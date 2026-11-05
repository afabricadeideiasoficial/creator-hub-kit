// Mede a energia do áudio a cada 10 ms, em janelas de 20 ms. Só mede: quem decide os cortes é o servidor.
// Uso: node medir_energia.cjs <audio16k.wav> <energia.json>
// O wav precisa ser mono, 16 kHz, 16 bits. O arquivo guarda centésimos de dB em números inteiros.
const fs = require("fs");

const [entrada, saida] = process.argv.slice(2);
if (!entrada || !saida) {
  console.error("Uso: node medir_energia.cjs <audio16k.wav> <energia.json>");
  process.exit(1);
}

const wav = fs.readFileSync(entrada);
if (wav.toString("latin1", 0, 4) !== "RIFF" || wav.toString("latin1", 8, 12) !== "WAVE") {
  console.error(`${entrada} não é um wav.`);
  process.exit(1);
}

let pos = 12;
let inicio = -1;
let tamanho = 0;
while (pos + 8 <= wav.length) {
  const nome = wav.toString("latin1", pos, pos + 4);
  const bytes = wav.readUInt32LE(pos + 4);
  if (nome === "data") {
    inicio = pos + 8;
    tamanho = Math.min(bytes, wav.length - inicio);
    break;
  }
  pos += 8 + bytes + (bytes % 2);
}
if (inicio < 0) {
  console.error(`${entrada} não tem áudio.`);
  process.exit(1);
}

const HOP = 160;
const JANELA = 320;
const amostras = Math.floor(tamanho / 2);
const quadros = Math.floor((amostras - JANELA) / HOP);
const db = new Array(Math.max(0, quadros));
for (let q = 0; q < quadros; q++) {
  let soma = 0;
  for (let k = 0; k < JANELA; k++) {
    const v = wav.readInt16LE(inicio + (q * HOP + k) * 2) / 32768;
    soma += v * v;
  }
  db[q] = Math.round(2000 * Math.log10(Math.sqrt(soma / JANELA) + 1e-9));
}

fs.writeFileSync(saida, JSON.stringify({ hop: 0.01, db }));
console.log(`Energia medida: ${(quadros / 100).toFixed(1)} s.`);
