"""Phase 9 - trim leading/trailing silence from every downloaded mp3.

Keeps only the spoken middle: head and tail silence (and very faint sub-threshold
audio) are removed via ffmpeg's two-pass silenceremove (forward + areverse).

Safe by design:
  - writes each result to a temp file and only replaces the original if ffmpeg
    succeeded AND the output is a non-trivial audio file (guards against a file
    that is entirely below threshold collapsing to empty);
  - idempotent: re-running on already-trimmed files is a near no-op.

A full backup of audio/ should be taken before running (see the runner command).

Usage:
    python3 09_trim_silence.py [--limit N]
"""

from __future__ import annotations

import argparse
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed

import config

# Two-pass: trim leading silence, reverse, trim leading (=original trailing), reverse
# back. The peak threshold (configurable via --threshold) removes silence and very
# faint edges; higher (closer to 0, e.g. -45dB) trims more aggressively. start_silence
# keeps ~30ms so the word onset/offset isn't cut hard.
DEFAULT_THRESHOLD_DB = -50


def build_filter(threshold_db: int) -> str:
    one = (f"silenceremove=start_periods=1:start_duration=0:start_silence=0.03"
           f":start_threshold={threshold_db}dB:detection=peak")
    return f"{one},areverse,{one},areverse"


MIN_OUTPUT_BYTES = 500  # smaller => treat as failed trim, keep original
FFMPEG_WORKERS = 10


def trim_one(path, trim_filter: str) -> tuple[str, str]:
    """Trim one file in place via a temp file. Returns (path, status)."""
    tmp = path.with_suffix(".trim.tmp.mp3")
    cmd = [
        "ffmpeg", "-y", "-loglevel", "error", "-i", str(path),
        "-af", trim_filter, "-acodec", "libmp3lame", "-q:a", "4",
        str(tmp),
    ]
    try:
        proc = subprocess.run(cmd, capture_output=True, timeout=60)
    except subprocess.TimeoutExpired:
        tmp.unlink(missing_ok=True)
        return str(path), "timeout"

    if proc.returncode != 0:
        tmp.unlink(missing_ok=True)
        return str(path), "ffmpeg-error"
    if not tmp.exists() or tmp.stat().st_size < MIN_OUTPUT_BYTES:
        tmp.unlink(missing_ok=True)
        return str(path), "empty-output"

    tmp.replace(path)  # atomic in-place swap
    return str(path), "ok"


def gather_files(limit):
    files = sorted(config.AUDIO_US_DIR.glob("*.mp3")) + sorted(config.AUDIO_UK_DIR.glob("*.mp3"))
    return files[:limit] if limit else files


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--threshold", type=int, default=DEFAULT_THRESHOLD_DB,
                        help="silence peak threshold in dB (e.g. -45 trims more)")
    args = parser.parse_args()

    files = gather_files(args.limit)
    total = len(files)
    if total == 0:
        print("No mp3 files found.", file=sys.stderr)
        return 1

    trim_filter = build_filter(args.threshold)
    size_before = sum(f.stat().st_size for f in files)
    print(f"Phase 9: trimming silence from {total:,} files at {args.threshold}dB, "
          f"{FFMPEG_WORKERS} workers")

    ok = failed = 0
    reasons: dict[str, int] = {}
    with ThreadPoolExecutor(max_workers=FFMPEG_WORKERS) as pool:
        futures = [pool.submit(trim_one, f, trim_filter) for f in files]
        for i, fut in enumerate(as_completed(futures), 1):
            _p, status = fut.result()
            if status == "ok":
                ok += 1
            else:
                failed += 1
                reasons[status] = reasons.get(status, 0) + 1
            if i % 1000 == 0 or i == total:
                print(f"  {i:,}/{total:,}  ok={ok:,} failed={failed:,}", flush=True)

    size_after = sum(f.stat().st_size for f in gather_files(args.limit))
    print(f"Done. trimmed={ok:,} kept-original={failed:,}")
    if reasons:
        print("  skip reasons:", reasons)
    print(f"  size: {size_before/1e6:.1f} MB -> {size_after/1e6:.1f} MB "
          f"({(1 - size_after/size_before):.0%} smaller)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
