// A cópia de estilo: analisar a referência, preparar o vídeo num estilo próprio, nome e capa. Dados inventados.
// Uso: node --test teste/*.test.cjs
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");

const RAIZ = path.join(__dirname, "..");
const FERRAMENTAS = path.join(RAIZ, "plugins/creator-hub/ferramentas");
const REF = path.join(FERRAMENTAS, "referencia");
const PATH_BASE = `${path.dirname(process.execPath)}:/usr/bin:/bin`;
const pastaNova = (nome = "referencia-") => fs.mkdtempSync(path.join(os.tmpdir(), nome));
const rodar = (script, args, env = {}) =>
  spawnSync("/bin/bash", [path.join(REF, script), ...args], { encoding: "utf8", env: { PATH: PATH_BASE, HOME: os.tmpdir(), ...env } });

function programaFalso(arquivo, corpo) {
  fs.mkdirSync(path.dirname(arquivo), { recursive: true });
  fs.writeFileSync(arquivo, `#!/bin/bash\n${corpo}\n`, { mode: 0o755 });
}

// O kit instalado nesta máquina, se houver: o Python com numpy e o ffmpeg de verdade.
const KIT_REAL = path.join(os.homedir(), ".creator-hub");
const temKitReal = fs.existsSync(path.join(KIT_REAL, "video-use/.venv/bin/python")) && fs.existsSync(path.join(KIT_REAL, "bin/ffmpeg"));

/** Uma casa falsa com o Python e o ffmpeg do kit real e um transcritor falso, que não baixa modelo. */
function casaComKitReal() {
  const casa = pastaNova("casa-");
  const kit = path.join(casa, ".creator-hub");
  fs.mkdirSync(path.join(kit, "video-use/helpers"), { recursive: true });
  fs.symlinkSync(path.join(KIT_REAL, "bin"), path.join(kit, "bin"));
  // A pasta inteira do ambiente: um atalho só para o python perderia os pacotes dele.
  fs.symlinkSync(path.join(KIT_REAL, "video-use/.venv"), path.join(kit, "video-use/.venv"));
  fs.writeFileSync(path.join(kit, "video-use/helpers/transcribe_local.py"), [
    "import json, sys, pathlib",
    "d = pathlib.Path(sys.argv[sys.argv.index('--edit-dir') + 1]) / 'transcripts'",
    "d.mkdir(parents=True, exist_ok=True)",
    "w = [{'text': 'Teste', 'start': 0.1, 'end': 0.5, 'type': 'word'}, {'text': ' ', 'start': 0.5, 'end': 0.6, 'type': 'spacing'}, {'text': 'azul.', 'start': 0.6, 'end': 1.0, 'type': 'word'}]",
    "(d / 'referencia.json').write_text(json.dumps({'language_code': 'en', 'words': w}))",
  ].join("\n"));
  return casa;
}

