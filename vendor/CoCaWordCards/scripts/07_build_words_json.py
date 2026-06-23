"""Phase 7 - build the final words.json consumed by the card app.

Walks the cleaned wordlist in COCA frequency order and emits one record per word
that has at least one local audio file. Audio paths are relative to the project
root so the dataset is portable. Source/accent come from the manifest where known
(Youdao-filled entries are labelled accordingly).
"""

from __future__ import annotations

import json
import sys

import json

import config

REL_US = "audio/us"
REL_UK = "audio/uk"


def load_sources_used() -> dict:
    path = config.DATA_DIR / "sources_used.json"
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    return {}


def _has_audio(folder, word: str) -> bool:
    path = folder / f"{config.safe_filename(word)}.mp3"
    return path.exists() and path.stat().st_size >= config.MIN_VALID_BYTES


def main() -> int:
    if not config.CLEAN_WORDLIST.exists():
        print("words_clean.txt missing - run earlier phases first.", file=sys.stderr)
        return 1

    words = config.CLEAN_WORDLIST.read_text(encoding="utf-8").split()
    sources_used = load_sources_used()

    records = []
    for word in words:
        has_us = _has_audio(config.AUDIO_US_DIR, word)
        has_uk = _has_audio(config.AUDIO_UK_DIR, word)
        if not (has_us or has_uk):
            continue

        used = sources_used.get(word, {})
        safe = config.safe_filename(word)
        rec = {"en": word}
        if has_us:
            rec["us"] = f"{REL_US}/{safe}.mp3"
            rec["us_source"] = used.get("us", "unknown")
        if has_uk:
            rec["uk"] = f"{REL_UK}/{safe}.mp3"
            rec["uk_source"] = used.get("uk", "unknown")
        records.append(rec)

    config.WORDS_JSON.write_text(json.dumps(records, ensure_ascii=False, indent=1), encoding="utf-8")

    print("Phase 7: build words.json")
    print(f"  total target words : {len(words):,}")
    print(f"  records emitted    : {len(records):,}")
    print(f"  wrote {config.WORDS_JSON}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
