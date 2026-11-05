// Resumo do index.html, sem o que a tela da prévia muda só de abrir o arquivo: a marca data-hf-id em cada bloco, a escrita das primeiras linhas
// a caixa do nome das tags (ela regrava feMorphology como femorphology, e o navegador lê as duas igual) e o elemento vazio (<svg></svg> vira <svg />).
// Um clique na linha do tempo muda tempos e faixas, e isso muda o resumo. Quem chama são o previa.sh e o conferir_comp.sh.
// Uso: node assinatura_comp.cjs <index.html>
const { createHash } = require("crypto");
const fs = require("fs");

const normalizado = fs
  .readFileSync(process.argv[2], "utf8")
  .replace(/ data-hf-id="[^"]*"/g, "")
  .replace(/<!doctype html>/i, "<!doctype html>")
  .replace(/<\/?[a-zA-Z][\w-]*/g, (tag) => tag.toLowerCase())
  .replace(/\s*\/>/g, ">")
  .replace(/(<([a-z][\w-]*)\b[^<>]*>)<\/\2>/g, "$1");

console.log(createHash("sha256").update(normalizado).digest("hex"));
