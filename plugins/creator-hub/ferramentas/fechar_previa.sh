#!/usr/bin/env bash
# Fecha a prévia de um vídeo já aprovado. Com vários vídeos em sequência, as prévias abertas iam ocupando as portas.
# Uso: bash fechar_previa.sh <pasta-do-projeto>
[ $# -eq 1 ] || { echo "Uso: bash fechar_previa.sh <pasta-do-projeto>"; exit 1; }
export HYPERFRAMES_NO_TELEMETRY=1 HYPERFRAMES_NO_UPDATE_CHECK=1
export PATH="$HOME/.creator-hub/bin:$PATH"
cd "$1" || exit 1
node node_modules/hyperframes/dist/cli.js preview . --stop > /dev/null 2>&1
echo "Prévia fechada: $1"
