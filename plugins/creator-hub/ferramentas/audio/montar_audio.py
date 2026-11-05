"""Monta o áudio de um vídeo cortado com corte em L: a imagem corta seco, o som não.

Uso: ~/Developer/video-use/.venv/bin/python ferramentas/audio/montar_audio.py <edl.json> <edited.mp4> -o <saida.mp4>
         [--externo <audio.wav> [--atraso <s>]] [--lufs -15] [--cauda-max 0.25] [--entrada 0.04]

Para cada trecho do EDL:
- mede o fim real da última palavra pelos agudos (3–9 kHz, onde ficam o "s", o "x" e o "f"), que a energia geral não
  enxerga, e estende o som até ali (nunca além do começo da próxima palavra do bruto);
- essa cauda passa por baixo do começo do trecho seguinte e some num fade suave, enquanto o trecho seguinte entra com
  um fade curto (--entrada): é o "começar o próximo corte em cima do fim do S".
O vídeo é copiado sem recodificar (cada trecho do render tem ceil(duração × qps) quadros; o áudio segue esses tempos).

--externo: usa o áudio de um gravador externo no lugar do som da câmera. Sem --atraso, mede a diferença de tempo
sozinho (ferramentas/audio/sincronizar_audio.py). Áudio mono vira estéreo (o mesmo som nos dois canais).
No fim, passa pelo tratamento leve (ruído sutil e volume) do tratar_voz.py.
"""
import argparse, json, math, subprocess, sys, tempfile
from pathlib import Path

import numpy as np

SR = 48000
AQUI = Path(__file__).resolve().parent


CANAL = {}   # arquivo → filtro: gravador que grava num canal só e deixa o outro vazio usa só o canal com voz


def canal_com_voz(arq):
    if arq not in CANAL:
        nivel = []
        for c in (0, 1):
            err = subprocess.run(["ffmpeg", "-nostats", "-t", "600", "-i", arq, "-vn", "-af", f"pan=mono|c0=c{c},astats=metadata=0",
                                  "-f", "null", "-"], capture_output=True, text=True).stderr
            v = [float(x) for x in __import__("re").findall(r"RMS level dB: (-?[\d.]+|-inf)", err.replace("-inf", "-200"))]
            nivel.append(v[0] if v else -200.0)
        if abs(nivel[0] - nivel[1]) > 20:
            CANAL[arq] = f"pan=mono|c0=c{0 if nivel[0] > nivel[1] else 1}"
        else:
            CANAL[arq] = "pan=mono|c0=0.5*c0+0.5*c1"
    return CANAL[arq]


def ler(arq, ini, dur):
    canais = int(subprocess.run(["ffprobe", "-v", "error", "-select_streams", "a:0", "-show_entries", "stream=channels",
                                 "-of", "csv=p=0", arq], capture_output=True, text=True).stdout.strip() or 1)
    filtro = canal_com_voz(arq) if canais == 2 else "anull"
    raw = subprocess.run(["ffmpeg", "-v", "error", "-ss", f"{max(0.0, ini):.4f}", "-t", f"{dur:.4f}", "-i", arq, "-map", "0:a:0",
                          "-af", filtro, "-ac", "1", "-ar", str(SR), "-f", "f32le", "-"], capture_output=True, check=True).stdout
    x = np.frombuffer(raw, np.float32).copy()
    if ini < 0:                                   # pedido antes do começo do arquivo: completa com silêncio
        x = np.concatenate([np.zeros(int(-ini * SR), np.float32), x])
    return x


def bandas(x):
    """Energia por quadro de 10 ms: geral e só agudos (3–9 kHz), em dB."""
    fr = SR // 100
    n = len(x) // fr
    q = x[: n * fr].reshape(n, fr) * np.hanning(fr)
    esp = np.abs(np.fft.rfft(q, axis=1)) ** 2
    f = np.fft.rfftfreq(fr, 1 / SR)
    geral = 10 * np.log10(esp.sum(1) + 1e-12)
    agudo = 10 * np.log10(esp[:, (f >= 3000) & (f <= 9000)].sum(1) + 1e-12)
    return geral, agudo


def fim_real(x, t_corte):
    """Segundos depois do corte até a palavra acabar de verdade, contando a cauda do "s" (agudos).

    Silêncio é relativo à própria fala do trecho (não ao ruído de fundo, que num microfone bom é baixo demais):
    quadro quieto = geral 22 dB abaixo da fala e agudos 12 dB abaixo. A palavra acaba no começo de 60 ms quietos,
    ou de uma pausa curta seguida da próxima palavra. Uma queda curta dentro da palavra ("qui|as") não conta."""
    g, a = bandas(x)
    lim_g, lim_a = np.percentile(g, 90) - 22, np.percentile(a, 90) - 12
    volta = np.percentile(g, 90) - 8
    i0, corrida = int(t_corte * 100), 0
    for i in range(max(0, i0 - 3), len(g)):
        if g[i] < lim_g and a[i] < lim_a:
            corrida += 1
            if corrida >= 6:
                return max(0.0, (i - corrida + 1) / 100 + 0.02 - t_corte)
        else:
            if corrida >= 2 and g[i] > volta:          # pausa curta e a próxima palavra já começou
                return max(0.0, (i - corrida) / 100 + 0.02 - t_corte)
            corrida = 0
    return len(g) / 100 - t_corte


