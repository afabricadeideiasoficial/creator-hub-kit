// O render mostra o motivo quando falha e para ali. Dados inventados.
// Uso: node --test teste/*.test.cjs
//
// Antes, a resposta do programa de vídeo passava por um `tail -2`. Numa falha ele escreve "Render failed", o motivo e,
// por último, a dica "Try --docker for containerized rendering"; só a dica sobrava. Um aluno no Mac viu só ela três
// vezes (23/11), e o renderizar.sh seguia para as conferências de um vídeo que não existia.
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");

const FERRAMENTAS = path.join(__dirname, "../plugins/creator-hub/ferramentas");
const RODAR = path.join(FERRAMENTAS, "rodar_render.sh");
const PATH_BASE = `${path.dirname(process.execPath)}:/usr/bin:/bin`;
const pastaNova = () => fs.mkdtempSync(path.join(os.tmpdir(), "render-erro-"));

// A caixa de erro como o HyperFrames 0.8.140 escreve (errorBox), com as cores.
const CAIXA_DE_ERRO = [
  "[hyperframes:render] WARNING: video src=\"assets/corte.mp4\" could not be resolved on disk",
  "",
  "\x1b[31m✗\x1b[39m  \x1b[1mRender failed\x1b[22m",
  "",
  "\x1b[2m   Asset not found: assets/foto-do-cliente.jpg\x1b[22m",
  "   \x1b[36mTry --docker for containerized rendering\x1b[39m",
  "",
].join("\n");

// Um projeto com o programa de vídeo trocado por um falso, que faz o que o corpo mandar.
function projetoCom(corpo) {
  const pasta = pastaNova();
  const cli = path.join(pasta, "node_modules/hyperframes/dist/cli.js");
  fs.mkdirSync(path.dirname(cli), { recursive: true });
  fs.writeFileSync(
    cli,
    `const args = process.argv.slice(2);\nconst saida = args[args.indexOf("-o") + 1];\nconst fs = require("fs");\n${corpo}\n`
  );
  return pasta;
}

const rodar = (pasta, args, env = {}) =>
  spawnSync("/bin/bash", [RODAR, ...args], { cwd: pasta, encoding: "utf8", env: { PATH: PATH_BASE, HOME: os.tmpdir(), ...env } });

const FALHA = `process.stderr.write(${JSON.stringify(CAIXA_DE_ERRO)} + "\\n"); process.exit(1);`;

test("rodar_render: na falha, mostra o motivo real, o espaço do disco, e sai com 1", () => {
  const pasta = projetoCom(FALHA);
  const r = rodar(pasta, ["-o", path.join(pasta, "final.mp4"), "--fps", "30", "--quality", "high"]);
  assert.equal(r.status, 1, r.stderr);
  assert.match(r.stdout, /O render falhou\. Motivo:\n {2}Asset not found: assets\/foto-do-cliente\.jpg\n/);
  assert.match(r.stdout, /Avisos do programa antes da falha:\n {2}\[hyperframes:render\] WARNING: video src="assets\/corte\.mp4" could not be resolved on disk\n/);
  assert.match(r.stdout, /Espaço livre no disco: [\d.]+ GB\./);
  assert.doesNotMatch(r.stdout, /docker/);
  assert.doesNotMatch(r.stdout, /\x1b/);
  // A resposta inteira fica guardada para o suporte.
  const registro = path.join(fs.realpathSync(pasta), "render.log");
  assert.match(r.stdout, new RegExp(`A resposta completa do programa ficou em ${registro.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\.`));
  assert.match(fs.readFileSync(registro, "utf8"), /Try --docker/);
});

test("rodar_render: quando dá certo, mostra as 2 linhas finais, sai com 0 e apaga o registro", () => {
  const pasta = projetoCom(`fs.writeFileSync(saida, "video"); console.log("Rendering\\n\\nRender complete\\n  final.mp4 (1.2 MB)");`);
  const r = rodar(pasta, ["-o", "final.mp4", "--fps", "30"]);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(r.stdout, "Render complete\n  final.mp4 (1.2 MB)\n");
  assert.ok(!fs.existsSync(path.join(pasta, "render.log")));
});

test("rodar_render: passa as opções ao programa e acrescenta --quiet", () => {
  const pasta = projetoCom(`fs.writeFileSync(saida, "video"); console.log(JSON.stringify(args));`);
  const r = rodar(pasta, ["-o", "final.mp4", "--fps", "30000/1001", "--quality", "high"]);
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(JSON.parse(r.stdout), ["render", ".", "-o", "final.mp4", "--fps", "30000/1001", "--quality", "high", "--quiet"]);
});

