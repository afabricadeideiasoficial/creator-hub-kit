// Modo ChatGPT: as skills que vão para <Edicoes>/.agents/skills não podem ter nada que só exista no Claude,
// e todo script que elas mandam rodar tem de existir no plugin. Pastas de mentira num diretório temporário.
// Uso: node --test teste/*.test.cjs
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");

const RAIZ = path.join(__dirname, "..");
const PLUGIN = path.join(RAIZ, "plugins/creator-hub");
const { preparar, paraChatGPT, MARCA, COMANDO_MAC } = require(path.join(PLUGIN, "ferramentas/chatgpt/preparar.cjs"));

// O que só existe no Claude. Se aparecer numa skill gerada, falta uma troca em preparar.cjs.
const SO_NO_CLAUDE = [
  /CLAUDE_PLUGIN_ROOT/,
  /Claude/,
  /AskUserQuestion/,
  /`Agent`/,
  /subagente/,
  /\/mcp\b/,
  /painel do navegador/,
  /janela de permissão/,
  /abre janela/,
  /ferramenta de leitura/,
  /ferramenta de busca de arquivos/,
  /\bcartões\b/,
  /num cartão/,
  /\.claude\//,
];

function casaDeMentira() {
  const casa = fs.mkdtempSync(path.join(os.tmpdir(), "kit-chatgpt-"));
  const edicoes = path.join(casa, "Edicoes");
  fs.mkdirSync(edicoes);
  return { casa, edicoes };
}

function arquivosMd(pasta) {
  return fs.readdirSync(pasta, { withFileTypes: true, recursive: true })
    .filter((d) => d.isFile() && d.name.endsWith(".md"))
    .map((d) => path.join(d.parentPath ?? d.path, d.name));
}

test("chatgpt: as 7 skills do kit vão para .agents/skills", () => {
  const { edicoes } = casaDeMentira();
  const { skills } = preparar(PLUGIN, edicoes);
  const doKit = fs.readdirSync(path.join(PLUGIN, "skills")).sort();
  assert.deepEqual(skills, doKit);
  for (const nome of doKit) assert.ok(fs.existsSync(path.join(edicoes, ".agents/skills", nome, "SKILL.md")), nome);
  assert.ok(fs.existsSync(path.join(edicoes, ".agents/skills/mascote-3d/references/voz.md")));
});

test("chatgpt: nada que só existe no Claude sobra nas skills geradas", () => {
  const { edicoes } = casaDeMentira();
  preparar(PLUGIN, edicoes);
  for (const arq of arquivosMd(path.join(edicoes, ".agents/skills"))) {
    const texto = fs.readFileSync(arq, "utf8");
    for (const proibido of SO_NO_CLAUDE) {
      const achado = texto.match(new RegExp(`.{0,50}${proibido.source}.{0,30}`));
      assert.ok(!achado, `${path.relative(edicoes, arq)}: "${achado?.[0]}"`);
    }
  }
});

test("chatgpt: todo script citado nas skills existe no plugin, pelo caminho real", () => {
  const { edicoes } = casaDeMentira();
  preparar(PLUGIN, edicoes);
  const raiz = path.resolve(PLUGIN);
  let vistos = 0;
  for (const arq of arquivosMd(path.join(edicoes, ".agents/skills"))) {
    const texto = fs.readFileSync(arq, "utf8");
    for (const [, rel] of texto.matchAll(new RegExp(`${raiz.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/(ferramentas/[^"\` ]+\\.(?:sh|cjs|py))`, "g"))) {
      assert.ok(fs.existsSync(path.join(raiz, rel)), `${path.basename(path.dirname(arq))}: ${rel}`);
      vistos++;
    }
  }
  assert.ok(vistos > 40, `só ${vistos} caminhos de script`);
});

