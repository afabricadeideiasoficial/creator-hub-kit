// Vários cortes de uma gravação longa: o que os scripts locais fazem. Dados inventados.
// Uso: node --test teste/*.test.cjs
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");

const FERRAMENTAS = path.join(__dirname, "../plugins/creator-hub/ferramentas");
const { resumir } = require(path.join(FERRAMENTAS, "cortes/resumir_gravacao.cjs"));
const { janelasDe, energiaDoCorte, palavrasDoCorte, noTempoDoCorte } = require(path.join(FERRAMENTAS, "cortes/abrir_cortes.cjs"));
const { noTempoDoBruto } = require(path.join(FERRAMENTAS, "cortes/no_tempo_do_bruto.cjs"));

test("resumir_gravacao: tira os espaços e guarda a energia em passos de 50 ms", () => {
  const { transcript, energia } = resumir(
    { words: [{ text: "Bloco", start: 0, end: 0.4, type: "word", logprob: 0.9, speaker_id: "s" }, { text: " ", start: 0.4, end: 0.5, type: "spacing" }, { text: "azul.", start: 0.5, end: 0.9, type: "word" }] },
    { hop: 0.01, db: [-100, -200, -300, -400, -500, -600, -600, -600, -600, -600, -700] },
  );
  assert.deepEqual(transcript.words, [{ text: "Bloco", start: 0, end: 0.4 }, { text: "azul.", start: 0.5, end: 0.9 }]);
  assert.equal(energia.hop, 0.05);
  assert.deepEqual(energia.db, [-300, -600, -700]);
});

test("janelas: folga de 2 s em volta, sem passar do começo nem do fim da gravação", () => {
  assert.deepEqual(janelasDe([[1, 10]], 11), [{ ini: 0, fim: 11, bruto_ini: 0 }]);
  assert.deepEqual(janelasDe([[100, 110]], 500), [{ ini: 0, fim: 14, bruto_ini: 98 }]);
});

test("janelas: o gancho de outro ponto vem primeiro, com 1 s de silêncio antes do trecho seguinte", () => {
  const janelas = janelasDe([[400, 404], [100, 110]], 500);
  assert.deepEqual(janelas, [{ ini: 0, fim: 8, bruto_ini: 398 }, { ini: 9, fim: 23, bruto_ini: 98 }]);
  assert.deepEqual(noTempoDoCorte([[400, 404], [100, 110]], janelas), [[2, 6], [11, 21]]);
});

test("energia do corte: copia só as janelas e deixa silêncio entre elas", () => {
  const db = Array.from({ length: 1000 }, (_, i) => -i);
  const corte = energiaDoCorte({ hop: 0.01, db }, [{ ini: 0, fim: 0.02, bruto_ini: 5 }, { ini: 0.03, fim: 0.05, bruto_ini: 1 }]);
  assert.deepEqual(corte.db, [-500, -501, -9000, -100, -101]);
});

test("palavras do corte: só as inteiras na janela, no tempo do corte e sem espaços", () => {
  const palavras = [
    { text: "fora", start: 97, end: 97.9, type: "word" },
    { text: "metade", start: 97.9, end: 98.1, type: "word" },
    { text: "dentro", start: 99, end: 99.5, type: "word" },
    { text: " ", start: 99.5, end: 99.6, type: "spacing" },
    { text: "gancho", start: 398.5, end: 399, type: "word" },
  ];
  const saida = palavrasDoCorte(palavras, [{ ini: 0, fim: 8, bruto_ini: 398 }, { ini: 9, fim: 23, bruto_ini: 98 }]);
  assert.deepEqual(saida.map((p) => [p.text, p.start, p.end]), [["gancho", 0.5, 1], ["dentro", 10, 10.5]]);
});

test("no tempo do bruto: cada trecho volta à gravação, na ordem do corte", () => {
  const janelas = [{ ini: 0, fim: 8, bruto_ini: 398 }, { ini: 9, fim: 23, bruto_ini: 98 }];
  assert.deepEqual(noTempoDoBruto([{ start: 2, end: 6, beat: "gancho" }, { start: 11, end: 21, beat: "corpo" }], janelas), [
    { start: 400, end: 404, beat: "gancho" },
    { start: 100, end: 110, beat: "corpo" },
  ]);
});

test("no tempo do bruto: trecho que atravessa o silêncio entre dois pedaços é recusado", () => {
  assert.throws(() => noTempoDoBruto([{ start: 7, end: 10 }], [{ ini: 0, fim: 8, bruto_ini: 398 }, { ini: 9, fim: 23, bruto_ini: 98 }]), /não cabe num pedaço só/);
});

