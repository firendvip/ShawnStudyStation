"""Phase 3 - analyse the real host distribution inside ultimate.json.

ultimate.json carries no source/accent fields, so we infer them from URL hosts.
This stage prints the real host frequency table (to confirm Cambridge / OneLook
hosts that the README did not spell out) and flags any unmapped hosts so the
HOST_TO_SOURCE table in config.py can be extended before building the manifest.
"""

from __future__ import annotations

import json
import sys
from collections import Counter
from urllib.parse import urlparse

import config


def host_of(url: str) -> str:
    return (urlparse(url).netloc or "").lower()


def main() -> int:
    if not config.ULTIMATE_JSON.exists():
        print("ultimate.json missing - run 01_fetch_inputs.py first.", file=sys.stderr)
        return 1

    data = json.loads(config.ULTIMATE_JSON.read_text(encoding="utf-8"))
    host_counter: Counter[str] = Counter()
    url_total = 0
    for urls in data.values():
        for url in urls:
            host_counter[host_of(url)] += 1
            url_total += 1

    print("Phase 3: source analysis")
    print(f"  words in index : {len(data):,}")
    print(f"  audio URLs     : {url_total:,}")
    print("  host distribution:")

    unmapped: list[str] = []
    for host, count in host_counter.most_common():
        source = config.HOST_TO_SOURCE.get(host, "UNMAPPED")
        if source == "UNMAPPED":
            unmapped.append(host)
        print(f"    {count:>8,}  {host:<40} -> {source}")

    if unmapped:
        print("\n  WARNING: unmapped hosts (extend HOST_TO_SOURCE in config.py):")
        for host in unmapped:
            print(f"    - {host}")

    stats = {
        "words": len(data),
        "urls": url_total,
        "hosts": dict(host_counter),
        "unmapped": unmapped,
    }
    config.SOURCE_STATS.write_text(json.dumps(stats, indent=2), encoding="utf-8")
    print(f"\n  wrote {config.SOURCE_STATS}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
