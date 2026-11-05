#!/usr/bin/env bash
# Renderiza o vídeo editado e faz as conferências de entrega.
# Uso: bash renderizar.sh <pasta-do-video> <arquivo-de-saida.mp4>
# No Windows (Git Bash), os programas terminam a linha com \r: por isso o tr -d '\r' em cada resposta.
set -e
# Em português, o awk e o sort usariam vírgula nos decimais e leriam errado os números do ffmpeg.
unset LC_ALL; export LC_NUMERIC=C
# Sem dados de uso e sem checagem de versão no programa de vídeo: a versão do kit é fixa.
export HYPERFRAMES_NO_TELEMETRY=1 HYPERFRAMES_NO_UPDATE_CHECK=1
[ $# -eq 2 ] || { echo "Uso: bash renderizar.sh <pasta-do-video> <arquivo-de-saida.mp4>"; exit 1; }

caminho() { (cd "$1" && { pwd -W 2>/dev/null || pwd -P; }); }

export PATH="$(caminho "$HOME")/.creator-hub/bin:$PATH"
V="$(caminho "$1")"
L="$V/2-legendas"
mkdir -p "$(dirname "$2")"
OUT="$(caminho "$(dirname "$2")")/$(basename "$2")"

[ -f "$L/index.html" ] || { echo "Falta o index.html: gere as legendas antes de renderizar."; exit 1; }
grep -q 'id="a-roll"' "$L/index.html" || { echo "O index.html não tem o vídeo dentro. Gere as legendas de novo em modo com-video antes de renderizar."; exit 1; }

FPS=$(ffprobe -v error -select_streams v:0 -show_entries stream=r_frame_rate -of csv=p=0 "$L/assets/video.mp4" | tr -d '\r')

bash "$(dirname "$0")/conferir_comp.sh" "$L"

cd "$L"
MARGENS="$(node medir_margens.cjs)"
echo "$MARGENS" | tail -1 | grep -q "todas as telas dentro" || { echo "$MARGENS" | grep FORA; echo "Há telas fora da margem segura: ajuste o roteiro e gere de novo."; exit 1; }
df -Pk "$V" | awk 'NR==2 && $4 < 10 * 1048576 {print "Aviso: menos de 10 GB livres no disco."}'

node node_modules/hyperframes/dist/cli.js render . -o "$OUT" --fps "$FPS" --quality high --quiet 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | tail -2

volume() { ffmpeg -hide_banner -nostats -i "$1" -af ebur128=framelog=quiet -vn -f null - 2>&1 | tr -d '\r' | grep -E '^ +I:' | tail -1 | grep -oE -e '-[0-9.]+'; }
LUFS=$(volume "$OUT")
if awk -v l="$LUFS" 'BEGIN { exit !(l != "" && (l < -16.5 || l > -13.5)) }'; then
  ffmpeg -hide_banner -loglevel error -y -i "$OUT" -c:v copy -af "loudnorm=I=-15:TP=-1.5:LRA=11" -c:a aac -b:a 192k "${OUT%.mp4}-n.mp4"
  mv "${OUT%.mp4}-n.mp4" "$OUT"
  LUFS=$(volume "$OUT")
fi

D0=$(ffprobe -v error -show_entries format=duration -of csv=p=0 assets/video.mp4 | tr -d '\r')
D1=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$OUT" | tr -d '\r')
echo "Duração: corte ${D0}s, vídeo final ${D1}s."
echo "Tamanho: $(ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0:s=x "$OUT" | tr -d '\r')."
echo "Volume: ${LUFS} LUFS."
LUZ=$(ffmpeg -hide_banner -sseof -0.2 -i "$OUT" -vf "scale=54:96,format=gray,signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=-" -an -f null - 2>/dev/null | grep -o "YAVG=[0-9]*" | head -1)
echo "Último quadro: $LUZ (0 seria tela preta)."
echo "Pronto: $OUT ($(du -h "$OUT" | cut -f1))"
