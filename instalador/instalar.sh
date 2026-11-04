#!/bin/sh
# Instalador do kit de edição do Creator Hub para Mac (chip Apple ou Intel).
# Não pede senha nem administrador. Pode rodar quantas vezes quiser: o que já está pronto é pulado.
#
#   curl -fsSL <url> | zsh                 instala o que falta
#   curl -fsSL <url> | KIT_CHECAR=1 zsh    só confere, sem instalar nada
#   zsh instalar.sh [--checar]             o mesmo, rodando do arquivo
#
# Só para testar:
#   KIT_FONTE=<pasta>    copia os arquivos do kit dessa pasta em vez de baixar do GitHub
#   KIT_ARQ=x86_64       escolhe os programas de Intel num Mac com chip Apple (com arch -x86_64)
#
# Onde as coisas ficam: tudo em ~/.creator-hub e ~/Edicoes, com três exceções que têm o caminho fixo nas
# próprias ferramentas: ~/.cache/puppeteer (o Chrome do Puppeteer), ~/.cache/hyperframes (o Chrome que o
# HyperFrames usa no render) e ~/.hyperframes (configuração do HyperFrames, com a telemetria desligada).
#
# Regras para quem mexer aqui:
# - Roda em zsh, bash e sh. Nada de array, [[ ]], print ou glob, e nada de variável chamada path ou status.
# - Nunca chame git, python3, make, cc, xcrun nem otool: num Mac sem as ferramentas de desenvolvedor, eles
#   abrem a janela da Apple. Pelo mesmo motivo o uv só usa o Python dele (UV_PYTHON_PREFERENCE).
# - O plugin entra por um marketplace numa pasta local, porque "marketplace add" com fonte no GitHub chama o git.
#   O escopo é o da pasta Edicoes: o plugin não aparece em outros projetos da pessoa. Computador da empresa, que
#   tem o kit em ~/Edicoes com skills de mesmo nome, não recebe o plugin.
# - O script chega por pipe: tudo fica em funções e a única chamada é a última linha, assim um download
#   cortado no meio não executa nada pela metade. Os comandos não podem ler a entrada padrão.

# Versões revisadas. Para atualizar, troque a versão e os SHA-256 juntos, e teste de novo.
NODE_VERSAO=22.23.4
FFMPEG_VERSAO=9.0.2
UV_VERSAO=0.13.4
VIDEO_USE_COMMIT=b877063835e6ea6e457124da7e28a0ae26691dc3
# 3.12 é a versão com pacote pronto de tudo nos três sistemas: no 3.14, o mlx exige macOS 14 e o
# onnxruntime (faster-whisper) não existe para Intel.
PYTHON_VERSAO=3.12
# Pacotes de Python publicados até esta data: o assinante recebe o que foi testado, não o lançamento de hoje.
PYTHON_PACOTES_ATE=2026-11-01T00:00:00Z

KIT_RAW=https://raw.githubusercontent.com/afabricadeideiasoficial/creator-hub-kit/main
KIT_TARBALL=https://codeload.github.com/afabricadeideiasoficial/creator-hub-kit/tar.gz/refs/heads/main
ARQ_TRANSCRICAO=plugins/creator-hub/ferramentas/transcribe_local.py
ARQ_PACKAGE=plugins/creator-hub/ferramentas/modelo/package.json
ARQ_LOCK=plugins/creator-hub/ferramentas/modelo/package-lock.json

