// Resumo do index.html, sem o que a tela da prévia muda só de abrir o arquivo: a marca data-hf-id em cada bloco e a escrita das primeiras linhas.
// Um clique na linha do tempo muda tempos e faixas, e isso muda o resumo. Quem chama são o previa.sh e o conferir_comp.sh.
// Uso: node assinatura_comp.cjs <index.html>
const { createHash } = require("crypto");
const fs = require("fs");

const normalizado = fs
  .readFileSync(process.argv[2], "utf8")
  .replace(/ data-hf-id="[^"]*"/g, "")
  .replace(/<!doctype html>/i, "<!doctype html>")
  .replace(/\s*\/>/g, ">");

console.log(createHash("sha256").update(normalizado).digest("hex"));
