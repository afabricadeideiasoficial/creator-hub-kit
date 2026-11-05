#!/usr/bin/env bash
# Diz se a tela da prévia alterou a edição. Um clique na linha do tempo grava o index.html com outros tempos e faixas.
# Abrir a prévia também grava o arquivo, mas sem mudar a edição: por isso a comparação é com o resumo que o previa.sh guarda antes de abrir.
# Uso: bash conferir_comp.sh <pasta-do-projeto>
[ $# -eq 1 ] || { echo "Uso: bash conferir_comp.sh <pasta-do-projeto>"; exit 1; }
[ -f "$1/index.html" ] || { echo "Falta o index.html em $1: gere o vídeo antes."; exit 1; }
export PATH="$HOME/.creator-hub/bin:$PATH"

# O arquivo que sai do motor não tem data-hf-id: sem ela, a tela da prévia ainda não gravou nada.
if ! grep -q 'data-hf-id' "$1/index.html"; then
  echo "O index.html está como foi gerado."
elif [ ! -f "$1/.comp-da-previa" ]; then
  echo "A tela da prévia gravou o index.html, e não tenho a versão anterior para comparar. Se alguém clicou na linha do tempo, gere o vídeo de novo."
elif [ "$(node "$(dirname "$0")/assinatura_comp.cjs" "$1/index.html" | tr -d '\r')" = "$(tr -d '\r' < "$1/.comp-da-previa")" ]; then
  echo "O index.html está como foi gerado."
else
  echo "Atenção: a tela da prévia alterou a edição no index.html. Se ninguém mexeu nela de propósito, gere o vídeo de novo antes de continuar."
fi
