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

test("chatgpt: AGENTS.md e .codex/config.toml na pasta, sem abrir gravação fora dela", () => {
  const { casa, edicoes } = casaDeMentira();
  preparar(PLUGIN, edicoes);
  assert.match(fs.readFileSync(path.join(edicoes, "AGENTS.md"), "utf8"), /novo-video/);
  const config = fs.readFileSync(path.join(edicoes, ".codex/config.toml"), "utf8");
  assert.match(config, /network_access = true/);
  // A regra deixa os scripts do kit rodarem fora do sandbox sem perguntar. Se o sandbox pudesse gravar onde moram
  // os scripts, os programas ou o navegador deles, bastaria trocar um para sair do sandbox.
  assert.ok(!config.includes("writable_roots"), config);
  assert.ok(!config.includes(casa), config);
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

// De onde vêm os scripts que o assistente roda: as skills geradas e o que um script chama. Lista feita pelo que é
// citado, não pela varredura da pasta: um script novo que fique de fora das regras faz o teste falhar.
test("chatgpt: todo script citado nas skills ou chamado por outro script tem regra", () => {
  const { regrasCodex } = require(path.join(PLUGIN, "ferramentas/chatgpt/preparar.cjs"));
  const raiz = path.resolve(PLUGIN);
  const comRegra = new Set([...regrasCodex(raiz).matchAll(/"bash", "([^"]+)"/g)].map((m) => m[1]));
  const { edicoes } = casaDeMentira();
  preparar(PLUGIN, edicoes);
  const citados = new Set();
  for (const arq of arquivosMd(path.join(edicoes, ".agents/skills"))) {
    for (const [, rel] of fs.readFileSync(arq, "utf8").matchAll(/(?:<ferramentas>|\/ferramentas)\/(\w[\w./-]*\.sh)/g)) citados.add(rel);
  }
  for (const d of fs.readdirSync(path.join(raiz, "ferramentas"), { withFileTypes: true, recursive: true })) {
    if (!d.isFile() || !d.name.endsWith(".sh")) continue;
    const texto = fs.readFileSync(path.join(d.parentPath ?? d.path, d.name), "utf8");
    for (const [, rel] of texto.matchAll(/\$FERRAMENTAS\/([\w./-]+\.sh)/g)) citados.add(rel);
  }
  assert.ok(citados.has("rodar_render.sh"), "o render passa pelo rodar_render.sh");
  assert.ok(citados.size > 25, `só ${citados.size} scripts citados`);
  for (const rel of citados) assert.ok(comRegra.has(path.join(raiz, "ferramentas", rel)), `sem regra: ${rel}`);
});

test("chatgpt: o guia de cada corte vai junto, sem o que só existe no Claude", () => {
  const { edicoes } = casaDeMentira();
  preparar(PLUGIN, edicoes);
  const guia = path.join(edicoes, ".agents/skills/cortes/references/editar-um-corte.md");
  assert.match(fs.readFileSync(guia, "utf8"), /^# Editar um corte/);
  const skill = fs.readFileSync(path.join(edicoes, ".agents/skills/cortes/SKILL.md"), "utf8");
  assert.match(skill, /references\/editar-um-corte\.md/);
  assert.ok(!skill.includes("instrucoes_do_corte.sh"), "o script mostra o guia do Claude");
});

test("chatgpt: todo guia que um script mostra tem versão para o ChatGPT", () => {
  const { GUIAS } = require(path.join(PLUGIN, "ferramentas/chatgpt/preparar.cjs"));
  const tratados = Object.values(GUIAS).flat().sort();
  const guias = fs.readdirSync(path.join(PLUGIN, "ferramentas"), { withFileTypes: true, recursive: true })
    .filter((d) => d.isFile() && d.name.endsWith(".md"))
    .map((d) => path.relative(PLUGIN, path.join(d.parentPath ?? d.path, d.name)))
    .sort();
  assert.deepEqual(guias, tratados);
});

test("chatgpt: as skills dizem onde fica a pasta de ferramentas, que os guias do servidor citam", () => {
  const { edicoes } = casaDeMentira();
  preparar(PLUGIN, edicoes);
  for (const nome of fs.readdirSync(path.join(PLUGIN, "skills"))) {
    const texto = fs.readFileSync(path.join(edicoes, ".agents/skills", nome, "SKILL.md"), "utf8");
    assert.ok(texto.includes(`\`<ferramentas>\`, é \`${path.resolve(PLUGIN)}/ferramentas\``), nome);
  }
});

test("chatgpt: o que os scripts mostram na tela não manda abrir o app do Claude", () => {
  for (const d of fs.readdirSync(path.join(PLUGIN, "ferramentas"), { withFileTypes: true, recursive: true })) {
    if (!d.isFile() || !d.name.endsWith(".sh")) continue;
    const linhas = fs.readFileSync(path.join(d.parentPath ?? d.path, d.name), "utf8").split("\n");
    for (const l of linhas) assert.ok(l.trim().startsWith("#") || !/Claude/.test(l), `${d.name}: ${l.trim()}`);
  }
});

test("chatgpt: comando de skill sem $HOME, ~, curinga nem redirecionamento, que o Codex não compara com as regras", () => {
  const { casa, edicoes } = casaDeMentira();
  preparar(PLUGIN, edicoes);
  let vistos = 0;
  for (const arq of arquivosMd(path.join(edicoes, ".agents/skills"))) {
    for (const [, linha] of fs.readFileSync(arq, "utf8").matchAll(/^(bash "[^\n]*)$/gm)) {
      vistos++;
      // <pasta-do-video> e afins são lacunas que o assistente preenche
      const semLacunas = linha.replace(/<[^<>]+>/g, "x");
      assert.ok(!/[$~*?<>|;&]/.test(semLacunas), `${path.relative(edicoes, arq)}: ${linha}`);
    }
  }
  assert.ok(vistos > 40, `só ${vistos} comandos`);
  assert.ok(fs.readFileSync(path.join(edicoes, ".agents/skills/mascote-3d/SKILL.md"), "utf8").includes(`"${casa}/Edicoes/<Canal>/mascote.js"`));
});
