// Quando o navegador que grava o vídeo trava, o render tenta de novo sozinho, em pedaços. Dados inventados.
// Uso: node --test teste/*.test.cjs
//
// Aluno no Mac (23 e 24/11): "Sequential screenshot capture stalled", em quadro diferente a cada vez. A 0.7.2 só dizia
// o motivo. Aqui o programa de vídeo é falso: cada chamada segue o roteiro da lista, e o que ele recebeu fica anotado.
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");

const FERRAMENTAS = path.join(__dirname, "../plugins/creator-hub/ferramentas");
const RODAR = path.join(FERRAMENTAS, "rodar_render.sh");
const PATH_BASE = `${path.dirname(process.execPath)}:/usr/bin:/bin`;

const caixa = (motivo) => `\n\x1b[31m✗\x1b[39m  \x1b[1mRender failed\x1b[22m\n\n   ${motivo}\n   Try --docker for containerized rendering\n\n`;
const trava = (quadro, total = 2658) =>
  caixa(`[Render] Sequential screenshot capture stalled: no frame progress for 60000ms (stuck at frame ${quadro}/${total}).`);

// Cada passo do roteiro: { falha } (o texto do erro), ou nada (dá certo); pedacos = quantos ficam prontos.
// pagina: o que a conferência das emendas encontra (direto = onde o 3º elemento aparece para quem pula direto).
function projeto(roteiro, pasta = fs.mkdtempSync(path.join(os.tmpdir(), "render recupera-")), pagina = {}) {
  const cli = path.join(pasta, "node_modules/hyperframes/dist/cli.js");
  fs.mkdirSync(path.dirname(cli), { recursive: true });
  fs.writeFileSync(
    cli,
    `const fs = require("fs");
const roteiro = ${JSON.stringify(roteiro)};
const args = process.argv.slice(2);
const chamadas = fs.existsSync("chamadas.json") ? JSON.parse(fs.readFileSync("chamadas.json", "utf8")) : [];
const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => k.startsWith("HF_")));
chamadas.push({ args, env, pedacosVelhos: fs.existsSync("renders/.hf-segments/velho") });
fs.writeFileSync("chamadas.json", JSON.stringify(chamadas));
const passo = roteiro[Math.min(chamadas.length, roteiro.length) - 1];
if (passo.pedacos) {
  fs.mkdirSync("renders/.hf-segments/abc", { recursive: true });
  const completed = Array.from({ length: passo.pedacos }, (_, index) => ({ index, startFrame: index * 300 }));
  fs.writeFileSync("renders/.hf-segments/abc/segments.json", JSON.stringify({ version: 1, completed }, null, 2));
}
if (passo.falha) { process.stderr.write(passo.falha); process.exit(1); }
fs.writeFileSync(args[args.indexOf("-o") + 1], "video");
console.log("Rendering\\n\\nRender complete\\n  final.mp4 (1.2 MB)");
`
  );
  // O navegador da conferência das emendas, também de mentira: a 1ª página vem quadro a quadro, as outras pulam direto.
  const pup = path.join(pasta, "node_modules/puppeteer/index.js");
  fs.mkdirSync(path.dirname(pup), { recursive: true });
  fs.mkdirSync(path.join(pasta, "node_modules/gsap/dist"), { recursive: true });
  fs.writeFileSync(path.join(pasta, "node_modules/gsap/dist/gsap.min.js"), "");
  fs.writeFileSync(path.join(pasta, "index.html"), `<!doctype html><html><body><video id="a-roll"></video></body></html>`);
  fs.writeFileSync(
    pup,
    `const P = ${JSON.stringify(pagina)};
let abertas = 0;
const elemento = (x) => ({ lugar: [x, 100, 200, 50], aparencia: ["1", "none", "none", "0px", "rgb(0, 0, 0)", "rgb(0, 0, 0)", "oi"] });
exports.launch = async () => {
  if (P.falha) throw new Error(P.falha);
  return {
    newPage: async () => {
      const n = abertas++;
      return { setViewport() {}, setRequestInterception() {}, on() {}, evaluateOnNewDocument() {}, goto() {}, waitForFunction() {}, close() {},
        evaluate: async (f) => f.name === "dados" ? { duracao: 44.3, desenho: !!P.desenho } : f.name === "foto" ? [elemento(10), null, elemento(n ? P.direto ?? 10 : 10)] : undefined };
    },
    close: async () => {},
  };
};
`
  );
  return pasta;
}

