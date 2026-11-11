#!/usr/bin/env bash
# Troca a capa de um estilo próprio por um quadro de um vídeo: da referência ou do primeiro vídeo feito no estilo.
# Uso: bash capa.sh <video> <segundos> <pasta-do-estilo>
set -e
unset LC_ALL; export LC_NUMERIC=C
[ $# -eq 3 ] || { echo "Uso: bash capa.sh <video> <segundos> <pasta-do-estilo>"; exit 1; }

caminho() { (cd "$1" && { pwd -W 2>/dev/null || pwd -P; }); }

export PATH="$(caminho "$HOME")/.creator-hub/bin:$PATH"
[ -f "$1" ] || { echo "Não encontrei o vídeo: $1"; exit 1; }
[ -d "$3" ] || { echo "Não encontrei a pasta do estilo: $3"; exit 1; }
case "$2" in
  '' | *[!0-9.]* | *.*.*) echo "Os segundos vão em número, como 2.5"; exit 1 ;;
esac

ffmpeg -v error -y -ss "$2" -i "$1" -frames:v 1 -vf scale=540:-2 -q:v 4 "$3/capa.jpg"
[ -f "$3/capa.jpg" ] || { echo "Não consegui tirar o quadro em $2 s: confira se o vídeo é tão longo."; exit 1; }
echo "Capa nova: $(caminho "$3")/capa.jpg"