escolher_programas() {
  case "$ARQ" in
    arm64)
      NOME_MAC="Mac com chip Apple"
      NODE_ARQ=darwin-arm64
      NODE_SHA=037650d0839f457747396f052073fb48333d31bf5abd3c98b74da20d89ebb1ad
      FFMPEG_PASTA=arm64/1789931890_9.0.2
      FFMPEG_SHA=c8ed4c4e6978a03c485edbfe4e0a5dc2380f8a30bba5150531b31b094492d924
      FFPROBE_SHA=fcbe839537485eaee7a7a8bc5cbc0f90d53617e80943e8a5b2e31cb851197ea6
      UV_NOME=uv-aarch64-apple-darwin
      UV_SHA=e0b1d4743ce64c55d9f0f4a444afa6b81125680070ee04e853fcd0f6c1ebf8f1
      WHISPER_MODULO=mlx_whisper
      WHISPER_PACOTE=mlx-whisper
      ;;
    x86_64)
      NOME_MAC="Mac Intel"
      NODE_ARQ=darwin-x64
      NODE_SHA=f42abca7aaac61efc57d49fb42ea84fc53bbeba9a749cb03a291ce6e4e7a69c1
      FFMPEG_PASTA=amd64/1789931006_9.0.2
      FFMPEG_SHA=7c6b4125b191cbf773832dc51f424cf2b6bb7da43007d1e066f95909e47cacd4
      FFPROBE_SHA=2322438ed2f6319a691291b247d09c69dcaa3a982460d1f269a7e1af335cfdfd
      UV_NOME=uv-x86_64-apple-darwin
      UV_SHA=7be2dcd316122f4b3e5a0a7889f6248266c14425374e105ff7dc9779184603a6
      WHISPER_MODULO=faster_whisper
      WHISPER_PACOTE='faster-whisper>=1.1'
      ;;
    *)
      printf 'Este computador não é compatível com o kit (processador %s).\n' "$ARQ"
      exit 1
      ;;
  esac
}

# ---------------------------------------------------------------------------
# Mensagens e controle dos passos

titulo() { printf '\n%s\n' "$1"; }
linha() { printf '  %s\n' "$1"; }
aviso() { printf '  ATENÇÃO: %s\n' "$1"; }

anotar_falha() {
  FALHAS="$FALHAS  - $1
"
  N_FALHAS=$((N_FALHAS + 1))
}

# passo <nome> <função que confere> <função que instala> <o que está fazendo>
# O passo só conta como pronto se a conferência passar depois de instalar.
passo() {
  if "$2"; then
    linha "$1: ok"
    return 0
  fi
  if [ "$CHECAR" = 1 ]; then
    linha "$1: falta"
    anotar_falha "$1"
    return 1
  fi
  printf '  %s: %s... ' "$1" "$4"
  ERRO=""
  if "$3" && "$2"; then
    printf 'pronto\n'
    return 0
  fi
  printf 'não deu certo\n'
  anotar_falha "$1: ${ERRO:-não ficou pronto. Rode o instalador de novo: ele continua de onde parou.}"
  return 1
}

# ---------------------------------------------------------------------------
# Downloads

baixar() {  # <o que é> <url> <destino>
  if ! curl -fsSL --retry 3 --retry-delay 3 --connect-timeout 20 --speed-time 120 --speed-limit 1024 -o "$3" "$2" >>"$LOG" 2>&1; then
    rm -f "$3"
    ERRO="não consegui baixar $1. Confira a internet e rode o instalador de novo: ele continua de onde parou."
    return 1
  fi
}

baixar_conferido() {  # <o que é> <url> <sha-256> <destino>
  baixar "$1" "$2" "$4" || return 1
  if [ "$(shasum -a 256 "$4" | awk '{print $1}')" != "$3" ]; then
    rm -f "$4"
    ERRO="o arquivo baixado veio diferente do esperado e foi descartado, por segurança. Rode o instalador de novo. Se repetir, fale com o suporte."
    return 1
  fi
}

pegar_do_kit() {  # <caminho no repositório>: deixa o arquivo em $TMP/kit/<caminho>
  destino="$TMP/kit/$1"
  [ -f "$destino" ] && return 0
  mkdir -p "$(dirname "$destino")"
  if [ -n "${KIT_FONTE:-}" ]; then
    cp "$KIT_FONTE/$1" "$destino" >>"$LOG" 2>&1 && return 0
    ERRO="não achei $1 em $KIT_FONTE."
    return 1
  fi
  baixar "o arquivo $1 do kit" "$KIT_RAW/$1" "$destino"
}

# ---------------------------------------------------------------------------
# bin/: Node, ffmpeg, ffprobe e uv

conferir_node() {
  [ "$("$BIN/node" -v 2>/dev/null)" = "v$NODE_VERSAO" ] && [ -f "$RAIZ/lib/node_modules/npm/bin/npm-cli.js" ]
}

