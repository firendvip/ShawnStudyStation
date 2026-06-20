# 项目规则 — 小善自拼闪卡

## 完成后自动打开 HTML（重要）
**每次完成任务后，只要产物或交付物是 HTML 文件（`.html`/`.htm`，包括重新构建出的 `小善自拼闪卡_vN.html`、或临时核对页），都必须用 `open` 直接在浏览器中打开给用户看**——不要只给路径让用户自己找。

- 优先用默认浏览器：`open -a "Google Chrome" "<绝对路径>"`（无 Chrome 则回退 Safari）。
- 「打开最新」= 打开版本号最大的 `小善自拼闪卡_vN.html`。
- 做了多份 HTML（如核对页）时，把相关的都打开或至少打开主交付物。

## 构建与版本
- 源在 `build/`：`app.js`（交互）、`build_html.py`（组装+CSS+注入，**每次生成新版本号** `小善自拼闪卡_vN.html`，保留旧版）、`build_audio.py`（匹配并拷贝 MP4→`video/`）、`build_video_trim.py`（去停顿视频→`video_trim/`）、`build_words.py`（听写单词真人音→`audio/words/`，**勿裁静音**否则削掉 /f//s//θ/ 起音）、`build_data.py`（`units.json`）。
- 构建顺序：`build_audio.py`(音源变动时) → `build_video_trim.py`(有缓存) → `build_words.py`(有缓存) → `build_html.py`。
- 产物随 HTML 需带 `video/`、`video_trim/`、`audio/words/` 文件夹（非单文件，约 1.1GB）。
- 详细设计见 `HANDOFF.md`。
