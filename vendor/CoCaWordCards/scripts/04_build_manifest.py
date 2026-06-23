"""Phase 4 - build the per-word download manifest.

For each cleaned COCA word we look up its candidate URLs in ultimate.json and pick
the best US and best UK candidate independently, ranked by source priority. Words
with no usable candidate are written to missing.txt for the gap-fill stage.

Matching is case-insensitive: ultimate.json keys are lowercase.
"""

from __future__ import annotations

import json
import sys

import config
from sources import detect_accent, priority_of, source_of  # noqa: F401 (used via candidates_per_accent)


def candidates_per_accent(urls: list[str]) -> dict[str, list[dict[str, str]]]:
    """Return {'us': [{url, source}, ...], 'uk': [...]} priority-ordered.

    All usable candidates are kept (not just the best) so the downloader can fall
    through to the next source when one is rate-limited or blocked.
    """
    buckets: dict[str, list[tuple[int, str, str]]] = {"us": [], "uk": []}
    for url in urls:
        source = source_of(url)
        if source is None:
            continue
        accent = detect_accent(url, source)
        buckets[accent].append((priority_of(source, accent), url, source))

    result: dict[str, list[dict[str, str]]] = {}
    for accent, items in buckets.items():
        if not items:
            continue
        items.sort(key=lambda t: t[0])
        result[accent] = [{"url": url, "source": source} for _, url, source in items]
    return result


def main() -> int:
    for required in (config.CLEAN_WORDLIST, config.ULTIMATE_JSON):
        if not required.exists():
            print(f"Missing {required.name} - run earlier phases first.", file=sys.stderr)
            return 1

    index = json.loads(config.ULTIMATE_JSON.read_text(encoding="utf-8"))
    words = config.CLEAN_WORDLIST.read_text(encoding="utf-8").split()

    manifest: dict[str, dict] = {}
    missing: list[str] = []
    us_count = uk_count = 0

    for word in words:
        urls = index.get(word.lower())
        if not urls:
            missing.append(word)
            continue
        picks = candidates_per_accent(urls)
        if not picks:
            missing.append(word)
            continue
        manifest[word] = picks
        if "us" in picks:
            us_count += 1
        if "uk" in picks:
            uk_count += 1

    config.MANIFEST_JSON.write_text(json.dumps(manifest, indent=1), encoding="utf-8")
    config.MISSING_TXT.write_text("\n".join(missing) + ("\n" if missing else ""), encoding="utf-8")

    total = len(words)
    print("Phase 4: build manifest")
    print(f"  words           : {total:,}")
    print(f"  matched         : {len(manifest):,}")
    print(f"  with US audio   : {us_count:,} ({us_count / total:.1%})")
    print(f"  with UK audio   : {uk_count:,} ({uk_count / total:.1%})")
    print(f"  unmatched       : {len(missing):,}")
    print(f"  wrote {config.MANIFEST_JSON.name} and {config.MISSING_TXT.name}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