/** Três planos de cor (dois cortes) e um tom, 3 s em pé. */
function videoDeTeste(pasta) {
  const v = path.join(pasta, "Minha Referência.MP4");
  const r = spawnSync(path.join(KIT_REAL, "bin/ffmpeg"), [
    "-v", "error", "-y",
    "-f", "lavfi", "-i", "color=c=red:s=360x640:r=30:d=1",
    "-f", "lavfi", "-i", "color=c=blue:s=360x640:r=30:d=1",
    "-f", "lavfi", "-i", "color=c=white:s=360x640:r=30:d=1",
    "-f", "lavfi", "-i", "sine=frequency=440:duration=3",
    "-filter_complex", "[0:v][1:v][2:v]concat=n=3:v=1:a=0[v]", "-map", "[v]", "-map", "3:a",
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", v,
  ], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  return v;
}

test("analisar: copia a referência sem mexer no original e mede cortes, folha, quadros e capa", { skip: !temKitReal && "sem o kit instalado nesta máquina" }, () => {
  const casa = casaComKitReal();
  const origem = pastaNova();
  const video = videoDeTeste(origem);
  const antes = fs.readFileSync(video);
  const estilo = path.join(casa, "Edicoes/Estilos/referencia-1");

  const r = rodar("analisar.sh", [video, estilo], { HOME: casa });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.deepEqual(fs.readFileSync(video), antes, "o original não muda");
  assert.ok(fs.existsSync(path.join(estilo, "referencia.mp4")), "a cópia leva a extensão em minúsculas");
  for (const f of ["analise.json", "folha.jpg", "gancho.jpg", "cortes.jpg", "quadro-01.jpg", "quadro-04.jpg"]) assert.ok(fs.existsSync(path.join(estilo, "analise", f)), f);
  assert.ok(fs.existsSync(path.join(estilo, "capa.jpg")));

  const a = JSON.parse(fs.readFileSync(path.join(estilo, "analise/analise.json"), "utf8"));
  assert.deepEqual(a.cortes, [1, 2]);
  assert.equal(a.largura, 360);
  assert.equal(a.altura, 640);
  assert.equal(a.palavras, 2, "conta só palavras, sem os espaços");
  assert.equal(a.idioma, "en");
  assert.match(r.stdout, /Referência: .*referencia\.mp4/);

  // A segunda vez reaproveita a cópia: nada é copiado nem baixado de novo.
  const outro = rodar("analisar.sh", ["https://exemplo.invalido/video", estilo], { HOME: casa });
  assert.equal(outro.status, 0, outro.stdout + outro.stderr);
  assert.doesNotMatch(outro.stdout, /Baixando/);
});

test("analisar: link que não baixa pede o arquivo e não deixa sobra", () => {
  const casa = pastaNova("casa-");
  programaFalso(path.join(casa, ".creator-hub/video-use/.venv/bin/python"), [
    'if [ "$1" = "-c" ]; then exit 0; fi',
    'if [ "$1" = "-m" ]; then for a in "$@"; do case "$a" in */referencia.*) touch "${a%%.%(ext)s}.mp4.part";; esac; done; exit 1; fi',
    "exit 2",
  ].join("\n"));
  const estilo = path.join(casa, "Edicoes/Estilos/referencia-1");
  const r = rodar("analisar.sh", ["https://exemplo.invalido/video", estilo], { HOME: casa });
  assert.equal(r.status, 1);
  assert.match(r.stdout, /Não consegui baixar este link.*salve o vídeo no computador/);
  assert.deepEqual(fs.readdirSync(estilo), []);
});

test("analisar: sem o kit instalado ou sem o vídeo, diz o que fazer", () => {
  const casa = pastaNova("casa-");
  assert.match(rodar("analisar.sh", ["/nao/existe.mp4", path.join(casa, "e")], { HOME: casa }).stdout, /não está instalado/);
  programaFalso(path.join(casa, ".creator-hub/video-use/.venv/bin/python"), "exit 0");
  const r = rodar("analisar.sh", ["/nao/existe.mp4", path.join(casa, "e")], { HOME: casa });
  assert.equal(r.status, 1);
  assert.match(r.stdout, /Não encontrei o vídeo: \/nao\/existe\.mp4/);
});

/** Uma pasta de vídeo pronta para a receita e uma pasta de estilo com o cabeçalho dado. */
function videoEEstilo(cabecalho) {
  const v = pastaNova();
  const l = path.join(v, "2-legendas");
  fs.mkdirSync(l);
  fs.writeFileSync(path.join(l, "video.json"), JSON.stringify({ id: "teste", dur: 2, cuts: [], estilo: "estilo-proprio", marca: { corMarcacao: "#112233" } }));
  fs.writeFileSync(path.join(l, "transcript.json"), JSON.stringify({ words: [{ text: "Oi.", start: 0, end: 0.4, type: "word" }] }));
  const e = pastaNova("estilo-");
  fs.writeFileSync(path.join(e, "estilo.md"), `---\nnome: Teste\n${cabecalho}referencia: inventada\n---\n\n# Teste\n\nefeitos: impacto\n`);
  return { v, l, e };
}

function casaComEfeitos() {
  const casa = pastaNova("casa-");
  const ef = path.join(casa, ".creator-hub/efeitos");
  for (const tipo of ["whoosh", "pop", "impacto"]) {
    fs.mkdirSync(path.join(ef, tipo), { recursive: true });
    fs.writeFileSync(path.join(ef, tipo, `${tipo}-01.wav`), "som inventado");
  }
  fs.writeFileSync(path.join(ef, "kit.json"), "[]");
  fs.writeFileSync(path.join(ef, "LEIA.md"), "# Efeitos");
  return casa;
}

test("preparar_estilo: faz o preparo da receita, traz as fontes do kit e as do estilo e lista o que o vídeo pode usar", () => {
  const { v, l, e } = videoEEstilo("");
  fs.mkdirSync(path.join(e, "fontes"));
  fs.writeFileSync(path.join(e, "fontes/MinhaFonte.OTF"), "fonte inventada");
  fs.writeFileSync(path.join(e, "fontes/leia.txt"), "não é fonte");
  const r = rodar("preparar_estilo.sh", [v, e], { HOME: casaComEfeitos() });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  for (const f of ["BebasNeue-Regular.ttf", "Inter-ExtraBold.ttf", "KaushanScript-Regular.ttf", "Poppins-ExtraBold.ttf", "Anton-Regular.ttf", "MinhaFonte.OTF"]) {
    assert.ok(fs.existsSync(path.join(l, "assets/fonts", f)), f);
    assert.match(r.stdout, new RegExp(`- ${f.replace(".", "\\.")}`), f);
  }
  assert.ok(!fs.existsSync(path.join(l, "assets/fonts/leia.txt")));
  assert.match(fs.readFileSync(path.join(l, "palavras.txt"), "utf8"), /^cor de destaque: #112233$/m);
  assert.ok(!fs.existsSync(path.join(l, "assets/sfx")), "sem a linha efeitos no cabeçalho, nenhum som; a do corpo do texto não vale");
});

test("preparar_estilo: traz só os efeitos sonoros que o cabeçalho pede, com o guia", () => {
  const { v, l, e } = videoEEstilo("efeitos: whoosh, pop, buzina\n");
  const r = rodar("preparar_estilo.sh", [v, e], { HOME: casaComEfeitos() });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.deepEqual(fs.readdirSync(path.join(l, "assets/sfx")).sort(), ["LEIA.md", "kit.json", "pop", "whoosh"]);
  assert.ok(fs.existsSync(path.join(l, "assets/sfx/pop/pop-01.wav")));
  assert.match(r.stdout, /pede o efeito "buzina", que o kit não tem/);
  assert.match(r.stdout, /Efeitos sonoros em assets\/sfx\/: whoosh pop/);
});

test("preparar_estilo: com efeitos pedidos e não instalados, avisa e segue", () => {
  const { v, l, e } = videoEEstilo("efeitos: whoosh\n");
  const r = rodar("preparar_estilo.sh", [v, e], { HOME: pastaNova("casa-") });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /não estão instalados: rode o instalar_efeitos\.sh/);
  assert.ok(fs.existsSync(path.join(l, "palavras.txt")));
});

test("preparar_estilo: \"efeitos: nenhum\" e pasta sem estilo.md", () => {
  const { v, l, e } = videoEEstilo("efeitos: nenhum\n");
  assert.equal(rodar("preparar_estilo.sh", [v, e], { HOME: casaComEfeitos() }).status, 0);
  assert.ok(!fs.existsSync(path.join(l, "assets/sfx")));
  const r = rodar("preparar_estilo.sh", [v, pastaNova()]);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /Não encontrei o estilo\.md/);
});

