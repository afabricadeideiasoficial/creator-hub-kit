#!/usr/bin/env node
// Prepara a pasta Edicoes para o app do ChatGPT (Codex), a partir das skills deste plugin.
// O Codex lê as skills em <pasta>/.agents/skills e as regras da pasta no AGENTS.md, mas não define
// ${CLAUDE_PLUGIN_ROOT} nas skills e não tem as ferramentas que só o Claude tem (cartões de pergunta,
// subagente, /mcp). Aqui cada skill ganha o caminho real do plugin e o texto equivalente no Codex.
//
// Uso: node preparar.cjs <pasta-do-plugin> <pasta-edicoes> [--bash <bash.exe do Git>]
// Com --bash, é o Windows: o Codex roda os comandos no PowerShell, e os scripts do kit vão pelo Git Bash.
// Pode rodar quantas vezes quiser: refaz só o que é dele (marcado com MARCA) e guarda o resto.

const fs = require("node:fs");
const path = require("node:path");

const MARCA = "creator-hub: gerado pela instalação";
const COMANDO_MAC =
  "curl -fsSL https://raw.githubusercontent.com/afabricadeideiasoficial/creator-hub-kit/main/instalador/instalar.sh | zsh -s -- --chatgpt";
const COMANDO_WINDOWS =
  "$env:KIT_CHATGPT='1'; irm https://raw.githubusercontent.com/afabricadeideiasoficial/creator-hub-kit/main/instalador/instalar.ps1 | iex";
const SKILLS_DO_KIT = /\b(novo-video|cortes|plano-continuo|mascote-3d|cliente-novo|referencia|fabrica)\b/;
const LOGIN =
  "abrir as configurações do app do ChatGPT (Cmd + vírgula), entrar em Plugins, na aba MCPs, e clicar em Autenticar no `fabrica` (em versões mais antigas do app, o caminho é Servidores MCP)";

// Guias que ficam fora das skills e que um script mostraria com o texto do Claude: vão adaptados para references/.
const GUIAS = { cortes: ["ferramentas/cortes/editar-um-corte.md"] };

const aviso = (raiz) => `> **Neste app (ChatGPT, pelo Codex).** Estas instruções valem para dois apps. Aqui:
> - Quando for perguntar, faça todas as perguntas numa mensagem só, cada uma com opções numeradas e a recomendada primeiro, e espere a pessoa responder com os números.
> - Para ler arquivos e ver pastas, use \`cat\`, \`sed -n\`, \`ls\` e \`rg\`. Para olhar uma imagem do computador, use a sua ferramenta de ver imagens.
> - Rode todo script do kit (\`bash ".../ferramentas/....sh"\`) já pedindo para rodar fora do sandbox (\`sandbox_permissions: "require_escalated"\`). A transcrição usa a placa de vídeo do Mac e a conferência e o render usam um navegador invisível, e o sandbox bloqueia os dois. A instalação deixou uma regra que libera só esses scripts, sem perguntar à pessoa. Se ainda assim o app pedir autorização, diga em uma linha que é a máquina de edição.
> - Nesses comandos, escreva os caminhos por extenso (\`/Users/...\`) e entre aspas, sem \`~\`, \`$HOME\`, curinga nem redirecionamento: comando com isso não casa com a regra e pede autorização à toa.
> - Onde uma receita ou um guia falar em \`<ferramentas>\`, é \`${raiz}/ferramentas\`.
> - Se o conector \`fabrica\` pedir login ou disser "token expirado", diga para a pessoa ${LOGIN}.
> - Os pedidos começam com \`$\`, como \`$novo-video\`. Se a pessoa colar um pedido com \`/\` vindo da vitrine, como "/novo-video estilo: x", trate igual.`;

