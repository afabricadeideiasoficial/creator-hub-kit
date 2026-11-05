"""Ajusta a voz de um vídeo: ruído e volume. Por padrão mexe o mínimo possível.

Uso: python3 ferramentas/audio/tratar_voz.py <entrada.mp4> -o <saida.mp4> [--lufs -15] [--perfil leve|forte]
                                             [--reducao 6] [--canal estereo|media|0|1]

Perfil leve (padrão, para microfone bom): redução sutil de ruído (até 6 dB) → limitador rápido só nos poucos
picos que estourariam → ganho puro até o volume pedido. Sem EQ, sem compressão, sem mexer no fundo das pausas.
Os canais originais são mantidos.

Perfil forte (só para áudio realmente ruim, microfone de câmera, sala com eco): grave de sala fora, redução de
chiado forte, EQ de voz, compressão e expansor nas pausas. Mexe no timbre: ouça antes de usar.

Entrada: vídeo ou só áudio (narração em .wav/.m4a: a saída .m4a sai sem vídeo).
Use o áudio ANTES de qualquer normalização (o base.mp4 do render do video-use). O loudnorm do render
pede ganho puro, mas quando o ganho estouraria os picos ele passa sozinho para o modo dinâmico, que comprime.

Mede e imprime antes/depois: volume integrado (LUFS), pico e ruído de fundo nas pausas.
"""
import argparse, json, re, subprocess, sys

import numpy as np


