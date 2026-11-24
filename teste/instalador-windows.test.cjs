// O instalador do Windows. Só lê o texto do arquivo: rodar, só num PC de verdade.
// Uso: node --test teste/*.test.cjs
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");

const ps1 = fs.readFileSync(path.join(__dirname, "../instalador/instalar.ps1"), "utf8");

test("instalador do Windows: as bibliotecas da placa só entram com NVIDIA, depois do ambiente, e nunca viram falha", () => {
  assert.ok(/^[\x00-\x7f]*$/.test(ps1), "o arquivo fica só em ASCII: o PowerShell 5 lê outra codificação sem BOM");
  assert.match(ps1, /if \(Passo 'Ambiente de transcri\\u00e7\\u00e3o' 'ConferirAmbiente' 'InstalarAmbiente' '[^']*'\) \{ PlacaNvidia \}/);
  const corpo = ps1.slice(ps1.indexOf("function PlacaNvidia"), ps1.indexOf("# Sem isto o Python do Windows"));
  assert.match(corpo, /Get-Command nvidia-smi/);
  assert.match(corpo, /'--only-binary', ':all:', 'nvidia-cublas-cu12', 'nvidia-cudnn-cu12==9\.\*'/);
  assert.doesNotMatch(corpo, /AnotarFalha/);
});

test("instalador do Windows: procura o Claude no caminho visto no PC real, sem fixar o id da loja", () => {
  assert.match(ps1, /Join-Path \$env:LOCALAPPDATA 'Claude-Data'/);
  assert.match(ps1, /-Filter 'claude_\*'/);
  assert.match(ps1, /Join-Path \$p\.FullName 'claude-code'/);
  assert.match(ps1, /'Claude\\claude-code'/);
  assert.doesNotMatch(ps1, /pzs8sxrjxfjjc/);
});

test("instalador do Windows: nunca escolhe o Claude.exe do app, e o programa mais novo vem primeiro", () => {
  assert.match(ps1, /\$c -match '\[\\\\\/\]\(WindowsApps\|AnthropicClaude\)\[\\\\\/\]'\) \{ return \$false \}/);
  assert.match(ps1, /PrimeiraLinha \$c @\('--version'\)/);
  assert.match(ps1, /Sort-Object @\{ Expression = \{ VersaoDoCaminho \$_\.FullName \}; Descending = \$true \}, @\{ Expression = 'LastWriteTime'; Descending = \$true \}/);
  assert.match(ps1, /Get-Process -Name 'claude'/);
  const m = ps1.match(/\[regex\]::Match\(\$caminho, '([^']+)'\)/);
  const versao = new RegExp(m[1].replace("[\\\\/]claude-code", "[\\\\/]claude-code"));
  assert.equal("C:\\Users\\a\\AppData\\Local\\Claude-Data\\claude_x\\claude-code\\2.1.317\\a33aa5518497\\claude.exe".match(versao)[1], "2.1.317");
  const fora = new RegExp(ps1.match(/\$c -match '([^']+)'\) \{ return \$false \}/)[1]);
  assert.ok(fora.test("C:\\Program Files\\WindowsApps\\Claude_4.16336.0.0_x64__x\\app\\Claude.exe"));
  assert.ok(!fora.test("C:\\Users\\a\\AppData\\Local\\Claude-Data\\claude_x\\claude-code\\2.1.317\\a33aa5518497\\claude.exe"));
});

test("instalador do Windows: registra o programa usado sem o nome da pessoa e diz que o /mcp funciona no app", () => {
  assert.match(ps1, /Programa do Claude usado: \$\(SemUsuario \$claude\)/);
  assert.match(ps1, /\.Replace\(\[string\]\$HOME, '~'\)/);
  assert.match(ps1, /digite \/mcp nessa sess\\u00e3o nova do app/);
  assert.doesNotMatch(ps1, /este comando n\\u00e3o rodou dentro do Claude/);
});

// Modo ChatGPT no Windows
test("instalador do Windows: o modo ChatGPT só liga quando a pessoa pede, e o do Claude segue igual", () => {
  assert.match(ps1, /\$CHATGPT = \(\$args -contains '--chatgpt'\) -or \(\$args -contains '-chatgpt'\) -or \(\$env:KIT_CHATGPT -eq '1'\)/);
  assert.match(ps1, /if \(\$CHATGPT\) \{\n      InstalarChatgpt\n    \} else \{\n      CopiarInicial 'CLAUDE\.md'\n      CopiarInicial '\.claude\/settings\.json'\n      InstalarPlugin\n    \}/);
});

test("instalador do Windows: o conector é o mesmo do plugin, e a configuração do app volta se não abrir", () => {
  const url = JSON.parse(fs.readFileSync(path.join(__dirname, "../plugins/creator-hub/.mcp.json"), "utf8")).mcpServers.fabrica.url;
  assert.ok(ps1.includes(`$KIT_MCP_URL = '${url}'`));
  const corpo = ps1.slice(ps1.indexOf("function LigarConector"), ps1.indexOf("function EhNosso"));
  assert.match(corpo, /GravarTexto \$CODEX_CONFIG \$antes/);
  assert.doesNotMatch(corpo, /mcp', 'add'/, "o mcp add abre o navegador e fica esperando");
});

test("instalador do Windows: sem o Git para e explica; nunca instala o Git nem chama o bash sem caminho", () => {
  const corpo = ps1.slice(ps1.indexOf("function InstalarChatgpt"), ps1.indexOf("function Resumo"));
  assert.match(corpo, /git-scm\.com\/download\/win/);
  assert.match(corpo, /if \(-not \$bash\) \{ return \}/);
  assert.doesNotMatch(ps1, /winget|choco /);
  assert.doesNotMatch(ps1, /& bash /);
});

test("instalador do Windows: sem KIT_RAMO, tudo vem do main", () => {
  assert.match(ps1, /\$KIT_RAW = '[^']+\/main'\n/);
  assert.match(ps1, /\$KIT_ZIP = '[^']+\/main'\n  if \(\$env:KIT_RAMO -match '\^\[A-Za-z0-9\._-\]\+\$'\) \{/);
});
