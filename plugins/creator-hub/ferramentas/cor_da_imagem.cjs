// As cores principais de uma imagem, sem contar fundo transparente, branco, preto e cinza. Quem chama é o cor_da_imagem.sh.
const { spawnSync } = require("child_process");

const LADO = 128;
const TRANSPARENTE_ABAIXO_DE = 128;
const NEUTRA_ABAIXO_DE = 32; // diferença entre o canal mais forte e o mais fraco
const MESMA_COR_ATE = 56;
const QUANTAS = 5;

const hex = ([r, g, b]) => `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;
const distancia = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const clarear = (cor, quanto) => cor.map((v) => v + (255 - v) * quanto);

/** Recebe os pontos em RGBA. Devolve as cores da mais presente para a menos presente e quanto há de neutro. */
function coresDe(rgba) {
  const baldes = new Map();
  let visiveis = 0;
  let neutros = 0;
  for (let i = 0; i + 3 < rgba.length; i += 4) {
    if (rgba[i + 3] < TRANSPARENTE_ABAIXO_DE) continue;
    const [r, g, b] = [rgba[i], rgba[i + 1], rgba[i + 2]];
    visiveis++;
    if (Math.max(r, g, b) - Math.min(r, g, b) < NEUTRA_ABAIXO_DE) {
      neutros++;
      continue;
    }
    const chave = (r >> 4) * 256 + (g >> 4) * 16 + (b >> 4);
    const balde = baldes.get(chave) ?? { soma: [0, 0, 0], n: 0 };
    balde.soma[0] += r;
    balde.soma[1] += g;
    balde.soma[2] += b;
    balde.n++;
    baldes.set(chave, balde);
  }

  const grupos = [];
  const emOrdem = [...baldes.values()].sort((a, b) => b.n - a.n);
  for (const balde of emOrdem) {
    const media = balde.soma.map((v) => v / balde.n);
    const grupo = grupos.find((g) => distancia(g.cor, media) <= MESMA_COR_ATE);
    if (grupo) {
      grupo.cor = grupo.cor.map((v, k) => (v * grupo.n + media[k] * balde.n) / (grupo.n + balde.n));
      grupo.n += balde.n;
    } else {
      grupos.push({ cor: media, n: balde.n });
    }
  }
  grupos.sort((a, b) => b.n - a.n);
  return { cores: grupos.slice(0, QUANTAS).map((g) => ({ cor: g.cor, parte: g.n / (visiveis || 1) })), neutra: neutros / (visiveis || 1) };
}

function texto({ cores, neutra }) {
  if (cores.length === 0) return `Esta imagem só tem branco, preto ou cinza (${Math.round(neutra * 100)}%). Pergunte à pessoa qual é a cor da marca.`;
  const principal = cores[0].cor;
  return [
    "Cores desta imagem, da que mais aparece para a que menos:",
    ...cores.map((c) => `${hex(c.cor)}  ${Math.max(1, Math.round(c.parte * 100))}%`),
    `Branco, preto e cinza: ${Math.round(neutra * 100)}%`,
    `Para o marca.json, se a primeira for a da marca: "corMarcacao": "${hex(principal)}", "gradienteDestaque": "linear-gradient(90deg, ${hex(clarear(principal, 0.3))}, ${hex(principal)})"`,
  ].join("\n");
}

if (require.main === module) {
  const r = spawnSync("ffmpeg", ["-v", "error", "-i", process.argv[2], "-frames:v", "1", "-vf", `scale=${LADO}:${LADO}:force_original_aspect_ratio=decrease,format=rgba`, "-f", "rawvideo", "-"], { maxBuffer: 16 * LADO * LADO });
  if (r.status !== 0 || !r.stdout?.length) {
    console.log("Não consegui ler esta imagem. Peça um arquivo PNG ou JPG: SVG não serve aqui.");
    process.exit(1);
  }
  console.log(texto(coresDe(r.stdout)));
}

module.exports = { coresDe, texto };
