// Deixa a transcrição e a energia de uma gravação longa no tamanho do envio: o servidor limita a 5 MB, e duas horas de gravação passariam disso.
// Uso: node resumir_gravacao.cjs <transcricao.json> <energia.json> <pasta-momentos> <id-do-estilo>
const fs = require("fs");
const path = require("path");

const PASSO = 5; // quadros de 10 ms: a energia sai em passos de 50 ms

const mediana = (valores) => [...valores].sort((a, b) => a - b)[Math.floor(valores.length / 2)];

function resumir(transcricao, energia) {
  const words = transcricao.words
    .filter((p) => (p.type ?? "word") === "word")
    .map((p) => ({ text: p.text, start: p.start, end: p.end }));
  const db = [];
  for (let i = 0; i < energia.db.length; i += PASSO) db.push(mediana(energia.db.slice(i, i + PASSO)));
  return { transcript: { words }, energia: { hop: (energia.hop ?? 0.01) * PASSO, db } };
}

if (require.main === module) {
  const [arquivoTexto, arquivoEnergia, pasta, estilo] = process.argv.slice(2);
  const { transcript, energia } = resumir(JSON.parse(fs.readFileSync(arquivoTexto, "utf8")), JSON.parse(fs.readFileSync(arquivoEnergia, "utf8")));
  fs.mkdirSync(pasta, { recursive: true });
  fs.writeFileSync(path.join(pasta, "transcript.json"), JSON.stringify(transcript));
  fs.writeFileSync(path.join(pasta, "energia.json"), JSON.stringify(energia));
  fs.writeFileSync(path.join(pasta, "video.json"), JSON.stringify({ estilo }));
  const minutos = (energia.db.length * energia.hop) / 60;
  console.log(`Gravação de ${minutos.toFixed(1)} min pronta para achar os momentos: ${transcript.words.length} palavras.`);
}

module.exports = { resumir };
