// Compara as falas escolhidas no takes.json com o que a transcrição ouviu no vídeo cortado.
// Só avisa: quem decide é quem está editando. Sempre sai com 0, para não parar o preparo do vídeo.
// Uso: node conferir_palavras.cjs <takes.json> <transcrição-do-corte.json> <cortes, como [3.3,5.8]> [transcrição-do-bruto.json]
// A transcrição do bruto só entra quando um take vem sem "fala": aí vale o que foi dito entre o início e o fim dele.
//
// Um corte só come palavra na emenda. Longe dela, palavra curta trocada é variação da transcrição, como "esse" e "isso",
// e só vale avisar quando sobra ou falta um trecho, o que costuma ser voz de bastidor ou take encurtado.
const fs = require("fs");

const norm = (t) => t.toLowerCase().normalize("NFD").replace(/[^\p{L}\p{N}]/gu, "");

// A mesma palavra dita de jeitos diferentes: a transcrição alterna entre eles sem que o corte tenha mudado nada.
const FORMAS = [
  ["voce", "oce", "ce", "vc"],
  ["para", "pra"],
  ["ia", "ai"],
  ["esta", "ta"],
  ["estou", "to"],
  ["estao", "tao"],
  ["estava", "tava"],
  ["estavam", "tavam"],
  ["estamos", "tamos"],
];
const FORMA = new Map(FORMAS.flatMap((grupo) => grupo.map((p) => [p, grupo[0]])));

// Contrações, para "pro" e "para o" serem a mesma coisa.
const CONTRACOES = new Map([["pro", "parao"], ["pros", "paraos"], ["pras", "paraas"], ["num", "emum"], ["numa", "emuma"]]);

// Até esta distância de um corte, em segundos, a diferença pode ter vindo do corte.
const PERTO_DE_CORTE = 0.4;
// Longe de um corte, só avisa quando a diferença é de um trecho, e não de uma palavra curta.
const TRECHO_LONGE_DO_CORTE = 3;
const PALAVRA_LONGA = 6;

// Sons que a transcrição inventa ou solta nas pausas: sozinhos não indicam problema no corte.
const SONS_SOLTOS = new Set(["e", "eh", "ah", "ahn", "ha", "hum", "uh", "um", "hm", "ne", "tipo", "assim"]);

function distancia(a, b) {
  let linha = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const nova = [i];
    for (let j = 1; j <= b.length; j++) nova[j] = Math.min(linha[j] + 1, nova[j - 1] + 1, linha[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    linha = nova;
  }
  return linha[b.length];
}

const temNumero = (t) => /\p{N}/u.test(t);

/** A mesma palavra com outra grafia? Número escrito em dígitos contra número por extenso conta como grafia. */
function mesmaGrafia(a, b) {
  if (a === b || (FORMA.get(a) ?? a) === (FORMA.get(b) ?? b)) return true;
  if (temNumero(a) !== temNumero(b)) return true;
  if (temNumero(a)) return false;
  const maior = Math.max(a.length, b.length);
  return distancia(a, b) <= (maior >= 10 ? 2 : maior >= 5 ? 1 : 0);
}

function fatias(texto, base) {
  return texto
    .split(/\s+/)
    .map((p) => ({ ...base, texto: p, n: norm(p) }))
    .filter((p) => p.n);
}

function esperadas(takes, bruto) {
  const palavras = [];
  takes.forEach((t, i) => {
    if (t.parte === "silencio") return;
    if (typeof t.fala === "string" && t.fala.trim()) {
      palavras.push(...fatias(t.fala, { take: i + 1 }));
      return;
    }
    const ditas = (bruto ?? []).filter((p) => p.start < t.fim && p.end > t.inicio);
    for (const p of ditas) palavras.push(...fatias(p.text, { take: i + 1 }));
  });
  return palavras;
}

const ouvidas = (transcricao) =>
  transcricao.words
    .filter((p) => (p.type ?? "word") === "word")
    .flatMap((p) => fatias(p.text, { start: p.start, end: p.end }));

/** Alinha as duas listas e devolve os pares: [índice esperado ou -1, índice ouvido ou -1]. */
function alinhar(a, b) {
  const n = a.length;
  const m = b.length;
  const custo = Array.from({ length: n + 1 }, () => new Float64Array(m + 1));
  for (let i = 1; i <= n; i++) custo[i][0] = i;
  for (let j = 1; j <= m; j++) custo[0][j] = j;
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const troca = mesmaGrafia(a[i - 1].n, b[j - 1].n) ? 0 : 1;
      custo[i][j] = Math.min(custo[i - 1][j - 1] + troca, custo[i - 1][j] + 1, custo[i][j - 1] + 1);
    }
  }
  const pares = [];
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && custo[i][j] === custo[i - 1][j - 1] + (mesmaGrafia(a[i - 1].n, b[j - 1].n) ? 0 : 1)) {
      pares.push([--i, --j]);
    } else if (i > 0 && custo[i][j] === custo[i - 1][j] + 1) {
      pares.push([--i, -1]);
    } else {
      pares.push([-1, --j]);
    }
  }
  return pares.reverse();
}