const OPCOES = ["-o", "final.mp4", "--fps", "60", "--quality", "high"];
function rodar(pasta, args = ["--em-pedacos", ...OPCOES], env = {}) {
  const r = spawnSync("/bin/bash", [RODAR, ...args], { cwd: pasta, encoding: "utf8", env: { PATH: PATH_BASE, HOME: os.tmpdir(), ...env } });
  return { ...r, chamadas: JSON.parse(fs.readFileSync(path.join(pasta, "chamadas.json"), "utf8")) };
}
const temPedacos = (pasta) => fs.existsSync(path.join(pasta, "renders/.hf-segments"));

const EM_PEDACOS = { HF_SEGMENTED_CAPTURE: "true", HF_SEGMENT_FRAMES: "300", HF_SEGMENT_BROWSER_RECYCLE: "1" };
const BASE = ["render", ".", ...OPCOES];

test("recupera: o render que dá certo de primeira roda uma vez só, como sempre", () => {
  const pasta = projeto([{}]);
  const r = rodar(pasta);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(r.stdout, "Render complete\n  final.mp4 (1.2 MB)\n");
  assert.deepEqual(r.chamadas, [{ args: [...BASE, "--quiet"], env: {}, pedacosVelhos: false }]);
  assert.ok(!fs.existsSync(path.join(pasta, "render.log")));
});

test("recupera: travou uma vez, grava em pedaços e termina", () => {
  const pasta = projeto([{ falha: trava(2523) }, { pedacos: 9 }]);
  const r = rodar(pasta);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(
    r.stdout,
    "O navegador que grava o vídeo travou em 0:42. Gravando de novo em pedaços, com um navegador novo a cada pedaço. Demora mais; não precisa fazer nada.\n" +
      "Deu certo: o vídeo foi gravado em pedaços (tentativa 1 de 6). Assista inteiro antes de entregar.\n" +
      "Render complete\n  final.mp4 (1.2 MB)\n"
  );
  assert.equal(r.chamadas.length, 2);
  assert.deepEqual(r.chamadas[0], { args: [...BASE, "--quiet"], env: {}, pedacosVelhos: false });
  // As opções da pessoa continuam as mesmas, e a 1ª em pedaços não aproveita nada que já estivesse na pasta.
  assert.deepEqual(r.chamadas[1].args, [...BASE, "--low-memory-mode", "--quiet"]);
  assert.deepEqual(r.chamadas[1].env, EM_PEDACOS);
  assert.ok(!temPedacos(pasta));
  assert.ok(!fs.existsSync(path.join(pasta, "renders")));
  assert.ok(!fs.existsSync(path.join(pasta, "render.log")));
});

test("recupera: travou de novo, continua dos pedaços prontos", () => {
  const pasta = projeto([{ falha: trava(2523) }, { falha: trava(1274), pedacos: 4 }, { falha: trava(2000), pedacos: 6 }, { pedacos: 9 }]);
  const r = rodar(pasta);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /Travou de novo em 0:21\. Continuando de onde parou: 4 de 9 pedaços prontos\.\n/);
  assert.match(r.stdout, /Travou de novo em 0:33\. Continuando de onde parou: 6 de 9 pedaços prontos\.\n/);
  assert.match(r.stdout, /Deu certo: o vídeo foi gravado em pedaços \(tentativa 3 de 6\)\./);
  assert.deepEqual(r.chamadas.map((c) => c.args.includes("--resume")), [false, false, true, true]);
  for (const c of r.chamadas.slice(1)) assert.deepEqual(c.env, EM_PEDACOS);
  assert.ok(!temPedacos(pasta));
});