function gravacaoDeTeste() {
  const g = fs.mkdtempSync(path.join(os.tmpdir(), "gravacao-"));
  const cliente = path.join(g, "cliente");
  fs.mkdirSync(path.join(g, "1-corte/transcripts"), { recursive: true });
  fs.mkdirSync(path.join(g, "momentos"));
  fs.mkdirSync(cliente);
  fs.writeFileSync(path.join(cliente, "marca.json"), JSON.stringify({ nome: "Marca Inventada" }));
  fs.writeFileSync(path.join(g, "1-corte/fonte.txt"), "/videos/bruto-longo.mp4\n");
  fs.writeFileSync(path.join(g, "1-corte/cor.txt"), "lut3d=/cor.cube\n");
  fs.writeFileSync(path.join(g, "1-corte/video.json"), JSON.stringify({ estilo: "padrao-da-marca" }));
  fs.writeFileSync(path.join(g, "1-corte/energia.json"), JSON.stringify({ hop: 0.01, db: Array(2000).fill(-1500) }));
  fs.writeFileSync(path.join(g, "1-corte/transcripts/bruto-longo.json"), JSON.stringify({ language_code: "pt", words: [{ text: "Bloco", start: 5, end: 5.5, type: "word" }, { text: " ", start: 5.5, end: 6, type: "spacing" }, { text: "azul.", start: 6, end: 6.5, type: "word" }] }));
  fs.writeFileSync(path.join(g, "momentos/cortes.json"), JSON.stringify({ duracao: 20, cortes: [{ numero: 1, titulo: "Bloco azul", pasta: "01-bloco-azul", trechos: [[5, 6.5]], dur: 1.5, motivo: "É azul" }, { numero: 2, titulo: "Outro", pasta: "02-outro", trechos: [[10, 12]], dur: 2, motivo: "x" }] }));
  return { g, cliente };
}

const abrir = (g, cliente, numeros) =>
  spawnSync("/bin/bash", [path.join(FERRAMENTAS, "cortes/abrir_cortes.sh"), g, cliente, numeros], { encoding: "utf8", env: { PATH: `${path.dirname(process.execPath)}:/usr/bin:/bin`, HOME: os.tmpdir() } });

test("abrir_cortes: a pasta do corte fica como a de um vídeo curto, com a cor e a marca", () => {
  const { g, cliente } = gravacaoDeTeste();
  const r = abrir(g, cliente, "1");
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const c = path.join(g, "cortes/01-bloco-azul/1-corte");
  const ler = (f) => JSON.parse(fs.readFileSync(path.join(c, f), "utf8"));
  assert.deepEqual(ler("janela.json").janelas, [{ ini: 0, fim: 5.5, bruto_ini: 3 }]);
  assert.equal(ler("energia.json").db.length, 550);
  assert.deepEqual(ler("transcript.json").words.map((p) => [p.text, p.start]), [["Bloco", 2], ["azul.", 3]]);
  const video = ler("video.json");
  assert.equal(video.estilo, "padrao-da-marca");
  assert.equal(video.dur, 5.5);
  assert.equal(video.id, "01-bloco-azul");
  assert.equal(video.marca.nome, "Marca Inventada");
  assert.equal(fs.readFileSync(path.join(c, "fonte.txt"), "utf8"), "/videos/bruto-longo.mp4\n");
  assert.equal(fs.readFileSync(path.join(c, "cor.txt"), "utf8"), "lut3d=/cor.cube\n");
  const projeto = fs.readFileSync(path.join(g, "cortes/01-bloco-azul/project.md"), "utf8");
  assert.match(projeto, /^## Estado atual$/m);
  assert.match(projeto, /2 a 3\.5 s/);
  assert.ok(!fs.existsSync(path.join(g, "cortes/02-outro")));
});

test("abrir_cortes: corte já aberto não é refeito, e número fora da lista é recusado", () => {
  const { g, cliente } = gravacaoDeTeste();
  assert.equal(abrir(g, cliente, "1").status, 0);
  const takes = path.join(g, "cortes/01-bloco-azul/1-corte/takes.json");
  fs.writeFileSync(takes, "[]");
  const r = abrir(g, cliente, "1, 2");
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /Corte 1 já estava aberto/);
  assert.match(r.stdout, /Corte 2 aberto/);
  assert.equal(fs.readFileSync(takes, "utf8"), "[]");
  const fora = abrir(g, cliente, "9");
  assert.equal(fora.status, 1);
  assert.match(fora.stdout, /Não há corte 9: a lista vai de 1 a 2/);
});

test("cortar.sh manda voltar ao tempo da gravação só quando há janela", () => {
  const cortar = fs.readFileSync(path.join(FERRAMENTAS, "cortar.sh"), "utf8");
  assert.match(cortar, /if \(fs\.existsSync\(janela\)\) edl\.ranges = require\(modulo\)\.noTempoDoBruto/);
});

test("a detecção do canal de voz não decodifica o vídeo da gravação", () => {
  assert.match(fs.readFileSync(path.join(FERRAMENTAS, "audio/montar_audio.py"), "utf8"), /"-t", "600", "-i", arq, "-vn"/);
});

