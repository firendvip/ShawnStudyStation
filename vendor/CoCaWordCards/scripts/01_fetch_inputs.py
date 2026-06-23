"""Phase 1 - fetch the COCA wordlist and the thousandlemons audio index.

Downloads are validated by minimum size to avoid half-written files. Re-running
skips files that already look complete.
"""

from __future__ import annotations

import sys

import config
from netutil import make_session

# ultimate.json is ~39 MB; the wordlist is tiny. Use generous minimums.
MIN_WORDLIST_BYTES = 50_000
MIN_ULTIMATE_BYTES = 20_000_000


def _fetch(session, url: str, dest, min_bytes: int) -> None:
    if dest.exists() and dest.stat().st_size >= min_bytes:
        print(f"  [skip] {dest.name} already present ({dest.stat().st_size:,} bytes)")
        return
    print(f"  [get ] {url}")
    resp = session.get(url, timeout=config.REQUEST_TIMEOUT * 3)
    resp.raise_for_status()
    if len(resp.content) < min_bytes:
        raise RuntimeError(
            f"{dest.name}: downloaded only {len(resp.content):,} bytes "
            f"(expected >= {min_bytes:,}); aborting to avoid a partial file."
        )
    dest.write_bytes(resp.content)
    print(f"  [ok  ] wrote {dest.name} ({len(resp.content):,} bytes)")


def main() -> int:
    config.ensure_dirs()
    session = make_session()
    print("Phase 1: fetching inputs")
    _fetch(session, config.COCA_WORDLIST_URL, config.RAW_WORDLIST, MIN_WORDLIST_BYTES)
    _fetch(session, config.ULTIMATE_JSON_URL, config.ULTIMATE_JSON, MIN_ULTIMATE_BYTES)
    print("Done.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
