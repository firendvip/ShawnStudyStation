# -*- coding: utf-8 -*-
"""
build_words.py — 为例词/听写下载真人单词发音（Free Dictionary API，维基词典真人录音）。

- 来源：https://api.dictionaryapi.dev/api/v2/entries/en/<word> 的 phonetics[].audio
- 优先 美音 .mp3 > 英音 .mp3（跳过 .ogg：Safari 不支持）
- 下载后用 ffmpeg 重编码为单声道 22.05k 并裁掉首尾静音，缩小体积
- 产物：audio/words/<word>.mp3 + build/words_map.json（word -> 相对路径）
- 有缓存：已下载的词跳过，便于增量/重跑
- 缺失的词自动回退 TTS（前端逻辑）

用法：python3 build_words.py
版权：维基词典音频多为 CC BY-SA；仅供该家庭个人学习，勿公开分发。
"""
import json
import os
import re
import subprocess
import time

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
WORDS_DIR = os.path.join(ROOT, "audio", "words")
API = "https://api.dictionaryapi.dev/api/v2/entries/en/"
REQUEST_DELAY = 0.5      # 请求间隔(s)，避免触发限流
TIMEOUT = 15


def collect_words():
    units = json.load(open(os.path.join(HERE, "units.json"), encoding="utf-8"))
    seen = set()
    words = []
    for u in units:
        for c in u["cards"]:
            for w in c["words"]:
                ww = w["w"].strip()
                if ww and ww not in seen:
                    seen.add(ww)
                    words.append(ww)
    return words


def slug(word):
    return re.sub(r"[^a-z0-9_-]", "", word.lower())


def fetch_json(word):
    out = subprocess.run(
        ["curl", "-s", "-m", str(TIMEOUT), API + word],
        capture_output=True, text=True,
    ).stdout
    try:
        d = json.loads(out)
        return d if isinstance(d, list) else None
    except Exception:
        return None


def pick_audio(entries):
    """从 API 结果里挑最合适的 mp3 链接：美音 > 英音 > 任意 mp3。"""
    urls = []
    for e in entries:
        if not isinstance(e, dict):
            continue
        for p in e.get("phonetics", []):
            a = (p.get("audio") or "").strip()
            if a:
                urls.append(a)
    mp3 = [u for u in urls if u.lower().endswith(".mp3")]
    for suf in ("-us.mp3", "-uk.mp3", "-au.mp3"):
        for u in mp3:
            if u.lower().endswith(suf):
                return u
    return mp3[0] if mp3 else None


def download_and_encode(url, dst):
    tmp = dst + ".raw"
    r = subprocess.run(["curl", "-s", "-m", str(TIMEOUT), "-o", tmp, url],
                       capture_output=True, text=True)
    if r.returncode != 0 or not os.path.exists(tmp) or os.path.getsize(tmp) < 200:
        if os.path.exists(tmp):
            os.remove(tmp)
        return False
    # 重编码：单声道 22.05k。不裁静音——裁前导会削掉 /f/ /s/ /θ/ 等清辅音起音(如 fan→an)。
    res = subprocess.run(
        ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-i", tmp,
         "-ac", "1", "-ar", "22050",
         "-codec:a", "libmp3lame", "-q:a", "6", "-map_metadata", "-1", dst],
        capture_output=True, text=True,
    )
    os.remove(tmp)
    return res.returncode == 0 and os.path.exists(dst) and os.path.getsize(dst) > 200


def main():
    os.makedirs(WORDS_DIR, exist_ok=True)
    words = collect_words()
    print(f"unique words: {len(words)}")
    wmap = {}
    no_audio = []
    fetched = cached = 0
    for i, w in enumerate(words, 1):
        dst = os.path.join(WORDS_DIR, slug(w) + ".mp3")
        rel = os.path.join("audio", "words", slug(w) + ".mp3")
        if os.path.exists(dst) and os.path.getsize(dst) > 200:
            wmap[w] = rel
            cached += 1
            continue
        entries = fetch_json(w)
        time.sleep(REQUEST_DELAY)
        url = pick_audio(entries) if entries else None
        if url and download_and_encode(url, dst):
            wmap[w] = rel
            fetched += 1
        else:
            no_audio.append(w)
        if i % 25 == 0:
            print(f"  {i}/{len(words)}  有音={len(wmap)} 缺={len(no_audio)}")

    with open(os.path.join(HERE, "words_map.json"), "w", encoding="utf-8") as f:
        json.dump(wmap, f, ensure_ascii=False, indent=0)

    total = len(words)
    have = len(wmap)
    report = [
        "=== 单词发音覆盖 ===",
        f"总词 {total} · 有真人音 {have} ({have*100//total}%) · 缺(回退TTS) {len(no_audio)}",
        f"本次新下载 {fetched} · 命中缓存 {cached}",
        "",
        "--- 缺音(回退 TTS) ---",
        "  " + (", ".join(no_audio) if no_audio else "(无)"),
    ]
    text = "\n".join(report)
    with open(os.path.join(HERE, "words_coverage.txt"), "w", encoding="utf-8") as f:
        f.write(text + "\n")
    print(text)
    print(f"\n[done] words_map.json: {have} 项；mp3 输出到 {WORDS_DIR}")


if __name__ == "__main__":
    main()
