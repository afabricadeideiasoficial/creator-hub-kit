#!/usr/bin/env bash
# Prepara uma gravação longa para a procura dos melhores momentos. Transcreve uma vez só: os cortes aproveitam o resultado.
# Uso: bash preparar_gravacao.sh <gravacao> <pasta-da-gravacao> <pasta-do-cliente> <id-do-estilo>
#   - deixa em <pasta-da-gravacao>/1-corte/ o áudio, a energia e a transcrição
#   - deixa em <pasta-da-gravacao>/momentos/ os arquivos que vão ao servidor: só o texto da fala e os números da energia
# Em gravação longa, demora: rode em segundo plano. Se a transcrição já existe, ela é aproveitada.
set -e
[ $# -eq 4 ] || { echo "Uso: bash preparar_gravacao.sh <gravacao> <pasta-da-gravacao> <pasta-do-cliente> <id-do-estilo>"; exit 1; }

FERRAMENTAS="$(cd "$(dirname "$0")/.." && { pwd -W 2>/dev/null || pwd -P; })"
export PATH="$HOME/.creator-hub/bin:$PATH"

bash "$FERRAMENTAS/preparar_corte.sh" "$1" "$2" "$3" "$4"
NOME="$(basename "$(tr -d '\r' < "$2/1-corte/fonte.txt")")"; NOME="${NOME%.*}"
node "$FERRAMENTAS/cortes/resumir_gravacao.cjs" "$2/1-corte/transcripts/$NOME.json" "$2/1-corte/energia.json" "$2/momentos" "$4"
