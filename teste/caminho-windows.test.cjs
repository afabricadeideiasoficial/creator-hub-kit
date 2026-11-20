// O caminho dos programas do kit (ffmpeg, ffprobe, node, uv) no PATH. Dados inventados.
// Uso: node --test teste/*.test.cjs
//
// No Git Bash do Windows, `pwd -W` devolve C:/Users/... e o bash separa o PATH nos ":". Um `export PATH` com essa forma
// quebra no "C:" e nem o bash nem o Python acham o ffprobe ("WinError 2"), embora o arquivo esteja na pasta. Foi o
// primeiro erro de um aluno no Windows (19/11, /referencia). O $HOME do Git Bash já vem na forma /c/Users/..., que o
// PATH aceita; no Mac é o mesmo caminho de sempre.
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");

const FERRAMENTAS = path.join(__dirname, "../plugins/creator-hub/ferramentas");
const CERTO = 'export PATH="$HOME/.creator-hub/bin:$PATH"';

function scripts(pasta) {
  return fs.readdirSync(pasta, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(pasta, e.name);
    if (e.isDirectory()) return scripts(p);
    return e.name.endsWith(".sh") ? [p] : [];
  });
}

test("caminho dos programas: todo script põe a pasta do kit no PATH pelo $HOME, nunca pela forma C:/ do Windows", () => {
  const errados = [];
  for (const arq of scripts(FERRAMENTAS)) {
    fs.readFileSync(arq, "utf8").split("\n").forEach((linha, i) => {
      if (/^\s*export PATH=/.test(linha) && linha.trim() !== CERTO) errados.push(`${path.relative(FERRAMENTAS, arq)}:${i + 1}: ${linha.trim()}`);
    });
  }
  assert.deepEqual(errados, []);
});

test("conferência da instalação: avisa quando o ffprobe está na pasta mas o kit não consegue chamá-lo", () => {
  const casa = fs.mkdtempSync(path.join(os.tmpdir(), "caminho-"));
  const kit = path.join(casa, ".creator-hub");
  for (const p of ["bin", "pacotes/node_modules/hyperframes", "video-use/helpers", "video-use/.venv/bin"]) fs.mkdirSync(path.join(kit, p), { recursive: true });
  fs.writeFileSync(path.join(kit, "pacotes/node_modules/hyperframes/package.json"), "{}");
  fs.writeFileSync(path.join(kit, "video-use/helpers/transcribe_local.py"), "");
  fs.writeFileSync(path.join(kit, "video-use/.venv/bin/python"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
  for (const p of ["node", "ffmpeg"]) fs.writeFileSync(path.join(kit, "bin", p), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
  // O ffprobe existe, mas sem permissão de rodar: o arquivo está no lugar e o kit não consegue chamá-lo.
  fs.writeFileSync(path.join(kit, "bin/ffprobe"), "", { mode: 0o644 });

  const r = spawnSync("/bin/bash", [path.join(FERRAMENTAS, "conferir_instalacao.sh")], {
    encoding: "utf8",
    env: { PATH: "/usr/bin:/bin", HOME: casa },
  });

  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /ffprobe/);
  assert.match(r.stdout, /não consegue chamar/);
  assert.doesNotMatch(r.stdout, /todas no lugar/);
});