test("como_transcreve: as três respostas têm aviso, e o processador diz que fica mais devagar", () => {
  const script = fs.readFileSync(path.join(FERRAMENTAS, "cortes/como_transcreve.sh"), "utf8");
  assert.match(script, /apple\) echo "Transcrição: chip Apple/);
  assert.match(script, /nvidia\) echo "Transcrição: placa NVIDIA/);
  assert.match(script, /cpu\) echo "Transcrição: processador.*mais devagar/);
});


const { coresDe, texto } = require(path.join(FERRAMENTAS, "cor_da_imagem.cjs"));
const pontos = (...grupos) => Buffer.from(grupos.flatMap(([rgba, n]) => Array(n).fill(rgba).flat()));

test("cor da imagem: ignora fundo transparente e neutros, e junta tons parecidos", () => {
  const { cores, neutra } = coresDe(pontos([[232, 105, 122, 255], 60], [[225, 100, 118, 255], 20], [[20, 80, 200, 255], 20], [[255, 255, 255, 255], 100], [[0, 0, 0, 0], 500]));
  assert.equal(cores.length, 2);
  assert.ok(Math.abs(cores[0].parte - 0.4) < 0.001);
  assert.ok(Math.abs(cores[1].parte - 0.1) < 0.001);
  assert.ok(Math.abs(neutra - 0.5) < 0.001);
  const saida = texto({ cores, neutra });
  assert.match(saida, /^#e6[0-9a-f]{4}  40%$/m);
  assert.match(saida, /"corMarcacao": "#e6[0-9a-f]{4}", "gradienteDestaque": "linear-gradient\(90deg, #[0-9a-f]{6}, #e6[0-9a-f]{4}\)"/);
});

test("cor da imagem: logo preto e branco manda perguntar à pessoa", () => {
  assert.match(texto(coresDe(pontos([[255, 255, 255, 255], 5], [[10, 10, 10, 255], 5]))), /só tem branco, preto ou cinza \(100%\)/);
});

test("instalador do Mac: procura o Claude na pasta do app e diz que o /mcp funciona no app", () => {
  const sh = fs.readFileSync(path.join(__dirname, "../instalador/instalar.sh"), "utf8");
  assert.match(sh, /Library\/Application Support\/Claude\/claude-code/);
  assert.match(sh, /digite \/mcp nessa sessão nova do app/);
  assert.doesNotMatch(sh, /este comando não rodou dentro do Claude/);
});

test("as skills mandam chamar a ferramenta de novo quando o pedido vence", () => {
  for (const arquivo of ["novo-video/SKILL.md", "cortes/SKILL.md", "plano-continuo/SKILL.md"]) {
    assert.match(fs.readFileSync(path.join(__dirname, "../plugins/creator-hub/skills", arquivo), "utf8"), /pedido não existe ou venceu/, arquivo);
  }
  assert.match(fs.readFileSync(path.join(FERRAMENTAS, "cortes/editar-um-corte.md"), "utf8"), /pedido não existe ou venceu/);
});

test("gravação que é atalho: o preparo usa o nome do arquivo de verdade, como a transcrição", () => {
  assert.match(fs.readFileSync(path.join(FERRAMENTAS, "preparar_corte.sh"), "utf8"), /if \[ -L "\$SRC" \]; then SRC="\$\(readlink -f/);
  assert.match(fs.readFileSync(path.join(FERRAMENTAS, "cortes/preparar_gravacao.sh"), "utf8"), /1-corte\/fonte\.txt/);
});

test("permissões da pasta inicial: só os comandos do kit, sem curl nem bash abertos", () => {
  const { allow } = JSON.parse(fs.readFileSync(path.join(__dirname, "../instalador/pasta-inicial/.claude/settings.json"), "utf8")).permissions;
  assert.ok(!allow.includes("Bash(curl -sS:*)"));
  assert.ok(!allow.includes("Bash(bash *creator-hub*ferramentas*)"));
  for (const regra of allow.filter((r) => r.startsWith("Bash(curl"))) assert.match(regra, /"https:\/\/kit\.creatorflowia\.com\//);
  for (const regra of allow.filter((r) => r.startsWith("Bash(bash"))) assert.match(regra, /^Bash\(bash "?(\/Users\/|\/c\/Users\/|C:)/);
  for (const ferramenta of ["achar_momentos", "conferir_momentos"]) assert.ok(allow.includes(`mcp__plugin_creator-hub_fabrica__${ferramenta}`));
});

test("o subagente recebe as instruções por um script, sem ler a pasta do plugin", () => {
  const skill = fs.readFileSync(path.join(__dirname, "../plugins/creator-hub/skills/cortes/SKILL.md"), "utf8");
  assert.match(skill, /ferramentas\/cortes\/instrucoes_do_corte\.sh/);
  assert.doesNotMatch(skill, /Leia `\$\{CLAUDE_PLUGIN_ROOT\}/);
  const r = spawnSync("/bin/bash", [path.join(FERRAMENTAS, "cortes/instrucoes_do_corte.sh")], { encoding: "utf8" });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /^# Editar um corte de uma gravação longa/);
  assert.doesNotMatch(r.stdout, /skills\/novo-video/);
});
