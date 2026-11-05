#!/usr/bin/env bash
# Prepara a pasta de legenda de um vídeo já editado.
# Uso: bash preparar_legenda.sh <video> <pasta-do-video> <pasta-do-cliente> <id-do-estilo>
#   - transcreve, se ainda não tiver transcrição
#   - cria <pasta-do-video>/2-legendas/ com as fontes da marca
#   - escreve transcript.json, video.json (id, título, duração, estilo e marca) e fonte.txt
# O caminho do vídeo fica só em fonte.txt: ele nunca vai ao servidor.
# No Windows (Git Bash), os programas terminam a linha com \r: por isso o tr -d '\r' em cada resposta.
set -e
# Em português, o awk e o sort usariam vírgula nos decimais e leriam errado os números do ffmpeg.
unset LC_ALL; export LC_NUMERIC=C
[ $# -eq 4 ] || { echo "Uso: bash preparar_legenda.sh <video> <pasta-do-video> <pasta-do-cliente> <id-do-estilo>"; exit 1; }

caminho() { (cd "$1" && { pwd -W 2>/dev/null || pwd -P; }); }

KIT_CASA="$(caminho "$HOME")/.creator-hub"
export PATH="$KIT_CASA/bin:$PATH"
FERRAMENTAS="$(caminho "$(dirname "$0")")"
PY="$KIT_CASA/video-use/.venv/bin/python"

[ -f "$1" ] || { echo "Não encontrei o vídeo: $1"; exit 1; }
[ -x "$PY" ] || [ -x "$PY.exe" ] || { echo "O kit não está instalado neste computador. Rode o instalador do Creator Hub."; exit 1; }

SRC="$(caminho "$(dirname "$1")")/$(basename "$1")"
mkdir -p "$2"
V="$(caminho "$2")"
CLIENTE="$(caminho "$3")"
ESTILO="$4"
NOME="$(basename "$SRC")"; NOME="${NOME%.*}"
L="$V/2-legendas"
mkdir -p "$V/transcripts" "$L/assets/fonts"

T="$V/transcripts/$NOME.json"
[ -f "$T" ] || "$PY" "$KIT_CASA/video-use/helpers/transcribe_local.py" "$SRC" --language pt --edit-dir "$V"

cp "$FERRAMENTAS/modelo/medir_margens.cjs" "$FERRAMENTAS/modelo/hyperframes.json" "$FERRAMENTAS/modelo/package.json" "$L/"
cp "$FERRAMENTAS/fontes/"*.ttf "$L/assets/fonts/"
[ -d "$CLIENTE/fontes" ] && find "$CLIENTE/fontes" -maxdepth 1 -type f \( -iname '*.ttf' -o -iname '*.otf' \) -exec cp {} "$L/assets/fonts/" \;

# Atalho para os pacotes instalados. No Windows vira junção, que não pede administrador.
[ -e "$L/node_modules" ] || node -e 'require("fs").symlinkSync(process.argv[1], process.argv[2], "junction")' "$KIT_CASA/pacotes/node_modules" "$L/node_modules"

# Início do último quadro, sem decodificar o vídeo inteiro.
DUR=$(ffprobe -v error -select_streams v:0 -show_entries packet=pts_time -of csv=p=0 "$SRC" | tr -d '\r' | sort -g | tail -1)

printf '%s\n' "$SRC" > "$L/fonte.txt"

# A prévia mostra a legenda sobre o vídeo. Link sem ocupar espaço; em outro disco, cópia.
node -e 'const fs=require("fs");const[a,b]=process.argv.slice(1);fs.rmSync(b,{force:true});try{fs.linkSync(a,b)}catch{fs.copyFileSync(a,b)}' "$SRC" "$L/assets/video.mp4"

node "$FERRAMENTAS/montar_video_json.cjs" "$T" "$L" "$(basename "$V")" "$NOME" "$DUR" "$ESTILO" "$FERRAMENTAS/marca-padrao.json" "$CLIENTE/marca.json"

echo "$NOME: pasta pronta em $L (duração ${DUR}s, estilo $ESTILO)."
