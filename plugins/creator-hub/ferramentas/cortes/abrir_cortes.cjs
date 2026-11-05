// Monta a pasta de cada corte: só os trechos do momento, como se fossem um vídeo curto.
// O servidor e as outras ferramentas enxergam o tempo do corte. O janela.json guarda de onde cada pedaço veio, e o cortar.sh volta ao tempo da gravação.
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const FOLGA = 2; // segundos a mais em volta do trecho: o corte precisa ver onde a palavra termina e o respiro do fim
const SILENCIO_ENTRE_TRECHOS = 1; // sem isso, dois trechos colados pareceriam uma fala só
const SEM_SOM = -9000; // centésimos de dB

/** As janelas na linha do tempo do corte, cada uma apontando para o tempo da gravação. */
function janelasDe(trechos, duracao) {
  const janelas = [];
  let t = 0;
  for (const [a, b] of trechos) {
    const brutoIni = Math.max(0, a - FOLGA);
    const brutoFim = Math.min(duracao, b + FOLGA);
    janelas.push({ ini: +t.toFixed(3), fim: +(t + brutoFim - brutoIni).toFixed(3), bruto_ini: +brutoIni.toFixed(3) });
    t += brutoFim - brutoIni + SILENCIO_ENTRE_TRECHOS;
  }
  return janelas;
}

const brutoFimDe = (j) => j.bruto_ini + (j.fim - j.ini);

function energiaDoCorte(energia, janelas) {
  const db = new Array(Math.round(janelas.at(-1).fim * 100)).fill(SEM_SOM);
  for (const j of janelas) {
    const origem = Math.round(j.bruto_ini * 100);
    const destino = Math.round(j.ini * 100);
    const quantos = Math.round((j.fim - j.ini) * 100);
    for (let k = 0; k < quantos && origem + k < energia.db.length; k++) db[destino + k] = energia.db[origem + k];
  }
  return { hop: energia.hop ?? 0.01, db };
}

/** Só as palavras inteiras dentro de cada janela, no tempo do corte. */
function palavrasDoCorte(palavras, janelas) {
  const saida = [];
  for (const j of janelas) {
    const desvio = j.ini - j.bruto_ini;
    for (const p of palavras)
      if ((p.type ?? "word") === "word" && p.start >= j.bruto_ini && p.end <= brutoFimDe(j))
        saida.push({ ...p, start: +(p.start + desvio).toFixed(3), end: +(p.end + desvio).toFixed(3) });
  }
  return saida;
}

const noTempoDoCorte = (trechos, janelas) => trechos.map(([a, b], i) => [+(a - janelas[i].bruto_ini + janelas[i].ini).toFixed(2), +(b - janelas[i].bruto_ini + janelas[i].ini).toFixed(2)]);

function abrirCorte(gravacao, cliente, ferramentas, corte, fonte, nome) {
  const dir = path.join(gravacao, "cortes", corte.pasta);
  const c = path.join(dir, "1-corte");
  fs.mkdirSync(path.join(c, "transcripts"), { recursive: true });

  const origem = path.join(gravacao, "1-corte");
  const energia = JSON.parse(fs.readFileSync(path.join(origem, "energia.json"), "utf8"));
  const transcricao = JSON.parse(fs.readFileSync(path.join(origem, "transcripts", `${nome}.json`), "utf8"));
  const video = JSON.parse(fs.readFileSync(path.join(origem, "video.json"), "utf8"));

  const janelas = janelasDe(corte.trechos, energia.db.length * (energia.hop ?? 0.01));
  const trecho = path.join(c, "transcripts", "trecho.json");
  fs.writeFileSync(trecho, JSON.stringify({ ...transcricao, words: palavrasDoCorte(transcricao.words, janelas) }));
  fs.writeFileSync(path.join(c, "energia.json"), JSON.stringify(energiaDoCorte(energia, janelas)));
  fs.writeFileSync(path.join(c, "janela.json"), `${JSON.stringify({ janelas }, null, 1)}\n`);
  fs.writeFileSync(path.join(c, "fonte.txt"), `${fonte}\n`);
  if (fs.existsSync(path.join(origem, "cor.txt"))) fs.copyFileSync(path.join(origem, "cor.txt"), path.join(c, "cor.txt"));

  execFileSync(process.execPath, [
    path.join(ferramentas, "montar_video_json.cjs"), trecho, c, corte.pasta, corte.pasta, String(janelas.at(-1).fim), video.estilo,
    path.join(ferramentas, "marca-padrao.json"), path.join(cliente, "marca.json"),
  ]);

  const tempos = noTempoDoCorte(corte.trechos, janelas).map(([a, b]) => `${a} a ${b} s`).join(", depois ");
  fs.writeFileSync(path.join(dir, "project.md"), [
    `# ${corte.titulo}`, "", "## Estado atual", "Aberto: falta escolher os takes.", "", "## O momento",
    `- Fala escolhida neste corte: ${tempos}. O resto é folga para o corte achar o fim das palavras.`,
    `- Por que este momento: ${corte.motivo}`, "",
  ].join("\n"));
  return dir;
}

function main() {
  const [gravacao, cliente, numeros, ferramentas] = process.argv.slice(2);
  const arquivo = path.join(gravacao, "momentos", "cortes.json");
  if (!fs.existsSync(arquivo)) {
    console.log("Falta o cortes.json: confira os momentos antes.");
    process.exit(1);
  }
  const { cortes } = JSON.parse(fs.readFileSync(arquivo, "utf8"));
  const fonte = fs.readFileSync(path.join(gravacao, "1-corte", "fonte.txt"), "utf8").trim();
  const nome = path.basename(fonte).replace(/\.[^.]+$/, "");
  for (const texto of numeros.split(",")) {
    const corte = cortes.find((c) => c.numero === Number(texto));
    if (!corte) {
      console.log(`Não há corte ${texto.trim()}: a lista vai de 1 a ${cortes.length}.`);
      process.exit(1);
    }
    const pasta = path.join(gravacao, "cortes", corte.pasta);
    if (fs.existsSync(path.join(pasta, "project.md"))) {
      console.log(`Corte ${corte.numero} já estava aberto: ${pasta}`);
      continue;
    }
    console.log(`Corte ${corte.numero} aberto: ${abrirCorte(gravacao, cliente, ferramentas, corte, fonte, nome)}`);
  }
}

if (require.main === module) main();

module.exports = { janelasDe, energiaDoCorte, palavrasDoCorte, noTempoDoCorte };
