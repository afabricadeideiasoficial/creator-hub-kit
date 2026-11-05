#!/usr/bin/env bash
# Tira fotos do vídeo animado em alguns instantes, para conferir sem renderizar.
# Uso: bash fotos.sh <pasta-plano> <tempos separados por vírgula>
#   as fotos ficam em <pasta-plano>/snapshots. Sempre sem descrição automática: nenhum quadro sai deste computador.
set -e
# Sem dados de uso e sem checagem de versão no programa de vídeo: a versão do kit é fixa.
export HYPERFRAMES_NO_TELEMETRY=1 HYPERFRAMES_NO_UPDATE_CHECK=1
[ $# -eq 2 ] || { echo "Uso: bash fotos.sh <pasta-plano> 1.2,3.4,5.6"; exit 1; }
export PATH="$HOME/.creator-hub/bin:$PATH"
cd "$1"
[ -f index.html ] || { echo "Falta o index.html: gere o vídeo antes."; exit 1; }
env -u GEMINI_API_KEY node node_modules/hyperframes/dist/cli.js snapshot . --describe false --no-end --at "$2" 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | tail -2
echo "Fotos em $(pwd)/snapshots"
