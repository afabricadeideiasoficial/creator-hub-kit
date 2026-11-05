#!/usr/bin/env bash
# Corrige a cor de um vídeo gravado em LOG. Roda antes do corte, e o cortar.sh aplica o resultado.
# Uso: bash preparar_cor.sh <pasta-do-video> <slog3|vlog|applelog> [--exposicao 0.5] [--look <arquivo.cube> --look-espera rec709 --intensidade 0.5]
#   escreve em <pasta-do-video>/1-corte/: cor.cube, cor.txt (o filtro) e cor-comparacao.jpg (antes e depois do mesmo quadro)
# No Windows (Git Bash), os programas terminam a linha com \r: por isso o tr -d '\r' em cada resposta.
set -e
# Em português, o node e o ffmpeg podem receber vírgula nos decimais.
unset LC_ALL; export LC_NUMERIC=C
[ $# -ge 2 ] || { echo "Uso: bash preparar_cor.sh <pasta-do-video> <slog3|vlog|applelog> [opções]"; exit 1; }

caminho() { (cd "$1" && { pwd -W 2>/dev/null || pwd -P; }); }

KIT_CASA="$(caminho "$HOME")/.creator-hub"
export PATH="$KIT_CASA/bin:$PATH"
AQUI="$(caminho "$(dirname "$0")")"
PY="$KIT_CASA/video-use/.venv/bin/python"
C="$(caminho "$1")/1-corte"
ENTRADA="$2"
shift 2

[ -f "$C/fonte.txt" ] || { echo "Falta preparar o bruto antes da cor."; exit 1; }
SRC="$(tr -d '\r' < "$C/fonte.txt")"
[ -f "$SRC" ] || { echo "Não encontrei o vídeo original em: $SRC"; exit 1; }

"$PY" "$AQUI/cor.py" lut --entrada "$ENTRADA" "$@" -o "$C/cor.cube" > /dev/null

# Um quadro do meio do vídeo: o começo costuma ser a claquete ou a pessoa se ajeitando.
DUR=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$SRC" | tr -d '\r')
MEIO=$(node -p "Number(process.argv[1]) / 2" "$DUR")
"$PY" "$AQUI/cor.py" comparar "$SRC" --tempo "$MEIO" --opcao "Como gravou=log" --opcao "Corrigido=$C/cor.cube" --colunas 2 -o "$C/cor-comparacao.jpg" > /dev/null

"$PY" "$AQUI/cor.py" filtro "$C/cor.cube" > "$C/cor.txt"
echo "Cor pronta. Comparação em $C/cor-comparacao.jpg"
