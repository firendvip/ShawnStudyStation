"""Phase 14 - ensure every word has a local US and UK mp3.

For each (word, accent) that has no valid local file:
  1. try Youdao (real human-ish online audio),
  2. else synthesize with macOS `say` (Samantha = US, Daniel = UK),
then trim silence and loudness-normalise so it matches the rest of the library.

Hyphens/underscores are read as spaces by the TTS; acronyms are read as-is.
Usage: python3 14_fill_missing_audio.py
"""

from __future__ import annotations

import json
import re
import subprocess
import sys
import tempfile
from pathlib import Path

import requests

import config

TARGET_MEAN_DB = -16.0
TRIM = ("silenceremove=start_periods=1:start_duration=0:start_silence=0.03"
        ":start_threshold=-45dB:detection=peak,areverse,"
        "silenceremove=start_periods=1:start_duration=0:start_silence=0.03"
        ":start_threshold=-45dB:detection=peak,areverse")
VOICE = {"us": "Samantha", "uk": "Daniel"}
_MEAN_RE = re.compile(r"mean_volume:\s*(-?\d+(?:\.\d+)?)\s*dB")
UA = {"User-Agent": "Mozilla/5.0"}


def looks_like_audio(b: bytes) -> bool:
    if len(b) < 800:
        return False
    if b[:3] == b"ID3":
        return True
    if b[0] == 0xFF and (b[1] & 0xE0) == 0xE0:
        return True
    head = b[:64].lstrip()
    return not (head[:1] in (b"{", b"<"))


def fetch_youdao(word: str, accent: str, dest_raw: Path) -> bool:
    t = 0 if accent == "us" else 1
    url = f"https://dict.youdao.com/dictvoice?type={t}&audio={requests.utils.quote(word)}"
    try:
        r = requests.get(url, headers=UA, timeout=15)
    except requests.RequestException:
        return False
    if r.status_code == 200 and looks_like_audio(r.content):
        dest_raw.write_bytes(r.content)
        return True
    return False


def tts(word: str, accent: str, dest_raw: Path) -> bool:
    text = re.sub(r"[-/_]+", " ", word).strip() or word
    aiff = dest_raw.with_suffix(".aiff")
    try:
        subprocess.run(["say", "-v", VOICE[accent], "-o", str(aiff), text],
                       capture_output=True, timeout=30, check=True)
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(aiff),
                        "-acodec", "libmp3lame", "-q:a", "4", str(dest_raw)],
                       capture_output=True, timeout=30, check=True)
        return dest_raw.exists() and dest_raw.stat().st_size > 800
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired):
        return False
    finally:
        aiff.unlink(missing_ok=True)


def measure_mean(path: Path):
    out = subprocess.run(["ffmpeg", "-i", str(path), "-af", "volumedetect", "-f", "null", "-"],
                         capture_output=True, text=True).stderr
    m = _MEAN_RE.search(out)
    return float(m.group(1)) if m else None


def process_to_dest(raw: Path, dest: Path) -> bool:
    """Trim silence then loudness-normalise raw -> dest."""
    trimmed = raw.with_name(raw.stem + ".trim.mp3")
    r = subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(raw),
                        "-af", TRIM, "-acodec", "libmp3lame", "-q:a", "4", str(trimmed)],
                       capture_output=True)
    if r.returncode != 0 or not trimmed.exists():
        return False
    mean = measure_mean(trimmed)
    gain = 0.0 if mean is None else max(min(TARGET_MEAN_DB - mean, 20.0), -20.0)
    dest.parent.mkdir(parents=True, exist_ok=True)
    r = subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(trimmed),
                        "-af", f"volume={gain:.2f}dB,alimiter=limit=0.9",
                        "-acodec", "libmp3lame", "-q:a", "4", str(dest)],
                       capture_output=True)
    trimmed.unlink(missing_ok=True)
    return r.returncode == 0 and dest.exists() and dest.stat().st_size > 800


def main() -> int:
    pack = json.loads((config.PROJECT_ROOT / "webapp/packs/coca17k.json").read_text(encoding="utf-8"))
    todo = []  # (word, accent)
    for w in pack["words"]:
        en = w["en"]
        safe = config.safe_filename(en)
        for accent in ("us", "uk"):
            folder = config.AUDIO_US_DIR if accent == "us" else config.AUDIO_UK_DIR
            f = folder / f"{safe}.mp3"
            if not (f.exists() and f.stat().st_size >= 800):
                todo.append((en, accent))

    print(f"Phase 14: {len(todo)} missing audio files to fill")
    stats = {"youdao": 0, "tts": 0, "failed": 0}
    with tempfile.TemporaryDirectory() as tmp:
        tmpdir = Path(tmp)
        for i, (en, accent) in enumerate(todo, 1):
            safe = config.safe_filename(en)
            folder = config.AUDIO_US_DIR if accent == "us" else config.AUDIO_UK_DIR
            dest = folder / f"{safe}.mp3"
            raw = tmpdir / f"{i}_{accent}.mp3"
            src = "youdao" if fetch_youdao(en, accent, raw) else ("tts" if tts(en, accent, raw) else None)
            if src and process_to_dest(raw, dest):
                stats[src] += 1
            else:
                stats["failed"] += 1
                print(f"  FAILED {accent}/{en}")
            if i % 25 == 0 or i == len(todo):
                print(f"  {i}/{len(todo)}  youdao={stats['youdao']} tts={stats['tts']} fail={stats['failed']}",
                      flush=True)

    print(f"Done. {stats}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
