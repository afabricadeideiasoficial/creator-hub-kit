// Mede a caixa real (texto + marcações) de cada tela no instante em que ela está completa.
// Uso: node medir_margens.cjs   → lista telas fora da faixa segura (15%–85% da largura, 10%–80% da altura)
const puppeteer = require("puppeteer");
const fs = require("fs"), path = require("path");
(async () => {
  const gsapJs = fs.readFileSync(require.resolve("gsap/dist/gsap.min.js"), "utf8");
  const b = await puppeteer.launch({ headless: "new" });
  const pg = await b.newPage();
  await pg.setViewport({ width: 1080, height: 1920 });
  await pg.setRequestInterception(true);
  pg.on("request", (r) => (r.url().includes("gsap") ? r.respond({ status: 200, contentType: "application/javascript", body: gsapJs })
    : /^https?:/.test(r.url()) && !r.url().includes("localhost") ? r.abort() : r.continue()));
  await pg.evaluateOnNewDocument(() => { window.__timelines = {}; });
  await pg.goto("file://" + path.join(__dirname, "index.html"), { waitUntil: "domcontentloaded" });
  await pg.waitForFunction(() => Object.keys(window.__timelines).length > 0, { timeout: 20000 });
  const res = await pg.evaluate(() => {
    const tl = Object.values(window.__timelines)[0];
    const out = [];
    document.querySelectorAll(".beat").forEach((el) => {
      const s = +el.dataset.start, d = +el.dataset.duration;
      tl.seek(s + d - 0.02, false);
      document.querySelectorAll(".beat").forEach((o) => (o.style.visibility = o === el ? "visible" : "hidden"));
      let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
      el.querySelectorAll(".w, .mark path").forEach((n) => {
        const r = n.getBoundingClientRect(); if (!r.width) return;
        x0 = Math.min(x0, r.left); x1 = Math.max(x1, r.right); y0 = Math.min(y0, r.top); y1 = Math.max(y1, r.bottom);
      });
      // destaque (*…* / **…**) que encolheu demais para caber na largura perde a força
      const pequenos = [...el.querySelectorAll(".row.bold, .row.brand")].map((r) => parseFloat(getComputedStyle(r).fontSize)).filter((px) => px < 88);
      out.push({ nome: el.dataset.name, x0: x0 / 10.8, x1: x1 / 10.8, y0: y0 / 19.2, y1: y1 / 19.2, pequeno: pequenos.length ? Math.min(...pequenos) : 0 });
    });
    return out;
  });
  let bad = 0, small = 0;
  for (const r of res) {
    const ok = r.x0 >= 15 && r.x1 <= 85 && r.y0 >= 10 && r.y1 <= 80;
    if (!ok) bad++;
    if (r.pequeno) small++;
    console.log(`${ok ? (r.pequeno ? "PEQ " : "ok  ") : "FORA"} x ${r.x0.toFixed(1)}–${r.x1.toFixed(1)}%  y ${r.y0.toFixed(1)}–${r.y1.toFixed(1)}%  ${r.nome}${r.pequeno ? `  ← destaque encolheu para ${r.pequeno.toFixed(0)}px: quebre a linha` : ""}`);
  }
  if (small) console.log(`${small} tela(s) com destaque pequeno demais (PEQ) — quebre a linha para a palavra-chave ficar sozinha`);
  console.log(bad ? `${bad} tela(s) fora da margem segura` : "todas as telas dentro da margem segura");
  await b.close();
})();
