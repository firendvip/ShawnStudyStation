# CoCaWordCards — COCA 两万词真人发音数据集

为 COCA 高频两万词构建本地「单词 + 美音/英音真人发音」数据集，供单词卡片 App 使用。
音频以本地文件形式存放在 `audio/{us,uk}/`，配套 `data/words.json` 清单（结构对齐
HighFreqWordCards 的 `MediaPlayer` 双口音播放模式）。

## 数据来源

- **词表**：[mahavivo/english-wordlists → `COCA_20000.txt`](https://github.com/mahavivo/english-wordlists)
  （COCA 频率排序，清洗去重后约 1.76 万唯一词）。
- **真人发音音频**：[thousandlemons 音频索引 `ultimate.json`](https://github.com/thousandlemons/English-words-pronunciation-mp3-audio-download)
  汇集 Cambridge / Oxford / OneLook(Macmillan) / Vocabulary.com / Dictionary.com /
  YourDictionary / TheFreeDictionary 等词典音源。按真人优先级择优：
  `cambridge > oxford > onelook > vocabulary.com > dictionary.com > yourdictionary > thefreedictionary`。
- **缺口兜底**：[有道 `dictvoice`](https://dict.youdao.com/dictvoice)（非官方接口、偏 TTS）。
- **英式/美式音标**：[open-dict-data/ipa-dict](https://github.com/open-dict-data/ipa-dict)
  的 `en_UK.txt`（RP）+ `en_US.txt`（GA），两套独立 IPA；缺口用 ECDICT 单套音标兜底。
- **中文释义 + 词性**：[ECDICT](https://github.com/skywind3000/ECDICT)（取首条义项的单个最常用意思 + 其词性）。

## ⚠️ 授权与用途

本数据集**仅限个人学习自用**。索引到的 mp3 版权归各词典所有，有道接口无授权。
**不得商用、不得公开再分发音频文件。** 若需发布产品，请改用 CC 授权的
Wiktionary / Lingua Libre 音源或采购 Forvo 商用 API。

## 目录结构

```
CoCaWordCards/
  scripts/        # Python 流水线（config / netutil / sources / 01-07）
  data/           # 词表、ultimate.json、manifest.json、words.json、报告与日志
  audio/us/       # 美音 mp3（{word}.mp3）
  audio/uk/       # 英音 mp3
  requirements.txt
```

## 运行流程

```bash
pip install -r requirements.txt
cd scripts
python3 01_fetch_inputs.py          # 拉取词表 + ultimate.json
python3 02_clean_wordlist.py        # 清洗去重 -> words_clean.txt
python3 03_analyze_sources.py       # 统计音源 host 分布
python3 04_build_manifest.py        # 择优生成 manifest.json + missing.txt
python3 05_download_audio.py        # 下载美/英音频（可中断续传；--limit N 试跑）
python3 06_coverage_and_fallback.py # 覆盖率报告 + 有道兜底（--report 仅报告）
python3 07_build_words_json.py      # 生成最终 words.json
python3 08_build_excel.py           # 生成 6 列 Excel（词/英式音标/美式音标/中文/词性/音频链接）
```

依赖 `dict/` 下三个词典文件（由 08 脚本使用，需先手动下载到 dict/）：
`en_UK.txt`、`en_US.txt`（ipa-dict）、`ecdict.csv`（ECDICT）。

脚本均**幂等可重跑**：已下载且有效的文件会被跳过，中断后可继续。

## 网页版 MVP（webapp/）

HighFreqWordCards 的网页移植，支持选择已有词包或上传自定义词包。

```bash
cd CoCaWordCards
python3 -m http.server 8137 --directory webapp
# 浏览器打开 http://localhost:8137
```

- [webapp/index.html](webapp/index.html) / [style.css](webapp/style.css) / [app.js](webapp/app.js) — 纯 vanilla JS，无构建步骤
- [webapp/packs/coca17k.json](webapp/packs/coca17k.json) — COCA 词包（中文/词性/英美音标），由 `scripts/10_build_pack.py` 生成
- `webapp/audio` → 软链到裁剪后的本地音频；缺失时回退有道在线发音
- 功能（对齐 Android APK）：双口音、语速 0.2-4×、重复 1/2/3/∞、重复间隔、自动翻页；
  显隐 英文/中文/音标/按钮/页头；音节拆分（点单词）；分组导航（每组 10 词）+ 跳转；
  字号、5 套浅色 + 5 套深色配色、明暗跟随系统；**模块布局拖拽编辑**（保存/取消/还原）；
  选择已有 / 上传 CSV·JSON 自定义词包；设置分「常规/个性化」标签页
- 翻词：点左右半屏 / ← → 键 / 滑动手势 / 上下一个按钮
- 安全：用户上传内容一律 `textContent`/DOM 渲染（防 XSS）；CSV 解析支持引号内逗号；
  localStorage 配额、fetch 状态、音频回退均有错误处理

## 产物

- `data/words.json` — 最终清单：`{ "en", "us", "uk", "us_source", "uk_source" }`
- `data/coverage_report.txt` — US/UK 覆盖率统计
- `audio/{us,uk}/*.mp3` — 发音文件
