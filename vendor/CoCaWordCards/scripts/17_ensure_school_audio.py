"""Phase 17 - guarantee every school-pack entry has BOTH a US and a UK local mp3,
so switching cards never lands on a silent word.

Priority per (word, accent), reusing existing local audio first:
  - local file exists           -> keep (the 17k real-human library always wins)
  - US: Merriam-Webster (real)  -> Youdao type=0 -> macOS `say` Samantha (TTS)
  - UK: Youdao type=1 (real-ish)-> macOS `say` Daniel (TTS)
Everything is trimmed + loudness-normalised to match the library.
"""

from __future__ import annotations

import json
import re
import subprocess
import sys
import tempfile
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import requests

import config

TARGET_MEAN_DB = -16.0
TRIM = ("silenceremove=start_periods=1:start_duration=0:start_silence=0.03"
        ":start_threshold=-45dB:detection=peak,areverse,"
        "silenceremove=start_periods=1:start_duration=0:start_silence=0.03"
        ":start_threshold=-45dB:detection=peak,areverse")
_MEAN_RE = re.compile(r"mean_volume:\s*(-?\d+(?:\.\d+)?)\s*dB")
UA = {"User-Agent": "Mozilla/5.0"}
VOICE = {"us": "Samantha", "uk": "Daniel"}
WORKERS = 8
PACKS = ["primary", "junior", "senior", "coca5000"]


def looks_like_audio(b: bytes) -> bool:
    if len(b) < 800:
        return False
    if b[:3] == b"ID3" or (b[0] == 0xFF and (b[1] & 0xE0) == 0xE0):
        return True
    if b[:4] in (b"RIFF", b"OggS"):
        return True
    return b[:1] not in (b"{", b"<")


def measure_mean(path: Path):
    out = subprocess.run(["ffmpeg", "-i", str(path), "-af", "volumedetect", "-f", "null", "-"],
                         capture_output=True, text=True).stderr
    m = _MEAN_RE.search(out)
    return float(m.group(1)) if m else None


def process_to_dest(raw: Path, dest: Path) -> bool:
    trimmed = raw.with_name(raw.stem + ".trim.mp3")
    if subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(raw), "-af", TRIM,
                       "-acodec", "libmp3lame", "-q:a", "4", str(trimmed)],
                      capture_output=True).returncode != 0 or not trimmed.exists():
        return False
    mean = measure_mean(trimmed)
    gain = 0.0 if mean is None else max(min(TARGET_MEAN_DB - mean, 20.0), -20.0)
    dest.parent.mkdir(parents=True, exist_ok=True)
    rc = subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(trimmed),
                         "-af", f"volume={gain:.2f}dB,alimiter=limit=0.9",
                         "-acodec", "libmp3lame", "-q:a", "4", str(dest)],
                        capture_output=True).returncode
    trimmed.unlink(missing_ok=True)
    return rc == 0 and dest.exists() and dest.stat().st_size > 800


def get_bytes(url: str):
    try:
        r = requests.get(url, headers=UA, timeout=15)
    except requests.RequestException:
        return None
    return r.content if r.status_code == 200 and looks_like_audio(r.content) else None


def acquire(word: str, accent: str, mw: dict, raw: Path) -> bool:
    # 1) real online: MW for US, then Youdao for the accent
    candidates = []
    if accent == "us" and word.lower() in mw:
        candidates.append(mw[word.lower()])
    t = 0 if accent == "us" else 1
    candidates.append(f"https://dict.youdao.com/dictvoice?type={t}&audio={requests.utils.quote(word)}")
    for url in candidates:
        b = get_bytes(url)
        if b:
            raw.write_bytes(b)
            return True
    # 2) TTS fallback (handles phrases; hyphens/underscores read as spaces)
    text = re.sub(r"[-/_]+", " ", word).strip() or word
    aiff = raw.with_suffix(".aiff")
    try:
        subprocess.run(["say", "-v", VOICE[accent], "-o", str(aiff), text],
                       capture_output=True, timeout=30, check=True)
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(aiff),
                        "-acodec", "libmp3lame", "-q:a", "4", str(raw)],
                       capture_output=True, timeout=30, check=True)
        return raw.exists() and raw.stat().st_size > 800
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired):
        return False
    finally:
        aiff.unlink(missing_ok=True)


def task(word, accent, mw, tmpdir):
    safe = config.safe_filename(word)
    folder = config.AUDIO_US_DIR if accent == "us" else config.AUDIO_UK_DIR
    dest = folder / f"{safe}.mp3"
    if dest.exists() and dest.stat().st_size >= 800:
        return "skip"
    raw = tmpdir / f"{abs(hash((word, accent)))}.bin"
    if not acquire(word, accent, mw, raw):
        return "acquire-fail"
    ok = process_to_dest(raw, dest)
    raw.unlink(missing_ok=True)
    return "ok" if ok else "process-fail"


def main() -> int:
    mw = json.loads((config.DATA_DIR / "ext" / "mw_map.json").read_text(encoding="utf-8"))
    seen, entries = set(), []
    for pid in PACKS:
        for w in json.loads((config.PROJECT_ROOT / "webapp/packs" / f"{pid}.json").read_text(encoding="utf-8"))["words"]:
            en = w["en"]
            if en.lower() not in seen:
                seen.add(en.lower())
                entries.append(en)
    jobs = [(en, acc) for en in entries for acc in ("us", "uk")]
    print(f"Phase 17: ensuring audio for {len(entries)} entries ({len(jobs)} files), {WORKERS} workers")

    counts = {}
    with tempfile.TemporaryDirectory() as tmp:
        tmpdir = Path(tmp)
        with ThreadPoolExecutor(max_workers=WORKERS) as pool:
            futs = [pool.submit(task, en, acc, mw, tmpdir) for en, acc in jobs]
            done = 0
            for f in as_completed(futs):
                s = f.result()
                counts[s] = counts.get(s, 0) + 1
                done += 1
                if done % 1000 == 0 or done == len(jobs):
                    print(f"  {done}/{len(jobs)}  {counts}", flush=True)
    print(f"Done. {counts}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
