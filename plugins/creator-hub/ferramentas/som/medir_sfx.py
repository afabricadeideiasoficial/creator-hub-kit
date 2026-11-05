"""Mede os efeitos sonoros de um vídeo pronto contra a voz: tira a voz do final (som que veio do DaVinci, já alinhado)
e olha o que sobra (música + efeitos). Lista cada efeito com o tempo e quantos dB ele fica abaixo da voz naquele instante.
Uso: medir_sfx.py <voz.mp4> <final.mp4> [--musica <faixa.m4a> --vol 0.1]
Regra: com a voz falando, efeito pelo menos 8 dB abaixo dela ("cobre" se ficar a menos de 6 dB); no silêncio, até −20 dBFS."""
import subprocess, sys
import numpy as np
SR = 16000
def audio(f):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", f, "-map", "0:a:0", "-ac", "1", "-ar", str(SR), "-f", "f32le", "-"], capture_output=True).stdout
    return np.frombuffer(raw, np.float32)
voz, fin = audio(sys.argv[1]), audio(sys.argv[2])
n = min(len(voz), len(fin)); voz, fin = voz[:n], fin[:n]
resto = fin - voz
if "--musica" in sys.argv:
    m = audio(sys.argv[sys.argv.index("--musica") + 1]) * float(sys.argv[sys.argv.index("--vol") + 1] if "--vol" in sys.argv else 0.1)
    m = np.pad(m, (0, max(0, n - len(m))))[:n]; resto = resto - m
hop, win = SR // 50, SR // 5                        # janela de 200 ms a cada 20 ms
def db(x):
    k = (len(x) - win) // hop
    fr = np.lib.stride_tricks.sliding_window_view(x, win)[::hop][:k]
    return 20 * np.log10(np.sqrt((fr ** 2).mean(1)) + 1e-9)
dv, ds = db(voz), db(resto)
ev, i = [], 0
while i < len(ds):
    if ds[i] > -42:
        j = i
        while j < len(ds) and ds[j] > -45: j += 1
        p = i + int(np.argmax(ds[i:j])); ev.append((p, ds[p], dv[p])); i = j
    else: i += 1
cobre = 0
for p, s, v in ev:
    t = p * hop / SR
    if v > -35:
        marca = "COBRE A FALA" if s > v - 6 else ("perto" if s > v - 8 else "ok")
        cobre += marca == "COBRE A FALA"
        print(f"{int(t // 60)}:{t % 60:05.2f}  efeito {s:6.1f} dB | voz {v:6.1f} dB | {v - s:4.1f} dB abaixo  {marca}")
    else:
        print(f"{int(t // 60)}:{t % 60:05.2f}  efeito {s:6.1f} dB | sem voz            {'ALTO' if s > -20 else 'ok'}")
print(f"{len(ev)} efeitos, {len(ev) / (n / SR) * 60:.0f} por minuto; cobrindo a fala: {cobre}")