instalar_node() {
  nome="node-v$NODE_VERSAO-$NODE_ARQ"
  baixar_conferido "o Node" "https://nodejs.org/dist/v$NODE_VERSAO/$nome.tar.xz" "$NODE_SHA" "$TMP/node.tar.xz" || return 1
  # o node vai por último: se ele está lá na versão certa, o npm também está
  tar -xJf "$TMP/node.tar.xz" -C "$TMP" >>"$LOG" 2>&1 \
    && mkdir -p "$BIN" "$RAIZ/lib/node_modules" \
    && rm -rf "$RAIZ/lib/node_modules/npm" \
    && mv "$TMP/$nome/lib/node_modules/npm" "$RAIZ/lib/node_modules/npm" \
    && rm -f "$BIN/node" "$BIN/npm" "$BIN/npx" \
    && mv "$TMP/$nome/bin/npm" "$TMP/$nome/bin/npx" "$BIN/" \
    && mv "$TMP/$nome/bin/node" "$BIN/node"
}

conferir_programa_ffmpeg() {  # <ffmpeg|ffprobe>
  case "$("$BIN/$1" -version 2>/dev/null | head -n 1)" in
    "$1 version $FFMPEG_VERSAO"*) return 0 ;;
  esac
  return 1
}
conferir_ffmpeg() { conferir_programa_ffmpeg ffmpeg; }
conferir_ffprobe() { conferir_programa_ffmpeg ffprobe; }

instalar_programa_ffmpeg() {  # <ffmpeg|ffprobe> <sha-256>
  baixar_conferido "o $1" "https://ffmpeg.martin-riedl.de/download/macos/$FFMPEG_PASTA/$1.zip" "$2" "$TMP/$1.zip" || return 1
  unzip -q -o "$TMP/$1.zip" -d "$TMP/$1-zip" >>"$LOG" 2>&1 \
    && mkdir -p "$BIN" \
    && chmod +x "$TMP/$1-zip/$1" \
    && mv -f "$TMP/$1-zip/$1" "$BIN/$1"
}
instalar_ffmpeg() { instalar_programa_ffmpeg ffmpeg "$FFMPEG_SHA"; }
instalar_ffprobe() { instalar_programa_ffmpeg ffprobe "$FFPROBE_SHA"; }

conferir_uv() {
  case "$("$BIN/uv" --version 2>/dev/null)" in
    "uv $UV_VERSAO"*) return 0 ;;
  esac
  return 1
}

instalar_uv() {
  baixar_conferido "o uv" "https://github.com/astral-sh/uv/releases/download/$UV_VERSAO/$UV_NOME.tar.gz" "$UV_SHA" "$TMP/uv.tar.gz" || return 1
  tar -xzf "$TMP/uv.tar.gz" -C "$TMP" >>"$LOG" 2>&1 \
    && mkdir -p "$BIN" \
    && mv -f "$TMP/$UV_NOME/uv" "$BIN/uv"
}

# ---------------------------------------------------------------------------
# video-use/: cortes e transcrição

conferir_video_use() {
  [ "$(cat "$VU/.commit" 2>/dev/null)" = "$VIDEO_USE_COMMIT" ] && [ -f "$VU/helpers/render.py" ]
}

instalar_video_use() {
  baixar "o video-use" "https://codeload.github.com/browser-use/video-use/tar.gz/$VIDEO_USE_COMMIT" "$TMP/video-use.tar.gz" || return 1
  tar -xzf "$TMP/video-use.tar.gz" -C "$TMP" >>"$LOG" 2>&1 \
    && rm -rf "$VU" \
    && mv "$TMP/video-use-$VIDEO_USE_COMMIT" "$VU" \
    && printf '%s\n' "$VIDEO_USE_COMMIT" >"$VU/.commit"
}

conferir_transcricao() {
  [ -f "$VU/helpers/transcribe_local.py" ] || return 1
  pegar_do_kit "$ARQ_TRANSCRICAO" || return 0   # sem internet para comparar, fica o que já está lá
  cmp -s "$TMP/kit/$ARQ_TRANSCRICAO" "$VU/helpers/transcribe_local.py"
}

