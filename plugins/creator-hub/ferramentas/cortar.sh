#!/usr/bin/env bash
# Corta o bruto seguindo o edl.json e monta o som com corte em L.
# Uso: bash cortar.sh <pasta-do-video>
#   sai em <pasta-do-video>/1-corte/edited_voz.mp4. O bruto nunca é alterado.
# O edl.json fica sem o caminho do vídeo, porque ele volta ao servidor no mapa de edição.
# No Windows (Git Bash), os programas terminam a linha com \r: por isso o tr -d '\r' em cada resposta.
set -e
# Em português, o awk e o sort usariam vírgula nos decimais e leriam errado os números do ffmpeg.
unset LC_ALL; export LC_NUMERIC=C
[ $# -eq 1 ] || { echo "Uso: bash cortar.sh <pasta-do-video>"; exit 1; }

caminho() { (cd "$1" && { pwd -W 2>/dev/null || pwd -P; }); }

KIT_CASA="$(caminho "$HOME")/.creator-hub"
export PATH="$KIT_CASA/bin:$PATH"
FERRAMENTAS="$(caminho "$(dirname "$0")")"
PY="$KIT_CASA/video-use/.venv/bin/python"
C="$(caminho "$1")/1-corte"

[ -f "$C/edl.json" ] || { echo "Falta o edl.json: decida os cortes antes."; exit 1; }
SRC="$(tr -d '\r' < "$C/fonte.txt")"
[ -f "$SRC" ] || { echo "Não encontrei o vídeo original em: $SRC"; exit 1; }

# A cor do preparar_cor.sh entra só aqui: o caminho dela fica fora do edl.json, que volta ao servidor no mapa.
node -e '
  const fs = require("fs");
  const [entrada, saida, bruto, cor, janela, modulo] = process.argv.slice(1);
  const edl = JSON.parse(fs.readFileSync(entrada, "utf8"));
  edl.sources.raw = bruto;
  if (fs.existsSync(cor)) edl.grade = fs.readFileSync(cor, "utf8").trim();
  // Corte de gravação longa: o edl.json está no tempo do corte, e o vídeo original, no tempo da gravação.
  if (fs.existsSync(janela)) edl.ranges = require(modulo).noTempoDoBruto(edl.ranges, JSON.parse(fs.readFileSync(janela, "utf8")).janelas);
  fs.writeFileSync(saida, JSON.stringify(edl, null, 2));' "$C/edl.json" "$C/edl-render.json" "$SRC" "$C/cor.txt" "$C/janela.json" "$FERRAMENTAS/cortes/no_tempo_do_bruto.cjs"

cd "$C"
rm -rf clips_graded
# Sem isto, um corte refeito que falhasse no som deixaria o vídeo do corte anterior no lugar.
rm -f edited_voz.mp4
"$PY" "$KIT_CASA/video-use/helpers/render.py" edl-render.json -o edited.mp4 --no-subtitles > render.log 2>&1 || { tail -5 render.log; echo "O corte não deu certo. Detalhes em $C/render.log"; exit 1; }
"$PY" "$FERRAMENTAS/audio/montar_audio.py" edl-render.json edited.mp4 -o edited_voz.mp4 --lufs -15 > som.log 2>&1 || { tail -5 som.log; echo "O som do corte não deu certo. Detalhes em $C/som.log"; exit 1; }
tail -2 som.log
rm -rf clips_graded base.mp4

DUR=$(ffprobe -v error -show_entries format=duration -of csv=p=0 edited_voz.mp4 | tr -d '\r')
[ -n "$DUR" ] || { echo "O vídeo cortado saiu com defeito: $C/edited_voz.mp4"; exit 1; }
echo "Corte pronto: $C/edited_voz.mp4 (${DUR}s)."
