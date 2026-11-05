#!/usr/bin/env bash
# Prepara a pasta de legendas para um estilo com receita. Roda depois do preparar_depois_do_corte.sh.
# Uso: bash preparar_receita.sh <pasta-do-video>
#   - troca o medidor de margens pelo que confere qualquer texto, inclusive dentro das cenas
#   - copia as fontes da receita
#   - escreve 2-legendas/palavras.txt, com a duração, os cortes, a cor de destaque e cada palavra no tempo do vídeo cortado
set -e
[ $# -eq 1 ] || { echo "Uso: bash preparar_receita.sh <pasta-do-video>"; exit 1; }

caminho() { (cd "$1" && { pwd -W 2>/dev/null || pwd -P; }); }

export PATH="$(caminho "$HOME")/.creator-hub/bin:$PATH"
AQUI="$(caminho "$(dirname "$0")")"
FERRAMENTAS="$(caminho "$AQUI/..")"
[ -f "$1/2-legendas/video.json" ] && [ -f "$1/2-legendas/transcript.json" ] || { echo "Falta preparar as legendas: rode o preparar_depois_do_corte.sh antes."; exit 1; }
L="$(caminho "$1/2-legendas")"

mkdir -p "$L/assets/fonts"
cp "$AQUI/medir_margens.cjs" "$L/medir_margens.cjs"
cp "$AQUI/fontes/"*.ttf "$FERRAMENTAS/fontes/Anton-Regular.ttf" "$L/assets/fonts/"

node "$AQUI/escrever_palavras.cjs" "$L"
echo "Pasta pronta para escrever o vídeo: $L/palavras.txt traz os tempos."
