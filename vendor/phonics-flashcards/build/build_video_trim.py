# -*- coding: utf-8 -*-
"""
build_video_trim.py — 生成"去全部静音"的视频版本（供闪卡里勾选"快进/去停顿"用）。

从已拷贝的 video/{cid}.mp4 出发：检测全部静音段，只保留有声片段并拼接重编码，
输出 video_trim/{cid}.mp4 + build/video_trim_map.json。

依赖 build/video_map.json（由 build_audio.py 生成）。重跑会跳过已存在的产物。
"""
import json
import os
import re
import shutil
import subprocess

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
TRIM_DIR = os.path.join(ROOT, "video_trim")

NOISE_DB = "-40dB"
MIN_SIL = 0.3          # 大于此的静音才剪
MIN_SEG = 0.05         # 太碎的有声段丢弃


def media_duration(path):
    r = subprocess.run(["ffmpeg", "-hide_banner", "-i", path],
                       capture_output=True, text=True)
    m = re.search(r"Duration: (\d+):(\d+):([0-9.]+)", r.stderr)
    return int(m[1]) * 3600 + int(m[2]) * 60 + float(m[3]) if m else 0.0


def kept_segments(src):
    """返回有声片段 [(start,end), ...]（静音的补集）。"""
    r = subprocess.run(
        ["ffmpeg", "-hide_banner", "-i", src,
         "-af", f"silencedetect=noise={NOISE_DB}:d={MIN_SIL}", "-f", "null", "-"],
        capture_output=True, text=True)
    starts = [float(x) for x in re.findall(r"silence_start: ([0-9.]+)", r.stderr)]
    ends = [float(x) for x in re.findall(r"silence_end: ([0-9.]+)", r.stderr)]
    total = media_duration(src)
    sil = list(zip(starts, ends))
    kept, cur = [], 0.0
    for s, e in sil:
        if s > cur:
            kept.append((cur, s))
        cur = max(cur, e)
    if cur < total:
        kept.append((cur, total))
    return [(a, b) for a, b in kept if b - a > MIN_SEG], total


def trim_video(src, dst):
    """去掉全部静音段，重编码输出。返回 (ok, out_seconds)。"""
    kept, total = kept_segments(src)
    if len(kept) <= 1:                       # 没什么可剪，直接拷
        shutil.copyfile(src, dst)
        return True, media_duration(dst)
    parts = []
    for i, (a, b) in enumerate(kept):
        parts.append(f"[0:v]trim=start={a:.3f}:end={b:.3f},setpts=PTS-STARTPTS[v{i}];"
                     f"[0:a]atrim=start={a:.3f}:end={b:.3f},asetpts=PTS-STARTPTS[a{i}]")
    n = len(kept)
    concat = "".join(f"[v{i}][a{i}]" for i in range(n)) + f"concat=n={n}:v=1:a=1[v][a]"
    fc = ";".join(parts) + ";" + concat
    res = subprocess.run(
        ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-i", src,
         "-filter_complex", fc, "-map", "[v]", "-map", "[a]",
         "-c:v", "libx264", "-preset", "veryfast", "-crf", "26",
         "-c:a", "aac", "-b:a", "96k", dst],
        capture_output=True, text=True)
    if res.returncode != 0:
        import sys
        sys.stderr.write(f"[trim FAIL] {src}\n{res.stderr[-300:]}\n")
        return False, 0.0
    return True, media_duration(dst)


def main():
    video_map = json.load(open(os.path.join(HERE, "video_map.json"), encoding="utf-8"))
    os.makedirs(TRIM_DIR, exist_ok=True)
    trim_map = {}
    done = fail = 0
    items = sorted(video_map.items(), key=lambda kv: int(kv[0][1:]))
    for i, (cid, rel) in enumerate(items, 1):
        src = os.path.join(ROOT, rel)
        out_rel = os.path.join("video_trim", f"{cid}.mp4")
        out_abs = os.path.join(ROOT, out_rel)
        if os.path.exists(out_abs) and os.path.getsize(out_abs) > 1000:
            trim_map[cid] = out_rel
            continue
        ok, _ = trim_video(src, out_abs)
        if ok:
            trim_map[cid] = out_rel
            done += 1
        else:
            fail += 1
        if i % 20 == 0:
            print(f"  {i}/{len(items)}  ok={len(trim_map)} fail={fail}")
    with open(os.path.join(HERE, "video_trim_map.json"), "w", encoding="utf-8") as f:
        json.dump(trim_map, f, ensure_ascii=False, indent=0)
    print(f"[done] video_trim_map.json {len(trim_map)} 项 (新生成 {done}, 失败 {fail}) -> {TRIM_DIR}/")


if __name__ == "__main__":
    main()
