#!/usr/bin/env bash
# Renderiza o vídeo animado e faz as conferências de entrega.
# Uso: bash renderizar_plano.sh <pasta-plano> <arquivo-de-saida.mp4> [--desfoque]
#   --desfoque: rastro de movimento de câmera. Renderiza 4 quadros para cada quadro final e mistura os 4. Leva umas 4 vezes mais tempo.
# No Windows (Git Bash), os programas terminam a linha com \r: por isso o tr -d '\r' em cada resposta.
set -e
# Em português, o awk e o sort usariam vírgula nos decimais e leriam errado os números do ffmpeg.
unset LC_ALL; export LC_NUMERIC=C
# Sem dados de uso e sem checagem de versão no programa de vídeo: a versão do kit é fixa.
export HYPERFRAMES_NO_TELEMETRY=1 HYPERFRAMES_NO_UPDATE_CHECK=1
[ $# -ge 2 ] || { echo "Uso: bash renderizar_plano.sh <pasta-plano> <arquivo-de-saida.mp4> [--desfoque]"; exit 1; }

caminho() { (cd "$1" && { pwd -W 2>/dev/null || pwd -P; }); }

export PATH="$(caminho "$HOME")/.creator-hub/bin:$PATH"
P="$(caminho "$1")"
mkdir -p "$(dirname "$2")"
OUT="$(caminho "$(dirname "$2")")/$(basename "$2")"
MODO="${3:-}"

[ -f "$P/index.html" ] || { echo "Falta o index.html: gere o vídeo antes de renderizar."; exit 1; }
bash "$(dirname "$0")/../conferir_comp.sh" "$P"

cd "$P"
MARGENS="$(node medir_margens.cjs)"
echo "$MARGENS" | tail -1 | grep -q "todas as telas dentro" || { echo "$MARGENS" | grep FORA; echo "Há telas fora da margem segura: ajuste o cenas.txt e gere de novo."; exit 1; }
df -Pk "$P" | awk 'NR==2 && $4 < 10 * 1048576 {print "Aviso: menos de 10 GB livres no disco."}'

if [ "$MODO" = "--desfoque" ]; then
  QUADRUPLO="$P/.quadruplo.mp4"
  node node_modules/hyperframes/dist/cli.js render . -o "$QUADRUPLO" --fps 120000/1001 --quality high --quiet 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | tail -2
  ffmpeg -hide_banner -loglevel error -y -i "$QUADRUPLO" -vf "tmix=frames=4:weights='1 1 1 1',select='not(mod(n+1\,4))',setpts=N/(30000/1001)/TB" \
    -r 30000/1001 -c:v libx264 -crf 20 -maxrate 12M -bufsize 24M -preset slow -pix_fmt yuv420p -c:a copy -movflags +faststart "$OUT"
  rm -f "$QUADRUPLO"
else
  node node_modules/hyperframes/dist/cli.js render . -o "$OUT" --fps 30000/1001 --quality high --quiet 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | tail -2
fi

volume() { ffmpeg -hide_banner -nostats -i "$1" -af ebur128=framelog=quiet -vn -f null - 2>&1 | tr -d '\r' | grep -E '^ +I:' | tail -1 | grep -oE -e '-[0-9.]+'; }
LUFS=$(volume "$OUT")
if awk -v l="$LUFS" 'BEGIN { exit !(l != "" && (l < -16.5 || l > -13.5)) }'; then
  ffmpeg -hide_banner -loglevel error -y -i "$OUT" -c:v copy -af "loudnorm=I=-15:TP=-1.5:LRA=11" -c:a aac -b:a 192k "${OUT%.mp4}-n.mp4"
  mv "${OUT%.mp4}-n.mp4" "$OUT"
  LUFS=$(volume "$OUT")
fi

D1=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$OUT" | tr -d '\r')
echo "Duração: ${D1}s."
echo "Volume: ${LUFS} LUFS."
LUZ=$(ffmpeg -hide_banner -sseof -0.2 -i "$OUT" -vf "scale=54:96,format=gray,signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=-" -an -f null - 2>/dev/null | grep -a YAVG | tail -1 | cut -d= -f2 | tr -d '\r')
echo "Último quadro: $LUZ (0 seria tela preta)."
echo "Pronto: $OUT ($(du -h "$OUT" | cut -f1))"
