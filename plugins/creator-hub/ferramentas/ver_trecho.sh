#!/usr/bin/env bash
# Mostra o que há em trechos do bruto: as palavras com os tempos e o volume a cada 0,1 s. Serve para decidir onde um take começa e termina.
# Uso: bash ver_trecho.sh <pasta-do-video> [início-fim ...]
#   sem trechos, lista todas as palavras. Exemplo: bash ver_trecho.sh "<pasta-do-video>" 0-1.3 3.9-5.4
export PATH="$HOME/.creator-hub/bin:$PATH"
[ $# -ge 1 ] || { echo "Uso: bash ver_trecho.sh <pasta-do-video> [início-fim ...]"; exit 1; }
C="$1/1-corte"
shift
[ -f "$C/energia.json" ] && [ -f "$C/transcript.json" ] || { echo "Falta preparar o bruto: não achei energia.json e transcript.json em $C."; exit 1; }
exec node "$(dirname "$0")/ver_trecho.cjs" "$C/energia.json" "$C/transcript.json" "$@"