instalar_transcricao() {
  pegar_do_kit "$ARQ_TRANSCRICAO" && cp "$TMP/kit/$ARQ_TRANSCRICAO" "$VU/helpers/transcribe_local.py"
}

conferir_ambiente() {
  [ -x "$VU/.venv/bin/python" ] \
    && "$VU/.venv/bin/python" -c "import librosa, matplotlib, numpy, PIL, requests, $WHISPER_MODULO" >>"$LOG" 2>&1
}

instalar_ambiente() {
  ERRO="não consegui preparar a transcrição. Confira a internet e rode o instalador de novo: ele continua de onde parou."
  # Ao trazer o Python, o uv chama install_name_tool, e num Mac sem as ferramentas de desenvolvedor esse
  # comando abre a janela da Apple. Este substituto não faz nada: o ajuste só importa para compilar, e aqui
  # só entra pacote pronto (--only-binary), pelo mesmo motivo.
  mkdir -p "$TMP/sem-janela" \
    && printf '#!/bin/sh\nexit 0\n' >"$TMP/sem-janela/install_name_tool" \
    && chmod +x "$TMP/sem-janela/install_name_tool" \
    && PATH="$TMP/sem-janela:$PATH" "$BIN/uv" venv -q --clear --python "$PYTHON_VERSAO" "$VU/.venv" >>"$LOG" 2>&1 \
    && "$BIN/uv" pip install -q --python "$VU/.venv/bin/python" --only-binary :all: -r "$VU/pyproject.toml" "$WHISPER_PACOTE" >>"$LOG" 2>&1 \
    && "$BIN/uv" pip install -q --python "$VU/.venv/bin/python" --no-deps -e "$VU" >>"$LOG" 2>&1
}

# ---------------------------------------------------------------------------
# pacotes/: HyperFrames, Puppeteer (com o Chrome) e GSAP

achou() { [ -n "$(find "$1" -type f -name "$2" 2>/dev/null | head -n 1)" ]; }

conferir_pacotes() {
  [ -f "$PAC/node_modules/hyperframes/dist/cli.js" ] && [ -f "$PAC/node_modules/.kit-lock" ] || return 1
  if pegar_do_kit "$ARQ_LOCK"; then
    cmp -s "$TMP/kit/$ARQ_LOCK" "$PAC/node_modules/.kit-lock" || return 1
  fi
  "$BIN/node" "$PAC/node_modules/hyperframes/dist/cli.js" --version >>"$LOG" 2>&1 || return 1
  achou "$HOME/.cache/puppeteer/chrome" 'Google Chrome for Testing' \
    && achou "$HOME/.cache/hyperframes/chrome" chrome-headless-shell
}

instalar_pacotes() {
  pegar_do_kit "$ARQ_PACKAGE" && pegar_do_kit "$ARQ_LOCK" || return 1
  ERRO="não consegui instalar as ferramentas de vídeo. Confira a internet e rode o instalador de novo: ele continua de onde parou."
  # O render do HyperFrames usa um Chrome próprio e o baixaria no primeiro vídeo: o browser ensure já o traz.
  # O npm ci apaga node_modules ao começar: a marca .kit-lock só existe depois de uma instalação inteira.
  mkdir -p "$PAC" \
    && cp "$TMP/kit/$ARQ_PACKAGE" "$PAC/package.json" \
    && cp "$TMP/kit/$ARQ_LOCK" "$PAC/package-lock.json" \
    && (cd "$PAC" && "$BIN/node" "$RAIZ/lib/node_modules/npm/bin/npm-cli.js" ci --no-audit --no-fund --loglevel=error) >>"$LOG" 2>&1 \
    && "$BIN/node" "$PAC/node_modules/hyperframes/dist/cli.js" browser ensure >>"$LOG" 2>&1 \
    && cp "$TMP/kit/$ARQ_LOCK" "$PAC/node_modules/.kit-lock"
}

# ---------------------------------------------------------------------------
# ~/Edicoes