test("chatgpt: cada skill abre com o aviso do ChatGPT, depois do cabeçalho", () => {
  const { edicoes } = casaDeMentira();
  preparar(PLUGIN, edicoes);
  for (const nome of fs.readdirSync(path.join(PLUGIN, "skills"))) {
    const texto = fs.readFileSync(path.join(edicoes, ".agents/skills", nome, "SKILL.md"), "utf8");
    assert.match(texto, /^---\nname: /, nome);
    const fimCabecalho = texto.indexOf("\n---\n", 4);
    assert.ok(texto.indexOf("Neste app (ChatGPT") > fimCabecalho, nome);
    assert.match(texto, /Servidores MCP/, nome);
  }
});

test("chatgpt: os pedidos viram $novo-video, sem mexer nos caminhos de pasta", () => {
  const saida = paraChatGPT('Use `/novo-video` ou "/cortes". Rode "R/ferramentas/referencia/analisar.sh" em ~/Edicoes/Estilos.', "R", false);
  assert.equal(saida, 'Use `$novo-video` ou "$cortes". Rode "R/ferramentas/referencia/analisar.sh" em ~/Edicoes/Estilos.');
});

test("chatgpt: o $ do caminho entra como está", () => {
  assert.equal(paraChatGPT('bash "${CLAUDE_PLUGIN_ROOT}/x.sh"', "/Users/a$b/kit", false), 'bash "/Users/a$b/kit/x.sh"');
});

