"""Phase 16 - download Merriam-Webster real-human audio for school-pack words that
have no local file yet, then trim + loudness-normalise them into the shared
audio/us library (matching the rest of the collection). UK is MW-less, so those
words keep the runtime Youdao fallback.

Reads data/ext/mw_download.json ([{en, url}]). Local files are never overwritten
(local audio always wins per the project rule).
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
WORKERS = 10


def measure_mean(path: Path):
    out = subprocess.run(["ffmpeg", "-i", str(path), "-af", "volumedetect", "-f", "null", "-"],
                         capture_output=True, text=True).stderr
    m = _MEAN_RE.search(out)
    return float(m.group(1)) if m else None


def process_to_dest(raw: Path, dest: Path) -> bool:
    trimmed = raw.with_name(raw.stem + ".trim.mp3")
    r = subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(raw), "-af", TRIM,
                        "-acodec", "libmp3lame", "-q:a", "4", str(trimmed)], capture_output=True)
    if r.returncode != 0 or not trimmed.exists():
        return False
    mean = measure_mean(trimmed)
    gain = 0.0 if mean is None else max(min(TARGET_MEAN_DB - mean, 20.0), -20.0)
    dest.parent.mkdir(parents=True, exist_ok=True)
    r = subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(trimmed),
                        "-af", f"volume={gain:.2f}dB,alimiter=limit=0.9",
                        "-acodec", "libmp3lame", "-q:a", "4", str(dest)], capture_output=True)
    trimmed.unlink(missing_ok=True)
    return r.returncode == 0 and dest.exists() and dest.stat().st_size > 800


def fetch_one(item, tmpdir: Path):
    en, url = item["en"], item["url"]
    safe = config.safe_filename(en)
    dest = config.AUDIO_US_DIR / f"{safe}.mp3"
    if dest.exists() and dest.stat().st_size >= 800:
        return en, "skip-existing"
    try:
        r = requests.get(url, headers=UA, timeout=20)
    except requests.RequestException as e:
        return en, f"net-{type(e).__name__}"
    if r.status_code != 200 or len(r.content) < 800:
        return en, f"http-{r.status_code}"
    raw = tmpdir / f"{safe}.wav"
    raw.write_bytes(r.content)
    ok = process_to_dest(raw, dest)
    raw.unlink(missing_ok=True)
    return en, "ok" if ok else "process-fail"


def main() -> int:
    items = json.loads((config.DATA_DIR / "ext" / "mw_download.json").read_text(encoding="utf-8"))
    print(f"Phase 16: fetching {len(items)} Merriam-Webster audio files")
    ok = skip = fail = 0
    reasons = {}
    with tempfile.TemporaryDirectory() as tmp:
        tmpdir = Path(tmp)
        with ThreadPoolExecutor(max_workers=WORKERS) as pool:
            futs = [pool.submit(fetch_one, it, tmpdir) for it in items]
            for i, f in enumerate(as_completed(futs), 1):
                _en, status = f.result()
                if status == "ok":
                    ok += 1
                elif status.startswith("skip"):
                    skip += 1
                else:
                    fail += 1
                    reasons[status] = reasons.get(status, 0) + 1
                if i % 100 == 0 or i == len(items):
                    print(f"  {i}/{len(items)}  ok={ok} skip={skip} fail={fail}", flush=True)
    print(f"Done. ok={ok} skip={skip} fail={fail}  reasons={reasons}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
