// Mede TODO texto visível (títulos, rótulos, itens, legenda) a cada 0,1 s, só com a câmera parada:
// durante a viagem da câmera o texto atravessa a tela de propósito. Texto que está inteiro fora da tela
// (a cena vizinha na mesma folha) também não conta.
// Uso: node medir_margens.cjs  → lista o que sai da faixa segura (15–85% da largura, 10–80% da altura)
const puppeteer = require("puppeteer");
const fs = require("fs"), path = require("path");
(async () => {
  const gsapJs = fs.readFileSync(require.resolve("gsap/dist/gsap.min.js"), "utf8");
  const b = await puppeteer.launch({ headless: "new" });
  const pg = await b.newPage();
  await pg.setViewport({ width: 1080, height: 1920 });
  await pg.setRequestInterception(true);
  pg.on("request", (r) => (r.url().includes("gsap") ? r.respond({ status: 200, contentType: "application/javascript", body: gsapJs })
    : /^https?:/.test(r.url()) ? r.abort() : r.continue()));
  await pg.evaluateOnNewDocument(() => { window.__timelines = {}; });
  await pg.goto("file://" + path.join(__dirname, "index.html"), { waitUntil: "domcontentloaded" });
  await pg.waitForFunction(() => Object.keys(window.__timelines).length > 0, { timeout: 20000 });
  const res = await pg.evaluate(() => {
    const tl = Object.values(window.__timelines)[0];
    const root = document.querySelector("[data-composition-id]");
    const root$ = root.getBoundingClientRect();
    const DUR = +root.dataset.duration;
    const clips = [...root.querySelectorAll(".clip[data-start][data-duration]")];
    const texts = [], w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let n; while ((n = w.nextNode())) if (n.textContent.trim() && !n.parentElement.closest("svg")) texts.push(n);
    const visivel = (el) => {
      let op = 1;
      for (let e = el; e && e !== document.body; e = e.parentElement) {
        const cs = getComputedStyle(e);
        if (cs.display === "none" || cs.visibility === "hidden") return 0;
        op *= +cs.opacity;
      }
      return op;
    };
    const fora = new Map();
    let amostras = 0;
    for (let t = 0; t <= DUR - 0.02; t += 0.1) {
      if (window.__planoContinuo && window.__planoContinuo.emMovimento(t)) continue;
      clips.forEach((el) => { const s = +el.dataset.start, d = +el.dataset.duration; el.style.visibility = t >= s && t < s + d ? "" : "hidden"; });
      tl.seek(t, false);
      amostras++;
      texts.forEach((no) => {
        const el = no.parentElement;
        if (visivel(el) < 0.5) return;
        const rg = document.createRange(); rg.selectNodeContents(no);
        [...rg.getClientRects()].forEach((r) => {
          if (!r.width) return;
          const x0 = (r.left - root$.left) / 10.8, x1 = (r.right - root$.left) / 10.8, y0 = (r.top - root$.top) / 19.2, y1 = (r.bottom - root$.top) / 19.2;
          if (x1 <= 0 || x0 >= 100 || y1 <= 0 || y0 >= 100) return; // fora da tela inteira: cena vizinha
          if (x0 < 15 || x1 > 85 || y0 < 10 || y1 > 80) {
            const k = no.textContent.trim();
            const v = fora.get(k) || { t0: t, t1: t, x0, x1, y0, y1 };
            v.t1 = t; v.x0 = Math.min(v.x0, x0); v.x1 = Math.max(v.x1, x1); v.y0 = Math.min(v.y0, y0); v.y1 = Math.max(v.y1, y1);
            fora.set(k, v);
          }
        });
      });
      // marcações (círculo, sublinhado) também ficam dentro da margem
      document.querySelectorAll(".traco-dest").forEach((sv) => {
        if (visivel(sv) < 0.5) return;
        const r = sv.querySelector("path").getBoundingClientRect();
        const x0 = (r.left - root$.left) / 10.8, x1 = (r.right - root$.left) / 10.8, y0 = (r.top - root$.top) / 19.2, y1 = (r.bottom - root$.top) / 19.2;
        if (x1 <= 0 || x0 >= 100 || y1 <= 0 || y0 >= 100) return;
        if (x0 < 15 || x1 > 85 || y0 < 10 || y1 > 80) {
          const k = "marcação em \"" + sv.parentElement.textContent.trim() + "\"";
          const v = fora.get(k) || { t0: t, t1: t, x0, x1, y0, y1 };
          v.t1 = t; v.x0 = Math.min(v.x0, x0); v.x1 = Math.max(v.x1, x1); v.y0 = Math.min(v.y0, y0); v.y1 = Math.max(v.y1, y1);
          fora.set(k, v);
        }
      });
    }
    return { amostras, n: texts.length, fora: [...fora.entries()] };
  });
  console.log(`${res.amostras} instantes com a câmera parada, ${res.n} textos medidos`);
  res.fora.forEach(([k, v]) => console.log(`FORA  ${v.t0.toFixed(1)}–${v.t1.toFixed(1)}s  x ${v.x0.toFixed(1)}–${v.x1.toFixed(1)}%  y ${v.y0.toFixed(1)}–${v.y1.toFixed(1)}%  "${k}"`));
  console.log(res.fora.length ? `${res.fora.length} texto(s) fora da margem segura` : "todas as telas dentro da margem segura");
  await b.close();
})();
