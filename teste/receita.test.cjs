// O preparo dos estilos com receita. Dados inventados.
// Uso: node --test teste/*.test.cjs
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");

const FERRAMENTAS = path.join(__dirname, "../plugins/creator-hub/ferramentas");
const preparar = (pasta) =>
  spawnSync("/bin/bash", [path.join(FERRAMENTAS, "receita/preparar_receita.sh"), pasta], { encoding: "utf8", env: { PATH: `${path.dirname(process.execPath)}:/usr/bin:/bin`, HOME: os.tmpdir() } });

function videoDeTeste(marca) {
  const v = fs.mkdtempSync(path.join(os.tmpdir(), "receita-"));
  const l = path.join(v, "2-legendas");
  fs.mkdirSync(l);
  fs.writeFileSync(path.join(l, "video.json"), JSON.stringify({ id: "teste", dur: 3.5, cuts: [1.2, 2.4], marca }));
  fs.writeFileSync(path.join(l, "transcript.json"), JSON.stringify({ words: [
    { text: "Bloco", start: 0, end: 0.4, type: "word" },
    { text: " ", start: 0.4, end: 0.5, type: "spacing" },
    { text: "azul.", start: 0.5, end: 0.9, type: "word" },
  ] }));
  return l;
}

test("preparar_receita: traz medidor, fontes e palavras no tempo do corte", () => {
  const l = videoDeTeste({ corMarcacao: "#112233", nome: "Marca Inventada" });
  const r = preparar(path.dirname(l));
  assert.equal(r.status, 0, r.stdout + r.stderr);
  for (const f of ["Anton-Regular.ttf", "Poppins-Medium.ttf", "Poppins-SemiBold.ttf", "Poppins-Bold.ttf", "Poppins-ExtraBold.ttf", "LibreBaskerville-Regular.ttf", "LibreBaskerville-Bold.ttf", "LibreBaskerville-Italic.ttf", "Cormorant-SemiBoldItalic.ttf"]) assert.ok(fs.existsSync(path.join(l, "assets/fonts", f)), f);
  assert.match(fs.readFileSync(path.join(l, "medir_margens.cjs"), "utf8"), /qualquer vídeo escrito à mão/);
  const palavras = fs.readFileSync(path.join(l, "palavras.txt"), "utf8");
  assert.match(palavras, /^id: teste$/m);
  assert.match(palavras, /^duração \(DUR\): 3\.5$/m);
  assert.match(palavras, /^cortes: 1\.2 2\.4$/m);
  assert.match(palavras, /^cor de destaque: #112233$/m);
  assert.match(palavras, /^nome da marca: Marca Inventada$/m);
  assert.match(palavras, /^música: não tem$/m);
  assert.match(palavras, /^0\.00 0\.40 Bloco\n0\.50 0\.90 azul\.$/m);
});

test("preparar_receita: a cor do gradiente da marca vem antes, e a música aparece", () => {
  const l = videoDeTeste({ gradienteDestaque: "linear-gradient(#abcdef, #000000)", corMarcacao: "#112233", musica: { arquivo: "assets/musica.m4a" } });
  assert.equal(preparar(path.dirname(l)).status, 0);
  const palavras = fs.readFileSync(path.join(l, "palavras.txt"), "utf8");
  assert.match(palavras, /^cor de destaque: #abcdef$/m);
  assert.match(palavras, /^música: assets\/musica\.m4a$/m);
});

test("fontes da receita: cada família leva a sua licença aberta", () => {
  const pasta = path.join(FERRAMENTAS, "receita/fontes");
  const arquivos = fs.readdirSync(pasta);
  for (const fonte of arquivos.filter((f) => f.endsWith(".ttf"))) {
    const familia = fonte.split("-")[0];
    assert.ok(arquivos.includes(`OFL-${familia}.txt`), `${fonte} sem licença`);
    assert.match(fs.readFileSync(path.join(pasta, `OFL-${familia}.txt`), "utf8"), /SIL Open Font License, Version 1\.1/, familia);
  }
});

test("quadro: sem o vídeo, diz o que falta", () => {
  const r = spawnSync("/bin/bash", [path.join(FERRAMENTAS, "receita/quadro.sh"), fs.mkdtempSync(path.join(os.tmpdir(), "receita-")), "1.5"], { encoding: "utf8", env: { PATH: "/usr/bin:/bin", HOME: os.tmpdir() } });
  assert.equal(r.status, 1);
  assert.match(r.stdout, /Falta o assets\/video\.mp4/);
});

test("assinatura da comp: a tela da prévia regravar SVG em minúsculas não conta como alteração", () => {
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), "receita-"));
  const assinatura = (nome, conteudo) => {
    const arquivo = path.join(pasta, nome);
    fs.writeFileSync(arquivo, conteudo);
    return spawnSync(process.execPath, [path.join(FERRAMENTAS, "assinatura_comp.cjs"), arquivo], { encoding: "utf8" }).stdout;
  };
  const original = assinatura("a.html", '<!doctype html><svg><filter id="r"><feMorphology radius="8"/><feMerge><feMergeNode in="d"/></feMerge></filter><clipPath id="c"><use href="#b"/></clipPath></svg><svg id="vazio" width="10"></svg><div class="clip" data-start="1">Texto Grande</div>');
  const regravado = assinatura("b.html", '<!DOCTYPE html><svg><filter id="r" data-hf-id="x1"><femorphology data-hf-id="x3" radius="8" /><femerge data-hf-id="x4"><femergenode in="d" /></femerge></filter><clippath id="c"><use href="#b" /></clippath></svg><svg id="vazio" width="10" /><div class="clip" data-hf-id="x2" data-start="1">Texto Grande</div>');
  assert.equal(regravado, original);
  // Mudar o tempo ou o texto continua contando.
  assert.notEqual(assinatura("c.html", '<!doctype html><svg><filter id="r"><feMorphology radius="8"/><feMerge><feMergeNode in="d"/></feMerge></filter><clipPath id="c"><use href="#b"/></clipPath></svg><svg id="vazio" width="10"></svg><div class="clip" data-start="2">Texto Grande</div>'), original);
  assert.notEqual(assinatura("d.html", '<!doctype html><svg><filter id="r"><feMorphology radius="8"/><feMerge><feMergeNode in="d"/></feMerge></filter><clipPath id="c"><use href="#b"/></clipPath></svg><svg id="vazio" width="10"></svg><div class="clip" data-start="1">texto grande</div>'), original);
});

test("preparar_receita: sem o preparo das legendas, diz o que falta", () => {
  const r = preparar(fs.mkdtempSync(path.join(os.tmpdir(), "receita-")));
  assert.equal(r.status, 1);
  assert.match(r.stdout, /Falta preparar as legendas/);
});
