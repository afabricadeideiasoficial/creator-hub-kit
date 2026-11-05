#!/usr/bin/env bash
# Abre a prévia das legendas em segundo plano.
# Uso: bash previa.sh <pasta-2-legendas> [porta]
set -e
# Em português, o awk e o sort usariam vírgula nos decimais e leriam errado os números do ffmpeg.
unset LC_ALL; export LC_NUMERIC=C
[ $# -ge 1 ] || { echo "Uso: bash previa.sh <pasta-2-legendas> [porta]"; exit 1; }
export PATH="$HOME/.creator-hub/bin:$PATH"
PORTA="${2:-30710}"
cd "$1"
[ -f index.html ] || { echo "Falta o index.html: gere as legendas antes."; exit 1; }
node node_modules/hyperframes/dist/cli.js preview . --background --no-open --port "$PORTA"
echo "Prévia em http://localhost:$PORTA"
