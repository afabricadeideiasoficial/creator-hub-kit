#!/usr/bin/env bash
# Diz onde este computador transcreve e quanto isso demora numa gravação longa. Não sai com erro: é só um aviso.
# Uso: bash como_transcreve.sh
caminho() { (cd "$1" && { pwd -W 2>/dev/null || pwd -P; }); }
KIT_CASA="$(caminho "$HOME")/.creator-hub"
FERRAMENTAS="$(caminho "$(dirname "$0")/..")"
ONDE=$(PYTHONPATH="$KIT_CASA/video-use/helpers" "$KIT_CASA/video-use/.venv/bin/python" "$FERRAMENTAS/transcribe_local.py" --where 2>/dev/null | tr -d '\r')
case "$ONDE" in
  apple) echo "Transcrição: chip Apple. Referência: alguns minutos por hora de gravação, medido num Mac forte. Varia com o chip." ;;
  nvidia) echo "Transcrição: placa NVIDIA. Referência: alguns minutos por hora de gravação, medido num notebook forte. Varia com a placa." ;;
  cpu) echo "Transcrição: processador, porque este computador não tem placa NVIDIA pronta para isso. Fica bem mais devagar. Referência: cerca de 30 minutos por hora de gravação, medido num PC forte. Num PC comum, mais." ;;
  *) echo "Transcrição: não consegui saber onde ela roda neste computador." ;;
esac
exit 0