def janela(n, tipo):
    if n <= 0:
        return np.ones(0, np.float32)
    t = np.linspace(0, 1, n, dtype=np.float32)
    return np.sin(t * np.pi / 2) if tipo == "entra" else np.cos(t * np.pi / 2)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("edl")
    ap.add_argument("video")
    ap.add_argument("-o", "--saida", required=True)
    ap.add_argument("--externo")
    ap.add_argument("--atraso", type=float)
    ap.add_argument("--lufs", type=float, default=-15.0)
    ap.add_argument("--cauda-max", type=float, default=0.25)
    ap.add_argument("--entrada", type=float, default=0.04, help="fade de entrada de cada trecho (s)")
    a = ap.parse_args()

    edl = json.loads(Path(a.edl).read_text())
    fonte_video = edl["sources"][edl["ranges"][0]["source"]]
    num, den = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v", "-show_entries", "stream=r_frame_rate",
                               "-of", "csv=p=0", a.video], capture_output=True, text=True, check=True).stdout.strip().split("/")
    fps = int(num) / int(den)
    fonte, atraso = fonte_video, 0.0
    if a.externo:
        fonte = a.externo
        if a.atraso is None:
            r = subprocess.run([sys.executable, str(AQUI / "sincronizar_audio.py"), fonte_video, a.externo, "--so-medir"],
                               capture_output=True, text=True, check=True).stdout
            medidas = json.loads(r[: r.rindex("}") + 1])["medidas"]
            atraso = float(np.median([m["atraso_s"] for m in medidas]))
        else:
            atraso = a.atraso
        print(f"áudio externo, atraso {atraso:+.3f} s")

    faixas = edl["ranges"]
    inicio_saida, q = [], 0
    for r in faixas:
        inicio_saida.append(q / fps)
        q += math.ceil((r["end"] - r["start"]) * fps)
    total = q / fps
    saida = np.zeros(int((total + a.cauda_max + 0.5) * SR), np.float32)
    caudas = []
    for k, r in enumerate(faixas):
        s, e = r["start"] + atraso, r["end"] + atraso
        x = ler(fonte, s, (e - s) + a.cauda_max)
        dur = e - s
        c = fim_real(x, dur) if k < len(faixas) - 1 else 0.0
        # sem pausa até o fim da janela: o corte está no meio da fala contínua; cauda passaria a próxima palavra
        cauda = 0.0 if c >= len(x) / SR - dur - 0.05 else min(a.cauda_max, c)
        cauda = max(cauda, 0.03) if k < len(faixas) - 1 else 0.0
        caudas.append(round(cauda, 3))
        n_corpo, n_cauda, n_ent = int(dur * SR), int(cauda * SR), int(a.entrada * SR)
        pedaco = x[: n_corpo + n_cauda].copy()
        if k > 0:
            pedaco[:n_ent] *= janela(min(n_ent, len(pedaco)), "entra")[: len(pedaco[:n_ent])]
        if n_cauda:
            pedaco[n_corpo:] *= janela(len(pedaco) - n_corpo, "sai")
        else:
            m = min(int(0.03 * SR), len(pedaco))
            pedaco[len(pedaco) - m:] *= janela(m, "sai")
        i0 = int(inicio_saida[k] * SR)
        saida[i0: i0 + len(pedaco)] += pedaco
    saida = saida[: int(total * SR)]

    with tempfile.TemporaryDirectory() as tmp:
        wav = Path(tmp) / "montado.wav"
        estereo = np.stack([saida, saida], 1)
        import wave
        with wave.open(str(wav), "w") as w:
            w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
            w.writeframes((np.clip(estereo, -1, 1) * 32767).astype(np.int16).tobytes())
        cru = Path(tmp) / "cru.mov"
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", a.video, "-i", str(wav), "-map", "0:v:0", "-map", "1:a:0",
                        "-c:v", "copy", "-c:a", "pcm_s16le", "-shortest", str(cru)], check=True)
        r = subprocess.run([sys.executable, str(AQUI / "tratar_voz.py"), str(cru), "-o", a.saida, "--lufs", str(a.lufs)],
                           capture_output=True, text=True, check=True).stdout
    d = json.loads(r)
    print(json.dumps({"trechos": len(faixas), "caudas_s": caudas, "duracao_s": round(total, 3),
                      "depois": d["depois"], "ganho_db": d.get("ganho_db")}, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    sys.exit(main())
