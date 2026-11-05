#!/usr/bin/env bash
# Lista as cores principais de um logo ou de um print, para a marca. Serve no Mac e no Windows, sem pedir permissão a cada vez.
# Uso: bash cor_da_imagem.sh <imagem>
[ $# -eq 1 ] || { echo "Uso: bash cor_da_imagem.sh <imagem>"; exit 1; }
[ -f "$1" ] || { echo "Não encontrei a imagem: $1"; exit 1; }
export PATH="$HOME/.creator-hub/bin:$PATH"
exec node "$(dirname "$0")/cor_da_imagem.cjs" "$1"
