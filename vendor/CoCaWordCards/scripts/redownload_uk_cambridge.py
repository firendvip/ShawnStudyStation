#!/usr/bin/env python3
"""Re-download high-quality British (UK) pronunciation audio from Cambridge.

The app's current UK audio is mostly low quality (22050 Hz / low bitrate / Youdao
fallback — muffled and noisy). Cambridge Dictionary serves real-human UK audio at
48000 Hz. This script fetches the Cambridge word page, extracts the first
``/media/english/uk_pron/....mp3`` link (that word's British pronunciation), and
downloads it into a staging directory, validating quality with ffprobe.

Design highlights
-----------------
- Per-host throttle for ``dictionary.cambridge.org``: concurrency <= 2 and a
  minimum spacing of 0.25s between requests (Cambridge 429s under load).
- Short exponential-backoff retry on 429/5xx; permanent statuses (404 etc.) and
  "no uk_pron on page" are recorded as *not covered* and skipped (never blocking).
- Resumable: an existing file that already passes validation is skipped.
- Quality gate: file >= 800 bytes AND ffprobe reports an audio stream with
  sample_rate >= 44100; anything below is treated as failure and not kept.
- Ctrl-C safe: in-flight work drains and a partial report is still written.

Usage
-----
    python3 redownload_uk_cambridge.py \\
        --wordlist /path/to/all_words.json \\
        --out-dir  /path/to/CoCaWordCards/audio_uk_cam \\
        [--concurrency 2] [--interval 0.25] \\
        [--limit N] [--words "apple,banana,water"]

Only ``--limit`` OR ``--words`` restrict the run; with neither, the full list runs.
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urlparse

import requests

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
)
CAMBRIDGE_BASE = "https://dictionary.cambridge.org"
WORD_PAGE_URL = CAMBRIDGE_BASE + "/dictionary/english/{slug}"

# First UK pronunciation mp3 on a Cambridge page.
UK_PRON_RE = re.compile(r'(/media/english/uk_pron/[^\s"\'<>]+?\.mp3)')

MIN_VALID_BYTES = 800
MIN_SAMPLE_RATE = 44100

REQUEST_TIMEOUT = 20  # seconds
PERMANENT_FAIL_STATUSES = {400, 401, 403, 404, 410}
RETRYABLE_STATUSES = {429, 500, 502, 503, 504}
PER_REQUEST_RETRIES = 3  # total attempts on transient errors
RETRY_BACKOFF = 0.8  # base seconds, grows each retry

# Characters allowed in a Cambridge slug beyond letters/digits.
_SLUG_KEEP = set("-'")


# ---------------------------------------------------------------------------
# Per-host throttle: concurrency cap + minimum spacing between requests.
# ---------------------------------------------------------------------------
class HostThrottle:
    """Gate concurrency and request spacing for a single host."""

    def __init__(self, concurrency: int, interval: float) -> None:
        self._sem = threading.Semaphore(max(1, concurrency))
        self._interval = max(0.0, interval)
        self._lock = threading.Lock()
        self._last = 0.0

    def acquire(self) -> None:
        self._sem.acquire()
        if self._interval > 0:
            with self._lock:
                wait = self._last + self._interval - time.monotonic()
                if wait > 0:
                    time.sleep(wait)
                self._last = time.monotonic()

    def release(self) -> None:
        self._sem.release()


# ---------------------------------------------------------------------------
# Slug + filename helpers
# ---------------------------------------------------------------------------
def to_cambridge_slug(word: str) -> str:
    """Convert an English headword to a Cambridge URL slug.

    Lowercase, spaces -> ``-``, drop characters Cambridge slugs never use
    (keeps letters, digits, ``-`` and ``'``). E.g. "ice cream" -> "ice-cream".
    """
    lowered = word.strip().lower()
    out_chars: list[str] = []
    for ch in lowered:
        if ch.isalnum():
            out_chars.append(ch)
        elif ch in (" ", "_"):
            out_chars.append("-")
        elif ch in _SLUG_KEEP:
            out_chars.append(ch)
        # everything else (punctuation, symbols) is dropped
    slug = "".join(out_chars)
    slug = re.sub(r"-{2,}", "-", slug).strip("-")
    return slug


def safe_filename(word: str) -> str:
    """Match the app's rule: only path separators are replaced.

    Identical to ``config.safe_filename`` in the pipeline so on-disk names line up
    with what the web client requests.
    """
    return word.replace("/", "_").replace("\\", "_")


# ---------------------------------------------------------------------------
# Audio quality validation (ffprobe)
# ---------------------------------------------------------------------------
@dataclass(frozen=True)
class ProbeResult:
    """Outcome of probing a downloaded mp3."""

    ok: bool
    sample_rate: int
    bit_rate: int
    duration: float
    reason: str = ""


def probe_audio(path: Path) -> ProbeResult:
    """Validate an mp3 with ffprobe: must have an audio stream, sr >= 44100."""
    try:
        proc = subprocess.run(
            [
                "ffprobe",
                "-v",
                "error",
                "-select_streams",
                "a:0",
                "-show_entries",
                "stream=sample_rate,bit_rate,duration:format=bit_rate,duration",
                "-of",
                "json",
                str(path),
            ],
            capture_output=True,
            text=True,
            timeout=30,
        )
    except (OSError, subprocess.SubprocessError) as exc:
        return ProbeResult(False, 0, 0, 0.0, f"ffprobe-error:{type(exc).__name__}")

    if proc.returncode != 0:
        return ProbeResult(False, 0, 0, 0.0, "ffprobe-nonzero")

    try:
        data = json.loads(proc.stdout or "{}")
    except json.JSONDecodeError:
        return ProbeResult(False, 0, 0, 0.0, "ffprobe-badjson")

    streams = data.get("streams") or []
    if not streams:
        return ProbeResult(False, 0, 0, 0.0, "no-audio-stream")

    stream = streams[0]
    fmt = data.get("format") or {}

    def _to_int(value: object) -> int:
        try:
            return int(float(value))  # type: ignore[arg-type]
        except (TypeError, ValueError):
            return 0

    def _to_float(value: object) -> float:
        try:
            return float(value)  # type: ignore[arg-type]
        except (TypeError, ValueError):
            return 0.0

    sample_rate = _to_int(stream.get("sample_rate"))
    bit_rate = _to_int(stream.get("bit_rate")) or _to_int(fmt.get("bit_rate"))
    duration = _to_float(stream.get("duration")) or _to_float(fmt.get("duration"))

    if sample_rate < MIN_SAMPLE_RATE:
        return ProbeResult(
            False, sample_rate, bit_rate, duration, f"low-sr:{sample_rate}"
        )
    return ProbeResult(True, sample_rate, bit_rate, duration)


# ---------------------------------------------------------------------------
# HTTP fetch with retry/backoff
# ---------------------------------------------------------------------------
def make_session() -> requests.Session:
    session = requests.Session()
    session.headers.update({"User-Agent": USER_AGENT})
    return session


def _fetch(
    session: requests.Session,
    url: str,
    throttle: HostThrottle,
    *,
    binary: bool,
) -> tuple[bytes | str | None, str | None]:
    """GET ``url`` through the throttle with transient-retry.

    Returns ``(payload, None)`` on success or ``(None, reason)`` on failure.
    ``payload`` is ``bytes`` when ``binary`` else decoded text.
    """
    delay = RETRY_BACKOFF
    last = "unknown"
    for attempt in range(1, PER_REQUEST_RETRIES + 1):
        throttle.acquire()
        try:
            resp = session.get(url, timeout=REQUEST_TIMEOUT)
        except requests.RequestException as exc:
            last = type(exc).__name__
            resp = None
        finally:
            throttle.release()

        if resp is not None:
            if resp.status_code == 200:
                return (resp.content if binary else resp.text), None
            if resp.status_code in PERMANENT_FAIL_STATUSES:
                return None, f"http-{resp.status_code}"
            last = f"http-{resp.status_code}"
            if resp.status_code not in RETRYABLE_STATUSES:
                return None, last

        if attempt < PER_REQUEST_RETRIES:
            time.sleep(delay)
            delay *= 1.7
    return None, last


# ---------------------------------------------------------------------------
# Per-word pipeline
# ---------------------------------------------------------------------------
@dataclass(frozen=True)
class WordResult:
    """Outcome for a single word."""

    word: str
    status: str  # "found" | "notfound" | "lowquality" | "skip-existing"
    reason: str = ""
    sample_rate: int = 0
    bit_rate: int = 0
    duration: float = 0.0


def process_word(
    session: requests.Session,
    throttle: HostThrottle,
    word: str,
    out_dir: Path,
) -> WordResult:
    """Fetch + validate the Cambridge UK audio for one headword."""
    dest = out_dir / f"{safe_filename(word)}.mp3"

    # Resume: keep an already-validated file.
    if dest.exists() and dest.stat().st_size >= MIN_VALID_BYTES:
        probe = probe_audio(dest)
        if probe.ok:
            return WordResult(
                word,
                "skip-existing",
                sample_rate=probe.sample_rate,
                bit_rate=probe.bit_rate,
                duration=probe.duration,
            )

    slug = to_cambridge_slug(word)
    if not slug:
        return WordResult(word, "notfound", reason="empty-slug")

    page, reason = _fetch(
        session, WORD_PAGE_URL.format(slug=slug), throttle, binary=False
    )
    if page is None:
        return WordResult(word, "notfound", reason=reason or "page-fetch-failed")

    assert isinstance(page, str)
    match = UK_PRON_RE.search(page)
    if not match:
        return WordResult(word, "notfound", reason="no-uk-pron")

    audio_url = CAMBRIDGE_BASE + match.group(1)
    content, reason = _fetch(session, audio_url, throttle, binary=True)
    if content is None:
        return WordResult(word, "notfound", reason=reason or "audio-fetch-failed")

    assert isinstance(content, bytes)
    if len(content) < MIN_VALID_BYTES:
        return WordResult(word, "lowquality", reason="too-small")

    # Write, then probe; delete if it fails the quality gate.
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(content)
    probe = probe_audio(dest)
    if not probe.ok:
        try:
            dest.unlink()
        except OSError:
            pass
        return WordResult(word, "lowquality", reason=probe.reason)

    return WordResult(
        word,
        "found",
        sample_rate=probe.sample_rate,
        bit_rate=probe.bit_rate,
        duration=probe.duration,
    )


# ---------------------------------------------------------------------------
# Word list loading + selection
# ---------------------------------------------------------------------------
def load_words(path: Path) -> list[str]:
    """Read the wordlist JSON (array of objects with an ``en`` key)."""
    with path.open(encoding="utf-8") as fh:
        data = json.load(fh)
    words: list[str] = []
    seen: set[str] = set()
    for item in data:
        en = (item.get("en") if isinstance(item, dict) else None) or ""
        en = en.strip()
        if en and en not in seen:
            seen.add(en)
            words.append(en)
    return words


def select_words(
    all_words: list[str], limit: int | None, explicit: str | None
) -> list[str]:
    """Apply ``--words`` (exact/case-insensitive) or ``--limit`` sampling."""
    if explicit:
        wanted = [w.strip() for w in explicit.split(",") if w.strip()]
        by_lower = {w.lower(): w for w in all_words}
        resolved: list[str] = []
        for w in wanted:
            resolved.append(by_lower.get(w.lower(), w))
        return resolved
    if limit is not None:
        return all_words[: max(0, limit)]
    return all_words


# ---------------------------------------------------------------------------
# Report
# ---------------------------------------------------------------------------
def write_report(out_dir: Path, results: list[WordResult]) -> dict[str, object]:
    """Aggregate results into the ``_report.json`` schema and persist it."""
    found = [r for r in results if r.status in ("found", "skip-existing")]
    notfound = [r.word for r in results if r.status == "notfound"]
    lowquality = [r.word for r in results if r.status == "lowquality"]
    report = {
        "found": len(found),
        "notfound": notfound,
        "lowquality": lowquality,
        "total": len(results),
        "details": [
            {
                "word": r.word,
                "status": r.status,
                "reason": r.reason,
                "sample_rate": r.sample_rate,
                "bit_rate": r.bit_rate,
                "duration": round(r.duration, 3),
            }
            for r in results
        ],
    }
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "_report.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    return report


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------
def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--wordlist", required=True, type=Path, help="all_words.json")
    parser.add_argument(
        "--out-dir", required=True, type=Path, help="staging dir (audio_uk_cam)"
    )
    parser.add_argument("--concurrency", type=int, default=2)
    parser.add_argument("--interval", type=float, default=0.25)
    parser.add_argument("--limit", type=int, default=None, help="only first N words")
    parser.add_argument("--words", type=str, default=None, help="comma-separated words")
    return parser.parse_args(argv)


def run(argv: list[str] | None = None) -> int:
    args = parse_args(argv)

    if not args.wordlist.exists():
        print(f"[fatal] wordlist not found: {args.wordlist}", file=sys.stderr)
        return 2

    all_words = load_words(args.wordlist)
    words = select_words(all_words, args.limit, args.words)
    if not words:
        print("[fatal] no words selected", file=sys.stderr)
        return 2

    out_dir: Path = args.out_dir
    throttle = HostThrottle(args.concurrency, args.interval)
    session = make_session()
    results: list[WordResult] = []

    print(
        f"[start] {len(words)} words -> {out_dir} "
        f"(conc={args.concurrency}, interval={args.interval}s)",
        flush=True,
    )

    interrupted = False
    with ThreadPoolExecutor(max_workers=max(1, args.concurrency)) as pool:
        futures = {
            pool.submit(process_word, session, throttle, w, out_dir): w for w in words
        }
        try:
            for i, fut in enumerate(as_completed(futures), start=1):
                res = fut.result()
                results.append(res)
                extra = (
                    f" sr={res.sample_rate} br={res.bit_rate}"
                    if res.sample_rate
                    else f" ({res.reason})"
                )
                print(
                    f"[{i}/{len(words)}] {res.word}: {res.status}{extra}", flush=True
                )
        except KeyboardInterrupt:
            interrupted = True
            print("\n[interrupted] draining and writing partial report...", flush=True)
            for fut in futures:
                fut.cancel()

    report = write_report(out_dir, results)
    print(
        f"[done]{' (partial)' if interrupted else ''} "
        f"found={report['found']} notfound={len(report['notfound'])} "  # type: ignore[arg-type]
        f"lowquality={len(report['lowquality'])} total={report['total']}",  # type: ignore[arg-type]
        flush=True,
    )
    return 130 if interrupted else 0


if __name__ == "__main__":
    sys.exit(run())
