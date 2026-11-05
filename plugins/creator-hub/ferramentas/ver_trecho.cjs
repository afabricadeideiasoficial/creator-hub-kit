// Lê o energia.json e o transcript.json do bruto e mostra palavras e volume de cada trecho. Quem chama é o ver_trecho.sh.
// Uso: node ver_trecho.cjs <energia.json> <transcript.json> [início-fim ...]
const fs = require("fs");

const [arquivoEnergia, arquivoTexto, ...pedidos] = process.argv.slice(2);
const { hop, db } = JSON.parse(fs.readFileSync(arquivoEnergia, "utf8"));
const palavras = JSON.parse(fs.readFileSync(arquivoTexto, "utf8")).words.filter((p) => (p.type ?? "word") === "word");

const PASSO = 0.1;
const comTempo = (p) => `${p.start.toFixed(2)}-${p.end.toFixed(2)} ${p.text.trim()}`;

// O arquivo guarda centésimos de dB.
const picoEntre = (ini, fim) => {
  const trecho = db.slice(Math.round(ini / hop), Math.round(fim / hop));
  return trecho.length ? Math.max(...trecho) / 100 : null;
};

if (pedidos.length === 0) {
  console.log(palavras.map(comTempo).join("\n"));
  process.exit(0);
}

const duracao = db.length * hop;
for (const pedido of pedidos) {
  const m = pedido.match(/^(\d+(?:[.,]\d+)?)-(\d+(?:[.,]\d+)?)$/);
  const ini = m ? +m[1].replace(",", ".") : NaN;
  const fim = m ? Math.min(+m[2].replace(",", "."), duracao) : NaN;
  if (!(fim > ini)) {
    console.log(`${pedido}: não entendi. Escreva início-fim em segundos, como 3.9-5.4, dentro dos ${duracao.toFixed(1)} s do bruto.`);
    continue;
  }
  const volumes = [];
  for (let t = ini; t < fim - 1e-9; t += PASSO) volumes.push(`${t.toFixed(1)}:${picoEntre(t, Math.min(t + PASSO, fim)).toFixed(0)}`);
  const ditas = palavras.filter((p) => p.start < fim && p.end > ini);
  console.log(`Trecho ${ini.toFixed(2)} a ${fim.toFixed(2)} s: pico de ${picoEntre(ini, fim).toFixed(0)} dB.`);
  console.log(`  volume a cada 0,1 s, em dB: ${volumes.join(" ")}`);
  console.log(`  palavras: ${ditas.length ? ditas.map(comTempo).join(" | ") : "nenhuma"}`);
}
