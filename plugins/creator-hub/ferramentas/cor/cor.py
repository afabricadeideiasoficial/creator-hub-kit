"""Cor: converte vídeo LOG para imagem normal (Rec.709) e aplica uma LUT, se a pessoa tiver a dela.

  python cor.py lut --entrada slog3 [--look <arquivo.cube> [--look <outra.cube>]] [--look-espera log|rec709]
                     [--intensidade 0.8] [--exposicao 0.3] [--temperatura 0.2] [--tinta 0] [--saturacao 1.0] -o <saida.cube>
      monta UMA LUT com tudo: ajuste de exposição e temperatura (feito antes, em luz linear, como um colorista
      faz no LOG), conversão neutra e o look, misturado na intensidade pedida.

  python cor.py filtro <saida.cube>
      imprime o filtro do ffmpeg que aplica a LUT (para o render ou o grade.py do video-use).

  python cor.py comparar <video> --tempo 600 --opcao "Neutra=neutra.cube" --opcao "Outra=outra.cube" -o comparacao.jpg
      o mesmo quadro em cada opção, lado a lado e com o nome embaixo.

Entradas (--entrada): slog3 (Sony S-Log3 / S-Gamut3.Cine), vlog (Panasonic V-Log / V-Gamut),
applelog (iPhone Apple Log / Rec.2020) e rec709 (vídeo normal). As curvas e matrizes são as publicadas
pelos fabricantes. A S-Log3 foi conferida com vídeo real da Sony A7S III; as outras seguem a fórmula e
ainda não foram testadas com arquivo de câmera.

Níveis: o vídeo é lido em nível de vídeo (preto do S-Log3 no código 95 de 1023), igual ao DaVinci no modo
automático. Por isso as LUTs exportadas do DaVinci funcionam aqui sem ajuste.
"""
import argparse, subprocess, sys, tempfile
from pathlib import Path

import numpy as np

# ── curvas LOG (valor de código 0–1 ↔ luz linear de cena, 0,18 = cinza médio) ──────────────
def slog3_dec(x):
    x = x * 1023
    return np.where(x >= 171.2102946929, 10 ** ((x - 420) / 261.5) * 0.19 - 0.01, (x - 95) * 0.01125 / (171.2102946929 - 95))

def slog3_enc(l):
    return np.where(l >= 0.01125, 420 + np.log10((np.maximum(l, 1e-9) + 0.01) / 0.19) * 261.5, l * (171.2102946929 - 95) / 0.01125 + 95) / 1023

def vlog_dec(x):
    return np.where(x < 0.181, (x - 0.125) / 5.6, 10 ** ((x - 0.598206) / 0.241514) - 0.00873)

def vlog_enc(l):
    return np.where(l < 0.01, 5.6 * l + 0.125, 0.241514 * np.log10(np.maximum(l, 1e-9) + 0.00873) + 0.598206)

AL = dict(R0=-0.05641088, Rt=0.01, c=47.28711236, b=0.00964052, g=0.08550479, d=0.69336945)
AL["Pt"] = AL["c"] * (AL["Rt"] - AL["R0"]) ** 2

def applelog_dec(p):
    return np.where(p >= AL["Pt"], 2 ** ((p - AL["d"]) / AL["g"]) - AL["b"],
                    np.where(p >= 0, np.sqrt(np.maximum(p, 0) / AL["c"]) + AL["R0"], AL["R0"]))

def applelog_enc(r):
    return np.where(r >= AL["Rt"], AL["g"] * np.log2(np.maximum(r, -AL["b"] + 1e-9) + AL["b"]) + AL["d"],
                    np.where(r >= AL["R0"], AL["c"] * (r - AL["R0"]) ** 2, 0.0))

def rec709_dec(v):
    return np.clip(v, 0, 1) ** 2.4

def rec709_enc(l):
    return np.clip(l, 0, 1) ** (1 / 2.4)

# ── matrizes de cor (gamut da câmera → XYZ D65 → Rec.709) ─────────────────────────────────
XYZ_709 = np.array([[3.2409699419, -1.5373831776, -0.4986107603],
                    [-0.9692436363, 1.8759675015, 0.0415550574],
                    [0.0556300797, -0.2039769589, 1.0569715142]])
SG3C_XYZ = np.array([[0.5990839208, 0.2489255161, 0.1024464902],
                     [0.2150758201, 0.8850685017, -0.1001443219],
                     [-0.0320658495, -0.0276583907, 1.1487819910]])
VG_XYZ = np.array([[0.679644, 0.152211, 0.118600], [0.260686, 0.774894, -0.035580], [-0.009310, -0.004612, 1.102980]])
R2020_XYZ = np.array([[0.6369580, 0.1446169, 0.1688810], [0.2627002, 0.6779981, 0.0593017], [0.0, 0.0280727, 1.0609851]])