// [o que procurar, pelo que trocar]. Cada troca tira um pedaço que só existe no Claude; o teste confere que
// nada do Claude sobrou, então uma frase nova nas skills que escape daqui faz o teste falhar.
function trocas(raiz, casa) {
  return [
    // antes da troca do caminho: o script mostraria o guia com o texto do Claude
    [/Rode `bash "\$\{CLAUDE_PLUGIN_ROOT\}\/ferramentas\/cortes\/instrucoes_do_corte\.sh"` e siga o que ele mostrar até o fim\./g,
      "Leia inteiro o `references/editar-um-corte.md` desta skill e siga até o fim."],
    [/\$\{CLAUDE_PLUGIN_ROOT\}/g, raiz],
    // o Codex não compara com as regras um comando que tenha variável: o caminho vai por extenso
    [/\$HOME(?=\/)/g, casa],
    [/mostre as escolhas em cartões/g, "mostre as escolhas como opções numeradas, para a pessoa responder só com o número"],
    [/Faça uma única chamada de `AskUserQuestion`/g, "Faça todas as perguntas numa mensagem só, com opções numeradas e a recomendada primeiro"],
    [/faça uma única chamada de `AskUserQuestion`/g, "faça todas as perguntas numa mensagem só, com opções numeradas e a recomendada primeiro"],
    [/Use `AskUserQuestion`,/g, "Pergunte numa mensagem só, com opções numeradas onde houver escolha,"],
    [/com `AskUserQuestion`:/g, "com opções numeradas:"],
    [/num cartão/g, "com opções numeradas"],
    [/Se o Claude pedir login no conector, diga para a pessoa digitar `\/mcp` e escolher `fabrica`\./g, `Se o conector \`fabrica\` pedir login, diga para a pessoa ${LOGIN}.`],
    [/digite `\/mcp` e escolha `fabrica`, aqui mesmo nesta sessão do app, sem abrir terminal\. Não use `\/login`\./g, `${LOGIN.replace("abrir", "abra").replace("entrar", "entre").replace("clicar", "clique")}.`],
    [/plano do Claude/g, "plano do ChatGPT"],
    [/Abra no painel do navegador/g, "Abra no navegador"],
    // cortes: o Codex faz no lugar do subagente
    [/quem lê é um subagente: chame a ferramenta `Agent`, sem trocar o modelo, com este pedido:/g, "leia só o que este pedido manda e siga-o você mesmo:"],
    [/chame a ferramenta `Agent` com `model: "sonnet"` e este pedido:/g, "siga você mesmo este pedido:"],
    [/Cada corte fica num subagente separado para um não carregar o histórico do outro, o que gastaria mais do plano da pessoa\./g,
      "Se a conversa ficar longa, diga à pessoa que dá para continuar numa conversa nova na pasta Edicoes, pedindo: continua os cortes de onde parou."],
    [/nesse caso, peça ao subagente que ajuste a lista/g, "nesse caso, ajuste a lista"],
    [/Se um subagente disser que algo deu errado/g, "Se algo der errado num corte"],
    [/chame um novo subagente para esse corte, dizendo o que mudar/g, "refaça esse corte com o que ela pediu"],
    [/com a sua ferramenta de leitura de arquivos, em partes se ele for grande/g, "com `sed -n`, em partes se ele for grande"],
    // conferir: no Codex, ler arquivo é comando de terminal, não janela de permissão
    [/Não rode comandos próprios, como `ls`, `cat`, `grep`, `tail`, `ffmpeg`, `ffprobe` ou `node`: cada um abre uma janela de permissão para a pessoa, e os scripts do kit não abrem\./g,
      "Não rode `ffmpeg`, `ffprobe` ou `node` por conta própria: os scripts do kit já fazem isso do jeito certo. Para ler um arquivo ou ver uma pasta, pode usar `cat`, `sed -n`, `ls` e `rg`."],
    [/Não rode comandos próprios, como `ls`, `cat`, `cp`, `mv`, `ffmpeg` ou `node`: cada um abre uma janela de permissão para a pessoa\./g,
      "Não rode `cp`, `mv`, `ffmpeg` ou `node` por conta própria. Para ler um arquivo ou ver uma pasta, pode usar `cat`, `sed -n`, `ls` e `rg`."],
    [/Para conferir, use só os scripts do kit, e não comandos próprios como `ls`, `ffmpeg` ou `node`: cada um abre uma janela de permissão para a pessoa\./g,
      "Para conferir, use os scripts do kit, e não `ffmpeg` ou `node` por conta própria. Para ler um arquivo ou ver uma pasta, pode usar `cat`, `sed -n`, `ls` e `rg`."],
    [/Rode cada script do kit sozinho, sem `\|`, `;` ou `&&`, e não rode comandos próprios como `ls`, `cat` ou `ffmpeg`: cada um abre uma janela de permissão para a pessoa\./g,
      "Rode cada script do kit sozinho, sem `|`, `;` ou `&&`, e não rode `ffmpeg` por conta própria. Para ler um arquivo ou ver uma pasta, pode usar `cat`, `sed -n`, `ls` e `rg`."],
    [/: comando encadeado também abre janela\. Para ver o que há numa pasta, use a sua ferramenta de busca de arquivos\. Para ler um arquivo ou a saída de um comando em segundo plano, use a sua ferramenta de leitura de arquivos\./g, "."],
    [/ Para ver o que há numa pasta, use a sua ferramenta de busca de arquivos\. Para ler um arquivo ou olhar uma imagem, use a sua ferramenta de leitura de arquivos\./g,
      " Para olhar uma imagem, use a sua ferramenta de ver imagens."],
    [/Abra, com a ferramenta de leitura, o `analise\/analise\.json` e todas as imagens/g, "Leia o `analise/analise.json` e olhe, com a sua ferramenta de ver imagens, todas as imagens"],
    [/Edite os arquivos com a sua ferramenta de edição, nunca com um script: script pede permissão à pessoa a cada vez\./g, "Edite os arquivos com a sua ferramenta de edição, nunca com um script."],
    // o guia de um corte
    [/quem mostra o resultado é a conversa principal/g, "o resultado é mostrado depois, no passo de aprovar"],
    [/não rode comandos próprios como `ls`, `cat`, `grep`, `ffmpeg` ou `node`: cada um abre uma janela de permissão para a pessoa\. Para ler um arquivo, use a sua ferramenta de leitura\./g,
      "não rode `ffmpeg` ou `node` por conta própria. Para ler um arquivo ou ver uma pasta, pode usar `cat`, `sed -n`, `ls` e `rg`."],
    [/Script de `python` ou `sed` abre uma janela de permissão para a pessoa\./g, "Não use script de `python` ou `sed` para isso."],
    // fabrica
    [/nada de listar pastas nem de ler `~\/\.claude\/plugins`\. Cada comando próprio abre uma janela de permissão para a pessoa\./g, "nada de listar pastas nem de abrir outros arquivos do kit."],
    [/## Atualizar\n[\s\S]*?(?=\n## )/g, `## Atualizar

Os estilos e os motores ficam no servidor e chegam sozinhos. As instruções do kit mudam de vez em quando. Para atualizar, rode a instalação de novo, no modo ChatGPT: ela só refaz o que mudou. Rode você mesmo, nesta conversa. Ela precisa de internet e de gravar fora da pasta: peça a autorização e explique que é a atualização do kit.

\`\`\`bash
${COMANDO_MAC}
\`\`\`

Depois, peça para a pessoa abrir uma conversa nova na pasta Edicoes. No Windows, o kit ainda não roda no ChatGPT: por enquanto, quem tem Windows usa o outro app, como na aula de instalação.
`],
    // mascote-3d: gerar a voz pelo navegador
    [/só se o Claude in Chrome estiver ligado e logado na conta dela/g, "só se você conseguir usar o navegador em que ela está logada no ElevenLabs"],
    [/Use \*\*Claude in Chrome\*\*, onde o ElevenLabs do usuário está logado\./g, "Use o navegador em que o ElevenLabs do usuário está logado, se você consegue controlá-lo. Se não, peça para a pessoa gerar e mandar o arquivo."],
    [/\n\nA extensão só enxerga navegadores logados na mesma conta do Claude desta sessão\./g, ""],
    // pedidos: /novo-video vira $novo-video (no Codex, a barra abre os comandos do app)
    [new RegExp(`(?<=[\\s\`"(])/(?=${SKILLS_DO_KIT.source})`, "g"), "$"],
  ];
}

