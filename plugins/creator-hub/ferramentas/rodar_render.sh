#!/usr/bin/env bash
# Roda o render do programa de vídeo na pasta atual (a do projeto). Se ele travar, tenta de novo sozinho, em pedaços;
# se falhar mesmo assim, mostra o motivo e para.
# Uso: bash rodar_render.sh [--em-pedacos] -o <saida> [outras opções do render, como --fps 30 --quality high]
#   --em-pedacos: se travar, pode gravar de novo em pedaços (só quem chama sabe se o vídeo aceita; veja abaixo)
# Sai com 0 quando o vídeo ficou pronto e com 1 quando não ficou: com `set -e`, o script que chamou para junto.
#
# Antes, a resposta do render passava por um `tail -2`. Numa falha o programa escreve "Render failed", o motivo e,
# por último, a dica "Try --docker for containerized rendering"; só a dica sobrava. Um aluno no Mac viu só ela,
# três vezes, e o script seguia para as conferências de um vídeo que não existia.
# No Windows (Git Bash), os programas terminam a linha com \r: por isso o tr -d '\r'.
#
# A trava: o navegador que grava os quadros congela, cada vez num ponto, e o programa desiste depois de 60 s parado.
# A 1ª tentativa é a de sempre. Com --em-pedacos, e só quando a falha é essa, as seguintes gravam em pedaços, com um
# navegador novo a cada pedaço, e cada uma continua dos pedaços que a anterior terminou. Outra falha para na hora.
#
# O navegador novo começa no meio do vídeo. Na legenda isso não muda nada; numa animação em que o lugar das coisas depende
# dos quadros de antes, elas pulam na emenda. Por isso só o vídeo editado (renderizar.sh) usa --em-pedacos, e mesmo nele
# o conferir_emendas.cjs compara as emendas antes: se alguma mudaria, não grava em pedaços. O vídeo animado e o mascote
# ficam de fora (medido: pulam), e o MOV transparente também: o programa grava cada pedaço num .mp4, que não aceita ProRes.
# Para desligar: HF_SEGMENTED_CAPTURE=false. Quem já liga os pedaços por conta própria (HF_SEGMENTED_CAPTURE=true, com
# --resume) fica no comando: aqui é uma tentativa só, e os pedaços ficam onde estão.
export PATH="$HOME/.creator-hub/bin:$PATH"

TENTATIVAS=6      # no máximo, em pedaços
QUADROS_PEDACO=300
PASTA_PEDACOS="renders/.hf-segments"   # onde o programa guarda os pedaços, dentro do projeto

AQUI="$(cd "$(dirname "$0")" && { pwd -W 2>/dev/null || pwd -P; })"
RECUPERA=""
if [ "${1:-}" = "--em-pedacos" ]; then RECUPERA=sim; shift; fi

SAIDA=""
FPS=""
FORMATO="mp4"
anterior=""
for a in "$@"; do
  [ "$anterior" = "-o" ] || [ "$anterior" = "--output" ] && SAIDA="$a"
  [ "$anterior" = "--fps" ] && FPS="$a"
  [ "$anterior" = "--format" ] && FORMATO="$a"
  anterior="$a"
done

[ "$FORMATO" = "mp4" ] || RECUPERA=""
[ -z "${HF_SEGMENTED_CAPTURE:-}" ] || RECUPERA=""

# Pedaço de outra vez nunca entra num vídeo: o programa reconhece o pedaço pela página, não pelo conteúdo do vídeo
# e das fotos. Por isso a pasta sai antes de começar e ao terminar.
limpar_pedacos() {
  [ -d "$PASTA_PEDACOS" ] || return 0
  rm -rf "$PASTA_PEDACOS" 2>/dev/null
  rmdir renders 2>/dev/null
  return 0
}

