#!/usr/bin/env bash
# Abre um arquivo no programa padrão do computador, para a pessoa não precisar procurar: mapa de edição, vídeo pronto, comparação de cor.
# Uso: bash abrir.sh <arquivo>
# Não falha se o computador não abrir: a última linha traz o caminho completo, para dizer à pessoa onde está.
# Só abre os tipos que o kit mostra à pessoa. Este script roda sem pedir permissão, e abrir um .command no Mac ou um .bat no Windows seria rodar um programa.
[ $# -eq 1 ] || { echo "Uso: bash abrir.sh <arquivo>"; exit 1; }

NOME="$(basename "$1")"
EXTENSAO=""
case "$NOME" in
  *.*) EXTENSAO="$(printf '%s' "${NOME##*.}" | tr '[:upper:]' '[:lower:]')" ;;
esac
case "$EXTENSAO" in
  html | mp4 | mov | m4a | jpg | jpeg | png) ;;
  *) echo "Não abri \"$NOME\": o kit só abre arquivos html, mp4, mov, m4a, jpg, jpeg ou png."; exit 1 ;;
esac

[ -f "$1" ] || { echo "Não encontrei o arquivo: $1"; exit 1; }
# O nome pode dizer .html e o atalho apontar para um programa.
[ ! -L "$1" ] || { echo "Não abri \"$NOME\": é um atalho para outro arquivo."; exit 1; }

PASTA="$(cd "$(dirname "$1")" && { pwd -W 2>/dev/null || pwd -P; })"
ALVO="$PASTA/$(basename "$1")"

abriu=sim
case "$(uname -s)" in
  Darwin) open "$ALVO" || abriu=nao ;;
  # O explorer.exe devolve erro mesmo quando abre, então o resultado dele não diz nada.
  MINGW* | MSYS* | CYGWIN*) explorer.exe "$(cygpath -w "$ALVO")" || true ;;
  *) xdg-open "$ALVO" || abriu=nao ;;
esac

if [ "$abriu" = sim ]; then
  echo "Aberto: $ALVO"
else
  echo "Não consegui abrir sozinho. O arquivo está em: $ALVO"
fi