PERFIS = {
    "slog3": ("Sony S-Log3 / S-Gamut3.Cine", slog3_dec, slog3_enc, XYZ_709 @ SG3C_XYZ, True),
    "vlog": ("Panasonic V-Log / V-Gamut", vlog_dec, vlog_enc, XYZ_709 @ VG_XYZ, True),
    "applelog": ("Apple Log / Rec.2020", applelog_dec, applelog_enc, XYZ_709 @ R2020_XYZ, True),
    "rec709": ("Vídeo normal (Rec.709)", rec709_dec, rec709_enc, np.eye(3), False),
}


def de_video(v):   # valor lido em nível de vídeo (0–1) → código 0–1 da curva
    return (v * 876 + 64) / 1023

def para_video(x):
    return (x * 1023 - 64) / 876


def tom(l, contraste=1.0):
    """Luz de cena → tela Rec.709 (gama 2,4), com rolagem suave das altas (curva filmica ACES aproximada)."""
    x = np.maximum(l, 0) * 0.6
    if contraste != 1.0:
        x = 0.108 * (np.maximum(x, 0) / 0.108) ** contraste   # gira em torno do cinza médio
    y = x * (2.51 * x + 0.03) / (x * (2.43 * x + 0.59) + 0.14)
    return np.clip(y, 0, 1) ** (1 / 2.4)


# ── arquivos .cube ───────────────────────────────────────────────────────────────────────
def ler_cube(p):
    n, dmin, dmax, linhas = None, np.zeros(3), np.ones(3), []
    for s in Path(p).read_text(errors="ignore").splitlines():
        s = s.strip()
        if not s or s.startswith("#") or s.startswith("TITLE"):
            continue
        k = s.split()
        if k[0] == "LUT_3D_SIZE":
            n = int(k[1])
        elif k[0] == "DOMAIN_MIN":
            dmin = np.array(k[1:4], float)
        elif k[0] == "DOMAIN_MAX":
            dmax = np.array(k[1:4], float)
        elif k[0][0] in "-.0123456789":
            linhas.append([float(v) for v in k[:3]])
    if not n:
        sys.exit(f"{p}: não é uma LUT 3D (.cube)")
    t = np.array(linhas).reshape(n, n, n, 3)   # índice [b][g][r]: o vermelho varia mais rápido
    return t, dmin, dmax


def amostrar(lut, rgb):
    t, dmin, dmax = lut
    n = t.shape[0]
    p = np.clip((rgb - dmin) / (dmax - dmin), 0, 1) * (n - 1)
    i0 = np.minimum(np.floor(p).astype(int), n - 2)
    f = p - i0
    r0, g0, b0 = i0[..., 0], i0[..., 1], i0[..., 2]
    fr, fg, fb = f[..., 0:1], f[..., 1:2], f[..., 2:3]
    c = lambda db, dg, dr: t[b0 + db, g0 + dg, r0 + dr]
    c00 = c(0, 0, 0) * (1 - fr) + c(0, 0, 1) * fr
    c01 = c(0, 1, 0) * (1 - fr) + c(0, 1, 1) * fr
    c10 = c(1, 0, 0) * (1 - fr) + c(1, 0, 1) * fr
    c11 = c(1, 1, 0) * (1 - fr) + c(1, 1, 1) * fr
    return (c00 * (1 - fg) + c01 * fg) * (1 - fb) + (c10 * (1 - fg) + c11 * fg) * fb


def escrever_cube(p, dados, n, titulo):
    with open(p, "w") as f:
        f.write(f'TITLE "{titulo}"\nLUT_3D_SIZE {n}\nDOMAIN_MIN 0 0 0\nDOMAIN_MAX 1 1 1\n')
        np.savetxt(f, dados.reshape(-1, 3), fmt="%.6f")


def montar(a):
    nome, dec, enc, para709, nivel_video = PERFIS[a.entrada]
    n = a.tamanho
    g = np.linspace(0, 1, n)
    b, gg, r = np.meshgrid(g, g, g, indexing="ij")
    v = np.stack([r, gg, b], -1)                       # entrada da LUT (como o ffmpeg/DaVinci entregam)
    x = de_video(v) if nivel_video else v
    lin = dec(x)                                        # luz de cena, no gamut da câmera
    # ajustes antes da conversão (no gamut da câmera, como no LOG)
    lin = lin * 2 ** a.exposicao
    lin = lin * np.array([1 + 0.1 * a.temperatura, 1 - 0.1 * a.tinta, 1 - 0.1 * a.temperatura])
    lin709 = np.einsum("ij,...j->...i", para709, lin)
    neutra = tom(lin709, a.contraste)
    if a.look:
        if a.look_espera == "log":
            xa = enc(lin)                               # volta para o LOG já com os ajustes
            img = para_video(xa) if nivel_video else xa
        else:
            img = neutra
        for arquivo in a.look:                          # várias LUTs: cada uma recebe a saída da anterior
            img = amostrar(ler_cube(arquivo), np.clip(img, 0, 1))
        final = a.intensidade * img + (1 - a.intensidade) * neutra
    else:
        final = neutra
    if a.saturacao != 1.0:
        y = final @ np.array([0.2126, 0.7152, 0.0722])
        final = y[..., None] + (final - y[..., None]) * a.saturacao
    escrever_cube(a.saida, np.clip(final, 0, 1), n, f"Cor: {nome}" + (" + " + " > ".join(Path(p).stem for p in a.look) if a.look else ""))
    print(a.saida)


