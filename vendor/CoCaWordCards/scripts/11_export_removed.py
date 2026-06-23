"""Export the words removed during cleaning (Phase 2) into an Excel file.

Replays the exact cleaning rules from 02_clean_wordlist.py and records, for every
raw line that did NOT make it into words_clean.txt, the reason it was dropped:
  - 空行
  - 缩写片段 (n't, 's, ...)
  - 格式不符 (non-letter chars / bad start-end)
  - 重复 (duplicate of an earlier kept line)

Chinese gloss (ECDICT) is attached where available so the words can be judged.
Output is written to the user's Desktop.
"""

from __future__ import annotations

import csv
import re
import sys
from pathlib import Path

from openpyxl import Workbook

import config

DESKTOP = Path.home() / "Desktop"
OUT = DESKTOP / "COCA_已清洗词条.xlsx"
ECDICT = config.PROJECT_ROOT / "dict" / "ecdict.csv"

FRAGMENTS = {"n't", "'s", "'re", "'ve", "'ll", "'d", "'m", "'t"}
VALID_RE = re.compile(r"^[a-z][a-z'\-]*[a-z]$|^[a-z]$", re.IGNORECASE)
ECDICT_LINE_SPLIT_RE = re.compile(r"\\n")
MEANING_SPLIT_RE = re.compile(r"[；;，,、]")
POS_LINE_RE = re.compile(r"^\s*([a-zA-Z]+)\.\s*(.*)$")


def first_meaning(translation: str) -> str:
    if not translation:
        return ""
    lines = [ln.strip() for ln in ECDICT_LINE_SPLIT_RE.split(translation) if ln.strip()]
    if not lines:
        return ""
    chosen = None
    for ln in lines:
        m = POS_LINE_RE.match(ln)
        if m:
            chosen = m.group(2)
            break
    if chosen is None:
        chosen = re.sub(r"^\[[^\]]*\]\s*", "", lines[0])
    return MEANING_SPLIT_RE.split(chosen, 1)[0].strip()


def load_ecdict_zh() -> dict[str, str]:
    table: dict[str, str] = {}
    if not ECDICT.exists():
        return table
    with ECDICT.open(encoding="utf-8") as fh:
        for row in csv.DictReader(fh):
            key = (row.get("word") or "").strip().lower()
            if key and key not in table:
                table[key] = first_meaning((row.get("translation") or "").strip())
    return table


def main() -> int:
    if not config.RAW_WORDLIST.exists():
        print("raw wordlist missing - run 01_fetch_inputs.py first.", file=sys.stderr)
        return 1

    zh = load_ecdict_zh()
    lines = config.RAW_WORDLIST.read_text(encoding="utf-8").splitlines()

    seen: dict[str, int] = {}  # exact token -> first kept line number
    removed = []  # (lineno, token, reason, note, zh)
    kept = 0

    # New rule: remove ONLY absolute (exact, case-sensitive) duplicates.
    for lineno, raw in enumerate(lines, 1):
        word = raw.strip()
        if not word:
            continue
        gloss = zh.get(word.lower(), "")
        if word in seen:
            removed.append((lineno, word, "绝对重复", f"与第 {seen[word]} 行完全相同（已保留）", gloss))
            continue
        seen[word] = lineno
        kept += 1

    removed.sort(key=lambda r: r[0])

    wb = Workbook()
    ws = wb.active
    ws.title = "已清洗词条"
    ws.append(["原行号", "词条", "清洗原因", "说明", "中文释义(参考)"])
    for row in removed:
        ws.append(list(row))
    for col, w in zip("ABCDE", (8, 20, 12, 30, 24)):
        ws.column_dimensions[col].width = w
    ws.freeze_panes = "A2"

    # Summary sheet
    s = wb.create_sheet("统计")
    from collections import Counter
    counts = Counter(r[2] for r in removed)
    s.append(["原始行数", len(lines)])
    s.append(["保留词数", kept])
    s.append(["清洗删除合计", len(removed)])
    s.append([])
    s.append(["按原因统计", "数量"])
    for reason, n in counts.most_common():
        s.append([reason, n])
    s.column_dimensions["A"].width = 16
    s.column_dimensions["B"].width = 10

    DESKTOP.mkdir(parents=True, exist_ok=True)
    wb.save(OUT)
    print(f"原始 {len(lines)} 行 -> 保留 {kept}，删除 {len(removed)}")
    print("删除原因分布:", dict(counts))
    print(f"已写入: {OUT}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
