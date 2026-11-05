#!/usr/bin/env bash
# Prepara a pasta de um vídeo animado sobre uma narração.
# Uso: bash preparar_plano.sh <narracao> <pasta-do-video> <pasta-do-cliente> <id-do-estilo> [--legenda] [--sem-tratar] [--musica <arquivo>]
#   cria <pasta-do-video>/plano/ com a narração tratada, a transcrição, o video.json, o som das viagens e o cenas.txt em branco
# No Windows (Git Bash), os programas terminam a linha com \r: por isso o tr -d '\r' em cada resposta.
set -e
# Em português, o awk e o sort usariam vírgula nos decimais e leriam errado os números do ffmpeg.
unset LC_ALL; export LC_NUMERIC=C
[ $# -ge 4 ] || { echo "Uso: bash preparar_plano.sh <narracao> <pasta-do-video> <pasta-do-cliente> <id-do-estilo> [--legenda] [--sem-tratar] [--musica <arquivo>]"; exit 1; }

caminho() { (cd "$1" && { pwd -W 2>/dev/null || pwd -P; }); }

KIT_CASA="$(caminho "$HOME")/.creator-hub"
export PATH="$KIT_CASA/bin:$PATH"
AQUI="$(caminho "$(dirname "$0")")"
FERRAMENTAS="$(dirname "$AQUI")"
PY="$KIT_CASA/video-use/.venv/bin/python"

NARRACAO="$1"
[ -f "$NARRACAO" ] || { echo "Não encontrei a narração: $NARRACAO"; exit 1; }
[ -x "$PY" ] || [ -x "$PY.exe" ] || { echo "O kit não está instalado neste computador. Rode o instalador do Creator Hub."; exit 1; }
mkdir -p "$2/plano/assets/sfx"
V="$(caminho "$2")"
CLIENTE="$(caminho "$3")"
ESTILO="$4"
shift 4
P="$V/plano"

LEGENDA=false; TRATAR=(); MUSICA=""
while [ $# -gt 0 ]; do
  case "$1" in
    --legenda) LEGENDA=true ;;
    --sem-tratar) TRATAR=(--sem-tratar) ;;
    --musica) shift; MUSICA="$1"; [ -f "$MUSICA" ] || { echo "Não encontrei a música: $MUSICA"; exit 1; } ;;
    *) echo "Opção desconhecida: $1"; exit 1 ;;
  esac
  shift
done

cp "$AQUI/medir_margens.cjs" "$FERRAMENTAS/modelo/hyperframes.json" "$FERRAMENTAS/modelo/package.json" "$P/"
[ -e "$P/node_modules" ] || node -e 'require("fs").symlinkSync(process.argv[1], process.argv[2], "junction")' "$KIT_CASA/pacotes/node_modules" "$P/node_modules"
[ -f "$P/cenas.txt" ] || cp "$AQUI/cenas-modelo.txt" "$P/cenas.txt"

# O som das viagens de câmera vem dos efeitos sonoros. Sem eles, o vídeo sai só com a narração.
SONS=false
if [ -f "$KIT_CASA/efeitos/whoosh.wav" ]; then
  cp "$KIT_CASA/efeitos/whoosh.wav" "$P/assets/sfx/whoosh.wav"
  SONS=true
fi

node -e '
  const fs = require("fs");
  const path = require("path");
  const [pasta, estilo, legenda, sons, padrao, cliente, nomeDoCliente] = process.argv.slice(1);
  const m = { ...JSON.parse(fs.readFileSync(padrao, "utf8")), ...(fs.existsSync(cliente) ? JSON.parse(fs.readFileSync(cliente, "utf8")) : {}) };
  const cor = ((m.gradienteDestaque ?? "").match(/#[0-9a-fA-F]{6}/) ?? [m.corMarcacao ?? "#E8697A"])[0];
  const id = path.basename(path.dirname(pasta)).toLowerCase().replace(/[^a-z0-9-]+/g, "-");
  const arquivo = path.join(pasta, "video.json");
  const antes = fs.existsSync(arquivo) ? JSON.parse(fs.readFileSync(arquivo, "utf8")) : {};
  const video = { ...antes, id, titulo: path.basename(path.dirname(pasta)), estilo, legenda: legenda === "true", sons: sons === "true", marca: { nome: m.nome ?? nomeDoCliente, cor } };
  fs.writeFileSync(arquivo, JSON.stringify(video, null, 1) + "\n");
' "$P" "$ESTILO" "$LEGENDA" "$SONS" "$FERRAMENTAS/marca-padrao.json" "$CLIENTE/marca.json" "$(basename "$CLIENTE")"

"$PY" "$AQUI/preparar.py" "$P" "$NARRACAO" "${TRATAR[@]}"

if [ -n "$MUSICA" ]; then
  DUR=$(node -p 'JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")).dur' "$P/video.json")
  bash "$FERRAMENTAS/musica.sh" "$MUSICA" "$P/assets/musica.m4a" "$(node -p "Number(process.argv[1]) + 0.45" "$DUR")"
  node -e '
    const fs = require("fs");
    const arquivo = process.argv[1];
    const video = JSON.parse(fs.readFileSync(arquivo, "utf8"));
    video.musica = { arquivo: "assets/musica.m4a", vol: 0.1 };
    fs.writeFileSync(arquivo, JSON.stringify(video, null, 1) + "\n");' "$P/video.json"
fi

echo "Pasta do vídeo animado pronta em $P (estilo $ESTILO)."