// No Windows, por cima do texto do Mac (que não muda). O Codex roda no PowerShell 5.1: "bash" sozinho pode abrir o
// WSL, "~" não vira a pasta da pessoa, "curl" é outro programa, "&&" não existe e o Get-Content sem -Encoding
// estraga os acentos.
const avisoWindows = (bash) => `> **No Windows.** Os comandos rodam no PowerShell. Aqui:
> - Rode os scripts do kit sempre pelo Git Bash, com o caminho inteiro, como nos exemplos: \`& "${bash}" "C:/.../script.sh" "argumento"\`. Nunca só \`bash\`, que pode abrir o WSL. Nos caminhos, use \`/\`.
> - Os comandos que as ferramentas \`fabrica\` devolvem são de bash (\`mkdir -p\`, \`curl\`, \`&&\`). Salve o comando, exatamente como veio, num arquivo \`comando.sh\` na pasta indicada, com a sua ferramenta de edição, e rode \`& "${bash}" comando.sh\` nessa pasta. Não o reescreva para o PowerShell.
> - Para ler um arquivo, use \`Get-Content -Encoding UTF8\`: sem isso, os acentos quebram.`;

function noWindows(texto, { raiz, casa, bash }) {
  const literal = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const script = `(?=${literal(raiz)}/ferramentas/|<ferramentas>/|\\.\\.\\./ferramentas/)`;
  return [
    [new RegExp(`(^ *|\`)bash "${script}`, "gm"), (m, antes) => `${antes}& "${bash}" "`],
    [/```bash\n(?= *& ")/g, () => "```powershell\n"],
    [new RegExp("```bash\\n" + literal(COMANDO_MAC), "g"), () => "```powershell\n" + COMANDO_WINDOWS],
    [/ No Windows, o kit ainda não roda no ChatGPT: por enquanto, quem tem Windows usa o outro app, como na aula de instalação\./g, () => ""],
    [/`cat`, `sed -n`, `ls` e `rg`/g, () => "`Get-Content -Encoding UTF8`, `dir` e `rg`"],
    [/com `sed -n`, em partes/g, () => "com `Get-Content -Encoding UTF8`, em partes"],
    [/~\/(?=Edicoes|\.creator-hub|\.cache|Downloads|Desktop)/g, () => `${casa}/`],
    [/Cmd \+ vírgula/g, () => "Ctrl + vírgula"],
    [/placa de vídeo do Mac/g, () => "placa de vídeo"],
    [/\(`\/Users\/\.\.\.`\)/g, () => "(`C:/Users/...`)"],
  ].reduce((t, [de, para]) => t.replace(de, para), texto);
}

function paraChatGPT(texto, raiz, comAviso, casa = "$HOME", bash = "") {
  // um Git do Windows pode ter trocado as quebras de linha dos arquivos
  let saida = texto.replaceAll("\r\n", "\n");
  // a troca vai por função: um "$" no texto novo (o caminho, o "$novo-video") entra como está
  for (const [de, para] of trocas(raiz, casa)) saida = saida.replace(de, () => para);
  if (comAviso) {
    // depois do cabeçalho (--- ... ---), antes do título
    const fim = saida.startsWith("---\n") ? saida.indexOf("\n---\n", 4) : -1;
    if (fim < 0) throw new Error("skill sem cabeçalho");
    const corte = fim + 5;
    const avisos = bash ? `${aviso(raiz)}\n>\n${avisoWindows(bash)}` : aviso(raiz);
    saida = `${saida.slice(0, corte)}\n${avisos}\n${saida.slice(corte)}`;
  }
  return bash ? noWindows(saida, { raiz, casa, bash }) : saida;
}

function agentsMd() {
  return `<!-- ${MARCA}. Rode a instalação de novo para atualizar; o que você mudar aqui volta ao padrão. -->
# Minha pasta de edição

Responda sempre em português (Brasil), de um jeito simples: quem usa esta pasta nem sempre é técnico.

- Para editar um vídeo, use a skill \`novo-video\`. Para ver o menu, use \`fabrica\`.
- Cada cliente tem uma pasta aqui, com o \`marca.json\` e as pastas de cada mês. Os vídeos gravados ficam em \`<Cliente>/<Mês>/Brutos/\`.
- Para copiar o jeito de editar de um vídeo de referência, use a skill \`referencia\`. Os estilos criados assim ficam em \`Estilos/\`, um por pasta.
- Nunca apague nem sobrescreva um vídeo original.
- Não mude nada em \`.agents/skills\` nem em \`~/.creator-hub\`: a instalação refaz essas pastas.
- Rode os scripts do kit fora do sandbox (\`sandbox_permissions: "require_escalated"\`): a transcrição usa a placa de vídeo do Mac e o render usa um navegador invisível, e o sandbox bloqueia os dois. A regra do kit libera esses scripts sem perguntar.
- Se o kit pedir login, diga para a pessoa ${LOGIN}.
`;
}

// Só vale depois que a pessoa confia na pasta. A rede é para os comandos que as ferramentas do servidor devolvem.
// Nada de writable_roots: os scripts do kit já rodam fora do sandbox (regrasCodex), e o sandbox não pode gravar onde
// moram os scripts, os programas e o navegador que eles usam. Com ~/.creator-hub ou ~/.cache graváveis, bastaria
// trocar um arquivo lá para rodar qualquer coisa fora do sandbox sem perguntar.
function configToml() {
  return `# ${MARCA}. Vale só nesta pasta, depois de confiar nela.
sandbox_mode = "workspace-write"
approval_policy = "on-request"

[sandbox_workspace_write]
network_access = true
`;
}

// Regras do Codex (~/.codex/rules): cada script do kit roda fora do sandbox sem perguntar, como a lista de
// permissões do Claude. Uma regra por script, com o caminho inteiro: outro script, "bash -c" ou comando
// encadeado não casam. Atenção ao que a regra alcança: alguns destes scripts rodam programas da pasta do vídeo
// (medir_margens.cjs, o render), então quem escreve nessa pasta decide o que roda fora do sandbox. É o mesmo alcance
// que o kit já tem no Claude, onde os comandos não têm sandbox. Lista de opções dentro do pattern invalida o arquivo inteiro, então nada disso aqui.
function regrasCodex(raiz, bash = "") {
  const scripts = fs
    .readdirSync(path.join(raiz, "ferramentas"), { withFileTypes: true, recursive: true })
    .filter((d) => d.isFile() && d.name.endsWith(".sh"))
    .map((d) => path.join(d.parentPath ?? d.path, d.name))
    .sort();
  const linhas = scripts.map(
    (s) => `prefix_rule(pattern = [${JSON.stringify(bash || "bash")}, ${JSON.stringify(bash ? barras(s) : s)}], decision = "allow", justification = "ferramenta do kit do Creator Hub")`,
  );
  return `# ${MARCA}. Libera só os scripts do kit fora do sandbox; a instalação refaz este arquivo.\n${linhas.join("\n")}\n`;
}

// No Windows, os textos levam "/": a barra invertida se perde no caminho entre o PowerShell e o bash.
const barras = (p) => p.replaceAll("\\", "/");

const ehNosso = (arq) => fs.existsSync(arq) && fs.readFileSync(arq, "utf8").includes(MARCA);

// Guarda o arquivo da pessoa com outro nome antes de escrever o nosso: nada se perde.
function escreverGuardando(arq, conteudo, avisos) {
  if (fs.existsSync(arq) && !ehNosso(arq)) {
    if (fs.readFileSync(arq, "utf8") === conteudo) return;
    const { dir, name, ext } = path.parse(arq);
    let n = 1;
    let guarda;
    do guarda = path.join(dir, `${name}.anterior${n > 1 ? `-${n}` : ""}${ext}`);
    while (fs.existsSync(guarda) && n++);
    fs.renameSync(arq, guarda);
    avisos.push(`o ${path.basename(arq)} que já existia foi guardado como ${path.basename(guarda)}`);
  }
  fs.mkdirSync(path.dirname(arq), { recursive: true });
  fs.writeFileSync(arq, conteudo);
}

function copiarSkill(origem, destino, raiz, casa, bash) {
  fs.rmSync(destino, { recursive: true, force: true });
  fs.mkdirSync(destino, { recursive: true });
  for (const item of fs.readdirSync(origem, { withFileTypes: true })) {
    const de = path.join(origem, item.name);
    const para = path.join(destino, item.name);
    if (item.isDirectory()) copiarSkill(de, para, raiz, casa, bash);
    else if (item.name.endsWith(".md")) fs.writeFileSync(para, paraChatGPT(fs.readFileSync(de, "utf8"), raiz, item.name === "SKILL.md", casa, bash));
    else fs.copyFileSync(de, para);
  }
}

function preparar(plugin, edicoes, { bash = "" } = {}) {
  const pasta = path.resolve(plugin);
  // o que vai escrito nas skills; no disco, o Node usa o caminho do sistema
  const raiz = bash ? barras(pasta) : pasta;
  const casa = bash ? barras(path.dirname(path.resolve(edicoes))) : path.dirname(path.resolve(edicoes));
  const avisos = [];
  const pastaSkills = path.join(edicoes, ".agents", "skills");
  const lista = path.join(pastaSkills, ".creator-hub.json");
  const antes = fs.existsSync(lista) ? JSON.parse(fs.readFileSync(lista, "utf8")).skills : [];
  const skills = fs
    .readdirSync(path.join(pasta, "skills"), { withFileTypes: true })
    .filter((d) => d.isDirectory() && fs.existsSync(path.join(pasta, "skills", d.name, "SKILL.md")))
    .map((d) => d.name)
    .sort();

  const feitas = [];
  for (const nome of skills) {
    const destino = path.join(pastaSkills, nome);
    if (fs.existsSync(destino) && !antes.includes(nome)) {
      avisos.push(`já existe uma skill sua chamada ${nome} em .agents/skills: não mexi nela`);
      continue;
    }
    copiarSkill(path.join(pasta, "skills", nome), destino, raiz, casa, bash);
    for (const guia of GUIAS[nome] ?? []) {
      const para = path.join(destino, "references", path.basename(guia));
      fs.mkdirSync(path.dirname(para), { recursive: true });
      fs.writeFileSync(para, paraChatGPT(fs.readFileSync(path.join(pasta, guia), "utf8"), raiz, false, casa, bash));
    }
    feitas.push(nome);
  }
  // skill que saiu do kit numa versão nova: sai daqui também, só se fomos nós que a pusemos
  for (const nome of antes) {
    if (!skills.includes(nome)) fs.rmSync(path.join(pastaSkills, nome), { recursive: true, force: true });
  }
  fs.writeFileSync(lista, `${JSON.stringify({ aviso: MARCA, skills: feitas }, null, 2)}\n`);

  const regrasDaPasta = bash ? noWindows(`${agentsMd()}- Rode os scripts do kit pelo Git Bash, com o caminho inteiro (\`& "${bash}" "C:/.../script.sh"\`), nunca só \`bash\`.\n`, { raiz, casa, bash }) : agentsMd();
  escreverGuardando(path.join(edicoes, "AGENTS.md"), regrasDaPasta, avisos);
  const config = path.join(edicoes, ".codex", "config.toml");
  if (!fs.existsSync(config) || ehNosso(config)) {
    fs.mkdirSync(path.dirname(config), { recursive: true });
    fs.writeFileSync(config, configToml());
  } else {
    avisos.push("a pasta Edicoes já tinha um .codex/config.toml seu: não mexi nele");
  }
  return { skills: feitas, avisos };
}

module.exports = { paraChatGPT, preparar, agentsMd, configToml, regrasCodex, GUIAS, MARCA, COMANDO_MAC, COMANDO_WINDOWS };

if (require.main === module) {
  const args = process.argv.slice(2);
  const opcao = (nome) => {
    const i = args.indexOf(nome);
    return i < 0 ? "" : args.splice(i, 2)[1];
  };
  const bash = barras(opcao("--bash"));
  const saida = opcao("--saida");
  // --regras <plugin>: só escreve na saída as regras do Codex (o instalador confere antes de pôr no lugar)
  if (args[0] === "--regras" && args[1]) {
    const regras = regrasCodex(path.resolve(args[1]), bash);
    // num arquivo no Windows: o que passa pelo PowerShell 5.1 muda de codificação
    if (saida) fs.writeFileSync(saida, regras);
    else process.stdout.write(regras);
    process.exit(0);
  }
  const [plugin, edicoes] = args;
  if (!plugin || !edicoes) {
    console.error("Uso: node preparar.cjs <pasta-do-plugin> <pasta-edicoes>  |  node preparar.cjs --regras <pasta-do-plugin>");
    process.exit(2);
  }
  try {
    const { skills, avisos } = preparar(plugin, edicoes, { bash });
    console.log(`Skills para o ChatGPT: ${skills.join(", ")}`);
    for (const a of avisos) console.log(`ATENÇÃO: ${a}`);
  } catch (e) {
    console.error(`Não consegui preparar a pasta para o ChatGPT: ${e.message}`);
    process.exit(1);
  }
}
