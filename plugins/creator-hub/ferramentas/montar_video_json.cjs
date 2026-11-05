// Escreve o transcript.json (sem os espaços) e o video.json da pasta 2-legendas.
// Uso: node montar_video_json.cjs <transcricao> <pasta> <id> <nome> <dur> <estilo> <marca-padrao.json> <marca-do-cliente.json> [marca-extra-json] [cortes-json]
const fs = require("fs");
const path = require("path");

const [transcricao, pasta, id, nome, dur, estilo, marcaPadrao, marcaCliente, marcaExtra, cortes] = process.argv.slice(2);

const lerJson = (arquivo) => JSON.parse(fs.readFileSync(arquivo, "utf8"));

const transcript = lerJson(transcricao);
transcript.words = transcript.words.filter((palavra) => palavra.type !== "spacing");
fs.writeFileSync(path.join(pasta, "transcript.json"), JSON.stringify(transcript, null, 1));

const marca = {
  ...lerJson(marcaPadrao),
  ...(fs.existsSync(marcaCliente) ? lerJson(marcaCliente) : {}),
  ...(marcaExtra ? JSON.parse(marcaExtra) : {}),
};

fs.writeFileSync(
  path.join(pasta, "video.json"),
  JSON.stringify({ id, titulo: `${nome}: legendas`, dur: Number(dur), estilo, ...(cortes ? { cuts: JSON.parse(cortes) } : {}), marca }, null, 1) + "\n",
);