test("chatgpt: a fabrica atualiza no modo ChatGPT, sem o comando do Windows", () => {
  const { edicoes } = casaDeMentira();
  preparar(PLUGIN, edicoes);
  const fabrica = fs.readFileSync(path.join(edicoes, ".agents/skills/fabrica/SKILL.md"), "utf8");
  assert.ok(fabrica.includes(COMANDO_MAC));
  assert.ok(!fabrica.includes("instalar.ps1"));
  assert.match(fabrica, /## Problemas/);
});

test("chatgpt: AGENTS.md e .codex/config.toml na pasta, com os caminhos da casa", () => {
  const { casa, edicoes } = casaDeMentira();
  preparar(PLUGIN, edicoes);
  assert.match(fs.readFileSync(path.join(edicoes, "AGENTS.md"), "utf8"), /novo-video/);
  const config = fs.readFileSync(path.join(edicoes, ".codex/config.toml"), "utf8");
  assert.ok(config.includes(JSON.stringify(path.join(casa, ".creator-hub"))));
  assert.match(config, /network_access = true/);
});

test("chatgpt: rodar de novo não perde o AGENTS.md da pessoa nem uma skill dela", () => {
  const { edicoes } = casaDeMentira();
  fs.writeFileSync(path.join(edicoes, "AGENTS.md"), "regras minhas\n");
  fs.mkdirSync(path.join(edicoes, ".agents/skills/cortes"), { recursive: true });
  fs.writeFileSync(path.join(edicoes, ".agents/skills/cortes/SKILL.md"), "minha skill\n");
  const { skills, avisos } = preparar(PLUGIN, edicoes);
  assert.equal(fs.readFileSync(path.join(edicoes, "AGENTS.anterior.md"), "utf8"), "regras minhas\n");
  assert.ok(fs.readFileSync(path.join(edicoes, "AGENTS.md"), "utf8").includes(MARCA));
  assert.equal(fs.readFileSync(path.join(edicoes, ".agents/skills/cortes/SKILL.md"), "utf8"), "minha skill\n");
  assert.ok(!skills.includes("cortes"));
  assert.equal(avisos.length, 2);
  // segunda vez: o AGENTS.md já é nosso, nada novo guardado
  preparar(PLUGIN, edicoes);
  assert.ok(!fs.existsSync(path.join(edicoes, "AGENTS.anterior-2.md")));
});

test("chatgpt: skill que saiu do kit sai da pasta, só se fomos nós que a pusemos", () => {
  const { edicoes } = casaDeMentira();
  preparar(PLUGIN, edicoes);
  const lista = path.join(edicoes, ".agents/skills/.creator-hub.json");
  const dados = JSON.parse(fs.readFileSync(lista, "utf8"));
  dados.skills.push("skill-velha");
  fs.writeFileSync(lista, JSON.stringify(dados));
  fs.mkdirSync(path.join(edicoes, ".agents/skills/skill-velha"));
  fs.mkdirSync(path.join(edicoes, ".agents/skills/da-pessoa"));
  preparar(PLUGIN, edicoes);
  assert.ok(!fs.existsSync(path.join(edicoes, ".agents/skills/skill-velha")));
  assert.ok(fs.existsSync(path.join(edicoes, ".agents/skills/da-pessoa")));
});

test("chatgpt: o instalador cadastra o mesmo endereço do conector que o plugin usa", () => {
  const sh = fs.readFileSync(path.join(RAIZ, "instalador/instalar.sh"), "utf8");
  const url = JSON.parse(fs.readFileSync(path.join(PLUGIN, ".mcp.json"), "utf8")).mcpServers.fabrica.url;
  assert.match(sh, new RegExp(`^KIT_MCP_URL=${url.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "m"));
  assert.match(sh, /--chatgpt\) MODO=chatgpt ;;/);
});

test("chatgpt: o comando de atualizar da fabrica é o mesmo do Mac, com --chatgpt", () => {
  const original = fs.readFileSync(path.join(PLUGIN, "skills/fabrica/SKILL.md"), "utf8");
  const mac = original.match(/^curl -fsSL \S+instalar\.sh \| zsh$/m)[0];
  assert.equal(COMANDO_MAC, `${mac} -s -- --chatgpt`);
});

test("chatgpt: regras do Codex, uma por script do kit, com o caminho inteiro", () => {
  const { regrasCodex } = require(path.join(PLUGIN, "ferramentas/chatgpt/preparar.cjs"));
  const raiz = path.resolve(PLUGIN);
  const texto = regrasCodex(raiz);
  const scripts = fs.readdirSync(path.join(raiz, "ferramentas"), { withFileTypes: true, recursive: true })
    .filter((d) => d.isFile() && d.name.endsWith(".sh"));
  const regras = texto.split("\n").filter((l) => l.startsWith("prefix_rule("));
  assert.equal(regras.length, scripts.length);
  for (const l of regras) {
    // sem lista de opções no pattern: ela invalida o arquivo inteiro no Codex
    assert.match(l, /^prefix_rule\(pattern = \["bash", "[^"\[\]]+\/ferramentas\/[^"\[\]]+\.sh"\], decision = "allow", justification = "[^"]+"\)$/);
    assert.ok(fs.existsSync(JSON.parse(l.match(/"bash", ("[^"]+")/)[1])));
  }
  assert.ok(texto.includes(MARCA));
});

test("chatgpt: skills e AGENTS.md mandam rodar os scripts do kit fora do sandbox", () => {
  const { edicoes } = casaDeMentira();
  preparar(PLUGIN, edicoes);
  assert.match(fs.readFileSync(path.join(edicoes, "AGENTS.md"), "utf8"), /require_escalated/);
  for (const nome of fs.readdirSync(path.join(PLUGIN, "skills"))) {
    assert.match(fs.readFileSync(path.join(edicoes, ".agents/skills", nome, "SKILL.md"), "utf8"), /require_escalated/, nome);
  }
});

test("chatgpt: o instalador para dentro do sandbox do Codex, explicando o que fazer", () => {
  const { spawnSync } = require("node:child_process");
  const { casa } = casaDeMentira();
  const r = spawnSync("sh", [path.join(RAIZ, "instalador/instalar.sh"), "--chatgpt"], {
    env: { ...process.env, HOME: casa, CODEX_SANDBOX: "seatbelt" },
    encoding: "utf8",
  });
  assert.equal(r.status, 1);
  assert.match(r.stdout, /fora do sandbox/);
  assert.match(r.stdout, /zsh -s -- --chatgpt/);
  assert.ok(!fs.existsSync(path.join(casa, ".creator-hub")), "não pode ter começado a instalar");
});
