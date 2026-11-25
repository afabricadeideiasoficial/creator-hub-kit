// Diz se o vídeo da pasta atual pode ser gravado em pedaços, cada um num navegador novo.
// O navegador novo começa no meio do vídeo. Numa animação em que a posição das coisas depende dos quadros de antes,
// elas aparecem fora do lugar e a emenda pula. Aqui, no começo de cada pedaço, a tela de quem veio quadro a quadro é
// comparada com a de quem pulou direto para lá.
// Uso: node conferir_emendas.cjs <quadros por segundo, como 30 ou 60000/1001> <quadros por pedaço>
// Sai com 0 quando nenhuma emenda muda, 1 quando alguma muda e 2 quando não deu para conferir (na dúvida, não grave).
const fs = require("fs"), path = require("path"), { pathToFileURL } = require("url");

const PASTA = process.cwd();
const [num, den = 1] = String(process.argv[2] || "30").split("/").map(Number);
const FPS = num / den, PASSO = Number(process.argv[3] || 300);
const LIMITE_MS = 240000; // conferência parada também não vale

// O que aparece na tela, elemento por elemento: lugar, tamanho e aparência. O que está invisível ou fora da tela não conta.
function foto() {
  return [...document.querySelectorAll("[data-composition-id] *")].map((e) => {
    const r = e.getBoundingClientRect(), c = getComputedStyle(e);
    if (!r.width || !r.height || r.right <= 0 || r.bottom <= 0 || r.left >= innerWidth || r.top >= innerHeight) return null;
    if (!e.checkVisibility({ opacityProperty: true, visibilityProperty: true })) return null;
    return {
      lugar: [r.left, r.top, r.width, r.height],
      aparencia: [c.opacity, c.clipPath, c.filter, c.strokeDashoffset, c.color, c.backgroundColor, e.childElementCount ? "" : e.textContent],
    };
  });
}
function dados() {
  const raiz = document.querySelector("[data-composition-id]");
  return { duracao: Number(raiz && raiz.dataset.duration), desenho: !!document.querySelector("canvas") };
}
function andar(de, ate, fps) {
  for (let k = de; k <= ate; k++) for (const t of Object.values(window.__timelines)) t.seek(k / fps, false);
}

const numeros = (s) => (String(s).match(/-?[\d.]+(?:e-?\d+)?/g) || []).map(Number);
const perto = (a, b, folga) => a.length === b.length && a.every((x, i) => Math.abs(x - b[i]) <= folga + Math.abs(b[i]) * 0.002);
function igual(a, b) {
  if (!a || !b) return a === b;
  // meio pixel não se vê
  if (!perto(a.lugar, b.lugar, 0.5)) return false;
  return a.aparencia.every((x, i) => x === b.aparencia[i] || (numeros(x).length > 0 && perto(numeros(x), numeros(b.aparencia[i]), 0.02)));
}

async function conferir() {
  const puppeteer = require(path.join(PASTA, "node_modules/puppeteer"));
  const gsapJs = fs.readFileSync(path.join(PASTA, "node_modules/gsap/dist/gsap.min.js"), "utf8");
  const html = fs.readFileSync(path.join(PASTA, "index.html"), "utf8");
  const largura = Number((html.match(/data-width="(\d+)"/) || [])[1] || 1080);
  const altura = Number((html.match(/data-height="(\d+)"/) || [])[1] || 1920);
  const navegador = await puppeteer.launch({ headless: "new" });
  try {
    const abrir = async () => {
      const pg = await navegador.newPage();
      await pg.setViewport({ width: largura, height: altura });
      await pg.setRequestInterception(true);
      pg.on("request", (r) => (r.url().includes("gsap") && /^https?:/.test(r.url()) ? r.respond({ status: 200, contentType: "application/javascript", body: gsapJs })
        : /^https?:/.test(r.url()) || r.resourceType() === "media" ? r.abort() : r.continue()));
      await pg.evaluateOnNewDocument(() => { window.__timelines = {}; });
      await pg.goto(pathToFileURL(path.join(PASTA, "index.html")).href, { waitUntil: "domcontentloaded" });
      await pg.waitForFunction(() => Object.keys(window.__timelines).length > 0, { timeout: 60000 });
      await new Promise((r) => setTimeout(r, 400));
      return pg;
    };
    const pg = await abrir();
    const { duracao, desenho } = await pg.evaluate(dados);
    if (!(duracao > 0 && FPS > 0)) throw new Error("página sem duração");
    if (desenho) { console.log("A página desenha em canvas (3D, partículas): não dá para comparar as emendas."); return 1; }
    const emendas = [];
    for (let q = PASSO; q < Math.floor(duracao * FPS); q += PASSO) emendas.push(q);
    const seguido = [];
    let de = 0;
    for (const q of emendas) {
      await pg.evaluate(andar, de, q, FPS);
      de = q + 1;
      seguido.push(await pg.evaluate(foto));
    }
    await pg.close();
    for (const [i, q] of emendas.entries()) {
      const nova = await abrir();
      await nova.evaluate(andar, q, q, FPS);
      const direto = await nova.evaluate(foto);
      await nova.close();
      const mudou = seguido[i].filter((a, k) => !igual(a, direto[k])).length;
      if (mudou || seguido[i].length !== direto.length) {
        const s = Math.floor(q / FPS);
        console.log(`Na emenda de ${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}, ${mudou} elemento(s) mudariam de lugar ou de aparência.`);
        return 1;
      }
    }
    console.log(`${emendas.length} emenda(s) conferida(s): nada muda na tela.`);
    return 0;
  } finally {
    await navegador.close().catch(() => {});
  }
}

setTimeout(() => { console.log("A conferência das emendas demorou demais."); process.exit(2); }, LIMITE_MS).unref();
conferir().then((c) => process.exit(c), (e) => { console.log("Não deu para conferir as emendas: " + e.message.split("\n")[0]); process.exit(2); });
