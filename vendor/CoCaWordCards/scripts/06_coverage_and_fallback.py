"""Phase 6 - coverage report and Youdao gap-fill.

Scans the audio folders against the full cleaned wordlist, reports US/UK coverage,
then (optionally) fills any gaps via the Youdao dictvoice endpoint.

NOTE: the Youdao endpoint is an unofficial, unauthenticated, TTS-leaning interface.
It is used here for PERSONAL STUDY gap-filling only and must not be redistributed.

Usage:
    python3 06_coverage_and_fallback.py            # report + run Youdao gap-fill
    python3 06_coverage_and_fallback.py --report   # report only, no downloads
"""

from __future__ import annotations

import argparse
import json
import sys
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from urllib.parse import quote

import config
from netutil import HostThrottle, fetch_audio_bytes, make_session

_local = threading.local()
_throttle = HostThrottle()
_sources_lock = threading.Lock()


def _session():
    if not hasattr(_local, "session"):
        _local.session = make_session()
    return _local.session


def _record_source(word: str, accent: str) -> None:
    """Append a 'youdao' label into sources_used.json (resume-safe)."""
    path = config.DATA_DIR / "sources_used.json"
    with _sources_lock:
        data = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}
        data.setdefault(word, {})[accent] = "youdao"
        path.write_text(json.dumps(data, indent=1), encoding="utf-8")


def _has_audio(folder, word: str) -> bool:
    path = folder / f"{config.safe_filename(word)}.mp3"
    return path.exists() and path.stat().st_size >= config.MIN_VALID_BYTES


def compute_coverage(words: list[str]):
    have_us = [w for w in words if _has_audio(config.AUDIO_US_DIR, w)]
    have_uk = [w for w in words if _has_audio(config.AUDIO_UK_DIR, w)]
    miss_us = [w for w in words if not _has_audio(config.AUDIO_US_DIR, w)]
    miss_uk = [w for w in words if not _has_audio(config.AUDIO_UK_DIR, w)]
    return have_us, have_uk, miss_us, miss_uk


def youdao_url(word: str, accent: str) -> str:
    type_ = config.YOUDAO_TYPE_US if accent == "us" else config.YOUDAO_TYPE_UK
    return config.YOUDAO_VOICE_URL.format(accent=type_, word=quote(word))


def _fill_task(word: str, accent: str):
    folder = config.AUDIO_US_DIR if accent == "us" else config.AUDIO_UK_DIR
    dest = folder / f"{config.safe_filename(word)}.mp3"
    content, reason = fetch_audio_bytes(_session(), youdao_url(word, accent), _throttle)
    if content is None:
        return word, accent, False, reason
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(content)
    _record_source(word, accent)
    return word, accent, True, "downloaded"


def gap_fill(miss_us: list[str], miss_uk: list[str]) -> int:
    jobs = [(w, "us") for w in miss_us] + [(w, "uk") for w in miss_uk]
    if not jobs:
        print("  no gaps to fill.")
        return 0
    print(f"  Youdao gap-fill: {len(jobs):,} files")
    filled = failed = 0
    # Be gentle with an unofficial endpoint: fewer workers.
    with ThreadPoolExecutor(max_workers=6) as pool:
        futures = [pool.submit(_fill_task, w, a) for (w, a) in jobs]
        for fut in as_completed(futures):
            _w, _a, ok, _msg = fut.result()
            if ok:
                filled += 1
            else:
                failed += 1
    print(f"  filled={filled:,} failed={failed:,}")
    return filled


def write_report(words, have_us, have_uk, miss_us, miss_uk, filled: int | None):
    total = len(words)
    lines = [
        "COCA pronunciation coverage report",
        "=" * 40,
        f"target words      : {total:,}",
        f"US audio present  : {len(have_us):,} ({len(have_us)/total:.1%})",
        f"UK audio present  : {len(have_uk):,} ({len(have_uk)/total:.1%})",
        f"missing US        : {len(miss_us):,}",
        f"missing UK        : {len(miss_uk):,}",
    ]
    if filled is not None:
        lines.append(f"Youdao filled     : {filled:,}")
    report = "\n".join(lines) + "\n"
    config.COVERAGE_REPORT.write_text(report, encoding="utf-8")
    print(report)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--report", action="store_true", help="report only, skip Youdao fill")
    args = parser.parse_args()

    if not config.CLEAN_WORDLIST.exists():
        print("words_clean.txt missing - run 02_clean_wordlist.py first.", file=sys.stderr)
        return 1

    words = config.CLEAN_WORDLIST.read_text(encoding="utf-8").split()

    print("Phase 6: coverage (before)")
    have_us, have_uk, miss_us, miss_uk = compute_coverage(words)
    write_report(words, have_us, have_uk, miss_us, miss_uk, filled=None)

    filled = None
    if not args.report:
        filled = gap_fill(miss_us, miss_uk)
        print("Phase 6: coverage (after gap-fill)")
        have_us, have_uk, miss_us, miss_uk = compute_coverage(words)
        write_report(words, have_us, have_uk, miss_us, miss_uk, filled=filled)

    return 0


if __name__ == "__main__":
    sys.exit(main())
