// Os scripts que substituem os comandos que o Claude improvisava para conferir. Dados inventados.
// Uso: node --test teste/*.test.cjs
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");

const FERRAMENTAS = path.join(__dirname, "../plugins/creator-hub/ferramentas");
const pastaNova = () => fs.mkdtempSync(path.join(os.tmpdir(), "conferencias-"));
const bash = (script, args, env = {}) =>
  spawnSync("/bin/bash", [path.join(FERRAMENTAS, script), ...args], { encoding: "utf8", env: { PATH: `${path.dirname(process.execPath)}:/usr/bin:/bin`, HOME: os.tmpdir(), ...env } });

function videoDeTeste() {
  const pasta = pastaNova();
  const corte = path.join(pasta, "1-corte");
  fs.mkdirSync(corte);
  // Silêncio até 1 s, voz de -20 dB até 2 s e silêncio até 3 s. Um valor a cada 10 ms, em centésimos de dB.
  const db = Array.from({ length: 300 }, (_, i) => (i >= 100 && i < 200 ? -2000 : -6500));
  fs.writeFileSync(path.join(corte, "energia.json"), JSON.stringify({ hop: 0.01, db }));
  const words = [
    { text: "primeira", start: 1.0, end: 1.4, type: "word" },
    { text: " ", start: 1.4, end: 1.5, type: "spacing" },
    { text: "palavra.", start: 1.5, end: 1.9, type: "word" },
  ];
  fs.writeFileSync(path.join(corte, "transcript.json"), JSON.stringify({ words }));
  return pasta;
}

test("ver_trecho: sem trechos, lista as palavras com os tempos, sem os espaços", () => {
  const r = bash("ver_trecho.sh", [videoDeTeste()]);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, "1.00-1.40 primeira\n1.50-1.90 palavra.\n");
});

test("ver_trecho: mostra pico, volume a cada 0,1 s e palavras do trecho", () => {
  const r = bash("ver_trecho.sh", [videoDeTeste(), "0.8-1.2"]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /Trecho 0\.80 a 1\.20 s: pico de -20 dB/);
  assert.match(r.stdout, /0\.8:-65 0\.9:-65 1\.0:-20 1\.1:-20/);
  assert.match(r.stdout, /palavras: 1\.00-1\.40 primeira$/m);
});

test("ver_trecho: trecho em silêncio diz que não há palavras, e aceita vírgula", () => {
  const r = bash("ver_trecho.sh", [videoDeTeste(), "2,2-2,4"]);
  assert.match(r.stdout, /pico de -65 dB/);
  assert.match(r.stdout, /palavras: nenhuma/);
});

test("ver_trecho: pedido errado explica como escrever e não para os outros", () => {
  const r = bash("ver_trecho.sh", [videoDeTeste(), "abc", "5-6", "1-1.1"]);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /abc: não entendi/);
  assert.match(r.stdout, /5-6: não entendi/);
  assert.match(r.stdout, /Trecho 1\.00 a 1\.10/);
});

test("ver_trecho: sem o bruto preparado, diz o que falta", () => {
  const r = bash("ver_trecho.sh", [pastaNova()]);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /Falta preparar o bruto/);
});

const COMP = `<!doctype html>
<html>
<head><meta charset="UTF-8" /></head>
<body><div class="beat clip" id="b0" data-start="1.5" data-duration="0.8" data-track-index="1">texto</div></body>
</html>
`;
// O que a tela da prévia grava só de abrir, como visto no HyperFrames 0.8.140.
const ABERTA = COMP.replace("<!doctype html>", "<!DOCTYPE html>").replace('<meta charset="UTF-8" />', '<meta charset="UTF-8">').replace('<div class="beat', '<div data-hf-id="hf-a1" class="beat');

function compComAssinatura(depois) {
  const pasta = pastaNova();
  const arquivo = path.join(pasta, "index.html");
  fs.writeFileSync(arquivo, COMP);
  const r = spawnSync(process.execPath, [path.join(FERRAMENTAS, "assinatura_comp.cjs"), arquivo], { encoding: "utf8" });
  fs.writeFileSync(path.join(pasta, ".comp-da-previa"), r.stdout);
  fs.writeFileSync(arquivo, depois);
  return pasta;
}

test("conferir_comp: arquivo que saiu do motor", () => {
  const pasta = pastaNova();
  fs.writeFileSync(path.join(pasta, "index.html"), COMP);
  assert.match(bash("conferir_comp.sh", [pasta]).stdout, /está como foi gerado/);
});

test("conferir_comp: gerado de novo depois da prévia, sem abrir de novo, não é alarme", () => {
  assert.match(bash("conferir_comp.sh", [compComAssinatura(COMP.replace("texto", "outro texto"))]).stdout, /está como foi gerado/);
});

test("conferir_comp: só abrir a prévia não é alarme", () => {
  assert.match(bash("conferir_comp.sh", [compComAssinatura(ABERTA)]).stdout, /está como foi gerado/);
});

test("conferir_comp: clique que muda tempo ou faixa é alarme", () => {
  for (const clique of [ABERTA.replace('data-start="1.5"', 'data-start="1.9"'), ABERTA.replace('data-track-index="1"', 'data-track-index="2"')]) {
    const r = bash("conferir_comp.sh", [compComAssinatura(clique)]);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /a tela da prévia alterou a edição/);
  }
});

test("conferir_comp: gravado pela prévia, sem a versão anterior, diz que não dá para comparar", () => {
  const pasta = pastaNova();
  fs.writeFileSync(path.join(pasta, "index.html"), ABERTA);
  assert.match(bash("conferir_comp.sh", [pasta]).stdout, /não tenho a versão anterior/);
});

test("conferir_comp: sem o arquivo, diz o que falta", () => {
  assert.equal(bash("conferir_comp.sh", [pastaNova()]).status, 1);
});

function casaCom(...arquivos) {
  const casa = pastaNova();
  for (const a of arquivos) {
    const p = path.join(casa, ".creator-hub", a);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, "");
  }
  return casa;
}
const TUDO = ["bin/node", "bin/ffmpeg", "bin/ffprobe", "pacotes/node_modules/hyperframes/package.json", "video-use/helpers/transcribe_local.py", "video-use/.venv/bin/python"];

test("conferir_instalacao: tudo no lugar, e a pasta marketplace não faz falta", () => {
  const r = bash("conferir_instalacao.sh", [], { HOME: casaCom(...TUDO) });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /Kit na versão \d+\.\d+\.\d+/);
  assert.match(r.stdout, /todas no lugar/);
  assert.doesNotMatch(r.stdout, /marketplace/);
  assert.match(r.stdout, /Efeitos sonoros: ainda não baixados/);
});

test("conferir_instalacao: no Windows, o programa termina em .exe", () => {
  const nomes = TUDO.map((a) => (/^bin\/|python$/.test(a) ? `${a}.exe` : a));
  assert.match(bash("conferir_instalacao.sh", [], { HOME: casaCom(...nomes) }).stdout, /todas no lugar/);
});

test("conferir_instalacao: diz o que falta e sai com 0", () => {
  const r = bash("conferir_instalacao.sh", [], { HOME: casaCom(...TUDO.filter((a) => a !== "bin/ffmpeg"), "efeitos/clique.wav") });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /Falta na instalação:\n- ffmpeg/);
  assert.match(r.stdout, /Efeitos sonoros: instalados/);
});
