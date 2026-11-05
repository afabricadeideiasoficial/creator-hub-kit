// Escreve o palavras.txt da receita a partir do video.json e do transcript.json da pasta de legendas.
// Uso: node escrever_palavras.cjs <pasta-2-legendas>
const fs = require("fs");
const path = require("path");

const pasta = process.argv[2];
const video = JSON.parse(fs.readFileSync(path.join(pasta, "video.json"), "utf8"));
const palavras = JSON.parse(fs.readFileSync(path.join(pasta, "transcript.json"), "utf8")).words.filter((p) => (p.type ?? "word") === "word");

const marca = video.marca ?? {};
const destaque = ((marca.gradienteDestaque ?? "").match(/#[0-9a-fA-F]{6}/) ?? [marca.corMarcacao ?? "#E8697A"])[0];

const linhas = [
  `id: ${video.id}`,
  `duração (DUR): ${video.dur}`,
  `cortes: ${(video.cuts ?? []).join(" ")}`,
  `cor de destaque: ${destaque}`,
  `nome da marca: ${marca.nome ?? "não tem"}`,
  `música: ${marca.musica?.arquivo ?? "não tem"}`,
  "",
  "início fim palavra",
  ...palavras.map((p) => `${p.start.toFixed(2)} ${p.end.toFixed(2)} ${p.text.trim()}`),
];
fs.writeFileSync(path.join(pasta, "palavras.txt"), `${linhas.join("\n")}\n`);
