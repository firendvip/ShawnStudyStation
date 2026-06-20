# -*- coding: utf-8 -*-
"""
build_audio.py — 匹配 Oxford Phonics World 源视频(MP4)到卡片，并拷贝到 video/，
并建立 cardId -> 音频文件 的映射。

设计要点（见 HANDOFF.md §6）：
- 源视频是「词形发音」，文件名带单元号+词形（u01_am / Unit_01_a_e / U_01_bl / U_05_o）。
- 一形多音用 `2` 后缀区分（th2 / ear2 / o2），与卡片的浊/清、ear 双音等对应。
- 输出文件名用 cardId（如 c27.mp3）保证唯一、零碰撞，彻底回避一形多音同名。
- 产物 video_map.json 供 build_html.py 注入；去停顿视频由 build_video_trim.py 生成。

用法：
    python3 build_audio.py            # 用默认源路径
    OPW_SRC=/path/to/牛津自然拼读 python3 build_audio.py
"""
import json
import os
import re
import shutil
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
VIDEO_DIR = os.path.join(ROOT, "video")

OPW_SRC = os.environ.get(
    "OPW_SRC", "/Users/Admin/Desktop/百度下载的/牛津自然拼读"
)

# 说明：翻面/视频都直接用 MP4（声音在后台播、画面点按钮才显示），不再单独生成 MP3。
# 这里只做「匹配 + 拷贝 MP4 到 video/」。去停顿的视频版由 build_video_trim.py 生成。

# 一形多音的「第二张卡」需要手工指定到带 2 后缀/特殊的视频词形。
# key = cardId, value = 该卡所在 level/unit 下的视频词形 token。
# th 的浊/清(c110/c111)需试听核对，必要时对调（见 verify_th_order 提示）。
OVERRIDES = {
    "c68": "ube",   # L3-U3 u_e 第二音(cube/tube) → Unit_03_ube
    "c79": "spy",   # L3-U6 y(spy) → Unit_06_spy
    "c110": "th2",  # L4-U5 th(浊/voiced) → 试听核对
    "c111": "th",   # L4-U5 th(清/voiceless) → 试听核对
    "c150": "ear2",  # L5-U4 ear 第二音 → U_04_ear2
    "c162": "o2",   # L5-U6 o 第二音 → U_06_o2
    "c166": "e",    # L5-U7 字形显示为 've'(/v/，glove/live)，但视频文件名是 U_07_e
}

# 各级视频文件名 -> (unit, form) 的解析规则
LEVEL_PATTERNS = {
    2: re.compile(r"^u(\d+)_(.+)$", re.I),
    3: re.compile(r"^Unit_(\d+)_(.+)$", re.I),
    4: re.compile(r"^U_(\d+)_(.+)$", re.I),
    5: re.compile(r"^U_(\d+)_(.+)$", re.I),
}


def find_video_dir(level):
    """找某级下含 'video' 的最深目录（L5 多嵌套一层）。"""
    base = os.path.join(OPW_SRC, str(level))
    if not os.path.isdir(base):
        return None
    matches = []
    for dirpath, dirnames, _ in os.walk(base):
        for d in dirnames:
            if "video" in d.lower():
                matches.append(os.path.join(dirpath, d))
    if not matches:
        return None
    # 取含 mp4 最多的目录（避免取到空的外层壳目录）
    def mp4count(p):
        try:
            return sum(1 for f in os.listdir(p) if f.lower().endswith(".mp4"))
        except OSError:
            return 0
    matches.sort(key=mp4count, reverse=True)
    return matches[0] if mp4count(matches[0]) else None


def index_videos(level):
    """返回 {(unit, form): abspath}；L1 返回 {letter: abspath}。"""
    vdir = find_video_dir(level)
    if not vdir:
        return {}, None
    idx = {}
    for f in os.listdir(vdir):
        if not f.lower().endswith(".mp4"):
            continue
        stem = f[:-4]
        path = os.path.join(vdir, f)
        if level == 1:
            # 文件名就是单字母 A..Z
            if len(stem) == 1 and stem.isalpha():
                idx[stem.lower()] = path
            continue
        m = LEVEL_PATTERNS[level].match(stem)
        if not m:
            continue
        unit = int(m.group(1))
        form = m.group(2).strip().lower()
        idx[(unit, form)] = path
    return idx, vdir


def normalize_form(g):
    """卡片 grapheme 归一化：去括号/中文标注、小写、保留下划线。"""
    base = g.split("(")[0].strip().lower()
    return base


def unit_of(key):
    """'L3-U6' -> 6。"""
    m = re.search(r"U(\d+)", key)
    return int(m.group(1)) if m else None


def media_duration(path):
    """返回媒体时长(秒)，失败返回 0。"""
    res = subprocess.run(["ffmpeg", "-hide_banner", "-i", path],
                         capture_output=True, text=True)
    m = re.search(r"Duration: (\d+):(\d+):([0-9.]+)", res.stderr)
    if not m:
        return 0.0
    h, mn, s = m.groups()
    return int(h) * 3600 + int(mn) * 60 + float(s)