copiar_inicial() {  # <caminho dentro da pasta inicial>
  origem="instalador/pasta-inicial/$1"
  if [ -f "$EDICOES/$1" ]; then
    # Ligar o plugin acrescenta o marketplace a este arquivo, então ele não fica igual ao modelo.
    if [ "$1" = ".claude/settings.json" ] && grep -q 'creator-hub' "$EDICOES/$1"; then
      linha "Pasta Edicoes, $1: ok"
      return 0
    fi
    if pegar_do_kit "$origem" && ! cmp -s "$TMP/kit/$origem" "$EDICOES/$1"; then
      aviso "o arquivo $1 já existe na pasta Edicoes e é diferente do modelo. Não mexi nele."
    else
      linha "Pasta Edicoes, $1: ok"
    fi
    return 0
  fi
  if [ "$CHECAR" = 1 ]; then
    linha "Pasta Edicoes, $1: falta"
    anotar_falha "Pasta Edicoes, $1"
    return 1
  fi
  ERRO=""
  if pegar_do_kit "$origem" && mkdir -p "$(dirname "$EDICOES/$1")" && cp "$TMP/kit/$origem" "$EDICOES/$1"; then
    linha "Pasta Edicoes, $1: pronto"
  else
    linha "Pasta Edicoes, $1: não deu certo"
    anotar_falha "Pasta Edicoes, $1: ${ERRO:-não consegui copiar o arquivo. Rode o instalador de novo.}"
  fi
}

# ---------------------------------------------------------------------------

resumo() {
  titulo "Resumo"
  if [ "$N_FALHAS" -eq 0 ]; then
    [ "$CHECAR" = 1 ] && linha "Tudo instalado." || linha "Tudo pronto: programas, transcrição, ferramentas de vídeo e pasta Edicoes."
    if [ "$KIT_DA_EMPRESA" = 1 ]; then
      linha "Este computador continua usando o kit da empresa."
    elif [ "$CHECAR" != 1 ]; then
      linha "Agora abra uma sessão NOVA no app do Claude, na pasta Edicoes (na sua pasta de usuário), e digite /fabrica."
      linha "A sessão que está aberta agora não enxerga o plugin."
    fi
    exit 0
  fi
  linha "$N_FALHAS item(ns) com problema:"
  printf '%s' "$FALHAS"
  if [ "$CHECAR" = 1 ]; then
    linha "Rode o instalador sem --checar para resolver."
  else
    linha "Basta rodar o instalador de novo: ele continua de onde parou. Se repetir, mostre esta mensagem ao Claude (detalhes em ~/.creator-hub/instalador.log)."
  fi
  exit 1
}

# ---------------------------------------------------------------------------
# Plugin do kit

achar_claude() {
  CLAUDE_EXE=""
  if [ -n "${CLAUDE_CODE_EXECPATH:-}" ] && [ -x "$CLAUDE_CODE_EXECPATH" ]; then
    CLAUDE_EXE=$CLAUDE_CODE_EXECPATH
  elif command -v claude >/dev/null 2>&1; then
    CLAUDE_EXE=$(command -v claude)
  fi
}

baixar_marketplace() {
  novo="$RAIZ/marketplace.novo"
  rm -rf "$novo"
  mkdir -p "$novo"
  if [ -n "${KIT_FONTE:-}" ]; then
    origem=$KIT_FONTE
  else
    baixar "o plugin do kit" "$KIT_TARBALL" "$TMP/kit.tar.gz" || return 1
    mkdir -p "$TMP/kit-tar"
    if ! tar -xzf "$TMP/kit.tar.gz" -C "$TMP/kit-tar" --strip-components=1 >>"$LOG" 2>&1; then
      ERRO="o plugin baixado veio com problema. Rode o instalador de novo."
      return 1
    fi
    origem="$TMP/kit-tar"
  fi
  if [ ! -f "$origem/plugins/creator-hub/.claude-plugin/plugin.json" ] || ! cp -R "$origem/.claude-plugin" "$origem/plugins" "$novo/" >>"$LOG" 2>&1; then
    rm -rf "$novo"
    ERRO="o plugin baixado veio incompleto. Rode o instalador de novo."
    return 1
  fi
  rm -rf "$MKT"
  mv "$novo" "$MKT"
}

