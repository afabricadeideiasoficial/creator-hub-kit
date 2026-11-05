#!/usr/bin/env bash
# Mostra as instruções de edição de um corte. Quem lê é o subagente: ler o arquivo direto da pasta do plugin abriria uma janela de permissão a cada corte.
# Uso: bash instrucoes_do_corte.sh
cat "$(dirname "$0")/editar-um-corte.md"
