"""Phase 8 - assemble the final 6-column Excel deliverable.

Columns (in order):
    英文单词 | 英式音标 | 美式音标 | 中文释义 | 词性 | 音频链接地址

Data sources:
    - UK / US IPA : open-dict-data/ipa-dict en_UK.txt / en_US.txt (genuinely
      distinct British vs American transcriptions). Falls back to ECDICT's single
      phonetic when a word is absent from a list.
    - 中文释义 + 词性 : ECDICT. We take only the SINGLE most common sense (first
      gloss of the first part-of-speech line) and its POS, per the requirement.
    - 音频链接地址 : the real-human source URL we selected during download
      (manifest, US preferred), with a Youdao URL as a universal fallback.
"""

from __future__ import annotations

import csv
import json
import re
import sys
from urllib.parse import quote

from openpyxl import Workbook

import config

DICT_DIR = config.PROJECT_ROOT / "dict"
EN_UK = DICT_DIR / "en_UK.txt"
EN_US = DICT_DIR / "en_US.txt"
ECDICT = DICT_DIR / "ecdict.csv"
OUT_XLSX = config.PROJECT_ROOT / "COCA_wordcards.xlsx"

HEADERS = ["英文单词", "英式音标", "美式音标", "中文释义", "词性", "音频链接地址"]

# Map ECDICT POS markers -> short tag requested by the user (n / adj / adv ...).
POS_MAP = {
    "n": "n", "pl": "n", "npl": "n",
    "v": "v", "vt": "v", "vi": "v", "vbl": "v", "aux": "aux",
    "adj": "adj", "a": "adj",
    "adv": "adv", "ad": "adv",
    "prep": "prep", "conj": "conj", "pron": "pron", "art": "art",
    "num": "num", "int": "int", "interj": "int", "abbr": "abbr",
}
POS_LINE_RE = re.compile(r"^\s*([a-zA-Z]+)\.\s*(.*)$")
# ECDICT stores sense breaks as the LITERAL two characters backslash-n, not a real
# newline, so we split on that. Within a sense, glosses are separated by Chinese/
# ASCII commas and semicolons - we keep only the first (single most common meaning).
ECDICT_LINE_SPLIT_RE = re.compile(r"\\n")
MEANING_SPLIT_RE = re.compile(r"[；;，,、]")


def load_ipa(path) -> dict[str, str]:
    """word(lower) -> first IPA transcription, slashes stripped."""
    table: dict[str, str] = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        if "\t" not in line:
            continue
        word, ipa = line.split("\t", 1)
        first = ipa.split(",")[0].strip().strip("/").strip("[]").strip()
        if first:
            table.setdefault(word.strip().lower(), first)
    return table


def parse_meaning_and_pos(translation: str) -> tuple[str, str]:
    """Return (single most-common Chinese meaning, short POS tag)."""
    if not translation:
        return "", ""
    lines = [ln.strip() for ln in ECDICT_LINE_SPLIT_RE.split(translation) if ln.strip()]
    # Prefer the first line that carries a POS marker; else the first line.
    chosen = None
    pos_tag = ""
    for ln in lines:
        m = POS_LINE_RE.match(ln)
        if m and m.group(1).lower() in POS_MAP:
            pos_tag = POS_MAP[m.group(1).lower()]
            chosen = m.group(2)
            break
    if chosen is None:
        # No POS line (e.g. "[网络] ..."): drop bracketed tags, take first line.
        chosen = re.sub(r"^\[[^\]]*\]\s*", "", lines[0])
    meaning = MEANING_SPLIT_RE.split(chosen, 1)[0].strip()
    return meaning, pos_tag


def load_ecdict() -> dict[str, dict]:
    """word(lower) -> {phonetic, translation}. Keeps memory modest."""
    table: dict[str, dict] = {}
    with ECDICT.open(encoding="utf-8") as fh:
        reader = csv.DictReader(fh)
        for row in reader:
            key = (row.get("word") or "").strip().lower()
            if key and key not in table:
                table[key] = {
                    "phonetic": (row.get("phonetic") or "").strip(),
                    "translation": (row.get("translation") or "").strip(),
                }
    return table


def audio_link(word: str, manifest: dict) -> str:
    picks = manifest.get(word)
    if picks:
        for accent in ("us", "uk"):
            cands = picks.get(accent)
            if cands:
                return cands[0]["url"]
    # Universal fallback: Youdao US voice (works for any token).
    return config.YOUDAO_VOICE_URL.format(accent=config.YOUDAO_TYPE_US, word=quote(word))


def main() -> int:
    for required in (EN_UK, EN_US, ECDICT, config.CLEAN_WORDLIST):
        if not required.exists():
            print(f"Missing {required} - run earlier phases first.", file=sys.stderr)
            return 1

    print("Phase 8: loading data sources ...")
    uk_ipa = load_ipa(EN_UK)
    us_ipa = load_ipa(EN_US)
    ecdict = load_ecdict()
    manifest = json.loads(config.MANIFEST_JSON.read_text(encoding="utf-8")) \
        if config.MANIFEST_JSON.exists() else {}
    words = config.CLEAN_WORDLIST.read_text(encoding="utf-8").split()
    print(f"  uk_ipa={len(uk_ipa):,} us_ipa={len(us_ipa):,} ecdict={len(ecdict):,} words={len(words):,}")

    wb = Workbook()
    ws = wb.active
    ws.title = "COCA"
    ws.append(HEADERS)

    stats = {"uk": 0, "us": 0, "zh": 0, "uk_fallback": 0, "us_fallback": 0}
    for word in words:
        key = word.lower()
        ec = ecdict.get(key, {})
        ec_phon = ec.get("phonetic", "")

        uk = uk_ipa.get(key, "")
        if not uk and ec_phon:
            uk = ec_phon
            stats["uk_fallback"] += 1
        us = us_ipa.get(key, "")
        if not us and ec_phon:
            us = ec_phon
            stats["us_fallback"] += 1

        meaning, pos = parse_meaning_and_pos(ec.get("translation", ""))

        if uk:
            stats["uk"] += 1
        if us:
            stats["us"] += 1
        if meaning:
            stats["zh"] += 1

        ws.append([word, uk, us, meaning, pos, audio_link(word, manifest)])

    # Widen columns for readability.
    for col, width in zip("ABCDEF", (18, 22, 22, 30, 8, 60)):
        ws.column_dimensions[col].width = width
    ws.freeze_panes = "A2"

    wb.save(OUT_XLSX)
    total = len(words)
    print(f"  rows written : {total:,}")
    print(f"  英式音标 covered : {stats['uk']:,} ({stats['uk']/total:.1%}), "
          f"of which ECDICT-fallback {stats['uk_fallback']:,}")
    print(f"  美式音标 covered : {stats['us']:,} ({stats['us']/total:.1%}), "
          f"of which ECDICT-fallback {stats['us_fallback']:,}")
    print(f"  中文释义 covered : {stats['zh']:,} ({stats['zh']/total:.1%})")
    print(f"  wrote {OUT_XLSX}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
