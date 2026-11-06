// Avisa, no começo da sessão, quando saiu uma versão nova do kit. Quem chama é o hooks/hooks.json.
// Só lê um arquivo público do kit, sem mandar nada sobre a pessoa. Sem internet, ou com qualquer erro,
// fica quieto: este aviso nunca pode atrapalhar a sessão.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const PUBLICADO =
  process.env.KIT_URL_VERSAO ||
  "https://raw.githubusercontent.com/afabricadeideiasoficial/creator-hub-kit/main/plugins/creator-hub/.claude-plugin/plugin.json";
const ESTADO = path.join(os.homedir(), ".creator-hub", "aviso-versao.json");
const HORA = 60 * 60 * 1000;
const CONFERIR_A_CADA = 6 * HORA;
const AVISAR_A_CADA = 24 * HORA;
const ESPERA_MAXIMA = 2000;

const AVISO = "Saiu uma melhoria do kit. Para receber, escreva: atualiza o kit.";
const PARA_O_CLAUDE = (instalada, publicada) =>
  `Saiu uma versão nova do kit do Creator Hub: este computador está na ${instalada}, e a publicada é a ${publicada}. ` +
  `Na primeira resposta desta sessão, diga em uma frase, sem termos técnicos: "Saiu uma melhoria do kit. Quer que eu atualize agora?" ` +
  `Espere a resposta antes de começar o pedido, porque depois de atualizar é preciso abrir uma sessão nova. ` +
  `Se a pessoa aceitar, siga a parte "Atualizar" da skill fabrica. Se ela não quiser, siga com o pedido e não volte ao assunto nesta sessão.`;

const versaoValida = (v) => typeof v === "string" && /^\d+\.\d+\.\d+$/.test(v);

function maisNova(publicada, instalada) {
  if (!versaoValida(publicada) || !versaoValida(instalada)) return false;
  const a = publicada.split(".").map(Number);
  const b = instalada.split(".").map(Number);
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i];
  return false;
}

function lerJson(arquivo) {
  try {
    return JSON.parse(fs.readFileSync(arquivo, "utf8"));
  } catch {
    return null;
  }
}

function gravarEstado(estado) {
  try {
    fs.mkdirSync(path.dirname(ESTADO), { recursive: true });
    fs.writeFileSync(ESTADO, JSON.stringify(estado));
  } catch {}
}

async function buscarPublicada() {
  try {
    const resposta = await fetch(PUBLICADO, { signal: AbortSignal.timeout(ESPERA_MAXIMA) });
    if (!resposta.ok) return null;
    const { version } = await resposta.json();
    return versaoValida(version) ? version : null;
  } catch {
    return null;
  }
}

async function principal() {
  const instalada = lerJson(path.join(__dirname, "../.claude-plugin/plugin.json"))?.version;
  const lido = lerJson(ESTADO);
  const estado = lido && typeof lido === "object" ? lido : {};
  const agora = Date.now();
  const recente = (quando, janela) => typeof quando === "number" && quando <= agora && agora - quando < janela;

  if (!recente(estado.conferido_em, CONFERIR_A_CADA)) {
    const publicada = await buscarPublicada();
    estado.conferido_em = agora;
    if (publicada) estado.publicada = publicada;
  }

  const avisar = maisNova(estado.publicada, instalada) && !recente(estado.avisado_em, AVISAR_A_CADA);
  if (avisar) estado.avisado_em = agora;
  gravarEstado(estado);
  if (!avisar) process.exit(0);

  const saida = {
    systemMessage: AVISO,
    hookSpecificOutput: {
      hookEventName: "SessionStart",
      additionalContext: PARA_O_CLAUDE(instalada, estado.publicada),
    },
  };
  // Sem acento cru na saída: o PowerShell do Windows reescreve o que passa por ele em outra codificação.
  const texto = JSON.stringify(saida).replace(/[\u0080-￿]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`);
  // Só sai depois de escrever: no Windows, a escrita pode não ter terminado quando a função volta.
  process.stdout.write(`${texto}\n`, () => process.exit(0));
}

principal().catch(() => process.exit(0));
