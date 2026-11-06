// As regras de permissão do modelo têm de cobrir a pasta de onde o plugin é lido de verdade. Caminhos inventados.
// Uso: node --test teste/*.test.cjs
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");

const RAIZ = path.join(__dirname, "..");
const { allow } = JSON.parse(fs.readFileSync(path.join(RAIZ, "instalador/pasta-inicial/.claude/settings.json"), "utf8")).permissions;
const regras = allow.filter((r) => r.startsWith("Bash(bash ")).map((r) => r.slice(5, -1));

// Um * da regra vale qualquer texto, inclusive barra e espaço.
const casa = (comando) =>
  regras.some((r) => new RegExp(`^${r.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}$`).test(comando));

const MARKETPLACE = ".creator-hub/marketplace/plugins/creator-hub/ferramentas";
const FORMAS = {
  "Mac, com aspas": `bash "/Users/ana/${MARKETPLACE}/cortar.sh" um dois`,
  "Mac, sem aspas": `bash /Users/ana/${MARKETPLACE}/cortar.sh`,
  "Windows C:, barra invertida e espaço no nome": `bash "C:\\Users\\Ana Paula\\${MARKETPLACE.replaceAll("/", "\\")}\\cortar.sh"`,
  "Windows C:, barra normal": `bash "C:/Users/Ana Paula/${MARKETPLACE}/cortar.sh"`,
  "Windows C:, sem aspas": `bash C:/Users/ana/${MARKETPLACE}/cortar.sh`,
  "Windows /c/, com aspas": `bash "/c/Users/Ana Paula/${MARKETPLACE}/cortar.sh"`,
  "Windows /c/, sem aspas": `bash /c/Users/ana/${MARKETPLACE}/cortar.sh`,
  "subpasta das ferramentas": `bash "/Users/ana/${MARKETPLACE}/cortes/cortar.sh"`,
};

for (const [nome, comando] of Object.entries(FORMAS)) {
  test(`regras: libera a ferramenta do kit no marketplace (${nome})`, () => {
    assert.ok(casa(comando), comando);
  });
}

test("regras: as do cache continuam, para instalação de marketplace que não é pasta local", () => {
  assert.ok(casa('bash "/Users/ana/.claude/plugins/cache/creator-hub/creator-hub/0.5.2/ferramentas/cortar.sh"'));
  assert.ok(casa('bash "C:\\Users\\ana\\.claude\\plugins\\cache\\creator-hub\\creator-hub\\0.5.2\\ferramentas\\cortar.sh"'));
  assert.ok(casa('bash "/c/Users/ana/.claude/plugins/cache/creator-hub/creator-hub/0.5.2/ferramentas/cortar.sh"'));
});

test("regras: o que não é do kit continua pedindo permissão", () => {
  for (const comando of [
    'bash "/Users/ana/outra-pasta/ferramentas/cortar.sh"',
    'bash "/Users/ana/.creator-hub/marketplace/plugins/outro/ferramentas/cortar.sh"',
    'bash "/Users/ana/.creator-hub/marketplace/cortar.sh"',
    "bash -c 'qualquer coisa'",
    'bash "/tmp/.creator-hub/marketplace/plugins/creator-hub/ferramentas/cortar.sh"',
  ]) {
    assert.ok(!casa(comando), comando);
  }
});

test("regras: cada forma existe com e sem aspas, nos três formatos, como as do cache", () => {
  const doMarketplace = regras.filter((r) => /creator-hub.marketplace/.test(r));
  assert.equal(doMarketplace.length, 6);
  for (const inicio of ["/Users/", "C:", "/c/Users/"]) {
    assert.equal(doMarketplace.filter((r) => r.startsWith(`bash "${inicio}`)).length, 1, `com aspas: ${inicio}`);
    assert.equal(doMarketplace.filter((r) => r.startsWith(`bash ${inicio}`)).length, 1, `sem aspas: ${inicio}`);
  }
});

