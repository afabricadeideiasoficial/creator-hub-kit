#!/usr/bin/env bash
# Prepara a pasta de legendas para um estilo próprio, criado com a skill referencia. Roda depois do preparar_depois_do_corte.sh.
# Uso: bash preparar_estilo.sh <pasta-do-video> <pasta-do-estilo>
#   - faz o mesmo preparo dos estilos com receita (medidor de margens, fontes e palavras.txt)
#   - acrescenta as fontes extras do kit e as que a pessoa pôs na pasta fontes do estilo
#   - lista as fontes que o vídeo pode usar
set -e
[ $# -eq 2 ] || { echo "Uso: bash preparar_estilo.sh <pasta-do-video> <pasta-do-estilo>"; exit 1; }

caminho() { (cd "$1" && { pwd -W 2>/dev/null || pwd -P; }); }

AQUI="$(caminho "$(dirname "$0")")"
FERRAMENTAS="$(caminho "$AQUI/..")"
[ -f "$2/estilo.md" ] || { echo "Não encontrei o estilo.md em $2. Os estilos próprios ficam em Edicoes/Estilos/<nome>/."; exit 1; }

bash "$FERRAMENTAS/receita/preparar_receita.sh" "$1"

L="$(caminho "$1/2-legendas")"
cp "$AQUI/fontes/"*.ttf "$L/assets/fonts/"
if [ -d "$2/fontes" ]; then
  for f in "$2/fontes/"*; do
    case "$(printf '%s' "${f##*.}" | tr '[:upper:]' '[:lower:]')" in
      ttf | otf | woff | woff2) cp "$f" "$L/assets/fonts/" ;;
    esac
  done
fi

echo "Fontes que este vídeo pode usar, em assets/fonts/:"
for f in "$L/assets/fonts/"*; do
  case "$f" in *.ttf | *.otf | *.woff | *.woff2 | *.TTF | *.OTF) echo "- $(basename "$f")" ;; esac
done

# Os efeitos sonoros que o estilo pede, pela linha "efeitos:" do cabeçalho do estilo.md (ex.: "efeitos: whoosh, pop").
EFEITOS="$(caminho "$HOME")/.creator-hub/efeitos"
PEDIDOS="$(sed -n '1,/^---$/{/^efeitos:/{s/^efeitos:[[:space:]]*//;p;};}' "$2/estilo.md" | tr -d '\r' | tr ',' ' ')"
case "$PEDIDOS" in '' | nenhum* | não* | nao*) exit 0 ;; esac
if [ ! -f "$EFEITOS/kit.json" ]; then
  echo "O estilo pede efeitos sonoros, mas eles não estão instalados: rode o instalar_efeitos.sh e este script de novo."
  exit 0
fi
mkdir -p "$L/assets/sfx"
cp "$EFEITOS/kit.json" "$EFEITOS/LEIA.md" "$L/assets/sfx/"
COPIADOS=""
for tipo in $PEDIDOS; do
  case "$tipo" in *[!a-z-]*) continue ;; esac
  [ -d "$EFEITOS/$tipo" ] || { echo "O estilo pede o efeito \"$tipo\", que o kit não tem."; continue; }
  rm -rf "$L/assets/sfx/$tipo"
  cp -R "$EFEITOS/$tipo" "$L/assets/sfx/$tipo"
  COPIADOS="$COPIADOS $tipo"
done
[ -z "$COPIADOS" ] || echo "Efeitos sonoros em assets/sfx/:$COPIADOS. Siga o assets/sfx/LEIA.md: o pico de cada som cai no quadro do evento."
