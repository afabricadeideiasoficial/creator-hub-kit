#!/usr/bin/env bash
# Instala o Mascote 3D em ~/.creator-hub/mascote-3d, a partir do pacote que o comando de baixar_mascote grava.
# Uso: bash instalar_mascote.sh
#   Sem o pacote, diz o que fazer. Com a mesma versão já instalada, não refaz nada. Pacote novo troca a instalação inteira.
# Extrai com caminho relativo: no Windows, o tar do Git Bash leria o "C:" de um caminho completo como um computador remoto.
set -e

caminho() { (cd "$1" && { pwd -W 2>/dev/null || pwd -P; }); }

mkdir -p "$HOME/.creator-hub"
CASA="$(caminho "$HOME/.creator-hub")"
PACOTE="$CASA/mascote-3d.tar.gz"
MARCA="$CASA/mascote-3d/.instalado"

if [ -f "$PACOTE" ] && { [ ! -f "$MARCA" ] || [ "$PACOTE" -nt "$MARCA" ]; }; then
  rm -rf "$CASA/mascote-3d.novo"
  mkdir -p "$CASA/mascote-3d.novo"
  (cd "$CASA/mascote-3d.novo" && tar -xzf ../mascote-3d.tar.gz)
  [ -f "$CASA/mascote-3d.novo/VERSAO" ] || { echo "O pacote do Mascote 3D veio incompleto: chame baixar_mascote de novo."; exit 1; }
  rm -rf "$CASA/mascote-3d"
  mv "$CASA/mascote-3d.novo" "$CASA/mascote-3d"
  : > "$CASA/mascote-3d/.instalado"
  echo "Mascote 3D instalado (versão $(cat "$CASA/mascote-3d/VERSAO"))."
elif [ -f "$MARCA" ]; then
  echo "Mascote 3D já instalado (versão $(cat "$CASA/mascote-3d/VERSAO"))."
else
  echo "Falta o Mascote 3D: chame a ferramenta baixar_mascote, rode o comando dela e rode este script de novo."
fi
