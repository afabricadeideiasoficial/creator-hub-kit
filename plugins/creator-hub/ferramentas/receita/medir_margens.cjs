// Mede TODO texto visível (títulos, rótulos, legendas e textos dentro das cenas) a cada 0,1 s.
// Serve para qualquer vídeo escrito à mão: lista o que sai da faixa segura (15–85% da largura, 10–80% da altura). Quem chama é o medir_margens.sh.
// Lista também a palavra falada que não aparece na legenda na hora dela, quando há uma legenda na tela.
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
  const arquivoPalavras = path.join(__dirname, "palavras.txt");
  const palavras = fs.existsSync(arquivoPalavras)
    ? fs.readFileSync(arquivoPalavras, "utf8").split("início fim palavra\n")[1].split("\n").filter(Boolean).map((l) => { const [i, , ...p] = l.split(" "); return { t: +i, texto: p.join(" ") }; })
    : [];
  const res = await pg.evaluate((palavras) => {
    const tl = Object.values(window.__timelines)[0];
    const root = document.querySelector("[data-composition-id]");
    const root$ = root.getBoundingClientRect();
    const DUR = +root.dataset.duration;
    const timed = [...root.querySelectorAll("[data-start][data-duration]")];
    const walker = () => {
      const out = [], w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let n; while ((n = w.nextNode())) if (n.textContent.trim()) out.push(n);
      return out;
    };
    // O contador troca o nó de texto a cada passo: a lista é refeita em cada instante, senão o número fica sem medir.
    let medidos = 0;
    const visivel = (el) => {
      let op = 1;
      for (let e = el; e && e !== document.body; e = e.parentElement) {
        const cs = getComputedStyle(e);
        if (cs.display === "none" || cs.visibility === "hidden") return 0;
        op *= +cs.opacity;
      }
      return op;
    };
    // Texto dentro de máscara só conta na parte que aparece: antes de entrar, ele fica fora da caixa que o recorta.
    const recortar = (el, r) => {
      let { left, right, top, bottom } = r;
      for (let e = el; e && e !== root; e = e.parentElement) {
        if (getComputedStyle(e).overflow === "visible") continue;
        const c = e.getBoundingClientRect();
        left = Math.max(left, c.left); right = Math.min(right, c.right); top = Math.max(top, c.top); bottom = Math.min(bottom, c.bottom);
      }
      return right > left && bottom > top ? { left, right, top, bottom } : null;
    };
    const fora = new Map();
    let amostras = 0;
    for (let t = 0; t <= DUR - 0.02; t += 0.1) {
      timed.forEach((el) => { const s = +el.dataset.start, d = +el.dataset.duration; el.style.visibility = t >= s && t < s + d ? "" : "hidden"; });
      tl.seek(t, false);
      amostras++;
      const texts = walker();
      medidos = Math.max(medidos, texts.length);
      texts.forEach((n) => {
        const el = n.parentElement;
        if (visivel(el) < 0.5) return;
        const rg = document.createRange(); rg.selectNodeContents(n);
        [...rg.getClientRects()].forEach((bruto) => {
          if (!bruto.width) return;
          const r = recortar(el, bruto);
          if (!r) return;
          const x0 = (r.left - root$.left) / 10.8, x1 = (r.right - root$.left) / 10.8, y0 = (r.top - root$.top) / 19.2, y1 = (r.bottom - root$.top) / 19.2;
          if (x0 < 15 || x1 > 85 || y0 < 10 || y1 > 80) {
            const k = n.textContent.trim();
            const v = fora.get(k) || { t0: t, t1: t, x0, x1, y0, y1 };
            v.t1 = t; v.x0 = Math.min(v.x0, x0); v.x1 = Math.max(v.x1, x1); v.y0 = Math.min(v.y0, y0); v.y1 = Math.max(v.y1, y1);
            fora.set(k, v);
          }
        });
      });
    }
    const norm = (s) => s.toLowerCase().normalize("NFD").replace(/[^\p{L}\p{N}]/gu, "");
    const legendas = timed.filter((el) => (el.dataset.name ?? "").startsWith("Legenda:"));
    const sumidas = [];
    for (const p of palavras) {
      const t = p.t + 0.06; // logo depois de entrar: em fala rápida, a palavra fica pouco tempo na tela
      const ativas = legendas.filter((el) => t >= +el.dataset.start && t < +el.dataset.start + +el.dataset.duration);
      if (!ativas.length) continue; // sem legenda na tela: tela de produto, por exemplo
      timed.forEach((el) => { const s = +el.dataset.start, d = +el.dataset.duration; el.style.visibility = t >= s && t < s + d ? "" : "hidden"; });
      tl.seek(t, false);
      const naTela = ativas.map((b) => {
        const w = document.createTreeWalker(b, NodeFilter.SHOW_TEXT);
        let txt = "";
        for (let n = w.nextNode(); n; n = w.nextNode()) if (visivel(n.parentElement) >= 0.5) txt += n.textContent;
        return norm(txt);
      }).join("");
      if (!naTela.includes(norm(p.texto))) sumidas.push(p);
    }
    return { amostras, n: medidos, fora: [...fora.entries()], sumidas };
  }, palavras);
  console.log(`${res.amostras} instantes, ${res.n} textos medidos`);
  res.fora.forEach(([k, v]) => console.log(`FORA  ${v.t0.toFixed(1)}–${v.t1.toFixed(1)}s  x ${v.x0.toFixed(1)}–${v.x1.toFixed(1)}%  y ${v.y0.toFixed(1)}–${v.y1.toFixed(1)}%  "${k}"`));
  res.sumidas.forEach((p) => console.log(`PALAVRA  ${p.t.toFixed(2)}s  "${p.texto}" é falada aqui e não aparece na legenda`));
  console.log(res.fora.length ? `${res.fora.length} texto(s) fora da margem segura` : "todas as telas dentro da margem segura");
  await b.close();
})();
