#!/usr/bin/env bash
# As ferramentas do Mascote 3D, a partir do pacote instalado em ~/.creator-hub/mascote-3d (bash instalar_mascote.sh).
# Uso: bash mascote.sh <comando> [argumentos]
#   novo <pasta-do-video>                     cria o projeto do vídeo; o canal é a pasta de cima que tem canal.json
#   transcrever <pasta-do-video>              transcreve assets/narracao.mp3 para transcript.json (neste computador)
#   montar <pasta-do-video>                   monta o index.html: legendas, cards, capítulos e opções A e B
#   ver <mascote.js> [--foto <selfie>]        imagem com 5 vistas do mascote (e a comparação com a selfie)
#   cores <selfie> [nome=x,y ...]             sem pontos, a selfie com grade; com pontos, a cor de cada um
#   trilha <saida.mp3> <segundos> [opções]    trilha de tensão feita aqui, sem custo e sem crédito de autoria
#   renderizar <pasta-do-video> <saida.mp4>   o vídeo inteiro, mais a cópia leve para ver no celular
# Nenhum quadro nem foto sai deste computador.
# No Windows (Git Bash), os programas terminam a linha com \r: por isso o tr -d '\r' em cada resposta.
set -e
# Em português, o awk e o sort usariam vírgula nos decimais e leriam errado os números do ffmpeg.
unset LC_ALL; export LC_NUMERIC=C
# Sem dados de uso e sem checagem de versão no programa de vídeo: a versão do kit é fixa.
export HYPERFRAMES_NO_TELEMETRY=1 HYPERFRAMES_NO_UPDATE_CHECK=1
unset GEMINI_API_KEY GOOGLE_API_KEY

caminho() { (cd "$1" && { pwd -W 2>/dev/null || pwd -P; }); }

KIT_CASA="$(caminho "$HOME")/.creator-hub"
export PATH="$KIT_CASA/bin:$PATH"
AQUI="$(caminho "$(dirname "$0")")"
FERRAMENTAS="$(dirname "$AQUI")"
M="$KIT_CASA/mascote-3d"
PY="$KIT_CASA/video-use/.venv/bin/python"
[ -x "$PY" ] || [ -x "$PY.exe" ] || { echo "O kit não está instalado neste computador. Rode o instalador do Creator Hub."; exit 1; }
[ -f "$M/VERSAO" ] || { echo "Falta o Mascote 3D: chame a ferramenta baixar_mascote, rode o comando dela e depois bash instalar_mascote.sh."; exit 1; }
export MASCOTE_HF_CLI="$KIT_CASA/pacotes/node_modules/hyperframes/dist/cli.js"

COMANDO="${1:-}"
[ $# -gt 0 ] && shift

case "$COMANDO" in
  novo)
    [ $# -eq 1 ] || { echo "Uso: bash mascote.sh novo <pasta-do-video>"; exit 1; }
    mkdir -p "$1"
    V="$(caminho "$1")"
    # O package.json do kit vem antes: assim o projeto usa o programa de vídeo fixo do kit.
    [ -f "$V/package.json" ] || cp "$FERRAMENTAS/modelo/package.json" "$V/package.json"
    "$PY" "$M/scripts/novo_video.py" "$V"
    [ -e "$V/node_modules" ] || node -e 'require("fs").symlinkSync(process.argv[1], process.argv[2], "junction")' "$KIT_CASA/pacotes/node_modules" "$V/node_modules"
    ;;

  transcrever)
    [ $# -eq 1 ] || { echo "Uso: bash mascote.sh transcrever <pasta-do-video>"; exit 1; }
    V="$(caminho "$1")"
    [ -f "$V/assets/narracao.mp3" ] || { echo "Falta a narração em $V/assets/narracao.mp3."; exit 1; }
    T="$(mktemp -d)"
    "$PY" "$KIT_CASA/video-use/helpers/transcribe_local.py" "$V/assets/narracao.mp3" --edit-dir "$T" --language pt >/dev/null
    "$PY" - "$T" "$V/transcript.json" <<'PY'
import json, sys
from pathlib import Path
dados = json.loads(next(Path(sys.argv[1], "transcripts").glob("*.json")).read_text(encoding="utf-8"))
palavras = [w for w in dados["words"] if w.get("type") != "spacing" and w.get("text", "").strip()]
Path(sys.argv[2]).write_text(json.dumps({"words": palavras}, ensure_ascii=False, indent=1), encoding="utf-8")
print(f"transcript.json: {len(palavras)} palavras, a última termina em {palavras[-1]['end']:.2f}s" if palavras else "Nenhuma palavra na narração.")
PY
    rm -rf "$T"
    DUR=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$V/assets/narracao.mp3" | tr -d '\r')
    echo "Narração: ${DUR}s (é o duracao_voz do video.json)."
    ;;

  montar)
    [ $# -eq 1 ] || { echo "Uso: bash mascote.sh montar <pasta-do-video>"; exit 1; }
    "$PY" "$M/scripts/montar_index.py" "$1"
    ;;

  ver)
    [ $# -ge 1 ] || { echo "Uso: bash mascote.sh ver <mascote.js> [--foto <selfie>]"; exit 1; }
    "$PY" "$M/scripts/ver_mascote.py" "$@"
    ;;

  cores)
    [ $# -ge 1 ] || { echo "Uso: bash mascote.sh cores <selfie> [nome=x,y ...]"; exit 1; }
    "$PY" "$M/scripts/cores_da_foto.py" "$@"
    ;;

  trilha)
    [ $# -ge 2 ] || { echo "Uso: bash mascote.sh trilha <saida.mp3> <segundos> [--fade-in 2] [--fade-out 1.2]"; exit 1; }
    "$PY" "$M/scripts/trilha.py" "$@"
    ;;

  renderizar)
    [ $# -eq 2 ] || { echo "Uso: bash mascote.sh renderizar <pasta-do-video> <saida.mp4>"; exit 1; }
    V="$(caminho "$1")"
    [ -f "$V/index.html" ] || { echo "Falta o index.html: rode bash mascote.sh montar antes."; exit 1; }
    [ -e "$2" ] && { echo "Já existe $2: escolha outro nome (-v2, -v3) para não gravar por cima de um vídeo aprovado."; exit 1; }
    mkdir -p "$(dirname "$2")"
    OUT="$(caminho "$(dirname "$2")")/$(basename "$2")"
    df -Pk "$V" | awk 'NR==2 && $4 < 10 * 1048576 {print "Aviso: menos de 10 GB livres no disco."}'
    (cd "$V" && node node_modules/hyperframes/dist/cli.js render . -o "$OUT" --fps 30 --quality high --quiet 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | tail -2)
    CELULAR="${OUT%.mp4}-celular.mp4"
    ffmpeg -hide_banner -loglevel error -y -i "$OUT" -c:v libx264 -crf 25 -preset medium -c:a aac -b:a 128k -movflags +faststart "$CELULAR"
    DUR=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$OUT" | tr -d '\r')
    echo "Vídeo: $OUT (${DUR}s). Cópia para o celular: $CELULAR"
    ;;

  *)
    sed -n '2,11p' "$0" | sed 's/^# \{0,1\}//'
    exit 1
    ;;
esac
