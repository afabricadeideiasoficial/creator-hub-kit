// Escreve os tempos dos cortes no vídeo final. Cada trecho do render tem ceil(duração × qps) quadros.
// Uso: node cortes_do_video.cjs <edl.json> <qps, como 24000/1001>
const fs = require("fs");

const [arquivo, qps] = process.argv.slice(2);
const [num, den] = qps.split("/").map(Number);
const quadrosPorSegundo = num / (den || 1);

const { ranges } = JSON.parse(fs.readFileSync(arquivo, "utf8"));
let quadros = 0;
const cortes = ranges.slice(0, -1).map((r) => {
  quadros += Math.ceil((r.end - r.start) * quadrosPorSegundo);
  return +(quadros / quadrosPorSegundo).toFixed(3);
});
console.log(JSON.stringify(cortes));
