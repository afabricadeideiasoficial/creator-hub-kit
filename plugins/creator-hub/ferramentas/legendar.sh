#!/usr/bin/env bash
# Renderiza a camada de legenda (transparente) e sobrepõe no vídeo original.
# O áudio do original é copiado sem alteração, e o vídeo é recodificado uma vez em alta qualidade.
# Uso: bash legendar.sh <pasta-do-video> [pasta-de-saida]
#   pasta-de-saida padrão: <pasta do vídeo original>/legendados
# O original nunca é sobrescrito.
# No Windows (Git Bash), os programas terminam a linha com \r: por isso o tr -d '\r' em cada resposta.
set -e
[ $# -ge 1 ] || { echo "Uso: bash legendar.sh <pasta-do-video> [pasta-de-saida]"; exit 1; }

caminho() { (cd "$1" && { pwd -W 2>/dev/null || pwd -P; }); }

export PATH="$(caminho "$HOME")/.creator-hub/bin:$PATH"
V="$(caminho "$1")"
L="$V/2-legendas"

[ -f "$L/index.html" ] || { echo "Falta o index.html: gere as legendas antes de renderizar."; exit 1; }
[ -f "$L/fonte.txt" ] || { echo "Falta o fonte.txt: prepare o vídeo de novo."; exit 1; }
grep -q 'id="a-roll"' "$L/index.html" && { echo "O index.html é o da prévia, com o vídeo dentro. Gere as legendas de novo em modo so-legenda antes de renderizar."; exit 1; }

SRC="$(tr -d '\r' < "$L/fonte.txt")"
[ -f "$SRC" ] || { echo "Não encontrei o vídeo original em: $SRC"; exit 1; }

OUTDIR="${2:-$(dirname "$SRC")/legendados}"
mkdir -p "$OUTDIR"
OUT="$OUTDIR/$(basename "$SRC")"
[ "$OUT" != "$SRC" ] || { echo "A saída seria o próprio vídeo original. Escolha outra pasta."; exit 1; }

FPS=$(ffprobe -v error -select_streams v:0 -show_entries stream=r_frame_rate -of csv=p=0 "$SRC" | tr -d '\r')
RES=$(ffprobe -v error -select_streams v:0 -show_entries stream=height -of csv=p=0 "$SRC" | tr -d '\r')
if [ "$RES" -ge 3840 ]; then PRESET=portrait-4k; else PRESET=portrait; fi

cd "$L"
MARGENS="$(node medir_margens.cjs)"
echo "$MARGENS" | tail -1 | grep -q "todas as telas dentro" || { echo "$MARGENS" | grep FORA; echo "Há telas fora da margem segura: ajuste o roteiro e gere de novo."; exit 1; }
df -Pk "$V" | awk 'NR==2 && $4 < 10 * 1048576 {print "Aviso: menos de 10 GB livres no disco."}'

node node_modules/hyperframes/dist/cli.js render . -o "$V/legenda.mov" --format mov --resolution "$PRESET" --fps "$FPS" --quiet 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | tail -2

# Vídeo sem áudio também passa: o "?" torna a faixa opcional.
ffmpeg -hide_banner -loglevel error -stats -y -i "$SRC" -i "$V/legenda.mov" \
  -filter_complex "[1:v]format=yuva444p,setpts=PTS-STARTPTS[cap];[0:v][cap]overlay=0:0:eof_action=pass:shortest=0,format=yuv420p[v]" \
  -map "[v]" -map 0:a? -c:a copy -c:v libx264 -preset medium -crf 16 -profile:v high \
  -color_primaries bt709 -color_trc bt709 -colorspace bt709 -movflags +faststart "$OUT"

D0=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$SRC" | tr -d '\r')
D1=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$OUT" | tr -d '\r')
echo "Duração: original ${D0}s, legendado ${D1}s."
LUZ=$(ffmpeg -hide_banner -sseof -0.2 -i "$OUT" -vf "scale=54:96,format=gray,signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=-" -an -f null - 2>/dev/null | grep -o "YAVG=[0-9]*" | head -1)
echo "Último quadro: $LUZ (0 seria tela preta)."
rm -f "$V/legenda.mov"
echo "Pronto: $OUT ($(du -h "$OUT" | cut -f1))"
