"""Source / accent inference from audio URLs.

ultimate.json has no structured source or accent fields, so both are inferred
from the URL host and path. Kept in one module so the manifest builder and any
later stage agree on the rules (DRY).
"""

from __future__ import annotations

from urllib.parse import urlparse

import config


def host_of(url: str) -> str:
    return (urlparse(url).netloc or "").lower()


def source_of(url: str) -> str | None:
    """Return the human-readable source name for a URL, or None if unknown."""
    return config.HOST_TO_SOURCE.get(host_of(url))


def detect_accent(url: str, source: str) -> str:
    """Return 'us' or 'uk' for a URL.

    Path markers take precedence; otherwise fall back to the source's default
    accent (all marker-less sources are American). Defaults to 'us'.
    """
    u = url.lower()
    if "uk_pron" in u or "british" in u or "__gb_" in u or "/uk/" in u:
        return "uk"
    if "us_pron" in u or "american" in u or "__us_" in u or "/us/" in u:
        return "us"
    return config.SOURCE_DEFAULT_ACCENT.get(source, "us")


def priority_of(source: str, accent: str) -> int:
    """Lower is better, ranked per accent. Unknown sources sort last."""
    ranking = config.US_PRIORITY if accent == "us" else config.UK_PRIORITY
    try:
        return ranking.index(source)
    except ValueError:
        return len(ranking)