test("nomear: dá o nome final, sem acento nem espaço, e nunca passa por cima de outro estilo", () => {
  const estilos = pastaNova("Estilos-");
  const provisorio = path.join(estilos, "referencia-1");
  fs.mkdirSync(provisorio);
  fs.writeFileSync(path.join(provisorio, "estilo.md"), "x");
  fs.mkdirSync(path.join(estilos, "ja-existe"));
  for (const ruim of ["Legenda Amarela", "legenda-amarelá", "../fora", "-x", ""]) {
    const r = rodar("nomear.sh", [provisorio, ruim]);
    assert.equal(r.status, 1, ruim);
    assert.match(r.stdout, /não serve/, ruim);
  }
  assert.match(rodar("nomear.sh", [provisorio, "ja-existe"]).stdout, /Já existe um estilo chamado ja-existe/);
  const r = rodar("nomear.sh", [provisorio, "legenda-amarela"]);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.ok(fs.existsSync(path.join(estilos, "legenda-amarela/estilo.md")));
  assert.ok(!fs.existsSync(provisorio));
});

test("capa: segundos só em número, e vídeo e pasta precisam existir", () => {
  const e = pastaNova();
  const video = path.join(e, "v.mp4");
  fs.writeFileSync(video, "");
  assert.match(rodar("capa.sh", [video, "2,5", e]).stdout, /Os segundos vão em número/);
  assert.match(rodar("capa.sh", [video, "$(id)", e]).stdout, /Os segundos vão em número/);
  assert.match(rodar("capa.sh", ["/nao/existe.mp4", "1", e]).stdout, /Não encontrei o vídeo/);
  assert.match(rodar("capa.sh", [video, "1", path.join(e, "nao")]).stdout, /Não encontrei a pasta do estilo/);
});

