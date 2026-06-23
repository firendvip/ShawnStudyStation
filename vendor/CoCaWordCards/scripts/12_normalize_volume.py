"""Phase 12 - loudness-align every mp3 so all words sound equally loud.

The trimmed clips vary ~10 dB in perceived loudness (some words noticeably louder
than others). Peak normalisation does not help (peaks already sit near 0 dBFS), so
we align the RMS / mean loudness instead:

  1. measure each file's mean_volume (ffmpeg volumedetect),
  2. apply the gain needed to reach TARGET_MEAN_DB,
  3. pass through a limiter so boosted clips never clip.

This is more reliable than EBU-R128 loudnorm on sub-second single-word clips.
Files that can't be measured or are essentially silent are left untouched.

Usage: python3 12_normalize_volume.py [--limit N]
"""

from __future__ import annotations

import argparse
import re
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed

import config

TARGET_MEAN_DB = -16.0
LIMITER = "alimiter=limit=0.9"   # ~ -0.9 dBFS ceiling, catches boosted peaks
MAX_GAIN_DB = 20.0               # never amplify a near-silent file more than this
SILENCE_FLOOR_DB = -45.0         # mean below this => broken/silent, skip
MIN_OUTPUT_BYTES = 400
WORKERS = 10

_MEAN_RE = re.compile(r"mean_volume:\s*(-?\d+(?:\.\d+)?)\s*dB")


def measure_mean(path) -> float | None:
    proc = subprocess.run(
        ["ffmpeg", "-i", str(path), "-af", "volumedetect", "-f", "null", "-"],
        capture_output=True, text=True,
    )
    m = _MEAN_RE.search(proc.stderr)
    return float(m.group(1)) if m else None


def normalize_one(path) -> tuple[str, str]:
    mean = measure_mean(path)
    if mean is None or mean < SILENCE_FLOOR_DB:
        return str(path), "skip-unmeasurable"
    gain = TARGET_MEAN_DB - mean
    if gain > MAX_GAIN_DB:
        gain = MAX_GAIN_DB
    tmp = path.with_suffix(".norm.tmp.mp3")
    cmd = [
        "ffmpeg", "-y", "-loglevel", "error", "-i", str(path),
        "-af", f"volume={gain:.2f}dB,{LIMITER}",
        "-acodec", "libmp3lame", "-q:a", "4", str(tmp),
    ]
    try:
        proc = subprocess.run(cmd, capture_output=True, timeout=60)
    except subprocess.TimeoutExpired:
        tmp.unlink(missing_ok=True)
        return str(path), "timeout"
    if proc.returncode != 0 or not tmp.exists() or tmp.stat().st_size < MIN_OUTPUT_BYTES:
        tmp.unlink(missing_ok=True)
        return str(path), "ffmpeg-error"
    tmp.replace(path)
    return str(path), "ok"


def gather(limit):
    files = sorted(config.AUDIO_US_DIR.glob("*.mp3")) + sorted(config.AUDIO_UK_DIR.glob("*.mp3"))
    return files[:limit] if limit else files


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=None)
    args = parser.parse_args()

    files = gather(args.limit)
    total = len(files)
    if total == 0:
        print("No mp3 files found.", file=sys.stderr)
        return 1
    print(f"Phase 12: loudness-aligning {total:,} files to {TARGET_MEAN_DB} dB, {WORKERS} workers")

    ok = skipped = failed = 0
    reasons: dict[str, int] = {}
    with ThreadPoolExecutor(max_workers=WORKERS) as pool:
        futures = [pool.submit(normalize_one, f) for f in files]
        for i, fut in enumerate(as_completed(futures), 1):
            _p, status = fut.result()
            if status == "ok":
                ok += 1
            elif status.startswith("skip"):
                skipped += 1
                reasons[status] = reasons.get(status, 0) + 1
            else:
                failed += 1
                reasons[status] = reasons.get(status, 0) + 1
            if i % 2000 == 0 or i == total:
                print(f"  {i:,}/{total:,}  ok={ok:,} skip={skipped:,} fail={failed:,}", flush=True)

    print(f"Done. normalized={ok:,} skipped={skipped:,} failed={failed:,}")
    if reasons:
        print("  reasons:", reasons)
    return 0


if __name__ == "__main__":
    sys.exit(main())
