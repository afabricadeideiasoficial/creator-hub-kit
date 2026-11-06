// A leitura das trilhas do vídeo e o aviso de erro no corte. Dados inventados.
// Uso: node --test teste/*.test.cjs
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");

const FERRAMENTAS = path.join(__dirname, "../plugins/creator-hub/ferramentas");
const LER = path.join(FERRAMENTAS, "ler_trilha.cjs");
const PATH_BASE = `${path.dirname(process.execPath)}:/usr/bin:/bin`;
const pastaNova = () => fs.mkdtempSync(path.join(os.tmpdir(), "leitura-ffprobe-"));

function programaFalso(arquivo, corpo) {
  fs.mkdirSync(path.dirname(arquivo), { recursive: true });
  fs.writeFileSync(arquivo, `#!/bin/bash\n${corpo}\n`, { mode: 0o755 });
}

function lerComRespostaDoFfprobe(resposta, trilha, campo) {
  const bin = pastaNova();
  programaFalso(path.join(bin, "ffprobe"), `cat <<'FIM'\n${resposta}\nFIM`);
  return spawnSync(process.execPath, [LER, "video.mp4", trilha, campo], { encoding: "utf8", env: { PATH: `${bin}:${PATH_BASE}` } });
}

test("ler_trilha: vídeo com trilha de horário dá uma resposta só", () => {
  // É o que o ffprobe 9 devolve em JSON: a mesma trilha em stream_groups e em streams.
  const r = lerComRespostaDoFfprobe(JSON.stringify({ programs: [], stream_groups: [{ streams: [{ r_frame_rate: "30000/1001" }] }], streams: [{ r_frame_rate: "30000/1001" }] }), "v:0", "r_frame_rate");
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, "30000/1001\n");
});

test("ler_trilha: vídeo com marca de rotação sai sem vírgula", () => {
  const r = lerComRespostaDoFfprobe(JSON.stringify({ streams: [{ height: 2160, side_data_list: [{}] }] }), "v:0", "height");
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, "2160\n");
});

test("ler_trilha: trilha que não existe é erro com aviso, nunca resposta vazia", () => {
  const r = lerComRespostaDoFfprobe(JSON.stringify({ streams: [] }), "a:0", "channels");
  assert.equal(r.status, 1);
  assert.equal(r.stdout, "");
  assert.match(r.stderr, /Não consegui ler channels da trilha a:0 de video\.mp4/);
});

test("ler_trilha: sem ffprobe é erro com aviso", () => {
  const r = spawnSync(process.execPath, [LER, "video.mp4", "v:0", "height"], { encoding: "utf8", env: { PATH: pastaNova() } });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /Não consegui ler height/);
});

// Com o ffmpeg de verdade, para a regra continuar valendo quando a versão instalada mudar.
const PATH_REAL = `${path.join(os.homedir(), ".creator-hub/bin")}:${process.env.PATH}`;
const temFfmpeg = spawnSync("ffmpeg", ["-version"], { env: { PATH: PATH_REAL } }).status === 0;

test("ler_trilha: com o ffprobe de verdade, em arquivos com horário e rotação", { skip: !temFfmpeg }, () => {
  const pasta = pastaNova();
  const ffmpeg = (...args) => assert.equal(spawnSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args], { encoding: "utf8", env: { PATH: PATH_REAL } }).status, 0);
  const base = path.join(pasta, "base.mp4");
  ffmpeg("-f", "lavfi", "-i", "testsrc2=s=1080x1920:r=30", "-f", "lavfi", "-i", "sine=f=220:r=48000", "-t", "1", "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", "-c:a", "aac", "-ac", "2", base);
  const horario = path.join(pasta, "horario.mp4");
  const rotacao = path.join(pasta, "rotacao.mp4");
  ffmpeg("-i", base, "-c", "copy", "-timecode", "01:00:00:00", horario);
  ffmpeg("-display_rotation", "90", "-i", base, "-c", "copy", "-timecode", "01:00:00:00", rotacao);
  for (const arquivo of [horario, rotacao]) {
    const ler = (trilha, campo) => {
      const r = spawnSync(process.execPath, [LER, arquivo, trilha, campo], { encoding: "utf8", env: { PATH: PATH_REAL } });
      assert.equal(r.status, 0, r.stderr);
      return r.stdout;
    };
    assert.equal(ler("v:0", "r_frame_rate"), "30/1\n");
    assert.equal(ler("v:0", "height"), "1920\n");
    assert.equal(ler("a:0", "channels"), "2\n");
  }
});

