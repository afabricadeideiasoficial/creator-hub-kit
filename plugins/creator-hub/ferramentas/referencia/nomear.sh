#!/usr/bin/env bash
# Dá o nome final à pasta de um estilo próprio, quando a pessoa escolhe um nome diferente do provisório.
# Uso: bash nomear.sh <pasta-do-estilo> <nome-novo>
#   O nome novo vai sem acento e sem espaço, em minúsculas, com hífen: ele vira o id do estilo.
set -e
[ $# -eq 2 ] || { echo "Uso: bash nomear.sh <pasta-do-estilo> <nome-novo>"; exit 1; }
[ -d "$1" ] || { echo "Não encontrei a pasta do estilo: $1"; exit 1; }
case "$2" in
  '' | -* | *-- | *[!a-z0-9-]*) echo "O nome \"$2\" não serve: use só letras minúsculas sem acento, números e hífen, como legenda-amarela."; exit 1 ;;
esac

caminho() { (cd "$1" && { pwd -W 2>/dev/null || pwd -P; }); }

ANTES="$(caminho "$1")"
DEPOIS="$(dirname "$ANTES")/$2"
[ "$ANTES" != "$DEPOIS" ] || { echo "O estilo já se chama $2: $DEPOIS"; exit 0; }
[ ! -e "$DEPOIS" ] || { echo "Já existe um estilo chamado $2. Escolha outro nome."; exit 1; }
mv "$ANTES" "$DEPOIS"
echo "Estilo: $DEPOIS"