test("recupera: trava sempre no mesmo ponto, para depois de 2 tentativas sem avançar e diz onde conferir", () => {
  const pasta = projeto([{ falha: trava(1274) }, { falha: trava(1274) }, { falha: trava(1278) }]);
  const r = rodar(pasta);
  assert.equal(r.status, 1);
  assert.equal(r.chamadas.length, 3);
  assert.match(r.stdout, /O render falhou\. Motivo:\n {2}\[Render\] Sequential screenshot capture stalled: .*\(stuck at frame 1278\/2658\)\.\n/);
  assert.match(r.stdout, /Tentei também em pedaços, 2 vezes: 0 de 9 pedaços ficaram prontos\. Travou em: 0:21, 0:21, 0:21\.\n/);
  assert.match(r.stdout, /O render travou em 0:21 do vídeo: confira o que aparece nesse ponto/);
  assert.match(r.stdout, /Espaço livre no disco: [\d.]+ GB\.\n/);
  assert.match(r.stdout, /Memória do computador: \d+ GB\.\n/);
  assert.doesNotMatch(r.stdout, /docker|\x1b|pontos diferentes/);
  assert.ok(!temPedacos(pasta));
  // O registro guarda as 3 tentativas para o suporte.
  const registro = fs.readFileSync(path.join(pasta, "render.log"), "utf8");
  assert.equal(registro.match(/Render failed/g).length, 3);
  assert.match(registro, /=== Tentativa 2 em pedaços ===/);
});

test("recupera: trava em pontos diferentes, tenta no máximo 6 vezes em pedaços e fala da memória", () => {
  const quadros = [2523, 350, 650, 950, 1250, 1550, 1850];
  const pasta = projeto(quadros.map((q, i) => ({ falha: trava(q), pedacos: i })));
  const r = rodar(pasta);
  assert.equal(r.status, 1);
  assert.equal(r.chamadas.length, 7);
  assert.match(r.stdout, /Tentei também em pedaços, 6 vezes: 6 de 9 pedaços ficaram prontos\./);
  assert.match(r.stdout, /O render travou em pontos diferentes do vídeo\. Quando o ponto muda, a suspeita é pouca memória/);
  assert.doesNotMatch(r.stdout, /confira o que aparece/);
  assert.ok(!temPedacos(pasta));
});

test("recupera: falha que não é trava para na hora", () => {
  const pasta = projeto([{ falha: caixa("Asset not found: assets/foto-do-cliente.jpg") }]);
  const r = rodar(pasta);
  assert.equal(r.status, 1);
  assert.equal(r.chamadas.length, 1);
  assert.match(r.stdout, /^O render falhou\. Motivo:\n {2}Asset not found/);
  assert.doesNotMatch(r.stdout, /pedaços/);
});

test("recupera: aviso de trava que o próprio programa resolveu não conta; vale o motivo final", () => {
  const aviso = "[WARN] [Render] Parallel drawElement capture stalled after 60000ms with no frame progress (last frame 3/90); retrying on a fresh screenshot session.\n";
  const pasta = projeto([{ falha: aviso + caixa("Streaming encode failed: No space left on device") }]);
  const r = rodar(pasta);
  assert.equal(r.status, 1);
  assert.equal(r.chamadas.length, 1);
});

test("recupera: a trava com vários navegadores ao mesmo tempo também é trava", () => {
  const motivo = "[Render] Parallel screenshot capture stalled: no frame progress for 60000ms (stuck at 1200/2658).";
  const pasta = projeto([{ falha: caixa(motivo) }, {}]);
  const r = rodar(pasta);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /travou em 0:20\./);
  assert.equal(r.chamadas.length, 2);
});

