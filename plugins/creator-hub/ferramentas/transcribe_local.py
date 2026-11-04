"""Transcribe a video locally with Whisper large-v3-turbo (offline, free).

Engine: mlx-whisper on Apple Silicon; faster-whisper everywhere else (Windows,
Intel Macs), on an NVIDIA GPU when CUDA works and on the CPU otherwise.
TRANSCRIBE_ENGINE=mlx or TRANSCRIBE_ENGINE=faster-whisper forces one.

Drop-in replacement for transcribe.py: same CLI, and the JSON it writes has the
same shape as an ElevenLabs Scribe response (``words`` with ``type`` "word" /
"spacing", ``start``, ``end``, ``text``, ``speaker_id``), so the rest of the
helpers and the edit kit read it unchanged.

Whisper skips sentences and drifts on long files, so the audio is transcribed
in windows of about 30s. Each window ends at the quietest 10 ms frame near the
30s mark, so a word is never split between two windows.

Cached: if the output file already exists, nothing is transcribed.

Usage:
    python helpers/transcribe_local.py <video_path>
    python helpers/transcribe_local.py <video_path> --edit-dir /custom/edit
    python helpers/transcribe_local.py <video_path> --language pt
    python helpers/transcribe_local.py <video_path> --window 0      # whole file at once
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import tempfile
import time
import wave
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from transcribe import count_audio_tracks, extract_audio, peak_dbfs, transcript_path  # noqa: E402

MODEL = "mlx-community/whisper-large-v3-turbo"  # mlx-whisper
FW_MODEL = "large-v3-turbo"                     # faster-whisper: same model, CTranslate2 weights
SR = 16000


def engine() -> str:
    forced = os.environ.get("TRANSCRIBE_ENGINE")
    if forced:
        return forced
    try:
        import mlx_whisper  # noqa: F401
        return "mlx"
    except ImportError:
        return "faster-whisper"


_fw: dict = {}


def _faster_whisper(device: str | None = None):
    """The faster-whisper model, loaded once: CUDA float16 when there is an NVIDIA GPU, CPU int8 otherwise."""
    if device is None and "model" in _fw:
        return _fw["model"]
    import ctranslate2
    from faster_whisper import WhisperModel
    if os.name == "nt":
        # On Windows the CUDA libraries come from the nvidia-cublas-cu12 / nvidia-cudnn-cu12 wheels.
        import importlib.util
        spec = importlib.util.find_spec("nvidia")
        for root in (spec.submodule_search_locations or []) if spec else []:
            for b in Path(root).glob("*/bin"):
                os.add_dll_directory(str(b))
                os.environ["PATH"] = str(b) + os.pathsep + os.environ["PATH"]
    device = device or ("cuda" if ctranslate2.get_cuda_device_count() > 0 else "cpu")
    _fw["device"] = device
    _fw["model"] = WhisperModel(FW_MODEL, device=device, compute_type="float16" if device == "cuda" else "int8",
                                cpu_threads=max(4, (os.cpu_count() or 8) // 2))
    return _fw["model"]


def whisper(audio: np.ndarray, language: str | None, **kw) -> dict:
    """One Whisper pass over 16 kHz mono audio, in mlx-whisper's result shape:
    {"language", "segments": [{"text", "start", "end", "words": [{"word", "start", "end", "probability"}]}]}."""
    kw.setdefault("condition_on_previous_text", False)
    if engine() == "mlx":
        import mlx_whisper
        return mlx_whisper.transcribe(audio, path_or_hf_repo=MODEL, language=language, word_timestamps=True, **kw)
    try:
        segments, info = _faster_whisper().transcribe(audio, language=language, word_timestamps=True, **kw)
        segments = list(segments)  # decoding is lazy: a broken CUDA install only fails here
    except Exception as e:
        if _fw.get("device") != "cuda":
            raise
        print(f"  GPU failed ({e}); using the CPU", flush=True)
        segments, info = _faster_whisper("cpu").transcribe(audio, language=language, word_timestamps=True, **kw)
        segments = list(segments)
    return {"language": info.language, "segments": [
        {"text": s.text, "start": s.start, "end": s.end,
         "words": [{"word": w.word, "start": w.start, "end": w.end, "probability": w.probability} for w in s.words or []]}
        for s in segments]}


def load_wav(path: Path) -> np.ndarray:
    with wave.open(str(path), "rb") as w:
        return np.frombuffer(w.readframes(w.getnframes()), np.int16).astype(np.float32) / 32768


def window_bounds(audio: np.ndarray, window: float, search: float = 3.0) -> list[tuple[int, int]]:
    """Sample ranges of ~window seconds, each ending at the quietest 10 ms frame near the mark."""
    n = len(audio)
    if window <= 0 or n <= window * SR:
        return [(0, n)]
    hop = SR // 100
    bounds, start = [], 0
    while n - start > (window + search) * SR:
        lo = start + int((window - search) * SR)
        hi = start + int(window * SR)
        seg = audio[lo:hi]
        k = len(seg) // hop
        rms = np.sqrt((seg[: k * hop].reshape(k, hop) ** 2).mean(1))
        cut = lo + int(np.argmin(rms)) * hop
        bounds.append((start, cut))
        start = cut
    bounds.append((start, n))
    return bounds


def transcribe_audio(audio: np.ndarray, language: str | None, window: float, verbose: bool) -> dict:
    words: list[dict] = []
    detected = language
    bounds = window_bounds(audio, window)
    for i, (s, e) in enumerate(bounds):
        offset = s / SR
        if verbose and len(bounds) > 1:
            print(f"  window {i + 1}/{len(bounds)}: {offset:.1f}-{e / SR:.1f}s", flush=True)
        r = whisper(audio[s:e], language)
        detected = detected or r.get("language")
        for seg in r.get("segments", []):
            for w in seg.get("words", []):
                text = w["word"].strip()
                if not text:
                    continue
                words.append({
                    "text": text,
                    "start": round(float(w["start"]) + offset, 3),
                    "end": round(float(w["end"]) + offset, 3),
                    "type": "word",
                    "speaker_id": "speaker_0",
                    "logprob": round(float(w.get("probability", 1.0)), 4),
                })

    # Scribe interleaves a "spacing" entry between words; keep that shape.
    out: list[dict] = []
    for i, w in enumerate(words):
        if i:
            prev = out[-1]
            out.append({"text": " ", "start": prev["end"], "end": max(prev["end"], w["start"]),
                        "type": "spacing", "speaker_id": "speaker_0"})
        out.append(w)

    return {
        "language_code": detected,
        "language_probability": 1.0,
        "text": " ".join(w["text"] for w in words),
        "words": out,
        "model": MODEL if engine() == "mlx" else f"faster-whisper {FW_MODEL}",
    }


def transcribe_one(
    video: Path,
    edit_dir: Path,
    language: str | None = None,
    window: float = 30.0,
    verbose: bool = True,
    audio_track: int = 0,
) -> Path:
    """Transcribe a single video. Returns path to transcript JSON."""
    (edit_dir / "transcripts").mkdir(parents=True, exist_ok=True)
    out_path = transcript_path(edit_dir, video, audio_track)

    if out_path.exists():
        if verbose:
            print(f"cached: {out_path.name}")
        return out_path

    n_tracks = count_audio_tracks(video)
    if n_tracks > 1 and verbose:
        print(f"  note: {video.name} has {n_tracks} audio tracks, using track "
              f"{audio_track + 1} (--audio-track to change)", flush=True)

    t0 = time.time()
    with tempfile.TemporaryDirectory() as tmp:
        wav = Path(tmp) / f"{video.stem}.wav"
        if verbose:
            print(f"  extracting audio from {video.name}", flush=True)
        extract_audio(video, wav, audio_track)
        peak = peak_dbfs(wav)
        if peak < -60.0:
            raise RuntimeError(f"track {audio_track + 1} of {video.name} is silent (peak {peak:.1f} dBFS)")
        audio = load_wav(wav)

    payload = transcribe_audio(audio, language, window, verbose)
    out_path.write_text(json.dumps(payload, indent=2, ensure_ascii=False))

    if verbose:
        n = sum(1 for w in payload["words"] if w["type"] == "word")
        print(f"  saved: {out_path.name} in {time.time() - t0:.1f}s")
        print(f"    words: {n}")
    return out_path


def main() -> None:
    ap = argparse.ArgumentParser(description="Transcribe a video locally with Whisper (mlx-whisper or faster-whisper)")
    ap.add_argument("video", type=Path, help="Path to video file")
    ap.add_argument("--edit-dir", type=Path, default=None,
                    help="Edit output directory (default: <video_parent>/edit)")
    ap.add_argument("--language", type=str, default=None,
                    help="Optional ISO language code (e.g., 'pt'). Omit to auto-detect.")
    ap.add_argument("--window", type=float, default=30.0,
                    help="Window length in seconds (0 = whole file at once). Default 30.")
    ap.add_argument("--audio-track", type=int, default=0, help="Zero-based audio track to transcribe.")
    ap.add_argument("--num-speakers", type=int, default=None, help="Ignored (kept for CLI compatibility).")
    args = ap.parse_args()

    video = args.video.resolve()
    if not video.exists():
        sys.exit(f"video not found: {video}")
    edit_dir = (args.edit_dir or (video.parent / "edit")).resolve()

    transcribe_one(video, edit_dir, language=args.language, window=args.window,
                   audio_track=args.audio_track)


if __name__ == "__main__":
    main()
