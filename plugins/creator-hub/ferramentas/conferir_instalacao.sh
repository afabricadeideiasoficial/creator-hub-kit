#!/usr/bin/env bash
# Confere a instalação do kit neste computador, sem instalar nada. Sai com 0 mesmo quando falta algo: a resposta está no texto.
# Uso: bash conferir_instalacao.sh
KIT="$HOME/.creator-hub"
faltam=""
confere() {
  # No Windows, os programas terminam em .exe.
  [ -e "$KIT/$2" ] || [ -e "$KIT/$2.exe" ] || faltam="$faltam
- $1 ($KIT/$2)"
}
confere "Node" bin/node
confere "ffmpeg" bin/ffmpeg
confere "ffprobe" bin/ffprobe
confere "programa de vídeo" pacotes/node_modules/hyperframes/package.json
confere "transcrição" video-use/helpers/transcribe_local.py
confere "Python da transcrição" video-use/.venv/bin/python

VERSAO=$(sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' "$(dirname "$0")/../.claude-plugin/plugin.json" | head -1)
echo "Kit na versão ${VERSAO:-desconhecida}."
if [ -n "$faltam" ]; then
  echo "Falta na instalação:$faltam"
else
  echo "Ferramentas do computador: todas no lugar."
fi
[ -z "$faltam" ] && bash "$(dirname "$0")/cortes/como_transcreve.sh"
if [ -f "$KIT/efeitos/clique.wav" ]; then
  echo "Efeitos sonoros: instalados."
else
  echo "Efeitos sonoros: ainda não baixados. Eles vêm na primeira edição completa."
fi
