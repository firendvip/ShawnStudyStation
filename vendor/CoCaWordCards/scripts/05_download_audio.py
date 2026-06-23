"""Phase 5 - download US/UK mp3 files, with per-host throttling and source fallback.

For each (word, accent) the priority-ordered candidate list from the manifest is
tried until one source yields valid audio. Per-host throttles keep Cambridge (and
friends) from rate-limiting us. Resumable: existing valid files are skipped.

The winning source per (word, accent) is recorded to data/sources_used.json so the
final words.json can be labelled accurately.

Usage:
    python3 05_download_audio.py [--limit N] [--accent us|uk|both]
"""

from __future__ import annotations

import argparse
import json
import sys
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed

import config
from manifestio import load_manifest
from netutil import HostThrottle, download_candidates, make_session

_local = threading.local()
_throttle = HostThrottle()

# Winning sources, written at the end. Guarded because workers update it.
_sources: dict[str, dict[str, str]] = {}
_sources_lock = threading.Lock()


def _session():
    if not hasattr(_local, "session"):
        _local.session = make_session()
    return _local.session


def _dest_for(word: str, accent: str):
    folder = config.AUDIO_US_DIR if accent == "us" else config.AUDIO_UK_DIR
    return folder / f"{config.safe_filename(word)}.mp3"


def _task(word: str, accent: str, candidates: list[dict]):
    source, msg = download_candidates(_session(), candidates, _dest_for(word, accent), _throttle)
    if source is not None and msg == "downloaded":
        with _sources_lock:
            _sources.setdefault(word, {})[accent] = source
    return word, accent, msg


def build_jobs(manifest: dict, accents: list[str], limit: int | None):
    jobs = []
    for word, picks in manifest.items():
        for accent in accents:
            cands = picks.get(accent)
            if cands:
                jobs.append((word, accent, cands))
    if limit is not None:
        jobs = jobs[:limit]
    return jobs


def _merge_existing_sources() -> None:
    """Preserve source labels from a previous run (resume-friendly)."""
    if config.DATA_DIR.joinpath("sources_used.json").exists():
        prev = json.loads((config.DATA_DIR / "sources_used.json").read_text(encoding="utf-8"))
        _sources.update(prev)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--accent", choices=["us", "uk", "both"], default="both")
    args = parser.parse_args()

    manifest = load_manifest()
    if manifest is None:
        print("manifest.json missing - run 04_build_manifest.py first.", file=sys.stderr)
        return 1

    _merge_existing_sources()
    accents = ["us", "uk"] if args.accent == "both" else [args.accent]
    jobs = build_jobs(manifest, accents, args.limit)
    print(f"Phase 5: downloading {len(jobs):,} files ({args.accent}), "
          f"{config.MAX_WORKERS} workers, per-host throttled")

    done = skipped = failed = 0
    fail_reasons: dict[str, int] = {}
    with ThreadPoolExecutor(max_workers=config.MAX_WORKERS) as pool:
        futures = [pool.submit(_task, w, a, c) for (w, a, c) in jobs]
        for i, fut in enumerate(as_completed(futures), 1):
            _w, _a, msg = fut.result()
            if msg == "skip-existing":
                skipped += 1
            elif msg == "downloaded":
                done += 1
            else:
                failed += 1
                fail_reasons[msg] = fail_reasons.get(msg, 0) + 1
            if i % 1000 == 0 or i == len(jobs):
                print(f"  {i:,}/{len(jobs):,}  ok={done:,} skip={skipped:,} fail={failed:,}",
                      flush=True)

    (config.DATA_DIR / "sources_used.json").write_text(
        json.dumps(_sources, indent=1), encoding="utf-8"
    )
    print(f"Done. downloaded={done:,} skipped={skipped:,} failed={failed:,}")
    if fail_reasons:
        print("  failure reasons:", dict(sorted(fail_reasons.items(), key=lambda x: -x[1])))
    return 0


if __name__ == "__main__":
    sys.exit(main())
