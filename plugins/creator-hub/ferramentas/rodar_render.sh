#!/usr/bin/env bash
# Roda o render do programa de vídeo na pasta atual (a do projeto) e, se ele falhar, mostra o motivo e para.
# Uso: bash rodar_render.sh -o <saida> [outras opções do render, como --fps 30 --quality high]
# Sai com 0 quando o vídeo ficou pronto e com 1 quando não ficou: com `set -e`, o script que chamou para junto.
#
# Antes, a resposta do render passava por um `tail -2`. Numa falha o programa escreve "Render failed", o motivo e,
# por último, a dica "Try --docker for containerized rendering"; só a dica sobrava. Um aluno no Mac viu só ela,
# três vezes, e o script seguia para as conferências de um vídeo que não existia.
# No Windows (Git Bash), os programas terminam a linha com \r: por isso o tr -d '\r'.
export PATH="$HOME/.creator-hub/bin:$PATH"

SAIDA=""
FPS=""
anterior=""
for a in "$@"; do
  [ "$anterior" = "-o" ] || [ "$anterior" = "--output" ] && SAIDA="$a"
  [ "$anterior" = "--fps" ] && FPS="$a"
  anterior="$a"
done

# O registro fica na pasta do projeto: se falhar, é o arquivo que o suporte pede.
REGISTRO="$(pwd)/render.log"
node node_modules/hyperframes/dist/cli.js render . "$@" --quiet > "$REGISTRO" 2>&1
CODIGO=$?
ESC="$(printf '\033')"
RESPOSTA="$(sed "s/${ESC}\[[0-9;]*m//g" "$REGISTRO" | tr -d '\r')"

# O programa pode sair com 0 sem gravar o vídeo: o arquivo vazio ou ausente também é falha.
if [ $CODIGO -eq 0 ] && { [ -z "$SAIDA" ] || [ -s "$SAIDA" ]; }; then
  printf '%s\n' "$RESPOSTA" | tail -2
  rm -f "$REGISTRO"
  exit 0
fi

echo "O render falhou. Motivo:"
# O motivo vem depois da linha "Render failed", com recuo. A dica do docker não serve para quem usa o kit.
MOTIVO="$(printf '%s\n' "$RESPOSTA" | awk '/Render failed/ { achou = 1; next } achou' | grep -v 'Try --docker' | grep -v '^ *$')"
# Sem a caixa de erro (o programa nem chegou a renderizar), mostra o fim da resposta.
[ -n "$MOTIVO" ] || MOTIVO="$(printf '%s\n' "$RESPOSTA" | grep -v '^ *$' | grep -v 'Try --docker' | tail -15)"
[ -n "$MOTIVO" ] || MOTIVO="o programa de vídeo parou sem dizer o motivo (código $CODIGO)."
[ $CODIGO -eq 0 ] && MOTIVO="o programa terminou, mas não gravou o vídeo em $SAIDA."
printf '%s\n' "$MOTIVO" | sed 's/^ *//' | sed 's/^/  /'
# Captura travada ("stuck at frame 2523/2658", aluno em 23/11): diz em que ponto do vídeo, para conferir o que aparece ali.
QUADRO="$(printf '%s\n' "$MOTIVO" | sed -n 's/.*stuck at frame \([0-9]*\)\/[0-9]*.*/\1/p' | head -1)"
if [ -n "$QUADRO" ]; then
  PONTO="$(awk -v q="$QUADRO" -v f="${FPS:-30}" 'BEGIN { n = split(f, p, "/"); r = (n == 2 && p[2] > 0) ? p[1] / p[2] : p[1]; if (r > 0) { s = int(q / r); printf "%d:%02d", int(s / 60), s % 60 } }')"
  [ -n "$PONTO" ] && echo "O render travou em $PONTO do vídeo: confira o que aparece nesse ponto (vídeo extra, foto pesada, tela de impacto) e rode de novo."
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
echo "A resposta completa do programa ficou em $REGISTRO."
exit 1
