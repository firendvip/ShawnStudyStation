"""Phase 10 - build the web word-pack JSON for the COCA 17k pack.

Combines the cleaned wordlist + ipa-dict (UK/US IPA) + ECDICT (single most-common
Chinese meaning + POS) into the pack format consumed by the web MVP. Audio is
resolved by convention at runtime: {audioBase}/{us|uk}/<en>.mp3.
"""

from __future__ import annotations

import json
import re
import sys

import config

DICT_DIR = config.PROJECT_ROOT / "dict"
EN_UK = DICT_DIR / "en_UK.txt"
EN_US = DICT_DIR / "en_US.txt"
ECDICT = DICT_DIR / "ecdict.csv"
OUT = config.PROJECT_ROOT / "webapp" / "packs" / "coca17k.json"

POS_MAP = {
    "n": "n", "pl": "n", "npl": "n", "v": "v", "vt": "v", "vi": "v", "vbl": "v",
    "aux": "aux", "adj": "adj", "a": "adj", "adv": "adv", "ad": "adv",
    "prep": "prep", "conj": "conj", "pron": "pron", "art": "art", "num": "num",
    "int": "int", "interj": "int", "abbr": "abbr",
}
POS_LINE_RE = re.compile(r"^\s*([a-zA-Z]+)\.\s*(.*)$")
ECDICT_LINE_SPLIT_RE = re.compile(r"\\n")
MEANING_SPLIT_RE = re.compile(r"[；;，,、]")


def load_ipa(path):
    table = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        if "\t" not in line:
            continue
        word, ipa = line.split("\t", 1)
        first = ipa.split(",")[0].strip().strip("/").strip("[]").strip()
        if first:
            table.setdefault(word.strip().lower(), first)
    return table


def parse_meaning_and_pos(translation):
    if not translation:
        return "", ""
    lines = [ln.strip() for ln in ECDICT_LINE_SPLIT_RE.split(translation) if ln.strip()]
    chosen, pos_tag = None, ""
    for ln in lines:
        m = POS_LINE_RE.match(ln)
        if m and m.group(1).lower() in POS_MAP:
            pos_tag = POS_MAP[m.group(1).lower()]
            chosen = m.group(2)
            break
    if chosen is None:
        chosen = re.sub(r"^\[[^\]]*\]\s*", "", lines[0])
    return MEANING_SPLIT_RE.split(chosen, 1)[0].strip(), pos_tag


def load_ecdict():
    import csv
    table = {}
    with ECDICT.open(encoding="utf-8") as fh:
        for row in csv.DictReader(fh):
            key = (row.get("word") or "").strip().lower()
            if key and key not in table:
                table[key] = {
                    "phonetic": (row.get("phonetic") or "").strip(),
                    "translation": (row.get("translation") or "").strip(),
                }
    return table


def main() -> int:
    for required in (EN_UK, EN_US, ECDICT, config.CLEAN_WORDLIST):
        if not required.exists():
            print(f"Missing {required} - run earlier phases first.", file=sys.stderr)
            return 1

    uk_ipa, us_ipa, ecdict = load_ipa(EN_UK), load_ipa(EN_US), load_ecdict()
    words = config.CLEAN_WORDLIST.read_text(encoding="utf-8").split()

    entries = []
    for word in words:
        key = word.lower()
        ec = ecdict.get(key, {})
        ec_phon = ec.get("phonetic", "")
        meaning, pos = parse_meaning_and_pos(ec.get("translation", ""))
        entries.append({
            "en": word,
            "zh": meaning,
            "pos": pos,
            "uk": uk_ipa.get(key) or ec_phon,
            "us": us_ipa.get(key) or ec_phon,
        })

    pack = {
        "id": "coca17k",
        "name": "COCA 高频 17000 词",
        "audioBase": "audio",
        "count": len(entries),
        "words": entries,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(pack, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"Phase 10: wrote {OUT} ({len(entries):,} words, "
          f"{OUT.stat().st_size/1e6:.1f} MB)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