def filtro(lut):
    # barras normais e ":" escapado: no Windows o caminho começa com "C:", que o ffmpeg leria como separador
    caminho = Path(lut).resolve().as_posix().replace("'", r"\'").replace(":", r"\:")
    return (f"scale=in_range=tv:in_color_matrix=bt709:out_range=pc,format=rgb48le,"
            f"lut3d=file='{caminho}':interp=tetrahedral,"
            f"scale=in_range=pc:out_range=tv:out_color_matrix=bt709,format=yuv420p10le")


def comparar(a):
    from PIL import Image, ImageDraw, ImageFont
    with tempfile.TemporaryDirectory() as tmp:
        quadros = []
        for k, op in enumerate(a.opcao):
            rotulo, lut = op.split("=", 1)
            cadeia = filtro(lut) if lut.lower() != "log" else "null"
            out = Path(tmp) / f"{k:02d}.png"
            subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", str(a.tempo), "-i", a.video, "-frames:v", "1",
                            "-vf", f"{cadeia},scale={a.largura}:-2", str(out)], check=True)
            quadros.append((rotulo, Image.open(out).convert("RGB")))
    w, h = quadros[0][1].size
    cols = min(a.colunas, len(quadros))
    grade = Image.new("RGB", (w * cols, h * -(-len(quadros) // cols)), "black")
    fonte = ImageFont.load_default()
    for arq in ("/System/Library/Fonts/Helvetica.ttc", "C:/Windows/Fonts/arial.ttf"):  # Mac, Windows
        try:
            fonte = ImageFont.truetype(arq, max(14, w // 15))
            break
        except OSError:
            pass
    for i, (rotulo, img) in enumerate(quadros):
        d = ImageDraw.Draw(img)
        x0, y0, x1, y1 = d.textbbox((0, 0), rotulo, font=fonte)
        tx, ty = (w - (x1 - x0)) // 2, h - (y1 - y0) - 22
        d.rectangle((tx - 8, ty - 6, tx + (x1 - x0) + 8, ty + (y1 - y0) + 10), fill=(0, 0, 0))
        d.text((tx, ty), rotulo, font=fonte, fill="white")
        grade.paste(img, ((i % cols) * w, (i // cols) * h))
    grade.save(a.saida, quality=90)
    print(a.saida)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    l = sub.add_parser("lut")
    l.add_argument("--entrada", choices=PERFIS, default="slog3")
    l.add_argument("--look", action="append", help="LUT do look; repita para encadear (a segunda recebe a saída da primeira)")
    l.add_argument("--look-espera", choices=["log", "rec709"], default="log")
    l.add_argument("--intensidade", type=float, default=1.0)
    l.add_argument("--exposicao", type=float, default=0.0, help="em stops (+1 = dobro de luz)")
    l.add_argument("--temperatura", type=float, default=0.0, help="-1 (frio) a 1 (quente)")
    l.add_argument("--tinta", type=float, default=0.0, help="-1 (verde) a 1 (magenta)")
    l.add_argument("--contraste", type=float, default=1.0)
    l.add_argument("--saturacao", type=float, default=1.0)
    l.add_argument("--tamanho", type=int, default=33)
    l.add_argument("-o", "--saida", required=True)
    f = sub.add_parser("filtro")
    f.add_argument("lut")
    c = sub.add_parser("comparar")
    c.add_argument("video")
    c.add_argument("--tempo", type=float, default=0)
    c.add_argument("--opcao", action="append", required=True, help='"Nome=arquivo.cube" (ou "LOG=log" para o original)')
    c.add_argument("--largura", type=int, default=480)
    c.add_argument("--colunas", type=int, default=4)
    c.add_argument("-o", "--saida", required=True)
    a = ap.parse_args()
    if a.cmd == "lut":
        montar(a)
    elif a.cmd == "filtro":
        print(filtro(a.lut))
    else:
        comparar(a)


if __name__ == "__main__":
    main()