test("rodar_render: programa que termina sem gravar o vídeo também é falha", () => {
  const pasta = projetoCom(`console.log("Render complete");`);
  const r = rodar(pasta, ["-o", "final.mp4"]);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /O render falhou\. Motivo:\n {2}o programa terminou, mas não gravou o vídeo em final\.mp4\./);
});

test("rodar_render: falha sem a caixa de erro mostra o fim da resposta, sem a dica do docker", () => {
  const pasta = projetoCom(`console.error("Error: Cannot find module 'puppeteer'\\r\\n    at Module._resolveFilename\\r\\nTry --docker for containerized rendering"); process.exit(3);`);
  const r = rodar(pasta, ["-o", "final.mp4"]);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /O render falhou\. Motivo:\n {2}Error: Cannot find module 'puppeteer'\n {2}at Module\._resolveFilename\n/);
  assert.doesNotMatch(r.stdout, /docker|\r/);
  assert.doesNotMatch(r.stdout, /Avisos/);
});

test("renderizar: render que falha para antes das conferências e sai com 1", () => {
  const casa = pastaNova();
  // O ffprobe falso responde o quadro por segundo do vídeo do corte.
  const ffprobe = path.join(casa, ".creator-hub/bin/ffprobe");
  fs.mkdirSync(path.dirname(ffprobe), { recursive: true });
  fs.writeFileSync(ffprobe, `#!/bin/bash\necho '{"streams":[{"r_frame_rate":"30/1"}]}'\n`, { mode: 0o755 });

  const video = pastaNova();
  const legendas = projetoCom(FALHA);
  const L = path.join(video, "2-legendas");
  fs.renameSync(legendas, L);
  fs.mkdirSync(path.join(L, "assets"));
  fs.writeFileSync(path.join(L, "assets/video.mp4"), "");
  fs.writeFileSync(path.join(L, "index.html"), `<!doctype html><html><body><video id="a-roll"></video></body></html>`);
  fs.writeFileSync(path.join(L, "medir_margens.cjs"), `console.log("todas as telas dentro da margem segura");`);

  const r = spawnSync("/bin/bash", [path.join(FERRAMENTAS, "renderizar.sh"), video, path.join(video, "final.mp4")], {
    encoding: "utf8",
    env: { PATH: PATH_BASE, HOME: casa },
  });
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /O render falhou\. Motivo:\n {2}Asset not found: assets\/foto-do-cliente\.jpg\n/);
  assert.doesNotMatch(r.stdout, /Duração|Volume|Pronto/);
});

test("todo render do kit passa pelo rodar_render.sh", () => {
  const scripts = (pasta) =>
    fs.readdirSync(pasta, { withFileTypes: true }).flatMap((e) => {
      const p = path.join(pasta, e.name);
      if (e.isDirectory()) return e.name === "node_modules" ? [] : scripts(p);
      return e.name.endsWith(".sh") ? [p] : [];
    });
  const diretos = scripts(FERRAMENTAS)
    .filter((arq) => arq !== RODAR)
    .flatMap((arq) =>
      fs
        .readFileSync(arq, "utf8")
        .split("\n")
        .map((linha, i) => [linha, i])
        .filter(([linha]) => /hyperframes\/dist\/cli\.js render/.test(linha))
        .map(([linha, i]) => `${path.relative(FERRAMENTAS, arq)}:${i + 1}: ${linha.trim()}`)
    );
  assert.deepEqual(diretos, []);
});

test("rodar_render: captura travada diz em que ponto do vídeo conferir", () => {
  // A resposta que o aluno do Mac recebeu em 23/11, sem as cores.
  const travou = [
    "",
    "✗  Render failed",
    "",
    "   [Render] Sequential screenshot capture stalled: no frame progress for 60000ms (stuck at frame 2523/2658).",
    "   Try --docker for containerized rendering",
    "",
  ].join("\n");
  const pasta = projetoCom(`process.stderr.write(${JSON.stringify(travou)} + "\\n"); process.exit(1);`);
  const r = rodar(pasta, ["-o", "final.mp4", "--fps", "30000/1001", "--quality", "high"]);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /O render falhou\. Motivo:\n {2}\[Render\] Sequential screenshot capture stalled: no frame progress for 60000ms \(stuck at frame 2523\/2658\)\.\n/);
  // 2523 quadros a 29,97 por segundo = 84 s.
  assert.match(r.stdout, /O render travou em 1:24 do vídeo: confira o que aparece nesse ponto/);
});
