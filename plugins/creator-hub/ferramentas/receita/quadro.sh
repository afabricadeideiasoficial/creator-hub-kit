#!/usr/bin/env bash
# Tira um quadro do vídeo cortado, para usar dentro de uma cena.
# Uso: bash quadro.sh <pasta-2-legendas> <segundos>
#   o quadro fica em assets/quadros/q_<segundos>.jpg, com 720 px de largura.
set -e
[ $# -eq 2 ] || { echo "Uso: bash quadro.sh <pasta-2-legendas> <segundos>"; exit 1; }
export PATH="$HOME/.creator-hub/bin:$PATH"
[ -f "$1/assets/video.mp4" ] || { echo "Falta o assets/video.mp4 em $1: prepare as legendas antes."; exit 1; }
mkdir -p "$1/assets/quadros"
SAIDA="assets/quadros/q_$2.jpg"
ffmpeg -hide_banner -loglevel error -y -ss "$2" -i "$1/assets/video.mp4" -frames:v 1 -vf "scale=720:-2" -q:v 3 "$1/$SAIDA"
echo "Use no index.html: $SAIDA"
