"""Sincroniza o áudio de um gravador externo com o vídeo da câmera e monta uma cópia do bruto com esse áudio.

Uso: ~/Developer/video-use/.venv/bin/python ferramentas/audio/sincronizar_audio.py <video> <audio_externo> -o <saida.mov>
                                             [--so-medir] [--janela 300]

Compara o som da câmera (de referência, mesmo com eco) com o do gravador para achar a diferença de tempo, mede em
três trechos do vídeo para conferir se o atraso é constante, e grava <saida.mov> com o vídeo original copiado (sem
recodificar) e o áudio externo alinhado em PCM. A partir daí o corte usa <saida.mov> como fonte (SRC do corte),
e todo o resto (render, legendas) segue igual.
"""
import argparse, json, subprocess, sys

import numpy as np

SR = 8000


def audio(arq, ini, dur):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-ss", str(ini), "-t", str(dur), "-i", arq, "-map", "0:a:0", "-ac", "1",
                          "-ar", str(SR), "-f", "f32le", "-"], capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.float32)


def envelope(x):
    # envelope de energia em blocos de 10 ms: robusto a eco, ganho e timbre diferentes entre os microfones
    b = SR // 100
    e = np.sqrt((x[: len(x) // b * b].reshape(-1, b) ** 2).mean(1))
    e = np.log10(e + 1e-5)
    return (e - e.mean()) / (e.std() + 1e-9)


def atraso(cam, ext):
    """Quanto o externo está atrasado em relação à câmera (s). Positivo: o evento aparece depois no externo."""
    a, b = envelope(cam), envelope(ext)
    n = 1 << int(np.ceil(np.log2(len(a) + len(b))))
    c = np.fft.irfft(np.fft.rfft(b, n) * np.conj(np.fft.rfft(a, n)), n)
    k = int(np.argmax(c))
    if k > n // 2:
        k -= n
    pico = c.max() / (np.sqrt((a ** 2).sum() * (b ** 2).sum()) + 1e-9)
    return k / 100.0, float(pico)


def duracao(arq):
    return float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", arq],
                                capture_output=True, text=True, check=True).stdout)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("video")
    ap.add_argument("externo")
    ap.add_argument("-o", "--saida")
    ap.add_argument("--so-medir", action="store_true")
    ap.add_argument("--janela", type=float, default=300, help="segundos comparados em cada ponto")
    a = ap.parse_args()

    dv, de = duracao(a.video), duracao(a.externo)
    # primeira medida: começo da câmera contra uma janela larga do externo (cobre gravador ligado antes ou depois)
    cam = audio(a.video, 0, a.janela)
    ext = audio(a.externo, 0, min(de, a.janela * 3))
    d0, p0 = atraso(cam, ext)
    medidas = [{"ponto_s": 0, "atraso_s": round(d0, 3), "confianca": round(p0, 3)}]
    # confere no meio e no fim: o atraso precisa ser o mesmo (senão o gravador e a câmera derivam)
    for frac in (0.5, 0.9):
        t = max(0.0, dv * frac - a.janela / 2)
        te = t + d0
        if te < 0 or te + a.janela > de:
            continue
        cam = audio(a.video, t, a.janela)
        ext = audio(a.externo, max(0.0, te - 2), a.janela + 4)
        d, p = atraso(cam, ext)
        medidas.append({"ponto_s": round(t), "atraso_s": round(d + max(0.0, te - 2) - t, 3), "confianca": round(p, 3)})
    atrasos = [m["atraso_s"] for m in medidas]
    deriva = max(atrasos) - min(atrasos)
    print(json.dumps({"duracao_video": round(dv, 1), "duracao_externo": round(de, 1), "medidas": medidas,
                      "deriva_s": round(deriva, 3)}, ensure_ascii=False, indent=1))
    if deriva > 0.04:
        print("! o atraso muda ao longo do vídeo (deriva > 40 ms): confira a taxa de amostragem do gravador antes de usar.")
    if a.so_medir or not a.saida:
        return
    off = float(np.median(atrasos))
    # áudio externo alinhado: corta o começo se o externo começou antes; põe silêncio se começou depois
    filtro = f"atrim=start={off:.4f},asetpts=PTS-STARTPTS" if off >= 0 else f"adelay={-off * 1000:.0f}:all=1"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", a.video, "-i", a.externo, "-map", "0:v:0", "-map", "1:a:0",
                    "-c:v", "copy", "-af", f"{filtro},apad", "-t", f"{dv:.3f}", "-c:a", "pcm_s24le", "-ar", "48000",
                    a.saida], check=True)
    print(f"gravado: {a.saida} (atraso aplicado {off:+.3f} s)")


if __name__ == "__main__":
    sys.exit(main())