ligar_plugin() {
  (
    cd "$EDICOES" || exit 1
    "$CLAUDE_EXE" plugin marketplace add "$MKT" --scope project \
      && "$CLAUDE_EXE" plugin marketplace update creator-hub \
      && "$CLAUDE_EXE" plugin install creator-hub@creator-hub --scope project \
      && "$CLAUDE_EXE" plugin update creator-hub@creator-hub --scope project
  ) >>"$LOG" 2>&1
}

plugin_ligado() {
  (cd "$EDICOES" && "$CLAUDE_EXE" plugin list --json 2>>"$LOG") | "$BIN/node" -e '
    let t = "";
    process.stdin.on("data", (d) => (t += d)).on("end", () => {
      let lista = [];
      try { lista = JSON.parse(t); } catch { process.exit(1); }
      process.exit(lista.some((p) => p.id === "creator-hub@creator-hub" && p.enabled) ? 0 : 1);
    });'
}

instalar_plugin() {
  if [ -e "$EDICOES/.claude/skills/novo-video/SKILL.md" ]; then
    KIT_DA_EMPRESA=1
    linha "Plugin do kit: este computador já tem o kit da empresa na pasta Edicoes. Não instalei, para não misturar os dois."
    return 0
  fi
  achar_claude
  if [ "$CHECAR" = 1 ]; then
    if [ -z "$CLAUDE_EXE" ]; then
      linha "Plugin do kit: só dá para conferir de dentro do app do Claude."
    elif plugin_ligado; then
      linha "Plugin do kit: ok"
    else
      linha "Plugin do kit: falta"
      anotar_falha "Plugin do kit"
    fi
    return 0
  fi
  printf '  Plugin do kit: baixando... '
  ERRO=""
  if ! baixar_marketplace; then
    printf 'não deu certo\n'
    anotar_falha "Plugin do kit: $ERRO"
    return 1
  fi
  printf 'pronto\n'
  if [ -z "$CLAUDE_EXE" ]; then
    linha "Plugin do kit: falta ligar."
    anotar_falha "Plugin do kit: este comando não rodou dentro do Claude. Abra o app do Claude numa sessão qualquer e peça para ele rodar este mesmo comando de instalação."
    return 1
  fi
  printf '  Plugin do kit: ligando na pasta Edicoes... '
  if ligar_plugin && plugin_ligado; then
    printf 'pronto\n'
    return 0
  fi
  printf 'não deu certo\n'
  anotar_falha "Plugin do kit: não consegui ligar o plugin na pasta Edicoes. Rode o instalador de novo."
  return 1
}