test("fontes da referência: cada família leva a sua licença aberta", () => {
  const pasta = path.join(REF, "fontes");
  const arquivos = fs.readdirSync(pasta);
  assert.ok(arquivos.filter((f) => f.endsWith(".ttf")).length >= 8);
  for (const fonte of arquivos.filter((f) => f.endsWith(".ttf"))) {
    const familia = fonte.split("-")[0];
    assert.ok(arquivos.includes(`OFL-${familia}.txt`), `${fonte} sem licença`);
    assert.match(fs.readFileSync(path.join(pasta, `OFL-${familia}.txt`), "utf8"), /SIL Open Font License, Version 1\.1/, familia);
  }
});

test("skills: todo script que uma skill manda rodar existe no kit", () => {
  const pasta = path.join(RAIZ, "plugins/creator-hub/skills");
  for (const skill of fs.readdirSync(pasta)) {
    const texto = fs.readFileSync(path.join(pasta, skill, "SKILL.md"), "utf8");
    for (const [, rel] of texto.matchAll(/\$\{CLAUDE_PLUGIN_ROOT\}\/(ferramentas\/[^"\s]+)/g))
      assert.ok(fs.existsSync(path.join(RAIZ, "plugins/creator-hub", rel)), `${skill}: ${rel}`);
  }
});

test("skill referencia: nada da empresa, de cliente ou de serviço pago", () => {
  const texto = fs.readFileSync(path.join(RAIZ, "plugins/creator-hub/skills/referencia/SKILL.md"), "utf8");
  assert.doesNotMatch(texto, /Developer\/video-use|fabrica-edicoes|catalogo\/|Referencias\/|Miguel|Fábrica|ElevenLabs|Higgsfield|Artlist|ref-0/i);
  for (const f of fs.readdirSync(REF).filter((f) => /\.(sh|py)$/.test(f)))
    assert.doesNotMatch(fs.readFileSync(path.join(REF, f), "utf8"), /Developer\/video-use|Edicoes\/Referencias|fabrica-edicoes|Miguel/, f);
});