test("recupera: outra falha no meio dos pedaços para e mostra essa, dizendo onde tinha travado", () => {
  const pasta = projeto([{ falha: trava(1274) }, { falha: caixa("Segment 4 encode failed: No space left on device"), pedacos: 4 }]);
  const r = rodar(pasta);
  assert.equal(r.status, 1);
  assert.equal(r.chamadas.length, 2);
  assert.match(r.stdout, /Motivo:\n {2}Segment 4 encode failed: No space left on device\n/);
  assert.match(r.stdout, /Tentei também em pedaços, 1 vez: .* Travou em: 0:21\.\n/);
  assert.ok(!temPedacos(pasta));
});

test("recupera: sem --em-pedacos, a trava para na hora, como antes", () => {
  const pasta = projeto([{ falha: trava(1274), pedacos: 4 }]);
  const r = rodar(pasta, OPCOES);
  assert.equal(r.status, 1);
  assert.deepEqual(r.chamadas.map((c) => c.args), [[...BASE, "--quiet"]]);
  assert.match(r.stdout, /O render travou em 0:21 do vídeo: confira/);
  assert.doesNotMatch(r.stdout, /pedaços/);
});

// No vídeo animado e no mascote, o navegador novo começa com as coisas fora do lugar e a emenda pula; o MOV nem grava.
test("recupera: só o vídeo editado liga os pedaços", () => {
  const usam = fs
    .readdirSync(FERRAMENTAS, { withFileTypes: true, recursive: true })
    .filter((d) => d.isFile() && d.name.endsWith(".sh") && d.name !== "rodar_render.sh")
    .map((d) => path.join(d.parentPath ?? d.path, d.name))
    .filter((arq) => /rodar_render\.sh" --em-pedacos/.test(fs.readFileSync(arq, "utf8")))
    .map((arq) => path.relative(FERRAMENTAS, arq));
  assert.deepEqual(usam, ["renderizar.sh"]);
});

test("recupera: o renderizar.sh tenta de novo em pedaços e, se não der, para antes das conferências", () => {
  const casa = fs.mkdtempSync(path.join(os.tmpdir(), "render-recupera-casa-"));
  const ffprobe = path.join(casa, ".creator-hub/bin/ffprobe");
  fs.mkdirSync(path.dirname(ffprobe), { recursive: true });
  fs.writeFileSync(ffprobe, `#!/bin/bash\necho '{"streams":[{"r_frame_rate":"60/1"}]}'\n`, { mode: 0o755 });
  const video = fs.mkdtempSync(path.join(os.tmpdir(), "render-recupera-video-"));
  const L = path.join(video, "2-legendas");
  projeto([{ falha: trava(1274) }, { falha: trava(1274) }], L);
  fs.mkdirSync(path.join(L, "assets"));
  fs.writeFileSync(path.join(L, "assets/video.mp4"), "");
  fs.writeFileSync(path.join(L, "medir_margens.cjs"), `console.log("todas as telas dentro da margem segura");`);
  const r = spawnSync("/bin/bash", [path.join(FERRAMENTAS, "renderizar.sh"), video, path.join(video, "final.mp4")], {
    encoding: "utf8",
    env: { PATH: PATH_BASE, HOME: casa },
  });
  assert.equal(r.status, 1, r.stdout + r.stderr);
  const chamadas = JSON.parse(fs.readFileSync(path.join(L, "chamadas.json"), "utf8"));
  assert.deepEqual(chamadas.map((c) => c.env), [{}, EM_PEDACOS, EM_PEDACOS]);
  for (const c of chamadas) assert.equal(c.args[c.args.indexOf("--fps") + 1], "60/1");
  assert.doesNotMatch(r.stdout, /Duração|Volume|Pronto/);
});

test("recupera: emenda que mudaria a tela não é gravada em pedaços, e o kit diz por quê", () => {
  const pasta = projeto([{ falha: trava(1274) }], undefined, { direto: 14 });
  const r = rodar(pasta);
  assert.equal(r.status, 1);
  assert.equal(r.chamadas.length, 1);
  assert.match(r.stdout, /Não tentei em pedaços: Na emenda de 0:05, 1 elemento\(s\) mudariam de lugar ou de aparência\.\n/);
  assert.match(r.stdout, /O render travou em 0:21 do vídeo: confira/);
  assert.match(fs.readFileSync(path.join(pasta, "render.log"), "utf8"), /=== Conferência das emendas ===\nNa emenda de 0:05/);
});

test("recupera: meio pixel de diferença na emenda não se vê, então grava em pedaços", () => {
  const pasta = projeto([{ falha: trava(1274) }, {}], undefined, { direto: 10.3 });
  assert.equal(rodar(pasta).status, 0);
});

test("recupera: página com desenho em canvas, ou conferência que não roda, não é gravada em pedaços", () => {
  for (const [pagina, motivo] of [[{ desenho: true }, /Não tentei em pedaços: A página desenha em canvas/], [{ falha: "Failed to launch the browser process" }, /Não tentei em pedaços: Não deu para conferir as emendas: Failed to launch/]]) {
    const r = rodar(projeto([{ falha: trava(1274) }], undefined, pagina));
    assert.equal(r.status, 1);
    assert.equal(r.chamadas.length, 1);
    assert.match(r.stdout, motivo);
  }
});

test("recupera: no MOV transparente não liga os pedaços", () => {
  const pasta = projeto([{ falha: trava(1274) }]);
  const r = rodar(pasta, ["--em-pedacos", "-o", "legenda.mov", "--format", "mov", "--resolution", "portrait", "--fps", "30"]);
  assert.equal(r.status, 1);
  assert.equal(r.chamadas.length, 1);
  assert.match(r.stdout, /O render travou em 0:42 do vídeo: confira/);
  assert.doesNotMatch(r.stdout, /pedaços/);
});

test("recupera: pedaços de outra vez saem da pasta antes de começar", () => {
  const pasta = projeto([{ falha: trava(1274) }, {}]);
  fs.mkdirSync(path.join(pasta, "renders/.hf-segments/velho"), { recursive: true });
  fs.writeFileSync(path.join(pasta, "renders/.hf-segments/velho/segment_00000.mp4"), "outro vídeo");
  fs.writeFileSync(path.join(pasta, "renders/meu-video.mp4"), "da pessoa");
  const r = rodar(pasta);
  assert.equal(r.status, 0);
  assert.deepEqual(r.chamadas.map((c) => c.pedacosVelhos), [false, false]);
  // O que a pessoa tem em renders fica.
  assert.equal(fs.readFileSync(path.join(pasta, "renders/meu-video.mp4"), "utf8"), "da pessoa");
});

test("recupera: quem já liga os pedaços por conta própria continua no comando", () => {
  const pasta = projeto([{ falha: trava(1274), pedacos: 4 }]);
  const r = rodar(pasta, ["--em-pedacos", ...OPCOES, "--resume"], { ...EM_PEDACOS, HF_DE_STALL_MS: "60000" });
  assert.equal(r.status, 1);
  assert.equal(r.chamadas.length, 1);
  assert.deepEqual(r.chamadas[0].args, [...BASE, "--resume", "--quiet"]);
  assert.ok(temPedacos(pasta));
});

test("recupera: HF_SEGMENTED_CAPTURE=false desliga", () => {
  const pasta = projeto([{ falha: trava(1274) }]);
  const r = rodar(pasta, undefined, { HF_SEGMENTED_CAPTURE: "false" });
  assert.equal(r.status, 1);
  assert.equal(r.chamadas.length, 1);
});

test("recupera: caminho com espaço e acento chega inteiro em todas as tentativas", () => {
  const pasta = projeto([{ falha: trava(1274) }, { falha: trava(2000), pedacos: 5 }, {}]);
  const saida = path.join(pasta, "Novembro é já/vídeo final.mp4");
  fs.mkdirSync(path.dirname(saida));
  const r = rodar(pasta, ["--em-pedacos", "-o", saida, "--fps", "30000/1001", "--quality", "high"]);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  for (const c of r.chamadas) assert.equal(c.args[c.args.indexOf("-o") + 1], saida);
});
