#!/usr/bin/env bash
# Prepara a pasta de legendas de um vídeo que acabou de ser cortado.
# Uso: bash preparar_depois_do_corte.sh <pasta-do-video> <pasta-do-cliente> <id-do-estilo> [musica]
#   - transcreve o vídeo cortado de novo: os tempos das legendas são os dele, não os do bruto
#   - cria <pasta-do-video>/2-legendas/ com o vídeo, as fontes, o fundo das telas de impacto e a música
#   - escreve transcript.json e video.json, com a duração e os cortes de verdade
# No Windows (Git Bash), os programas terminam a linha com \r: por isso o tr -d '\r' em cada resposta.
set -e
# Em português, o awk e o sort usariam vírgula nos decimais e leriam errado os números do ffmpeg.
unset LC_ALL; export LC_NUMERIC=C
[ $# -ge 3 ] || { echo "Uso: bash preparar_depois_do_corte.sh <pasta-do-video> <pasta-do-cliente> <id-do-estilo> [musica]"; exit 1; }

caminho() { (cd "$1" && { pwd -W 2>/dev/null || pwd -P; }); }

KIT_CASA="$(caminho "$HOME")/.creator-hub"
export PATH="$KIT_CASA/bin:$PATH"
FERRAMENTAS="$(caminho "$(dirname "$0")")"
PY="$KIT_CASA/video-use/.venv/bin/python"
V="$(caminho "$1")"
CLIENTE="$(caminho "$2")"
ESTILO="$3"
MUSICA="${4:-}"
C="$V/1-corte"
L="$V/2-legendas"
VIDEO="$C/edited_voz.mp4"

[ -f "$VIDEO" ] || { echo "Falta o vídeo cortado: rode o corte antes."; exit 1; }
[ -z "$MUSICA" ] || [ -f "$MUSICA" ] || { echo "Não encontrei a música: $MUSICA"; exit 1; }
mkdir -p "$L/assets/fonts"

# A transcrição antiga é de outro corte: sem apagar, as legendas sairiam com os tempos velhos.
rm -f "$C/transcripts/edited_voz.json"
"$PY" "$KIT_CASA/video-use/helpers/transcribe_local.py" "$VIDEO" --language pt --edit-dir "$C"

cp "$FERRAMENTAS/modelo/medir_margens.cjs" "$FERRAMENTAS/modelo/hyperframes.json" "$FERRAMENTAS/modelo/package.json" "$L/"
cp "$FERRAMENTAS/fontes/"*.ttf "$L/assets/fonts/"
[ -d "$CLIENTE/fontes" ] && find "$CLIENTE/fontes" -maxdepth 1 -type f \( -iname '*.ttf' -o -iname '*.otf' \) -exec cp {} "$L/assets/fonts/" \;
[ -e "$L/node_modules" ] || node -e 'require("fs").symlinkSync(process.argv[1], process.argv[2], "junction")' "$KIT_CASA/pacotes/node_modules" "$L/node_modules"
node -e 'const fs=require("fs");const[a,b]=process.argv.slice(1);fs.rmSync(b,{force:true});try{fs.linkSync(a,b)}catch{fs.copyFileSync(a,b)}' "$VIDEO" "$L/assets/video.mp4"

# Início do último quadro: é a duração que evita quadro preto no fim.
DUR=$(ffprobe -v error -select_streams v:0 -show_entries packet=pts_time -of csv=p=0 "$VIDEO" | tr -d '\r' | sort -g | tail -1)
FPS=$(node "$FERRAMENTAS/ler_trilha.cjs" "$VIDEO" v:0 r_frame_rate)

# O fundo das telas de impacto: o da marca, se houver, ou um gradiente escuro na cor dela, para o texto continuar legível.
if [ -f "$CLIENTE/fundos/impacto.mp4" ]; then
  cp "$CLIENTE/fundos/impacto.mp4" "$L/assets/fundo-impacto.mp4"
elif [ ! -f "$L/assets/fundo-impacto.mp4" ]; then
  CORES=$(node -e '
    const fs = require("fs");
    const [padrao, cliente] = process.argv.slice(1);
    const m = { ...JSON.parse(fs.readFileSync(padrao, "utf8")), ...(fs.existsSync(cliente) ? JSON.parse(fs.readFileSync(cliente, "utf8")) : {}) };
    const cor = ((m.gradienteDestaque ?? "").match(/#[0-9a-fA-F]{6}/) ?? [m.corMarcacao ?? "#333333"])[0];
    const escura = (fator) => "#" + [1, 3, 5].map((i) => Math.round(parseInt(cor.slice(i, i + 2), 16) * fator).toString(16).padStart(2, "0")).join("");
    console.log(`${escura(0.4)} ${escura(0.15)}`);' "$FERRAMENTAS/marca-padrao.json" "$CLIENTE/marca.json")
  COR_A=${CORES%% *}; COR_B=${CORES##* }
  ffmpeg -hide_banner -loglevel error -y -f lavfi -i "gradients=size=1080x1920:rate=30:c0=${COR_A}:c1=${COR_B}:c2=#0b0b0d:nb_colors=3:duration=15:speed=0.01" -c:v libx264 -pix_fmt yuv420p -crf 20 "$L/assets/fundo-impacto.mp4"
fi

# O clique de câmera das legendas vem dos efeitos sonoros. Sem eles, o vídeo sai sem clique.
CLIQUE=null
if [ -f "$KIT_CASA/efeitos/clique.wav" ]; then
  mkdir -p "$L/assets/sfx"
  cp "$KIT_CASA/efeitos/clique.wav" "$L/assets/sfx/clique.wav"
  CLIQUE='{"arquivo":"assets/sfx/clique.wav","dur":1.02,"pico":0.042,"vol":0.6}'
fi

EXTRA="{\"soLegenda\":false,\"clique\":$CLIQUE}"
if [ -n "$MUSICA" ]; then
  bash "$FERRAMENTAS/musica.sh" "$MUSICA" "$L/assets/musica.m4a" "$(node -p "Number(process.argv[1]) + 0.45" "$DUR")"
  EXTRA="{\"soLegenda\":false,\"clique\":$CLIQUE,\"musica\":{\"arquivo\":\"assets/musica.m4a\",\"nome\":\"Música\"}}"
fi

CUTS=$(node "$FERRAMENTAS/cortes_do_video.cjs" "$C/edl.json" "$FPS")
node "$FERRAMENTAS/montar_video_json.cjs" "$C/transcripts/edited_voz.json" "$L" "$(basename "$V")" "$(basename "$V")" "$DUR" "$ESTILO" "$FERRAMENTAS/marca-padrao.json" "$CLIENTE/marca.json" "$EXTRA" "$CUTS"

echo "Pasta de legendas pronta em $L (duração ${DUR}s, estilo $ESTILO)."

# Compara as falas escolhidas com o que a transcrição ouviu no corte. Só avisa: não para o preparo.
if [ -f "$C/takes.json" ]; then
  node "$FERRAMENTAS/conferir_palavras.cjs" "$C/takes.json" "$C/transcripts/edited_voz.json" "$CUTS" "$C/transcript.json"
fi