# Uma tentativa. Deixa em CODIGO a saída do programa e em RESPOSTA o que ele escreveu só nesta vez.
ESC="$(printf '\033')"
tentar() {
  local antes
  antes=$(wc -l < "$REGISTRO" | tr -d ' \r')
  node node_modules/hyperframes/dist/cli.js render . "$@" --quiet >> "$REGISTRO" 2>&1
  CODIGO=$?
  RESPOSTA="$(tail -n +$((antes + 1)) "$REGISTRO" | sed "s/${ESC}\[[0-9;]*m//g" | tr -d '\r')"
}

# O programa pode sair com 0 sem gravar o vídeo: o arquivo vazio ou ausente também é falha.
deu_certo() { [ $CODIGO -eq 0 ] && { [ -z "$SAIDA" ] || [ -s "$SAIDA" ]; }; }

ler_motivo() {
  # O motivo vem depois da linha "Render failed", com recuo. A dica do docker não serve para quem usa o kit.
  MOTIVO="$(printf '%s\n' "$RESPOSTA" | awk '/Render failed/ { achou = 1; next } achou' | grep -v 'Try --docker' | grep -v '^ *$')"
  TRAVOU=""
  printf '%s\n' "$MOTIVO" | grep -q 'capture stalled' && TRAVOU=sim
  # Sem a caixa de erro (o programa nem chegou a renderizar), mostra o fim da resposta.
  [ -n "$MOTIVO" ] || MOTIVO="$(printf '%s\n' "$RESPOSTA" | grep -v '^ *$' | grep -v 'Try --docker' | tail -15)"
  [ -n "$MOTIVO" ] || MOTIVO="o programa de vídeo parou sem dizer o motivo (código $CODIGO)."
  [ $CODIGO -eq 0 ] && MOTIVO="o programa terminou, mas não gravou o vídeo em $SAIDA."
  # Captura travada ("stuck at frame 2523/2658", aluno em 23/11): em que ponto do vídeo.
  QUADRO="$(printf '%s\n' "$MOTIVO" | sed -n 's/.*stuck at [a-z ]*\([0-9]*\)\/[0-9]*.*/\1/p' | head -1)"
  QUADROS="$(printf '%s\n' "$MOTIVO" | sed -n 's/.*stuck at [a-z ]*[0-9]*\/\([0-9]*\).*/\1/p' | head -1)"
  PONTO=""
  [ -n "$QUADRO" ] && PONTO="$(awk -v q="$QUADRO" -v f="${FPS:-30}" 'BEGIN { n = split(f, p, "/"); r = (n == 2 && p[2] > 0) ? p[1] / p[2] : p[1]; if (r > 0) { s = int(q / r); printf "%d:%02d", int(s / 60), s % 60 } }')"
  return 0
}

# Quantos pedaços já estão prontos (cada um tem uma linha "index" na lista do programa).
pedacos_prontos() { cat "$PASTA_PEDACOS"/*/segments.json 2>/dev/null | grep -c '"index"'; }

# O registro fica na pasta do projeto: se falhar, é o arquivo que o suporte pede. Guarda todas as tentativas.
REGISTRO="$(pwd)/render.log"
: > "$REGISTRO"

[ -n "$RECUPERA" ] && limpar_pedacos
tentar "$@"
if deu_certo; then
  printf '%s\n' "$RESPOSTA" | tail -2
  rm -f "$REGISTRO"
  exit 0
fi
ler_motivo

FEITAS=0
PONTOS="$PONTO"
PRONTOS=0
DE=""
MESMO_PONTO=sim
NAO_EM_PEDACOS=""
if [ -n "$RECUPERA" ] && [ -n "$TRAVOU" ]; then
  printf '\n=== Conferência das emendas ===\n' >> "$REGISTRO"
  EMENDAS="$(node "$AQUI/conferir_emendas.cjs" "${FPS:-30}" $QUADROS_PEDACO 2>&1)"
  if [ $? -ne 0 ]; then
    NAO_EM_PEDACOS="$(printf '%s\n' "$EMENDAS" | tr -d '\r' | tail -1)"
    [ -n "$NAO_EM_PEDACOS" ] || NAO_EM_PEDACOS="não deu para conferir as emendas."
  fi
  printf '%s\n' "$EMENDAS" >> "$REGISTRO"
fi
if [ -n "$RECUPERA" ] && [ -n "$TRAVOU" ] && [ -z "$NAO_EM_PEDACOS" ]; then
  trap limpar_pedacos EXIT
  [ -n "$QUADROS" ] && DE=" de $(((QUADROS + QUADROS_PEDACO - 1) / QUADROS_PEDACO))"
  echo "O navegador que grava o vídeo travou${PONTO:+ em $PONTO}. Gravando de novo em pedaços, com um navegador novo a cada pedaço. Demora mais; não precisa fazer nada."
  export HF_SEGMENTED_CAPTURE=true HF_SEGMENT_FRAMES=$QUADROS_PEDACO HF_SEGMENT_BROWSER_RECYCLE=1
  SEM_AVANCO=0
  CONTINUAR=""
  while [ -n "$TRAVOU" ] && [ $FEITAS -lt $TENTATIVAS ] && [ $SEM_AVANCO -lt 2 ]; do
    FEITAS=$((FEITAS + 1))
    printf '\n=== Tentativa %s em pedaços ===\n' "$FEITAS" >> "$REGISTRO"
    # Na primeira, sem --resume: ele aproveitaria pedaços que já estivessem na pasta.
    tentar "$@" --low-memory-mode $CONTINUAR
    CONTINUAR="--resume"
    if deu_certo; then
      echo "Deu certo: o vídeo foi gravado em pedaços (tentativa $FEITAS de $TENTATIVAS). Assista inteiro antes de entregar."
      printf '%s\n' "$RESPOSTA" | tail -2
      rm -f "$REGISTRO"
      exit 0
    fi
    PONTO_ANTES="$PONTO"
    ler_motivo
    [ -n "$TRAVOU" ] || break
    if [ "$PONTO" = "$PONTO_ANTES" ]; then MESMO_PONTO=sim; else MESMO_PONTO=""; fi
    AGORA=$(pedacos_prontos)
    if [ "$AGORA" -gt "$PRONTOS" ]; then SEM_AVANCO=0; else SEM_AVANCO=$((SEM_AVANCO + 1)); fi
    PRONTOS=$AGORA
    PONTOS="$PONTOS${PONTO:+, $PONTO}"
    if [ $FEITAS -lt $TENTATIVAS ] && [ $SEM_AVANCO -lt 2 ]; then
      echo "Travou de novo${PONTO:+ em $PONTO}. Continuando de onde parou: $PRONTOS$DE pedaços prontos."
    fi
  done
fi

echo "O render falhou. Motivo:"
printf '%s\n' "$MOTIVO" | sed 's/^ *//' | sed 's/^/  /'
if [ $FEITAS -gt 0 ]; then
  VEZES="$FEITAS vezes"
  [ $FEITAS -eq 1 ] && VEZES="1 vez"
  echo "Tentei também em pedaços, $VEZES: $PRONTOS$DE pedaços ficaram prontos. Travou em: $PONTOS."
fi
[ -n "$NAO_EM_PEDACOS" ] && echo "Não tentei em pedaços: $NAO_EM_PEDACOS"
if [ -n "$PONTO" ] && [ -n "$MESMO_PONTO" ]; then
  echo "O render travou em $PONTO do vídeo: confira o que aparece nesse ponto (vídeo extra, foto pesada, tela de impacto) e rode de novo."
elif [ -n "$PONTO" ]; then
  echo "O render travou em pontos diferentes do vídeo. Quando o ponto muda, a suspeita é pouca memória: feche os outros programas, reinicie o computador e rode de novo."
fi
# Os avisos que o programa deu antes da falha costumam dizer qual arquivo ou trecho deu problema.
printf '%s\n' "$RESPOSTA" | grep -q 'Render failed' && AVISOS="$(printf '%s\n' "$RESPOSTA" | awk '/Render failed/ { exit } /WARN/' | tail -5)"
if [ -n "$AVISOS" ]; then
  echo "Avisos do programa antes da falha:"
  printf '%s\n' "$AVISOS" | sed 's/^ *//' | sed 's/^/  /'
fi
df -Pk . | awk 'NR==2 {
  printf "Espaço livre no disco: %.1f GB.\n", $4 / 1048576
  if ($4 < 10 * 1048576) print "Pouco espaço: o render precisa de espaço para os arquivos temporários. Libere espaço e rode de novo."
}'
MEMORIA="$(node -e 'console.log(Math.round(require("os").totalmem() / 1073741824))' 2>/dev/null | tr -d '\r')"
[ -n "$MEMORIA" ] && echo "Memória do computador: $MEMORIA GB."
echo "A resposta completa do programa ficou em $REGISTRO."
exit 1
