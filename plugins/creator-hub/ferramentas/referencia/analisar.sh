#!/usr/bin/env bash
# Traz um vídeo de referência para a pasta do estilo e mede o jeito de editar dele.
# Uso: bash analisar.sh <video-ou-link> <pasta-do-estilo>
#   - link: baixa o vídeo (o baixador entra no kit na primeira vez); arquivo: copia, sem mexer no original
#   - escreve em <pasta-do-estilo>/analise/: analise.json, folha.jpg, cortes.jpg, gancho.jpg e quadro-01..04.jpg
#   - faz uma capa.jpg pequena, se a pasta ainda não tem
# Nada do vídeo vai ao servidor: a análise e a transcrição rodam neste computador.
# No Windows (Git Bash), os programas terminam a linha com \r: por isso o tr -d '\r' em cada resposta.
set -e
unset LC_ALL; export LC_NUMERIC=C
[ $# -eq 2 ] || { echo "Uso: bash analisar.sh <video-ou-link> <pasta-do-estilo>"; exit 1; }

caminho() { (cd "$1" && { pwd -W 2>/dev/null || pwd -P; }); }

KIT_CASA="$(caminho "$HOME")/.creator-hub"
export PATH="$KIT_CASA/bin:$PATH"
AQUI="$(caminho "$(dirname "$0")")"
PY="$KIT_CASA/video-use/.venv/bin/python"
[ -x "$PY" ] || [ -x "$PY.exe" ] || { echo "O kit não está instalado neste computador. Rode o instalador do Creator Hub."; exit 1; }

mkdir -p "$2"
P="$(caminho "$2")"

# Uma referência por estilo: se a pasta já tem uma, ela vale e nada é baixado de novo.
REF=""
for f in "$P"/referencia.*; do
  case "$f" in *.part | *.ytdl | *.tmp) continue ;; esac
  [ -f "$f" ] && { REF="$f"; break; }
done

case "$1" in
  http://* | https://*)
    if [ -z "$REF" ]; then
      if ! "$PY" -c "import yt_dlp" >/dev/null 2>&1; then
        echo "Primeira vez: instalando o baixador de vídeos no kit."
        uv pip install -q --python "$PY" yt-dlp >/dev/null 2>&1 || { echo "Não consegui instalar o baixador. Salve o vídeo no computador e me diga onde ele está."; exit 1; }
      fi
      echo "Baixando a referência..."
      if ! "$PY" -m yt_dlp -q --no-warnings --no-playlist -f "bv*[height<=1920]+ba/b[height<=1920]/b" \
        --merge-output-format mp4 -o "$P/referencia.%(ext)s" "$1"; then
        rm -f "$P"/referencia.*.part "$P"/referencia.*.ytdl
        echo "Não consegui baixar este link. Alguns sites, como o Instagram, pedem login para baixar: salve o vídeo no computador e me diga onde ele está."
        exit 1
      fi
      for f in "$P"/referencia.*; do [ -f "$f" ] && { REF="$f"; break; }; done
      [ -n "$REF" ] || { echo "O link não trouxe um vídeo. Salve o vídeo no computador e me diga onde ele está."; exit 1; }
    fi
    ;;
  *)
    [ -f "$1" ] || { echo "Não encontrei o vídeo: $1"; exit 1; }
    SRC="$(caminho "$(dirname "$1")")/$(basename "$1")"
    if [ -z "$REF" ]; then
      EXT="$(printf '%s' "${SRC##*.}" | tr '[:upper:]' '[:lower:]')"
      REF="$P/referencia.$EXT"
      cp "$SRC" "$REF"
    fi
    ;;
esac

"$PY" "$AQUI/analisar.py" "$REF" --saida "$P/analise" --transcritor "$KIT_CASA/video-use/helpers/transcribe_local.py" || {
  echo "Não consegui medir este vídeo. Confira se o arquivo abre no computador; se abrir, mande outro formato, como mp4."
  exit 1
}

if [ ! -f "$P/capa.jpg" ] && [ -f "$P/analise/quadro-02.jpg" ]; then
  ffmpeg -v error -y -i "$P/analise/quadro-02.jpg" -vf scale=540:-2 -q:v 4 "$P/capa.jpg"
fi

echo "Referência: $REF"
echo "Imagens para olhar: $P/analise/folha.jpg, cortes.jpg, gancho.jpg e quadro-01.jpg a quadro-04.jpg"
