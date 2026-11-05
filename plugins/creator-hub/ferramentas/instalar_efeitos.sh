#!/usr/bin/env bash
# Instala os efeitos sonoros em ~/.creator-hub/efeitos, a partir do pacote que o comando de baixar_efeitos grava.
# Uso: bash instalar_efeitos.sh
#   Sem o pacote, diz o que fazer. Com os efeitos já instalados, não refaz nada.
# Extrai com caminho relativo: no Windows, o tar do Git Bash leria o "C:" de um caminho completo como um computador remoto.
set -e

caminho() { (cd "$1" && { pwd -W 2>/dev/null || pwd -P; }); }

mkdir -p "$HOME/.creator-hub/efeitos"
CASA="$(caminho "$HOME/.creator-hub")"
MARCA="$CASA/efeitos/.instalado"

if [ -f "$CASA/efeitos.tar.gz" ] && { [ ! -f "$MARCA" ] || [ "$CASA/efeitos.tar.gz" -nt "$MARCA" ]; }; then
  (cd "$CASA/efeitos" && tar -xzf ../efeitos.tar.gz)
  : > "$MARCA"
  echo "Efeitos sonoros instalados: $(find "$CASA/efeitos" -name '*.wav' | wc -l | tr -d ' ') sons."
elif [ -f "$MARCA" ]; then
  echo "Efeitos sonoros já instalados."
else
  echo "Faltam os efeitos sonoros: chame a ferramenta baixar_efeitos, rode o comando dela e rode este script de novo."
fi
