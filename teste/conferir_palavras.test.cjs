// Conferência das palavras. As frases são inventadas.
// Uso: node --test teste/*.test.cjs
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");

const SCRIPT = path.join(__dirname, "../plugins/creator-hub/ferramentas/conferir_palavras.cjs");
const { conferir, texto } = require(SCRIPT);

const falas = (...textos) => textos.map((fala, i) => ({ inicio: i * 10, fim: i * 10 + 5, parte: "fala", fala }));
// Cada palavra ouvida leva 0,5 s, a contar do começo do corte.
const corte = (frase) => ({
  words: frase.split(" ").flatMap((text, i) => [
    { text, start: i * 0.5, end: i * 0.5 + 0.4, type: "word" },
    { text: " ", start: i * 0.5 + 0.4, end: i * 0.5 + 0.5, type: "spacing" },
  ]),
});
const LONGE = [60];

test("as mesmas palavras: nenhum aviso", () => {
  const r = conferir(falas("A porta azul abre cedo.", "O vizinho chega depois."), corte("A porta azul abre cedo. O vizinho chega depois."), []);
  assert.deepEqual(r.avisos, []);
  assert.match(texto(r), /as 9 palavras/);
});

for (const [nome, fala, ouvido] of [
  ["nome junto e separado", "Abra o Creator Hub agora", "Abra o CreatorHub agora"],
  ["nome separado e junto", "Abra o CreatorHub agora", "Abra o Creator Hub agora"],
  ["cê e ocê", "Se cê quiser", "Se ocê quiser"],
  ["você e cê", "Se você quiser", "Se cê quiser"],
  ["para e pra", "Vai para casa", "Vai pra casa"],
  ["pro e para o", "Vai pro quarto", "Vai para o quarto"],
  ["para os e pros", "Fala para os amigos", "Fala pros amigos"],
  ["tá e está", "Isso está certo", "Isso tá certo"],
  ["número e extenso", "Custa 500 reais", "Custa quinhentos reais"],
  ["maiúscula e pontuação", "Ela disse, sim.", "ela disse sim"],
  ["acento", "Ate amanhã", "Até amanha"],
  ["palavra com hífen separada", "Um bate-papo rápido", "Um bate -papo rápido"],
  ["uma letra de diferença em palavra longa", "Uma coisa diferente", "Uma coisa diferentes"],
]) {
  test(`grafia não é alarme, mesmo em cima de um corte: ${nome}`, () => {
    assert.deepEqual(conferir(falas(fala), corte(ouvido), [0.5, 1]).avisos, []);
  });
}

test("palavra trocada em cima de um corte: avisa dizendo o que era e o que ouviu", () => {
  const { avisos } = conferir(falas("Sempre esse cliente volta"), corte("Sempre o cliente volta"), [0.5]);
  assert.equal(avisos.length, 1);
  assert.match(avisos[0], /fala 1, em 0,5 s do corte: era "esse", ouvi "o"/);
});

test("a mesma palavra trocada longe de um corte é variação da transcrição, e o texto não diz que está tudo no corte", () => {
  const r = conferir(falas("Sempre esse cliente volta"), corte("Sempre o cliente volta"), LONGE);
  assert.deepEqual(r.avisos, []);
  assert.doesNotMatch(texto(r), /estão no corte/);
  assert.match(texto(r), /nenhuma palavra perdida nas emendas.*variou em 1 ponto,/);
});

test("palavra comida no começo de um trecho: avisa que faltou", () => {
  const { avisos } = conferir(falas("Ontem", "Hoje cedo o trem passou"), corte("Ontem cedo o trem passou"), [0.5]);
  assert.equal(avisos.length, 1);
  assert.match(avisos[0], /fala 2, .*faltou "Hoje"/);
});

test("palavra longa partida na emenda é pega", () => {
  const { avisos } = conferir(falas("Uma lacuna grande"), corte("Palacuna grande"), [0.3]);
  assert.equal(avisos.length, 1);
  assert.match(avisos[0], /era "Uma lacuna", ouvi "Palacuna"/);
});

test("voz de bastidor no meio do take: avisa mesmo longe de um corte", () => {
  const { avisos } = conferir(falas("A porta abre cedo"), corte("A porta de novo faz de novo abre cedo"), LONGE);
  assert.equal(avisos.length, 1);
  assert.match(avisos[0], /sobrou "de novo faz de novo"/);
});

test("palavra curta a mais, longe de um corte, não é alarme", () => {
  assert.deepEqual(conferir(falas("A porta abre cedo"), corte("A porta que abre cedo"), LONGE).avisos, []);
});

test("trecho inteiro faltando: avisa mesmo longe de um corte", () => {
  const { avisos } = conferir(falas("A porta abre muito cedo no verão"), corte("A porta abre"), LONGE);
  assert.equal(avisos.length, 1);
  assert.match(avisos[0], /faltou "muito cedo no verão"/);
});

test("som solto da transcrição não é alarme, nem em cima de um corte", () => {
  assert.deepEqual(conferir(falas("A porta abre"), corte("A porta é abre"), [1]).avisos, []);
});

test("sem a lista de cortes, avisa toda diferença", () => {
  assert.equal(conferir(falas("Sempre esse cliente"), corte("Sempre o cliente"), null).avisos.length, 1);
});

test("trecho de silêncio não tem palavras a conferir", () => {
  const takes = [...falas("A porta abre"), { inicio: 20, fim: 21, parte: "silencio", fala: "respiro da sala" }];
  assert.deepEqual(conferir(takes, corte("A porta abre"), []).avisos, []);
});

test("take sem fala usa o que foi dito no bruto entre o início e o fim dele", () => {
  const bruto = [
    { text: "fora", start: 0, end: 0.4 },
    { text: "dentro", start: 1, end: 1.4 },
    { text: "também", start: 1.5, end: 1.9 },
    { text: "depois", start: 3, end: 3.4 },
  ];
  const takes = [{ inicio: 0.9, fim: 2, parte: "fala" }];
  assert.deepEqual(conferir(takes, corte("dentro também"), [], bruto).avisos, []);
  assert.match(conferir(takes, corte("dentro"), [0.2], bruto).avisos[0], /faltou "também"/);
});

// Pela linha de comando, como o preparo do vídeo chama.
function rodar(takes, transcricao, ...resto) {
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), "conferir-"));
  const a = path.join(pasta, "takes.json");
  const b = path.join(pasta, "corte.json");
  fs.writeFileSync(a, takes);
  fs.writeFileSync(b, transcricao);
  return spawnSync(process.execPath, [SCRIPT, a, b, ...resto], { encoding: "utf8" });
}

test("pela linha de comando: mostra a diferença e sai com 0", () => {
  const r = rodar(JSON.stringify(falas("Sempre esse cliente")), JSON.stringify(corte("Sempre o cliente")), "[0.5]");
  assert.equal(r.status, 0);
  assert.match(r.stdout, /1 diferença entre as falas escolhidas/);
  assert.match(r.stdout, /era "esse", ouvi "o"/);
});

test("arquivo quebrado não para o preparo: pede para comparar à mão", () => {
  const r = rodar("{ não é json", JSON.stringify(corte("Sempre")), "[]");
  assert.equal(r.status, 0);
  assert.match(r.stdout, /não consegui comparar/);
});