// Com o kit instalado neste computador: o corte e o som de verdade, sem nada falso.
const PYTHON_DO_KIT = path.join(os.homedir(), ".creator-hub/video-use/.venv/bin/python");
const temKit = temFfmpeg && fs.existsSync(PYTHON_DO_KIT);

function videosDeVerdade() {
  const pasta = pastaNova();
  const ffmpeg = (...args) => {
    const r = spawnSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args], { encoding: "utf8", env: { PATH: PATH_REAL } });
    assert.equal(r.status, 0, r.stderr);
  };
  const v = (nome) => path.join(pasta, nome);
  ffmpeg("-f", "lavfi", "-i", "testsrc2=s=540x960:r=30", "-f", "lavfi", "-i", "sine=f=220:r=48000", "-t", "4", "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", "-c:a", "aac", "-ac", "2", v("normal.mp4"));
  ffmpeg("-f", "lavfi", "-i", "testsrc2=s=108x192:r=24", "-t", "4", "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", v("pequeno.mp4"));
  ffmpeg("-i", v("normal.mp4"), "-i", v("pequeno.mp4"), "-map", "0:v", "-map", "1:v", "-map", "0:a", "-c", "copy", v("duas-trilhas.mp4"));
  ffmpeg("-i", v("normal.mp4"), "-c", "copy", "-timecode", "01:00:00:00", v("horario.mp4"));
  ffmpeg("-i", v("normal.mp4"), "-an", "-c", "copy", v("sem-som.mp4"));
  return v;
}

const EDL_DE_TESTE = (bruto) => ({ version: 1, sources: { raw: bruto }, ranges: [{ source: "raw", start: 0.5, end: 1.5 }, { source: "raw", start: 2, end: 3 }], grade: "", overlays: [], subtitles: null });

test("montar_audio: funciona com 2 trilhas de vídeo e com trilha de horário", { skip: !temKit }, () => {
  const v = videosDeVerdade();
  for (const nome of ["duas-trilhas.mp4", "horario.mp4"]) {
    const pasta = pastaNova();
    const edl = path.join(pasta, "edl.json");
    const saida = path.join(pasta, "saida.mp4");
    fs.writeFileSync(edl, JSON.stringify(EDL_DE_TESTE(v("normal.mp4"))));
    const r = spawnSync(PYTHON_DO_KIT, [path.join(FERRAMENTAS, "audio/montar_audio.py"), edl, v(nome), "-o", saida], { encoding: "utf8", env: { ...process.env, PATH: PATH_REAL } });
    assert.equal(r.status, 0, `${nome}: ${r.stderr}`);
    assert.ok(fs.statSync(saida).size > 0, nome);
  }
});

function cortarDeVerdade(fonte) {
  const video = pastaNova();
  const corte = path.join(video, "1-corte");
  fs.mkdirSync(corte);
  fs.writeFileSync(path.join(corte, "fonte.txt"), fonte);
  fs.writeFileSync(path.join(corte, "edl.json"), JSON.stringify(EDL_DE_TESTE("x")));
  const r = spawnSync("/bin/bash", [path.join(FERRAMENTAS, "cortar.sh"), video], { encoding: "utf8", env: { ...process.env, PATH: PATH_REAL } });
  return { r, voz: path.join(corte, "edited_voz.mp4") };
}

test("cortar: vídeo com 2 trilhas e vídeo com horário chegam ao fim, com o som", { skip: !temKit }, () => {
  const v = videosDeVerdade();
  for (const nome of ["duas-trilhas.mp4", "horario.mp4"]) {
    const { r, voz } = cortarDeVerdade(v(nome));
    assert.equal(r.status, 0, `${nome}: ${r.stdout}${r.stderr}`);
    assert.match(r.stdout, /Corte pronto: .*edited_voz\.mp4 \(2\.\d+s\)\./, nome);
    const som = spawnSync(process.execPath, [LER, voz, "a:0", "codec_name"], { encoding: "utf8", env: { PATH: PATH_REAL } });
    assert.equal(som.stdout, "aac\n", nome);
  }
});