def medir(arquivo):
    err = subprocess.run(["ffmpeg", "-nostats", "-i", arquivo, "-map", "0:a:0", "-af", "ebur128=peak=true", "-f", "null", "-"],
                         capture_output=True, text=True).stderr
    i = re.findall(r"I:\s+(-?[\d.]+) LUFS", err)
    tp = re.findall(r"Peak:\s+(-?[\d.]+) dBFS", err)
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", arquivo, "-map", "0:a:0", "-ac", "1", "-ar", "16000", "-f", "f32le", "-"],
                         capture_output=True).stdout
    x = np.frombuffer(raw, np.float32)
    fr = 800
    db = 20 * np.log10(np.sqrt((x[: len(x) // fr * fr].reshape(-1, fr) ** 2).mean(1)) + 1e-9)
    return {"lufs": float(i[-1]) if i else None, "pico": float(tp[-1]) if tp else None,
            "ruido": round(float(np.percentile(db, 2)), 1), "fala": round(float(np.percentile(db, 90)), 1)}


def lufs_de(arquivo, filtro):
    err = subprocess.run(["ffmpeg", "-nostats", "-i", arquivo, "-map", "0:a:0", "-af", f"{filtro},ebur128=peak=true",
                          "-f", "null", "-"], capture_output=True, text=True).stderr
    return float(re.findall(r"I:\s+(-?[\d.]+) LUFS", err)[-1]), float(re.findall(r"Peak:\s+(-?[\d.]+) dBFS", err)[-1])


def cadeia_leve(a, antes):
    canal = {"estereo": "anull", "media": "pan=stereo|c0=0.5*c0+0.5*c1|c1=0.5*c0+0.5*c1",
             "0": "pan=stereo|c0=c0|c1=c0", "1": "pan=stereo|c0=c1|c1=c1"}[a.canal]
    ruido = max(-80.0, min(-20.0, antes["ruido"] - 3))
    base = canal + (f",afftdn=nr={a.reducao}:nf={ruido:.0f}:tn=1" if a.reducao > 0 else "")
    i, pico = lufs_de(a.entrada, base)
    ganho = a.lufs - i
    teto = -1.5 - ganho                   # depois do ganho, nenhum pico passa de -1,5 dBTP
    partes = [base]
    if pico > teto:                        # só os picos acima do teto passam pelo limitador; o resto fica intacto
        partes.append(f"alimiter=limit={max(0.0625, 10 ** (teto / 20)):.4f}:attack=3:release=60:level=false")
    partes.append(f"volume={ganho:.2f}dB")
    return ",".join(partes), {"ganho_db": round(ganho, 1), "picos_acima_do_teto_db": round(max(0.0, pico - teto), 1)}


def cadeia(a, antes):
    canal = {"media": "pan=mono|c0=0.5*c0+0.5*c1", "0": "pan=mono|c0=c0", "1": "pan=mono|c0=c1"}.get(a.canal, "pan=mono|c0=0.5*c0+0.5*c1")
    ruido = max(-80.0, min(-20.0, antes["ruido"] - 3))  # o redutor parte do ruído medido (2% mais baixos, com margem)
    ganho = -20.0 - (antes["lufs"] if antes["lufs"] is not None else -20.0)   # leva a fala a -20 LUFS: limiares iguais para áudio alto ou baixo
    partes = [canal, "highpass=f=80:poles=2", f"afftdn=nr={a.reducao}:nf={ruido:.0f}:tn=1"]
    if not a.sem_eq:
        partes += ["equalizer=f=250:t=q:w=1.2:g=-2.5", "equalizer=f=3500:t=q:w=1.0:g=2.5",
                   "highshelf=f=10000:g=1.5", "deesser=i=0.35"]
    partes += [f"volume={ganho:.1f}dB",
               "acompressor=threshold=-18dB:ratio=2:attack=10:release=150",
               # expansor leve: abaixa o fundo ~12 dB só nas pausas, sem cortar seco
               "agate=threshold=0.03:ratio=3:range=0.25:attack=5:release=200"]
    return ",".join(partes)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("entrada")
    ap.add_argument("-o", "--saida", required=True)
    ap.add_argument("--lufs", type=float, default=-15.0)
    ap.add_argument("--perfil", choices=["leve", "forte"], default="leve")
    ap.add_argument("--canal", choices=["estereo", "media", "0", "1"], default="estereo")
    ap.add_argument("--reducao", type=float, default=None, help="redução de ruído em dB (leve: 6; forte: 18; 0 desliga)")
    ap.add_argument("--sem-eq", action="store_true", help="perfil forte sem a equalização")
    a = ap.parse_args()
    if a.reducao is None:
        a.reducao = 6.0 if a.perfil == "leve" else 18.0

    antes = medir(a.entrada)
    if a.perfil == "leve":
        final, info = cadeia_leve(a, antes)
        final += ",aresample=48000"
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", a.entrada, "-map", "0:v:0?", "-map", "0:a:0", "-c:v", "copy",
                        "-af", final, "-c:a", "aac", "-b:a", "256k", "-movflags", "+faststart", a.saida], check=True)
        print(json.dumps({"antes": antes, "depois": medir(a.saida), **info, "cadeia": final}, ensure_ascii=False, indent=1))
        return
    base = cadeia(a, antes)
    # 1ª passada: mede o resultado da cadeia para o loudnorm acertar o alvo
    err = subprocess.run(["ffmpeg", "-nostats", "-i", a.entrada, "-map", "0:a:0", "-af",
                          f"{base},loudnorm=I={a.lufs}:TP=-1.5:LRA=11:print_format=json", "-f", "null", "-"],
                         capture_output=True, text=True).stderr
    m = json.loads(err[err.rindex("{"): err.rindex("}") + 1])
    final = (f"{base},loudnorm=I={a.lufs}:TP=-1.5:LRA=11:measured_I={m['input_i']}:measured_TP={m['input_tp']}:"
             f"measured_LRA={m['input_lra']}:measured_thresh={m['input_thresh']}:offset={m['target_offset']}:linear=true,"
             f"aresample=48000")
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", a.entrada, "-map", "0:v:0?", "-map", "0:a:0", "-c:v", "copy",
                    "-af", final, "-c:a", "aac", "-b:a", "256k", "-ac", "2", "-movflags", "+faststart", a.saida], check=True)
    depois = medir(a.saida)
    print(json.dumps({"antes": antes, "depois": depois, "cadeia": final}, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    sys.exit(main())
