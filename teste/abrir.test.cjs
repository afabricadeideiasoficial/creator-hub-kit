// O abrir.sh nos três sistemas, com programas de mentira no PATH: nada abre de verdade na tela.
// Uso: node --test teste/*.test.cjs
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");

const SCRIPT = path.join(__dirname, "../plugins/creator-hub/ferramentas/abrir.sh");

function preparar(sistema, { falha = [], nome = "mapa de edição.html" } = {}) {
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), "abrir-"));
  const bin = path.join(pasta, "bin");
  const registro = path.join(pasta, "chamadas.txt");
  fs.mkdirSync(bin);
  const programa = (nome, corpo) => fs.writeFileSync(path.join(bin, nome), `#!/bin/bash\n${corpo}\n`, { mode: 0o755 });
  programa("uname", `echo ${sistema}`);
  programa("cygpath", 'echo "C:\\\\convertido\\\\$(basename "$2")"');
  for (const nome of ["open", "xdg-open", "explorer.exe"])
    programa(nome, `echo "${nome} $1" >> "${registro}"\nexit ${falha.includes(nome) ? 1 : 0}`);
  const arquivo = path.join(pasta, "pasta do vídeo", nome);
  fs.mkdirSync(path.dirname(arquivo));
  fs.writeFileSync(arquivo, "x");
  const rodar = (alvo = arquivo) =>
    spawnSync("/bin/bash", [SCRIPT, alvo], { encoding: "utf8", env: { PATH: `${bin}:/usr/bin:/bin` } });
  const chamadas = () => (fs.existsSync(registro) ? fs.readFileSync(registro, "utf8").trim() : "");
  return { arquivo: fs.realpathSync(arquivo), rodar, chamadas };
}

test("no Mac: usa o open, com o caminho completo, mesmo com espaço e acento", () => {
  const { arquivo, rodar, chamadas } = preparar("Darwin");
  const r = rodar();
  assert.equal(r.status, 0, r.stderr);
  assert.equal(chamadas(), `open ${arquivo}`);
  assert.match(r.stdout, new RegExp(`Aberto: ${arquivo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
});

test("no Windows: usa o explorer com o caminho convertido, e o erro falso dele não atrapalha", () => {
  const { rodar, chamadas } = preparar("MINGW64_NT-10.0-19045", { falha: ["explorer.exe"] });
  const r = rodar();
  assert.equal(r.status, 0, r.stderr);
  assert.equal(chamadas(), "explorer.exe C:\\convertido\\mapa de edição.html");
  assert.match(r.stdout, /Aberto:/);
});

test("no Linux: usa o xdg-open", () => {
  const { arquivo, rodar, chamadas } = preparar("Linux");
  assert.equal(rodar().status, 0);
  assert.equal(chamadas(), `xdg-open ${arquivo}`);
});

test("caminho relativo vira caminho completo", () => {
  const { arquivo, chamadas } = preparar("Darwin");
  const bin = path.join(path.dirname(path.dirname(arquivo)), "bin");
  const r = spawnSync("/bin/bash", [SCRIPT, path.basename(arquivo)], { encoding: "utf8", cwd: path.dirname(arquivo), env: { PATH: `${bin}:/usr/bin:/bin` } });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(chamadas(), `open ${arquivo}`);
});

test("se o computador não abrir, não falha e diz onde está o arquivo", () => {
  const { arquivo, rodar } = preparar("Darwin", { falha: ["open"] });
  const r = rodar();
  assert.equal(r.status, 0);
  assert.ok(r.stdout.includes(`Não consegui abrir sozinho. O arquivo está em: ${arquivo}`), r.stdout);
});

test("arquivo que não existe: avisa e não chama nada", () => {
  const { rodar, chamadas } = preparar("Darwin");
  const r = rodar("/nao/existe.html");
  assert.equal(r.status, 1);
  assert.match(r.stdout, /Não encontrei o arquivo/);
  assert.equal(chamadas(), "");
});

for (const nome of ["a.html", "a.mp4", "a.mov", "a.m4a", "a.jpg", "a.jpeg", "a.png"]) {
  test(`tipo aceito: ${nome}`, () => {
    const { arquivo, rodar, chamadas } = preparar("Darwin", { nome });
    assert.equal(rodar().status, 0);
    assert.equal(chamadas(), `open ${arquivo}`);
  });
}

for (const nome of ["a.HTML", "a.Mp4", "FOTO.JPG"]) {
  test(`extensão em maiúscula também vale: ${nome}`, () => {
    const { arquivo, rodar, chamadas } = preparar("Darwin", { nome });
    assert.equal(rodar().status, 0);
    assert.equal(chamadas(), `open ${arquivo}`);
  });
}

function assertRecusado({ rodar, chamadas }) {
  const r = rodar();
  assert.equal(r.status, 1);
  assert.equal(chamadas(), "", "não pode chamar o programa que abre");
  assert.equal(r.stdout.trim().split("\n").length, 1, `explica em uma linha: ${r.stdout}`);
  assert.match(r.stdout, /só abre arquivos html, mp4, mov, m4a, jpg, jpeg ou png/);
}

for (const nome of ["a.command", "a.terminal", "a.COMMAND", "a.app", "a.sh", "a.tool", "sem-extensao", "mapa.html.command"]) {
  test(`no Mac, tipo recusado: ${nome}`, () => assertRecusado(preparar("Darwin", { nome })));
}

for (const nome of ["a.bat", "a.cmd", "a.exe", "a.BAT", "a.ps1", "a.lnk", "mapa.html.exe", "a.bat."]) {
  test(`no Windows, tipo recusado: ${nome}`, () => assertRecusado(preparar("MINGW64_NT-10.0-19045", { nome })));
}

test("atalho com nome de .html que aponta para um programa é recusado", () => {
  const preparado = preparar("Darwin", { nome: "programa.command" });
  const atalho = path.join(path.dirname(preparado.arquivo), "mapa.html");
  fs.symlinkSync(preparado.arquivo, atalho);
  const r = preparado.rodar(atalho);
  assert.equal(r.status, 1);
  assert.equal(preparado.chamadas(), "");
  assert.match(r.stdout, /atalho/);
});
