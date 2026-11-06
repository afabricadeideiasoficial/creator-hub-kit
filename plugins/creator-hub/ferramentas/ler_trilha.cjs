// Lê um campo de uma trilha do vídeo, como r_frame_rate, height ou channels.
// Uso: node ler_trilha.cjs <arquivo> <v:0 | a:0> <campo>
// Sempre em JSON, nunca em csv: no csv, o ffprobe 9 repete a resposta quando o arquivo tem trilha de horário
// (vídeo exportado de editor), e a marca de rotação (celular, câmera) deixa uma vírgula no fim dela.
const { spawnSync } = require("child_process");

const [arquivo, trilha, campo] = process.argv.slice(2);
const r = spawnSync("ffprobe", ["-v", "error", "-select_streams", trilha, "-show_entries", `stream=${campo}`, "-of", "json", arquivo], { encoding: "utf8" });

let valor;
try {
  valor = JSON.parse(r.stdout).streams[0][campo];
} catch {}
if (valor === undefined) {
  console.error(`Não consegui ler ${campo} da trilha ${trilha} de ${arquivo}. ${(r.stderr ?? "").trim()}`.trim());
  process.exit(1);
}
console.log(valor);
