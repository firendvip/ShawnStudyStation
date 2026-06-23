"""Shared HTTP helpers: session factory, per-host throttle, and a candidate-aware
download routine.

The downloader hits real dictionary sites, several of which rate-limit (Cambridge
429s under load) or hotlink-block (Dictionary.com 403). So fetching is:
  - throttled per host (concurrency cap + minimum spacing), and
  - fail-fast on permanent errors (403/404) so the caller falls through to the
    next candidate source instead of burning retries.
"""

from __future__ import annotations

import threading
import time
from pathlib import Path
from urllib.parse import urlparse

import requests

import config


def make_session() -> requests.Session:
    session = requests.Session()
    session.headers.update({"User-Agent": config.USER_AGENT})
    return session


# ---------------------------------------------------------------------------
# Per-host throttle: a semaphore (concurrency cap) + a min-interval gate.
# ---------------------------------------------------------------------------
class HostThrottle:
    def __init__(self) -> None:
        self._guard = threading.Lock()
        self._sems: dict[str, threading.Semaphore] = {}
        self._interval_locks: dict[str, threading.Lock] = {}
        self._last: dict[str, float] = {}

    def _for(self, host: str):
        with self._guard:
            if host not in self._sems:
                conc = config.HOST_CONCURRENCY.get(host, config.DEFAULT_HOST_CONCURRENCY)
                self._sems[host] = threading.Semaphore(conc)
                self._interval_locks[host] = threading.Lock()
                self._last[host] = 0.0
            return self._sems[host], self._interval_locks[host]

    def acquire(self, host: str) -> None:
        sem, ilock = self._for(host)
        sem.acquire()
        interval = config.HOST_INTERVAL.get(host, config.DEFAULT_HOST_INTERVAL)
        if interval > 0:
            with ilock:
                wait = self._last[host] + interval - time.monotonic()
                if wait > 0:
                    time.sleep(wait)
                self._last[host] = time.monotonic()

    def release(self, host: str) -> None:
        sem, _ = self._for(host)
        sem.release()


def _looks_like_audio(content: bytes) -> bool:
    if len(content) < config.MIN_VALID_BYTES:
        return False
    head = content[:4]
    if head[:3] == b"ID3":
        return True
    if head[0] == 0xFF and (head[1] & 0xE0) == 0xE0:
        return True
    if head[:4] in (b"OggS", b"RIFF"):
        return True
    lowered = content[:200].lstrip().lower()
    if lowered.startswith(b"<!doctype") or lowered.startswith(b"<html"):
        return False
    return True


def fetch_audio_bytes(session, url: str, throttle: HostThrottle):
    """Fetch one URL with throttling and short transient-retry.

    Returns ``(content_bytes, None)`` on success, or ``(None, reason)`` where reason
    is a short string. Permanent failures (403/404/not-audio) return immediately.
    """
    host = (urlparse(url).netloc or "").lower()
    delay = config.RETRY_BACKOFF
    last = "unknown"
    for attempt in range(1, config.PER_CANDIDATE_RETRIES + 1):
        throttle.acquire(host)
        try:
            resp = session.get(url, timeout=config.REQUEST_TIMEOUT)
        except requests.RequestException as exc:
            last = type(exc).__name__
            resp = None
        finally:
            throttle.release(host)

        if resp is not None:
            if resp.status_code == 200 and _looks_like_audio(resp.content):
                return resp.content, None
            if resp.status_code in config.PERMANENT_FAIL_STATUSES:
                return None, f"http-{resp.status_code}"
            if resp.status_code == 200:
                return None, "not-audio"  # bad body, no point retrying same URL
            last = f"http-{resp.status_code}"
            if resp.status_code not in config.RETRYABLE_STATUSES:
                return None, last
        if attempt < config.PER_CANDIDATE_RETRIES:
            time.sleep(delay)
            delay *= 1.7
    return None, last


def download_candidates(session, candidates: list[dict], dest: Path, throttle: HostThrottle):
    """Try each candidate (already priority-ordered) until one yields valid audio.

    Returns ``(source, "downloaded")`` on success, ``(source, "skip-existing")`` if
    the file is already present, or ``(None, last_reason)`` if all candidates fail.
    """
    if dest.exists() and dest.stat().st_size >= config.MIN_VALID_BYTES:
        return None, "skip-existing"

    last = "no-candidates"
    for cand in candidates:
        content, reason = fetch_audio_bytes(session, cand["url"], throttle)
        if content is not None:
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_bytes(content)
            return cand["source"], "downloaded"
        last = reason
    return None, last
