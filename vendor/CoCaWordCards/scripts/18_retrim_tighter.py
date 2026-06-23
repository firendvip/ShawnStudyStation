"""Phase 18 - re-trim every local mp3 at a tighter -40dB threshold (was -45dB) to
remove the low-level head/tail fade users perceive as a "long tail", then
re-normalise to -16dB so loudness stays consistent. Processed in place.

Per-file pipeline (one trim pass + one loudness pass):
  trim(-40dB, keep 30ms guard) -> measure mean -> volume+limiter -> overwrite.
"""

from __future__ import annotations

import re
import subprocess
import sys
import tempfile
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import config

THRESH = "-40dB"
TARGET_MEAN_DB = -16.0
TRIM = (f"silenceremove=start_periods=1:start_duration=0:start_silence=0.03"
        f":start_threshold={THRESH}:detection=peak,areverse,"
        f"silenceremove=start_periods=1:start_duration=0:start_silence=0.03"
        f":start_threshold={THRESH}:detection=peak,areverse")
_MEAN_RE = re.compile(r"mean_volume:\s*(-?\d+(?:\.\d+)?)\s*dB")
WORKERS = 10
MIN_BYTES = 400


def measure_mean(path: Path):
    out = subprocess.run(["ffmpeg", "-i", str(path), "-af", "volumedetect", "-f", "null", "-"],
                         capture_output=True, text=True).stderr
    m = _MEAN_RE.search(out)
    return float(m.group(1)) if m else None


def retrim(path: Path) -> str:
    trimmed = path.with_suffix(".rt.mp3")
    if subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(path), "-af", TRIM,
                       "-acodec", "libmp3lame", "-q:a", "4", str(trimmed)],
                      capture_output=True).returncode != 0 or not trimmed.exists():
        trimmed.unlink(missing_ok=True)
        return "trim-fail"
    if trimmed.stat().st_size < MIN_BYTES:   # whole clip below threshold -> keep original
        trimmed.unlink(missing_ok=True)
        return "too-quiet-skip"
    mean = measure_mean(trimmed)
    gain = 0.0 if mean is None else max(min(TARGET_MEAN_DB - mean, 20.0), -20.0)
    out = path.with_suffix(".rn.mp3")
    rc = subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(trimmed),
                         "-af", f"volume={gain:.2f}dB,alimiter=limit=0.9",
                         "-acodec", "libmp3lame", "-q:a", "4", str(out)],
                        capture_output=True).returncode
    trimmed.unlink(missing_ok=True)
    if rc != 0 or not out.exists() or out.stat().st_size < MIN_BYTES:
        out.unlink(missing_ok=True)
        return "norm-fail"
    out.replace(path)
    return "ok"


def main() -> int:
    files = sorted(config.AUDIO_US_DIR.glob("*.mp3")) + sorted(config.AUDIO_UK_DIR.glob("*.mp3"))
    print(f"Phase 18: re-trimming {len(files)} files at {THRESH}, {WORKERS} workers")
    counts = {}
    with ThreadPoolExecutor(max_workers=WORKERS) as pool:
        futs = {pool.submit(retrim, f): f for f in files}
        done = 0
        for fu in as_completed(futs):
            s = fu.result()
            counts[s] = counts.get(s, 0) + 1
            done += 1
            if done % 3000 == 0 or done == len(files):
                print(f"  {done}/{len(files)}  {counts}", flush=True)
    print(f"Done. {counts}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