/** As diferenças em grupos contíguos, já sem as que são só grafia, como "Creator Hub" e "CreatorHub". */
function diferencas(a, b) {
  const grupos = [];
  let atual = null;
  let ouvidaAnterior = -1;
  for (const [i, j] of alinhar(a, b)) {
    const igual = i >= 0 && j >= 0 && mesmaGrafia(a[i].n, b[j].n);
    if (igual) {
      atual = null;
    } else {
      if (!atual) {
        atual = { a: [], b: [], ouvidaAnterior };
        grupos.push(atual);
      }
      if (i >= 0) atual.a.push(i);
      if (j >= 0) atual.b.push(j);
    }
    if (j >= 0) ouvidaAnterior = j;
  }
  const semContracao = (lista) => lista.map((p) => CONTRACOES.get(p) ?? p).join("");
  return grupos.filter((g) => {
    const de = g.a.map((i) => a[i].n);
    const para = g.b.map((j) => b[j].n);
    if (de.length && para.length && mesmaGrafia(semContracao(de), semContracao(para))) return false;
    // Som solto sozinho, de um lado só, não é problema do corte.
    if (!para.length && de.every((p) => SONS_SOLTOS.has(p))) return false;
    if (!de.length && para.every((p) => SONS_SOLTOS.has(p))) return false;
    return true;
  });
}

/** O trecho do corte em que a diferença aparece: as palavras ouvidas ou, se faltou palavra, o vão entre as vizinhas. */
function intervalo(g, b) {
  if (g.b.length) return [b[g.b[0]].start, b[g.b.at(-1)].end];
  const antes = b[g.ouvidaAnterior];
  const depois = b[g.ouvidaAnterior + 1];
  return [antes?.end ?? depois?.start ?? 0, depois?.start ?? antes?.end ?? 0];
}

function valeAvisar(g, a, b, cortes) {
  if (!cortes) return true;
  const [ini, fim] = intervalo(g, b);
  if (cortes.some((c) => ini - PERTO_DE_CORTE <= c && c <= fim + PERTO_DE_CORTE)) return true;
  if (g.a.length && g.b.length) return Math.max(g.a.length, g.b.length) >= TRECHO_LONGE_DO_CORTE;
  const lado = g.a.length ? g.a.map((i) => a[i].n) : g.b.map((j) => b[j].n);
  return lado.length >= 2 || lado[0].length >= PALAVRA_LONGA;
}

const tempo = (t) => `${t.toFixed(1).replace(".", ",")} s`;
const juntar = (lista, palavras) => lista.map((i) => palavras[i].texto).join(" ");

function conferir(takes, transcricao, cortes, bruto) {
  const a = esperadas(takes, bruto);
  const b = ouvidas(transcricao);
  const todas = diferencas(a, b);
  const grupos = todas.filter((g) => valeAvisar(g, a, b, cortes));
  const avisos = grupos.map((g) => {
    const ouvida = g.b.length ? b[g.b[0]] : b[g.ouvidaAnterior + 1] ?? b[g.ouvidaAnterior];
    const quando = ouvida ? `em ${tempo(ouvida.start)} do corte` : "no fim do corte";
    const take = g.a.length ? `fala ${a[g.a[0]].take}, ` : "";
    if (!g.b.length) return `${take}${quando}: faltou "${juntar(g.a, a)}".`;
    if (!g.a.length) return `${quando}: sobrou "${juntar(g.b, b)}", que não está nas falas.`;
    return `${take}${quando}: era "${juntar(g.a, a)}", ouvi "${juntar(g.b, b)}".`;
  });
  return { esperadas: a.length, ouvidas: b.length, avisos, longeDosCortes: todas.length - grupos.length };
}

function texto({ esperadas: e, ouvidas: o, avisos, longeDosCortes: longe }) {
  if (!avisos.length && !longe) return `Conferência das palavras: as ${e} palavras das falas escolhidas estão no corte.\n`;
  if (!avisos.length) return `Conferência das palavras: nenhuma palavra perdida nas emendas. Longe dos cortes, a transcrição variou em ${longe} ponto${longe === 1 ? "" : "s"}, o que o corte não causa.\n`;
  return `Conferência das palavras: ${avisos.length} diferença${avisos.length === 1 ? "" : "s"} entre as falas escolhidas (${e} palavras) e o corte (${o} palavras):\n${avisos.map((a) => `- ${a}`).join("\n")}\n`;
}

if (require.main === module) {
  const [arquivoTakes, arquivoCorte, cortes, arquivoBruto] = process.argv.slice(2);
  if (!arquivoTakes || !arquivoCorte || !cortes) {
    console.log("Uso: node conferir_palavras.cjs <takes.json> <transcrição-do-corte.json> <cortes, como [3.3,5.8]> [transcrição-do-bruto.json]");
    process.exit(0);
  }
  try {
    const takes = JSON.parse(fs.readFileSync(arquivoTakes, "utf8"));
    const corte = JSON.parse(fs.readFileSync(arquivoCorte, "utf8"));
    const bruto = arquivoBruto && fs.existsSync(arquivoBruto) ? JSON.parse(fs.readFileSync(arquivoBruto, "utf8")).words : null;
    process.stdout.write(texto(conferir(takes, corte, JSON.parse(cortes), bruto)));
  } catch (erro) {
    console.log(`Conferência das palavras: não consegui comparar (${erro.message}). Compare o texto à mão.`);
  }
}

module.exports = { conferir, texto };
