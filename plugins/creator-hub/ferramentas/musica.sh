#!/usr/bin/env bash
# Monta a trilha no tamanho exato do vídeo, a partir de qualquer música.
# Música curta é emendada nela mesma com crossfade. O fim é um fade out, e o volume fica em torno de -26 LUFS,
# o nível em que a música fica em -20 dB debaixo da voz.
# Uso: bash musica.sh <musica> <saida.m4a> <segundos>
# No Windows (Git Bash), os programas terminam a linha com \r: por isso o tr -d '\r' em cada resposta.
set -e
# Em português, o awk e o sort usariam vírgula nos decimais e leriam errado os números do ffmpeg.
unset LC_ALL; export LC_NUMERIC=C
[ $# -eq 3 ] || { echo "Uso: bash musica.sh <musica> <saida.m4a> <segundos>"; exit 1; }

export PATH="$HOME/.creator-hub/bin:$PATH"
ENTRADA="$1"
SAIDA="$2"
N="$3"
CROSS=1

[ -f "$ENTRADA" ] || { echo "Não encontrei a música: $ENTRADA"; exit 1; }
D=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$ENTRADA" | tr -d '\r')

# Música muito curta não dá crossfade: pede outra.
awk -v d="$D" 'BEGIN { exit !(d >= 5) }' || { echo "A música tem só ${D}s: use uma de pelo menos 5 segundos."; exit 1; }

COPIAS=$(awk -v n="$N" -v d="$D" -v c="$CROSS" 'BEGIN { k = (n - c) / (d - c); i = int(k); if (i < k) i++; print (i < 1 ? 1 : i) }')
FILTRO=""
ANTERIOR="0:a"
i=1
while [ "$i" -lt "$COPIAS" ]; do
  FILTRO="${FILTRO}[${ANTERIOR}][${i}:a]acrossfade=d=${CROSS}[s${i}];"
  ANTERIOR="s${i}"
  i=$((i + 1))
done
FIM=$(awk -v n="$N" 'BEGIN { print n - 1.2 }')
FILTRO="${FILTRO}[${ANTERIOR}]atrim=0:${N},afade=t=out:st=${FIM}:d=1.2,loudnorm=I=-26:TP=-2:LRA=11,aresample=48000[o]"

# Cada cópia é uma entrada do ffmpeg.
ENTRADAS=()
i=0
while [ "$i" -lt "$COPIAS" ]; do
  ENTRADAS+=(-i "$ENTRADA")
  i=$((i + 1))
done

ffmpeg -hide_banner -loglevel error -y "${ENTRADAS[@]}" -filter_complex "$FILTRO" -map "[o]" -c:a aac -b:a 160k "$SAIDA"
echo "Trilha: $(ffprobe -v error -show_entries format=duration -of csv=p=0 "$SAIDA" | tr -d '\r')s em $SAIDA"
