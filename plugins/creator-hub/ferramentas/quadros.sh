#!/usr/bin/env bash
# Monta uma folha com quadros de um vídeo, para olhar sem abrir o vídeo. Mostra também a duração e o tamanho dele.
# Uso: bash quadros.sh <video> <folha.jpg> [segundos entre os quadros]
#   sem os segundos, são 12 quadros espalhados pelo vídeo.
# No Windows (Git Bash), os programas terminam a linha com \r: por isso o tr -d '\r' em cada resposta.
set -e
# Em português, o awk e o sort usariam vírgula nos decimais e leriam errado os números do ffmpeg.
unset LC_ALL; export LC_NUMERIC=C
[ $# -ge 2 ] || { echo "Uso: bash quadros.sh <video> <folha.jpg> [segundos entre os quadros]"; exit 1; }
export PATH="$HOME/.creator-hub/bin:$PATH"
VIDEO="$1"
FOLHA="$2"
COLUNAS=6
[ -f "$VIDEO" ] || { echo "Não encontrei o vídeo: $VIDEO"; exit 1; }
mkdir -p "$(dirname "$FOLHA")"

DUR=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$VIDEO" | tr -d '\r')
TAMANHO="$(node "$(dirname "$0")/ler_trilha.cjs" "$VIDEO" v:0 width)x$(node "$(dirname "$0")/ler_trilha.cjs" "$VIDEO" v:0 height)"
PASSO="${3:-$(awk -v d="$DUR" 'BEGIN { printf "%.3f", d / 12 }')}"
# A folga de 0,05 evita uma linha vazia na folha quando a conta dá 12,001 quadros por causa do arredondamento.
QUANTOS=$(awk -v d="$DUR" -v p="$PASSO" 'BEGIN { i = int(d / p + 0.95); print (i < 1 ? 1 : i) }')
LINHAS=$(( (QUANTOS + COLUNAS - 1) / COLUNAS ))

ffmpeg -hide_banner -loglevel error -y -i "$VIDEO" -vf "fps=1/$PASSO,scale=216:-1,tile=${COLUNAS}x${LINHAS}" -frames:v 1 "$FOLHA"
echo "Vídeo: ${DUR}s, $TAMANHO."
echo "Folha: $FOLHA, com um quadro a cada ${PASSO}s, da esquerda para a direita."