test("cortar: quando o som falha de verdade, sai com erro e sem dizer que ficou pronto", { skip: !temKit }, () => {
  // Vídeo sem som: a imagem corta, e a montagem do som falha.
  const { r, voz } = cortarDeVerdade(videosDeVerdade()("sem-som.mp4"));
  assert.notEqual(r.status, 0, r.stdout);
  assert.match(r.stdout, /O som do corte não deu certo/);
  assert.doesNotMatch(r.stdout, /Corte pronto/);
  assert.equal(fs.existsSync(voz), false);
});

test("nenhuma ferramenta lê trilha do vídeo em csv", () => {
  const ruins = [];
  const percorrer = (pasta) => {
    for (const item of fs.readdirSync(pasta, { withFileTypes: true })) {
      const caminho = path.join(pasta, item.name);
      if (item.isDirectory()) percorrer(caminho);
      else if (/\.(sh|py|cjs|mjs)$/.test(item.name)) {
        fs.readFileSync(caminho, "utf8").split("\n").forEach((linha, i) => {
          if (linha.includes("stream=") && !linha.includes("json")) ruins.push(`${path.relative(FERRAMENTAS, caminho)}:${i + 1}`);
        });
      }
    }
  };
  percorrer(FERRAMENTAS);
  assert.deepEqual(ruins, []);
});

function pastaDoCorte(comportamentoDoSom, duracao = "4.5") {
  const casa = pastaNova();
  const video = path.join(casa, "video");
  const corte = path.join(video, "1-corte");
  fs.mkdirSync(corte, { recursive: true });
  const bruto = path.join(casa, "bruto.mp4");
  fs.writeFileSync(bruto, "");
  fs.writeFileSync(path.join(corte, "fonte.txt"), bruto);
  fs.writeFileSync(path.join(corte, "edl.json"), JSON.stringify({ sources: { raw: "x" }, ranges: [{ source: "raw", start: 1, end: 3 }] }));
  // Sobra de um corte anterior: não pode ser confundida com o resultado deste.
  fs.writeFileSync(path.join(corte, "edited_voz.mp4"), "corte antigo");
  programaFalso(path.join(casa, ".creator-hub/video-use/.venv/bin/python"), `case "$1" in
  *render.py) : > edited.mp4 ;;
  *montar_audio.py) ${comportamentoDoSom} ;;
esac`);
  programaFalso(path.join(casa, ".creator-hub/bin/ffprobe"), `[ -f edited_voz.mp4 ] && [ -n "${duracao}" ] && echo "${duracao}"; exit 0`);
  const r = spawnSync("/bin/bash", [path.join(FERRAMENTAS, "cortar.sh"), video], { encoding: "utf8", env: { PATH: PATH_BASE, HOME: casa } });
  return { r, corte };
}

test("cortar: se o som falha, para, mostra o erro e não diz que ficou pronto", () => {
  const { r, corte } = pastaDoCorte(`echo "ValueError: too many values to unpack (expected 2)" >&2; exit 1`);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /too many values to unpack/);
  assert.match(r.stdout, /O som do corte não deu certo/);
  assert.doesNotMatch(r.stdout, /Corte pronto/);
  assert.equal(fs.existsSync(path.join(corte, "edited_voz.mp4")), false);
});

test("cortar: som que não gera vídeo legível também não passa por pronto", () => {
  const { r } = pastaDoCorte(`: > edited_voz.mp4`, "");
  assert.equal(r.status, 1);
  assert.match(r.stdout, /saiu com defeito/);
  assert.doesNotMatch(r.stdout, /Corte pronto/);
});

test("cortar: com o som certo, termina em pronto com a duração", () => {
  const { r } = pastaDoCorte(`echo novo > edited_voz.mp4; echo '{ "trechos": 1 }'`);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /Corte pronto: .*edited_voz\.mp4 \(4\.5s\)\./);
});
