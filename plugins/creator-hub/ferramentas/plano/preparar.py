"""Prepara a narração de um vídeo animado: áudio tratado, transcrição por palavra e duração.

Uso: python preparar.py <pasta-plano> <narracao> [--transcricao arq.json] [--sem-tratar]

<narracao> é o áudio (ou vídeo) que a pessoa mandou. Gera, dentro da pasta:
- assets/narracao.m4a: tratamento leve (ruído sutil e volume em −15 LUFS, audio/tratar_voz.py);
  com --sem-tratar só converte (use quando a narração já veio tratada);
- transcript.json: palavras com tempo (transcrição local neste computador);
- video.json: "dur" = fim da narração mais um respiro (1,2 s depois da última palavra), com a cena final parada.
"""
import argparse, json, subprocess, sys, tempfile
from pathlib import Path

AQUI = Path(__file__).resolve().parent
VU = Path.home() / ".creator-hub" / "video-use"


def duracao(arq):
    return float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(arq)],
                                capture_output=True, text=True, check=True).stdout)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("projeto", type=Path)
    ap.add_argument("narracao", type=Path)
    ap.add_argument("--transcricao", type=Path)
    ap.add_argument("--sem-tratar", action="store_true")
    a = ap.parse_args()

    p = a.projeto.resolve()
    (p / "assets").mkdir(exist_ok=True)
    saida = p / "assets" / "narracao.m4a"
    if a.sem_tratar:
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(a.narracao), "-map", "0:a:0", "-c:a", "aac", "-b:a", "256k",
                        "-ar", "48000", "-ac", "2", str(saida)], check=True)
    else:
        r = subprocess.run([sys.executable, str(AQUI.parent / "audio/tratar_voz.py"), str(a.narracao), "-o", str(saida)],
                           capture_output=True, text=True, check=True).stdout
        print("áudio:", json.dumps(json.loads(r)["depois"], ensure_ascii=False))

    if a.transcricao:
        dados = json.loads(a.transcricao.read_text(encoding="utf-8"))
    else:
        with tempfile.TemporaryDirectory() as tmp:
            subprocess.run([sys.executable, str(VU / "helpers/transcribe_local.py"), str(saida),
                            "--language", "pt", "--edit-dir", tmp], check=True)
            dados = json.loads(next(Path(tmp, "transcripts").glob("*.json")).read_text(encoding="utf-8"))
    palavras = [w for w in dados["words"] if w.get("type") != "spacing" and w.get("text", "").strip()]
    (p / "transcript.json").write_text(json.dumps({"words": palavras}, ensure_ascii=False, indent=1), encoding="utf-8")

    cfg_path = p / "video.json"
    cfg = json.loads(cfg_path.read_text(encoding="utf-8")) if cfg_path.exists() else {}
    cfg["narracao"] = "assets/narracao.m4a"
    cfg["dur"] = round(max(duracao(saida), palavras[-1]["end"] + 1.2), 3)  # respiro no fim com a cena final parada
    cfg_path.write_text(json.dumps(cfg, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{len(palavras)} palavras · {cfg['dur']} s · texto: {' '.join(w['text'] for w in palavras)}")


if __name__ == "__main__":
    sys.exit(main())
