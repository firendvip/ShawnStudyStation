"""Phase 15 - build the school word packs (primary / junior / senior / COCA5000).

Word lists come from LinXueyuanStdio/DictionaryData (小学/初中/高中) and
Ecattea/COCA-English-Anki-Deck (COCA 5000), pre-extracted into data/ext/.
Per-word data is layered: IPA from ipa-dict -> DictionaryData -> ECDICT; Chinese
meaning + POS from ECDICT -> DictionaryData. Audio points at the shared library
(audioBase "audio"), so packs reuse local mp3s; missing words fall back at runtime.

Also emits data/ext/mw_download.json: target words lacking local audio that the
Merriam-Webster map can supply (downloaded + processed by 16_fetch_mw_audio.py).
"""

from __future__ import annotations

import csv
import json
import re
import sys

import config

DICT = config.PROJECT_ROOT / "dict"
EXT = config.DATA_DIR / "ext"
PACK_DIR = config.PROJECT_ROOT / "webapp" / "packs"

PACK_NAMES = {
    "primary": "小学英语",
    "junior": "初中英语",
    "senior": "高中英语",
    "coca5000": "COCA 5000 核心词",
}

POS_MAP = {
    "n": "n", "pl": "n", "npl": "n", "v": "v", "vt": "v", "vi": "v", "vbl": "v",
    "aux": "aux", "adj": "adj", "a": "adj", "adv": "adv", "ad": "adv",
    "prep": "prep", "conj": "conj", "pron": "pron", "art": "art", "num": "num",
    "int": "int", "interj": "int", "abbr": "abbr",
}
POS_LINE_RE = re.compile(r"^\s*([a-zA-Z]+)\.\s*(.*)$")
LINE_SPLIT_RE = re.compile(r"\\n")
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
    lines = [ln.strip() for ln in LINE_SPLIT_RE.split(translation) if ln.strip()]
    if not lines:
        return "", ""
    chosen, pos = None, ""
    for ln in lines:
        m = POS_LINE_RE.match(ln)
        if m and m.group(1).lower() in POS_MAP:
            pos = POS_MAP[m.group(1).lower()]
            chosen = m.group(2)
            break
    if chosen is None:
        chosen = re.sub(r"^\[[^\]]*\]\s*", "", lines[0])
    meaning = MEANING_SPLIT_RE.split(chosen, 1)[0].strip()
    # DictionaryData glosses sometimes start with "(A)" etc; trim leading parens.
    meaning = re.sub(r"^\([^)]*\)\s*", "", meaning).strip()
    return meaning, pos


def load_ecdict():
    table = {}
    ec = DICT / "ecdict.csv"
    with ec.open(encoding="utf-8") as fh:
        for row in csv.DictReader(fh):
            key = (row.get("word") or "").strip().lower()
            if key and key not in table:
                table[key] = {
                    "phonetic": (row.get("phonetic") or "").strip(),
                    "translation": (row.get("translation") or "").strip(),
                }
    return table


def clean_ipa(s):
    return (s or "").strip().strip("/").strip("[]").strip()


def main() -> int:
    for req in (DICT / "en_UK.txt", DICT / "en_US.txt", DICT / "ecdict.csv",
                EXT / "stage_words.json", EXT / "dd_meta.json", EXT / "mw_map.json"):
        if not req.exists():
            print(f"Missing {req}", file=sys.stderr)
            return 1

    uk_ipa = load_ipa(DICT / "en_UK.txt")
    us_ipa = load_ipa(DICT / "en_US.txt")
    ecdict = load_ecdict()
    dd = json.loads((EXT / "dd_meta.json").read_text(encoding="utf-8"))
    stage_words = json.loads((EXT / "stage_words.json").read_text(encoding="utf-8"))
    mw = json.loads((EXT / "mw_map.json").read_text(encoding="utf-8"))

    def build_entry(en):
        key = en.lower()
        ec = ecdict.get(key, {})
        ddm = dd.get(key, {})
        ec_phon = ec.get("phonetic", "")
        zh, pos = parse_meaning_and_pos(ec.get("translation", ""))
        if not zh and ddm.get("tr"):
            zh2, pos2 = parse_meaning_and_pos(ddm["tr"])
            zh = zh or zh2
            pos = pos or pos2
        uk = uk_ipa.get(key) or clean_ipa(ddm.get("uk")) or ec_phon
        us = us_ipa.get(key) or clean_ipa(ddm.get("us")) or ec_phon
        return {"en": en, "zh": zh, "pos": pos, "uk": uk, "us": us}

    PACK_DIR.mkdir(parents=True, exist_ok=True)
    for pid, name in PACK_NAMES.items():
        # Drop textbook placeholder entries like "... o'clock" / "... years old".
        words = [w for w in stage_words[pid] if not w.lstrip().startswith("...")]
        entries = [build_entry(w) for w in words]
        pack = {"id": pid, "name": name, "audioBase": "audio",
                "count": len(entries), "words": entries}
        out = PACK_DIR / f"{pid}.json"
        out.write_text(json.dumps(pack, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        cov = sum(1 for e in entries if e["zh"]) / max(1, len(entries))
        print(f"  {pid:9} {name:12} {len(entries):6} 词  中文覆盖 {cov:.0%}  -> {out.name}")

    # MW download list: target words lacking local US audio that MW can supply.
    local = {p.stem.lower() for p in config.AUDIO_US_DIR.glob("*.mp3")}
    need, seen = [], set()
    for pid in stage_words:
        for w in stage_words[pid]:
            wl = w.lower()
            if wl in seen:
                continue
            seen.add(wl)
            if wl not in local and wl in mw:
                need.append({"en": w, "url": mw[wl]})
    (EXT / "mw_download.json").write_text(json.dumps(need, ensure_ascii=False), encoding="utf-8")
    print(f"  MW 待下载（缺本地音频、MW 有）: {len(need)} 词 -> mw_download.json")
    return 0


if __name__ == "__main__":
    sys.exit(main())
