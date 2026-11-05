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