// O Claude lê uma regra em duas etapas (visto no 2.1.318): a primeira tira uma barra de cada "\\", e na segunda
// "\\" é uma barra e "\*" é um asterisco. Por isso "..\" seguido de qualquer coisa tem 4 barras na regra e 8 no JSON.
const { deny } = JSON.parse(fs.readFileSync(path.join(RAIZ, "instalador/pasta-inicial/.claude/settings.json"), "utf8")).permissions;
function padrao(regra) {
  const texto = regra.slice(5, -1).replace(/\\([()\\])/g, "$1");
  let saida = "";
  for (let i = 0; i < texto.length; i++) {
    if (texto[i] === "\\" && (texto[i + 1] === "*" || texto[i + 1] === "\\")) saida += `\\${texto[++i]}`;
    else if (texto[i] === "*") saida += ".*";
    else saida += texto[i].replace(/[.+?^${}()|[\]\\'"]/g, "\\$&");
  }
  return new RegExp(`^${saida}$`, "s");
}
const recusa = (comando) => deny.some((r) => padrao(r).test(comando));
const KIT_W = MARKETPLACE.replaceAll("/", "\\");

test("regras: sair da pasta do kit com .. é recusado, em todos os formatos", () => {
  for (const comando of [
    `bash "/Users/ana/${MARKETPLACE}/../../outro.sh"`,
    `bash /Users/ana/${MARKETPLACE}/../../outro.sh`,
    `bash "C:\\Users\\Ana Paula\\${KIT_W}\\..\\..\\outro.sh"`,
    `bash C:\\Users\\ana\\${KIT_W}\\..\\..\\outro.sh`,
    `bash "C:/Users/Ana Paula/${MARKETPLACE}/../../outro.sh"`,
    `bash C:/Users/ana/${MARKETPLACE}/../../outro.sh`,
    `bash "/c/Users/Ana Paula/${MARKETPLACE}/../../outro.sh"`,
    `bash /c/Users/ana/${MARKETPLACE}/../../outro.sh`,
    `bash "C:/Users/ana/${MARKETPLACE}/..\\outro.sh"`,
    `bash "C:\\Users\\ana\\${KIT_W}\\../outro.sh"`,
    "bash ../algo.sh",
  ]) {
    assert.ok(recusa(comando), comando);
  }
});

test("regras: o bloqueio de .. não atrapalha as chamadas de verdade", () => {
  for (const comando of [
    ...Object.values(FORMAS),
    `bash "/Users/ana/${MARKETPLACE}/cortar.sh" "/Users/ana/Edicoes/Cliente/a..b.mp4" 3.9-5.4`,
    `bash "C:\\Users\\Ana Paula\\${KIT_W}\\cortar.sh" "C:\\Users\\Ana Paula\\Edicoes\\a..b.mp4"`,
    `bash "/Users/ana/${MARKETPLACE}/cortar.sh" "/Users/ana/Edicoes/capa.."`,
  ]) {
    assert.ok(!recusa(comando), comando);
    assert.ok(casa(comando), comando);
  }
});

test("regras: a barra invertida do deny fica escrita como o Claude precisa", () => {
  assert.deepEqual(deny, ["Bash(bash *../*)", `Bash(bash *..${"\\".repeat(4)}*)`]);
});

test("regras: nenhuma instrução do kit manda chamar uma ferramenta com ..", () => {
  const pasta = path.join(RAIZ, "plugins/creator-hub");
  for (const arquivo of fs.readdirSync(pasta, { recursive: true }).filter((f) => f.endsWith(".md"))) {
    for (const linha of fs.readFileSync(path.join(pasta, arquivo), "utf8").split("\n")) {
      if (/bash "\$\{CLAUDE_PLUGIN_ROOT\}/.test(linha)) assert.doesNotMatch(linha, /\.\.[/\\]/, `${arquivo}: ${linha}`);
    }
  }
});

test("regras: a pasta citada é a mesma para onde os dois instaladores baixam o plugin", () => {
  const mac = fs.readFileSync(path.join(RAIZ, "instalador/instalar.sh"), "utf8");
  assert.match(mac, /RAIZ="\$HOME\/\.creator-hub"/);
  assert.match(mac, /MKT="\$RAIZ\/marketplace"/);
  const windows = fs.readFileSync(path.join(RAIZ, "instalador/instalar.ps1"), "utf8");
  assert.match(windows, /\$RAIZ = Join-Path \$HOME '\.creator-hub'/);
  assert.match(windows, /\$MKT = Join-Path \$RAIZ 'marketplace'/);
  assert.ok(fs.existsSync(path.join(RAIZ, "plugins/creator-hub/ferramentas")));
});

test("regras: as skills chamam as ferramentas no formato que as regras cobrem", () => {
  const pasta = path.join(RAIZ, "plugins/creator-hub");
  const arquivos = fs.readdirSync(pasta, { recursive: true }).filter((f) => f.endsWith(".md"));
  let chamadas = 0;
  for (const arquivo of arquivos) {
    const texto = fs.readFileSync(path.join(pasta, arquivo), "utf8");
    // Toda ferramenta entre aspas é chamada com "bash " logo antes, sem nada colado na frente.
    for (const achado of texto.matchAll(/"\$\{CLAUDE_PLUGIN_ROOT\}\/ferramentas\/[^"]+"/g)) {
      chamadas++;
      const antes = texto.slice(Math.max(0, achado.index - 40), achado.index).split("\n").pop();
      assert.match(antes, /(^|[`\s])bash $/, `${arquivo}: ${antes}${achado[0]}`);
      assert.doesNotMatch(antes, /(&&|;|=\S*) *bash $/, `${arquivo}: ${antes}${achado[0]}`);
    }
  }
  assert.ok(chamadas > 0);
});