def process_card(src_mp4, mp4_dst):
    """拷贝原 MP4 到 video/（翻面后台出声 + 点按钮显示都用它）。返回 (ok, seconds)。"""
    try:
        shutil.copyfile(src_mp4, mp4_dst)
    except OSError as e:
        sys.stderr.write(f"[copy FAIL] {src_mp4}: {e}\n")
        return False, 0.0
    return True, media_duration(mp4_dst)


def main():
    units = json.load(open(os.path.join(HERE, "units.json"), encoding="utf-8"))

    # 预建各级视频索引
    video_idx = {}
    video_dirs = {}
    for level in range(1, 6):
        idx, vdir = index_videos(level)
        video_idx[level] = idx
        video_dirs[level] = vdir
        if not idx:
            sys.stderr.write(f"[warn] L{level} 未找到视频目录/文件\n")

    video_map = {}            # cardId -> 相对项目根的 mp4 路径
    matched = []              # (cardId, g, src basename, 视频秒数)
    unmatched = []            # (cardId, level, unit, g)
    used_videos = {1: set(), 2: set(), 3: set(), 4: set(), 5: set()}
    convert_fail = []

    for u in units:
        level = u["level"]
        unit = unit_of(u["key"])
        idx = video_idx.get(level, {})
        for card in u["cards"]:
            cid = card["id"]
            form = normalize_form(card["g"])
            src = None
            if level == 1:
                src = idx.get(form[0] if form else "")
                if src:
                    used_videos[1].add(os.path.basename(src))
            else:
                token = OVERRIDES.get(cid, form)
                src = idx.get((unit, token))
                if src:
                    used_videos[level].add(os.path.basename(src))
            if not src:
                unmatched.append((cid, level, unit, card["g"]))
                continue
            mp4_rel = os.path.join("video", f"{cid}.mp4")
            mp4_abs = os.path.join(ROOT, mp4_rel)
            os.makedirs(VIDEO_DIR, exist_ok=True)
            ok, length = process_card(src, mp4_abs)
            if ok:
                video_map[cid] = mp4_rel
                matched.append((cid, card["g"], os.path.basename(src), length))
            else:
                convert_fail.append((cid, src))

    # 写映射
    with open(os.path.join(HERE, "video_map.json"), "w", encoding="utf-8") as f:
        json.dump(video_map, f, ensure_ascii=False, indent=0)

    # 覆盖率报告
    lines = []
    lines.append("=== 音频覆盖率报告 ===")
    total = sum(len(u["cards"]) for u in units)
    lines.append(f"卡片总数 {total} · 匹配成功 {len(matched)} · 未匹配 {len(unmatched)} · 转码失败 {len(convert_fail)}")
    lines.append("")
    for level in range(1, 6):
        lvl_cards = [c for u in units if u["level"] == level for c in u["cards"]]
        ok = [m for m in matched if m[0] in {c["id"] for c in lvl_cards}]
        lines.append(f"L{level}: {len(ok)}/{len(lvl_cards)} 匹配  (视频目录: {video_dirs.get(level)})")
    if matched:
        lens = sorted(m[3] for m in matched)
        avg = sum(lens) / len(lens)
        lines.append("")
        lines.append(f"视频时长(s): min {lens[0]:.1f} · 中位 {lens[len(lens)//2]:.1f} · max {lens[-1]:.1f} · 平均 {avg:.1f}")
    lines.append("")
    lines.append("--- 匹配明细 (cardId  词形  视频秒  <-  源文件) ---")
    for cid, g, src, length in matched:
        flag = "  [OVERRIDE]" if cid in OVERRIDES else ""
        lines.append(f"  {cid}\t{g}\t{length:.1f}s\t<- {src}{flag}")
    if unmatched:
        lines.append("")
        lines.append("--- 未匹配(将回退 TTS) ---")
        for cid, level, unit, g in unmatched:
            lines.append(f"  {cid}\tL{level}-U{unit}\t{g}")
    if convert_fail:
        lines.append("")
        lines.append("--- 转码失败 ---")
        for cid, src in convert_fail:
            lines.append(f"  {cid}\t{src}")
    # 未使用的视频
    lines.append("")
    lines.append("--- 未被使用的视频(供核对) ---")
    for level in range(1, 6):
        vdir = video_dirs.get(level)
        if not vdir:
            continue
        allv = {f for f in os.listdir(vdir) if f.lower().endswith(".mp4")}
        unused = sorted(allv - used_videos[level])
        if unused:
            lines.append(f"  L{level}: " + ", ".join(unused))
    lines.append("")
    lines.append("提示：c110(th浊)/c111(th清) 的视频对应需试听核对，必要时在 OVERRIDES 中对调 th/th2。")

    report = "\n".join(lines)
    with open(os.path.join(HERE, "audio_coverage.txt"), "w", encoding="utf-8") as f:
        f.write(report + "\n")
    print(report)
    print(f"\n[done] video_map.json {len(video_map)} 项")
    print(f"       mp4 -> {VIDEO_DIR}/")


if __name__ == "__main__":
    main()
