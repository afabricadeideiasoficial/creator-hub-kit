#!/usr/bin/env bash
# Abre a prévia em segundo plano. A última linha da saída é o endereço: é esse que se abre no navegador.
# Uso: bash previa.sh <pasta-do-projeto> [porta]
#   Se esta pasta já tem prévia aberta, usa a mesma. Se a porta estiver ocupada por outro vídeo ou outro programa, usa a próxima livre.
# No Windows (Git Bash), os programas terminam a linha com \r: por isso o tr -d '\r' em cada resposta.
set -e
# Em português, o awk e o sort usariam vírgula nos decimais e leriam errado os números do ffmpeg.
unset LC_ALL; export LC_NUMERIC=C
# Sem dados de uso e sem checagem de versão no programa de vídeo: a versão do kit é fixa.
export HYPERFRAMES_NO_TELEMETRY=1 HYPERFRAMES_NO_UPDATE_CHECK=1
[ $# -ge 1 ] || { echo "Uso: bash previa.sh <pasta-do-projeto> [porta]"; exit 1; }
export PATH="$HOME/.creator-hub/bin:$PATH"
PRIMEIRA="${2:-30710}"
TENTATIVAS=20
FERRAMENTAS="$(cd "$(dirname "$0")" && { pwd -W 2>/dev/null || pwd -P; })"
cd "$1"
[ -f index.html ] || { echo "Falta o index.html: gere as legendas antes."; exit 1; }
CLI=node_modules/hyperframes/dist/cli.js

# Guarda o resumo do arquivo que acabou de sair do motor, para o conferir_comp.sh saber se a tela da prévia mudou a edição.
if ! grep -q 'data-hf-id' index.html; then
  node "$FERRAMENTAS/assinatura_comp.cjs" index.html > .comp-da-previa
fi

# A porta da resposta em JSON do HyperFrames, só quando a prévia está de pé.
porta_da_resposta() {
  tr -d '\r' | node -e '
    let t = "";
    process.stdin.on("data", (d) => (t += d)).on("end", () => {
      const linha = t.split("\n").reverse().find((l) => l.trim().startsWith("{"));
      try {
        const { ok, result } = JSON.parse(linha);
        if (ok && result.port && result.state !== "not-running") console.log(result.port);
      } catch {}
    });' | tr -d '\r'
}

porta_livre() {
  node -e '
    const s = require("net").connect({ port: +process.argv[1], host: "localhost" });
    s.on("connect", () => { s.destroy(); process.exit(1); });
    s.on("error", () => process.exit(0));
    setTimeout(() => process.exit(1), 1500);' "$1"
}

ABERTA=$(node "$CLI" preview . --status --json --port "$PRIMEIRA" 2>/dev/null | porta_da_resposta || true)
if [ -n "$ABERTA" ]; then
  echo "Prévia em http://localhost:$ABERTA"
  exit 0
fi

PORTA="$PRIMEIRA"
while [ "$PORTA" -lt "$((PRIMEIRA + TENTATIVAS))" ]; do
  if porta_livre "$PORTA"; then
    SAIDA=$(node "$CLI" preview . --background --no-open --port "$PORTA" --json 2>&1) || true
    ABERTA=$(printf '%s\n' "$SAIDA" | porta_da_resposta)
    if [ -n "$ABERTA" ]; then
      echo "Prévia em http://localhost:$ABERTA"
      exit 0
    fi
    # Outro programa pode ter pegado a porta nesse meio-tempo: aí vale tentar a próxima. Qualquer outro erro para aqui.
    case "$SAIDA" in
      *preview-port-unavailable*) ;;
      *) printf '%s\n' "$SAIDA" | tail -5; echo "A prévia não abriu."; exit 1 ;;
    esac
  fi
  PORTA=$((PORTA + 1))
done
echo "Não achei porta livre entre $PRIMEIRA e $((PRIMEIRA + TENTATIVAS - 1)). Feche uma prévia antiga e rode de novo."
exit 1
