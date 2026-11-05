#!/usr/bin/env bash
# Abre a pasta de cada corte aprovado, sem transcrever de novo. Cada corte fica pronto para analisar_falas, como um vídeo curto.
# Uso: bash abrir_cortes.sh <pasta-da-gravacao> <pasta-do-cliente> <numeros separados por vírgula>
set -e
[ $# -eq 3 ] || { echo "Uso: bash abrir_cortes.sh <pasta-da-gravacao> <pasta-do-cliente> <numeros separados por vírgula>"; exit 1; }
FERRAMENTAS="$(cd "$(dirname "$0")/.." && { pwd -W 2>/dev/null || pwd -P; })"
export PATH="$HOME/.creator-hub/bin:$PATH"
exec node "$FERRAMENTAS/cortes/abrir_cortes.cjs" "$1" "$2" "$3" "$FERRAMENTAS"
