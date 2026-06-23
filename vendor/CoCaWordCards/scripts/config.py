"""Shared configuration and paths for the COCA pronunciation pipeline.

All paths are derived from the project root so scripts can run from anywhere.
"""

from __future__ import annotations

from pathlib import Path

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
PROJECT_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = PROJECT_ROOT / "data"
AUDIO_DIR = PROJECT_ROOT / "audio"
AUDIO_US_DIR = AUDIO_DIR / "us"
AUDIO_UK_DIR = AUDIO_DIR / "uk"

# Data files
RAW_WORDLIST = DATA_DIR / "coca_20000_raw.txt"
CLEAN_WORDLIST = DATA_DIR / "words_clean.txt"
ULTIMATE_JSON = DATA_DIR / "ultimate.json"
SOURCE_STATS = DATA_DIR / "source_stats.json"
MANIFEST_JSON = DATA_DIR / "manifest.json"
MISSING_TXT = DATA_DIR / "missing.txt"
COVERAGE_REPORT = DATA_DIR / "coverage_report.txt"
WORDS_JSON = DATA_DIR / "words.json"

# ---------------------------------------------------------------------------
# Remote sources
# ---------------------------------------------------------------------------
COCA_WORDLIST_URL = (
    "https://raw.githubusercontent.com/mahavivo/english-wordlists/master/COCA_20000.txt"
)
ULTIMATE_JSON_URL = (
    "https://raw.githubusercontent.com/thousandlemons/"
    "English-words-pronunciation-mp3-audio-download/master/ultimate.json"
)

# Youdao fallback (gray-zone, personal study use only)
YOUDAO_VOICE_URL = "https://dict.youdao.com/dictvoice?type={accent}&audio={word}"
YOUDAO_TYPE_US = 0
YOUDAO_TYPE_UK = 1

# ---------------------------------------------------------------------------
# Source / host configuration
# ---------------------------------------------------------------------------
# Map known hosts -> human-readable source name.
# Confirmed against the real ultimate.json host distribution (Phase 3).
HOST_TO_SOURCE = {
    "dictionary.cambridge.org": "cambridge",
    "www.oxforddictionaries.com": "oxford",
    "www.onelook.com": "onelook",  # serves Macmillan human recordings
    "s3.amazonaws.com": "vocabulary.com",  # path: /audio.vocabulary.com/...
    "static.sfdict.com": "dictionary.com",
    "www.yourdictionary.com": "yourdictionary",
    "img2.tfd.com": "thefreedictionary",
    "img.tfd.com": "thefreedictionary",
}

# Per-accent source priority (lower index = tried first). All are human recordings
# except thefreedictionary (likely synthesised, kept last).
#
# Ordering balances QUALITY against RELIABILITY observed in Phase 5:
#   - vocabulary.com is AWS S3 (never rate-limits) -> top for US to offload the bulk.
#   - cambridge is excellent but rate-limits under load -> throttled, mid priority.
#   - oxford / onelook(Macmillan) are reliable human sources.
#   - dictionary.com returns 403 (hotlink-blocked) -> last, fails fast then falls through.
US_PRIORITY = [
    "vocabulary.com",
    "cambridge",
    "oxford",
    "onelook",
    "yourdictionary",
    "thefreedictionary",
    "dictionary.com",
]
UK_PRIORITY = [
    "oxford",
    "onelook",
    "cambridge",
    "thefreedictionary",
    "yourdictionary",
]

# Sources with no per-URL accent marker: assume this accent (all are US sites).
SOURCE_DEFAULT_ACCENT = {
    "dictionary.com": "us",
    "yourdictionary": "us",
    "vocabulary.com": "us",
}

# ---------------------------------------------------------------------------
# Download tuning
# ---------------------------------------------------------------------------
REQUEST_TIMEOUT = 12  # seconds
MAX_WORKERS = 24  # global thread pool; per-host throttles keep individual hosts safe
MIN_VALID_BYTES = 800  # files smaller than this are treated as invalid/empty
USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
)

# Per-host politeness. Cambridge rate-limits aggressively (429 under load), so it
# gets low concurrency and a minimum spacing between requests. Others are relaxed.
DEFAULT_HOST_CONCURRENCY = 8
DEFAULT_HOST_INTERVAL = 0.0  # seconds between requests to the same host
HOST_CONCURRENCY = {
    "dictionary.cambridge.org": 2,  # rate-limits aggressively; kept low (fallback only)
    "www.oxforddictionaries.com": 8,
    "www.onelook.com": 12,  # probed: handles 12 concurrent with no throttling
}
HOST_INTERVAL = {
    "dictionary.cambridge.org": 0.25,
}

# HTTP statuses not worth retrying (hard block / not found) -> fall through to the
# next candidate source immediately instead of burning retries.
PERMANENT_FAIL_STATUSES = {400, 401, 403, 404, 410}
# Statuses worth a short retry (transient) before falling through.
RETRYABLE_STATUSES = {429, 500, 502, 503, 504}
PER_CANDIDATE_RETRIES = 2  # quick retries on transient errors before next source
RETRY_BACKOFF = 0.8  # base seconds, grows each retry


def ensure_dirs() -> None:
    """Create all required directories (idempotent)."""
    for d in (DATA_DIR, AUDIO_US_DIR, AUDIO_UK_DIR):
        d.mkdir(parents=True, exist_ok=True)


def safe_filename(word: str) -> str:
    """Make a filesystem-safe audio basename (path separators -> underscore).

    Kept minimal: only '/' and '\\' break paths; everything else (apostrophes,
    hyphens, accents) is valid on macOS/most filesystems. The web client applies
    the identical rule so local paths match.
    """
    return word.replace("/", "_").replace("\\", "_")
