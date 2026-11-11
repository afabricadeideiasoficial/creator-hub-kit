"""Mede um vídeo de referência para o Claude tirar o estilo de edição dele.

Uso: python analisar.py <video> --saida <pasta> [--transcritor <transcribe_local.py>]

Gera na pasta de saída:
  analise.json   duração, formato, cortes, ritmo, volume e, com o transcritor, a fala por segundo
  folha.jpg      um quadro por segundo (a cada 2 s em vídeo longo), para ver o vídeo inteiro de relance
  cortes.jpg     o quadro logo depois de cada corte
  gancho.jpg     os 3 primeiros segundos, 6 quadros por segundo (entrada da legenda, primeiro movimento)
  quadro-NN.jpg  4 quadros grandes, para ler fonte, tamanho e posição da legenda

Só mede: nada do vídeo sai do computador.
"""
import argparse, json, math, re, subprocess, sys
from pathlib import Path

import numpy as np

LW, LH = 72, 128            # tamanho reduzido para comparar quadros
LIMIAR_MIN = 12.0           # diferença média mínima (0–255) para contar como corte
INTERVALO_MIN = 0.25        # dois cortes a menos de 0,25 s viram um só


def sh(cmd, **kw):
    return subprocess.run(cmd, capture_output=True, check=True, **kw)


def info(v):
    d = json.loads(sh(["ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json", v]).stdout)
    vs = next(s for s in d["streams"] if s["codec_type"] == "video")
    num, den = (vs.get("avg_frame_rate") or "30/1").split("/")
    if int(num) == 0:
        num, den = (vs.get("r_frame_rate") or "30/1").split("/")
    # A rotação pode vir nos dados do quadro (ffmpeg novo) ou nas tags (ffmpeg antigo).
    rot = next((sd.get("rotation", 0) for sd in vs.get("side_data_list", []) if "rotation" in sd), None)
    if rot is None:
        rot = vs.get("tags", {}).get("rotate", 0)
    w, h = int(vs["width"]), int(vs["height"])
    if abs(int(float(rot))) % 180 == 90:
        w, h = h, w
    return {"duracao": round(float(d["format"]["duration"]), 3), "largura": w, "altura": h,
            "qps": round(int(num) / max(int(den), 1), 3),
            "tem_audio": any(s["codec_type"] == "audio" for s in d["streams"])}


def cortes(v, qps):
    raw = sh(["ffmpeg", "-v", "error", "-i", v, "-vf", f"scale={LW}:{LH},format=gray", "-f", "rawvideo", "-"]).stdout
    f = np.frombuffer(raw, np.uint8).reshape(-1, LH, LW).astype(np.int16)
    if len(f) < 2:
        return [], LIMIAR_MIN
    dif = np.abs(np.diff(f, axis=0)).mean(axis=(1, 2))
    limiar = max(LIMIAR_MIN, float(np.median(dif)) * 6)
    ts = []
    for i in np.flatnonzero(dif > limiar):
        t = round(float(i + 1) / qps, 3)
        if ts and t - ts[-1] < INTERVALO_MIN:
            continue
        ts.append(t)
    return ts, round(limiar, 1)


def lufs(v):
    err = subprocess.run(["ffmpeg", "-nostats", "-i", v, "-af", "ebur128", "-f", "null", "-"],
                         capture_output=True, text=True, encoding="utf-8", errors="replace").stderr
    m = re.findall(r"I:\s+(-?[\d.]+) LUFS", err)
    return float(m[-1]) if m else None


def folha(v, saida, nome, filtro):
    sh(["ffmpeg", "-v", "error", "-y", "-i", v, "-vf", filtro, "-frames:v", "1", "-q:v", "3", str(saida / nome)])


def quadro(v, t, destino, largura):
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", f"{t:.3f}", "-i", v, "-frames:v", "1",
                    "-vf", f"scale={largura}:-2", "-q:v", "3", str(destino)], capture_output=True)
    return destino.exists()


def transcrever(v, saida, transcritor):
    # Sem idioma: a referência pode ser de outro país, e o Whisper descobre sozinho.
    sh([sys.executable, transcritor, v, "--edit-dir", str(saida)])
    js = sorted((saida / "transcripts").glob("*.json"))
    if not js:
        return None, None
    dados = json.loads(js[0].read_text(encoding="utf-8"))
    palavras = [w for w in dados.get("words", []) if w.get("type") != "spacing"]
    return palavras, dados.get("language_code")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("video")
    ap.add_argument("--saida", required=True)
    ap.add_argument("--transcritor", help="caminho do transcribe_local.py do kit; sem ele, não transcreve")
    a = ap.parse_args()
    # No Windows, a saída do Python não é UTF-8 por padrão e os acentos quebrariam o print.
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except (AttributeError, ValueError):
        pass
    v, saida = a.video, Path(a.saida)
    saida.mkdir(parents=True, exist_ok=True)

    r = info(v)
    dur = r["duracao"]
    ts, limiar = cortes(v, r["qps"])
    planos = np.diff([0.0, *ts, dur])
    r.update({
        "cortes": ts,
        "limiar_corte": limiar,
        "cortes_por_minuto": round(len(ts) / dur * 60, 1),
        "plano_medio_s": round(float(planos.mean()), 2),
        "plano_mais_curto_s": round(float(planos.min()), 2),
        "plano_mais_longo_s": round(float(planos.max()), 2),
        "lufs": lufs(v) if r["tem_audio"] else None,
    })

    passo = 1 if dur <= 120 else 2
    n = max(1, math.ceil(dur / passo))
    folha(v, saida, "folha.jpg", f"fps=1/{passo},scale=180:-2,tile=8x{math.ceil(n / 8)}")
    folha(v, saida, "gancho.jpg", "trim=0:3,fps=6,scale=200:-2,tile=6x3")
    (saida / "cortes.jpg").unlink(missing_ok=True)
    if ts:
        tmp = saida / "_cortes"
        tmp.mkdir(exist_ok=True)
        for p in tmp.iterdir():
            p.unlink()
        k = 0
        for t in ts:
            k += quadro(v, min(t + 0.15, dur - 0.3), tmp / f"{k:03d}.jpg", 180)
        if k:
            sh(["ffmpeg", "-v", "error", "-y", "-framerate", "1", "-i", str(tmp / "%03d.jpg"),
                "-vf", f"tile=8x{math.ceil(k / 8)}", "-frames:v", "1", "-q:v", "3", str(saida / "cortes.jpg")])
        for p in tmp.iterdir():
            p.unlink()
        tmp.rmdir()
    for k, frac in enumerate((0.2, 0.4, 0.6, 0.8), 1):
        quadro(v, dur * frac, saida / f"quadro-{k:02d}.jpg", 720)

    if a.transcritor and r["tem_audio"]:
        palavras, idioma = transcrever(v, saida, a.transcritor)
        if palavras:
            fala = sum(float(w["end"]) - float(w["start"]) for w in palavras)
            r["idioma"] = idioma
            r["palavras"] = len(palavras)
            r["palavras_por_segundo"] = round(len(palavras) / dur, 2)
            r["fala_ocupa"] = f"{round(fala / dur * 100)}% do vídeo"

    (saida / "analise.json").write_text(json.dumps(r, ensure_ascii=False, indent=1), encoding="utf-8")
    print(json.dumps({k: v for k, v in r.items() if k != "cortes"}, ensure_ascii=False, indent=1))
    print(f"cortes ({len(ts)}): {ts}")


if __name__ == "__main__":
    sys.exit(main())
