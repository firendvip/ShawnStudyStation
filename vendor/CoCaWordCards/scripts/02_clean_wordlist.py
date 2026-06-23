"""Phase 2 - clean the raw COCA wordlist.

Per the project rule, the ONLY thing removed is an ABSOLUTE duplicate: an entry
that is character-for-character identical to one already kept (case-sensitive).
Everything else is preserved, including:
  - case variants that mean different things (Polish/polish, Labour/labour, Scotch/scotch)
  - accented real words (sauté)
  - non-standard tokens (n't, and/or, his/her) -- kept as instructed

Empty lines are skipped (they are not words, not a deletion of one).
"""

from __future__ import annotations

import sys

import config


def clean(lines: list[str]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for raw in lines:
        word = raw.strip()
        if not word:
            continue
        if word in seen:  # absolute (exact, case-sensitive) duplicate only
            continue
        seen.add(word)
        out.append(word)
    return out


def main() -> int:
    if not config.RAW_WORDLIST.exists():
        print("Raw wordlist missing - run 01_fetch_inputs.py first.", file=sys.stderr)
        return 1

    lines = config.RAW_WORDLIST.read_text(encoding="utf-8").splitlines()
    cleaned = clean(lines)
    config.CLEAN_WORDLIST.write_text("\n".join(cleaned) + "\n", encoding="utf-8")

    print("Phase 2: clean wordlist")
    print(f"  raw lines      : {len(lines):,}")
    print(f"  cleaned unique : {len(cleaned):,}")
    print(f"  wrote          : {config.CLEAN_WORDLIST}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