principal() {
  CHECAR=0
  [ "${1:-}" = "--checar" ] && CHECAR=1
  [ "${KIT_CHECAR:-}" = 1 ] && CHECAR=1
  FALHAS=""
  N_FALHAS=0
  KIT_DA_EMPRESA=0

  if [ "$(uname -s)" != Darwin ]; then
    printf 'Este instalador é para Mac. No Windows, use o instalar.ps1.\n'
    exit 1
  fi
  ARQ=$(uname -m)
  # Terminal aberto no modo Rosetta num Mac com chip Apple: vale o chip de verdade
  [ "$ARQ" = x86_64 ] && [ "$(sysctl -n sysctl.proc_translated 2>/dev/null)" = 1 ] && ARQ=arm64
  [ -n "${KIT_ARQ:-}" ] && ARQ=$KIT_ARQ
  escolher_programas

  RAIZ="$HOME/.creator-hub"
  BIN="$RAIZ/bin"
  VU="$RAIZ/video-use"
  PAC="$RAIZ/pacotes"
  EDICOES="$HOME/Edicoes"
  MKT="$RAIZ/marketplace"

  if [ "$CHECAR" = 1 ]; then
    TMP=$(mktemp -d "${TMPDIR:-/tmp}/creator-hub.XXXXXX") || exit 1
    LOG=/dev/null
  else
    mkdir -p "$RAIZ" || { printf 'Não consegui criar a pasta do kit na sua pasta de usuário.\n'; exit 1; }
    TMP="$RAIZ/.tmp"
    rm -rf "$TMP"
    mkdir -p "$TMP"
    LOG="$RAIZ/instalador.log"
    : >"$LOG"
  fi
  trap 'rm -rf "$TMP"' EXIT
  trap 'exit 130' INT TERM

  PATH="$BIN:$PATH"
  # Tudo fica dentro de ~/.creator-hub, e nada de Python do sistema nem configuração de fora.
  export PATH UV_CACHE_DIR="$RAIZ/cache/uv" UV_PYTHON_INSTALL_DIR="$RAIZ/python" UV_PYTHON_BIN_DIR="$RAIZ/python/bin"
  export UV_PYTHON_PREFERENCE=only-managed UV_NO_CONFIG=1 UV_EXCLUDE_NEWER="$PYTHON_PACOTES_ATE"
  export NPM_CONFIG_CACHE="$RAIZ/cache/npm" NPM_CONFIG_UPDATE_NOTIFIER=false
  export MPLCONFIGDIR="$TMP/matplotlib"
  # Sem telemetria e sem procurar atualização nos comandos deste instalador.
  export DO_NOT_TRACK=1 HYPERFRAMES_NO_TELEMETRY=1 HYPERFRAMES_NO_UPDATE_CHECK=1
  unset VIRTUAL_ENV PYTHONHOME PYTHONPATH

  titulo "Kit de edição do Creator Hub"
  livre=$(df -Pk "$HOME" | awk 'NR==2{print int($4/1048576)}')
  linha "$NOME_MAC, $livre GB livres no disco"
  # o Chrome do Puppeteer pede macOS 13
  [ "$(sw_vers -productVersion | cut -d. -f1)" -lt 13 ] && aviso "este macOS é antigo. O kit pede macOS 13 ou mais novo: se algum passo não der certo, atualize o sistema."
  [ "$livre" -lt 30 ] && aviso "pouco espaço no disco. O kit ocupa cerca de 4 GB, contando o modelo de transcrição, e cada vídeo pede mais alguns. Libere espaço assim que puder."

  titulo "Programas"
  passo "Node $NODE_VERSAO" conferir_node instalar_node "baixando"
  passo "ffmpeg $FFMPEG_VERSAO" conferir_ffmpeg instalar_ffmpeg "baixando"
  passo "ffprobe $FFMPEG_VERSAO" conferir_ffprobe instalar_ffprobe "baixando"
  passo "uv $UV_VERSAO" conferir_uv instalar_uv "baixando"

  titulo "Transcrição e cortes"
  if passo "video-use" conferir_video_use instalar_video_use "baixando"; then
    passo "Transcrição local" conferir_transcricao instalar_transcricao "copiando"
    if conferir_uv; then
      passo "Ambiente de transcrição" conferir_ambiente instalar_ambiente "preparando (alguns minutos)"
    else
      anotar_falha "Ambiente de transcrição: depende do uv, que não ficou pronto."
    fi
  fi

  titulo "Ferramentas de vídeo"
  if conferir_node; then
    if passo "HyperFrames e Chrome" conferir_pacotes instalar_pacotes "instalando (alguns minutos)" && [ "$CHECAR" != 1 ]; then
      "$BIN/node" "$PAC/node_modules/hyperframes/dist/cli.js" telemetry disable >>"$LOG" 2>&1
    fi
  else
    anotar_falha "HyperFrames e Chrome: depende do Node, que não ficou pronto."
  fi

  titulo "Sua pasta de trabalho"
  if [ -d "$EDICOES" ]; then
    linha "Pasta Edicoes: ok"
  elif [ "$CHECAR" = 1 ]; then
    linha "Pasta Edicoes: falta"
    anotar_falha "Pasta Edicoes"
  elif mkdir -p "$EDICOES"; then
    linha "Pasta Edicoes: criada"
  else
    linha "Pasta Edicoes: não deu certo"
    anotar_falha "Pasta Edicoes: não consegui criar a pasta na sua pasta de usuário."
  fi
  copiar_inicial "CLAUDE.md"
  copiar_inicial ".claude/settings.json"
  instalar_plugin

  # O cache só serve para retomar uma instalação interrompida.
  [ "$CHECAR" != 1 ] && [ "$N_FALHAS" -eq 0 ] && rm -rf "$RAIZ/cache"

  resumo
}

principal "$@" </dev/null
