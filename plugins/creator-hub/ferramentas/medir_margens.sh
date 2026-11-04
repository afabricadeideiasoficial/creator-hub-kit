#!/usr/bin/env bash
# Confere se todas as telas ficam dentro da margem segura do Instagram.
# Uso: bash medir_margens.sh <pasta-2-legendas>
set -e
[ $# -eq 1 ] || { echo "Uso: bash medir_margens.sh <pasta-2-legendas>"; exit 1; }
export PATH="$HOME/.creator-hub/bin:$PATH"
cd "$1"
[ -f index.html ] || { echo "Falta o index.html: gere as legendas antes."; exit 1; }
node medir_margens.cjs
