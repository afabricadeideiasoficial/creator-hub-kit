#!/usr/bin/env bash
# Prepara um vídeo bruto para o corte.
# Uso: bash preparar_corte.sh <bruto> <pasta-do-video> <pasta-do-cliente> <id-do-estilo>
#   - separa o áudio, usando só o canal com voz, e mede a energia a cada 10 ms
#   - transcreve em janelas de 30 s, se ainda não tiver transcrição
#   - escreve em <pasta-do-video>/1-corte/: transcript.json, energia.json, video.json e fonte.txt
# O caminho e a imagem do vídeo não vão ao servidor: só o texto da fala e os números da energia.
# No Windows (Git Bash), os programas terminam a linha com \r: por isso o tr -d '\r' em cada resposta.
set -e
# Em português, o awk e o sort usariam vírgula nos decimais e leriam errado os números do ffmpeg.
unset LC_ALL; export LC_NUMERIC=C
[ $# -eq 4 ] || { echo "Uso: bash preparar_corte.sh <bruto> <pasta-do-video> <pasta-do-cliente> <id-do-estilo>"; exit 1; }

caminho() { (cd "$1" && { pwd -W 2>/dev/null || pwd -P; }); }

KIT_CASA="$(caminho "$HOME")/.creator-hub"
export PATH="$KIT_CASA/bin:$PATH"
FERRAMENTAS="$(caminho "$(dirname "$0")")"
PY="$KIT_CASA/video-use/.venv/bin/python"

[ -f "$1" ] || { echo "Não encontrei o vídeo: $1"; exit 1; }
[ -x "$PY" ] || [ -x "$PY.exe" ] || { echo "O kit não está instalado neste computador. Rode o instalador do Creator Hub."; exit 1; }

SRC="$(caminho "$(dirname "$1")")/$(basename "$1")"
# Se o vídeo é um atalho, vale o arquivo de verdade: é o nome dele que a transcrição usa.
if [ -L "$SRC" ]; then SRC="$(readlink -f "$SRC" 2>/dev/null || printf '%s' "$SRC")"; fi
mkdir -p "$2/1-corte"
V="$(caminho "$2")"
CLIENTE="$(caminho "$3")"
ESTILO="$4"
NOME="$(basename "$SRC")"; NOME="${NOME%.*}"
C="$V/1-corte"

printf '%s\n' "$SRC" > "$C/fonte.txt"

# Gravador que grava num canal só deixa o outro vazio: a análise usa só o canal com voz.
FILTRO="anull"
if [ "$(node "$FERRAMENTAS/ler_trilha.cjs" "$SRC" a:0 channels)" = 2 ]; then
  FILTRO=$(ffmpeg -nostats -hide_banner -vn -t 120 -i "$SRC" -map 0:a:0 -af astats=metadata=0 -f null - 2>&1 | tr -d '\r' | node -e '
    let t = "";
    process.stdin.on("data", (d) => (t += d)).on("end", () => {
      const niveis = [...t.matchAll(/RMS level dB: (-?[\d.]+|-inf|nan)/g)].map((m) => (Number.isFinite(+m[1]) ? +m[1] : -200));
      const [e, d] = niveis;
      if (niveis.length >= 2 && Math.abs(e - d) > 20) console.log(`pan=mono|c0=c${e > d ? 0 : 1}`);
      else console.log("anull");
    });')
fi
[ -f "$C/audio16k.wav" ] || ffmpeg -hide_banner -loglevel error -y -i "$SRC" -vn -map 0:a:0 -af "$FILTRO" -ac 1 -ar 16000 -c:a pcm_s16le "$C/audio16k.wav"
node "$FERRAMENTAS/medir_energia.cjs" "$C/audio16k.wav" "$C/energia.json"

T="$C/transcripts/$NOME.json"
[ -f "$T" ] || "$PY" "$KIT_CASA/video-use/helpers/transcribe_local.py" "$SRC" --language pt --edit-dir "$C"

DUR=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$SRC" | tr -d '\r')
node "$FERRAMENTAS/montar_video_json.cjs" "$T" "$C" "$(basename "$V")" "$NOME" "$DUR" "$ESTILO" "$FERRAMENTAS/marca-padrao.json" "$CLIENTE/marca.json"

echo "$NOME: bruto de ${DUR}s pronto em $C (estilo $ESTILO)."
