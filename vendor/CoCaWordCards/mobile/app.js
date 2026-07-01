// WordCards Mobile — vanilla JS port (feature parity with desktop webapp).
// Logic is copied verbatim from the desktop app.js; only the drawer open/close
// gains a bottom-sheet `.open` class, plus a small mobile-wiring block at the
// end of bindEvents (mirrored visibility toggles + bottom-bar prev/play/next +
// accent quick-toggle). Every desktop element id is present in mobile/index.html.
"use strict";

// ---- Site-styled custom dialogs (replace native alert/confirm) ----
let __toastTimer = null;
function showToast(message) {
  let t = document.querySelector(".ui-toast");
  if (!t) { t = document.createElement("div"); t.className = "ui-toast"; document.body.appendChild(t); }
  t.innerHTML = '<span class="ui-toast-dot">✓</span>' + String(message).replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
  requestAnimationFrame(() => t.classList.add("show"));
  clearTimeout(__toastTimer); __toastTimer = setTimeout(() => t.classList.remove("show"), 2200);
}
function showConfirm({ title = "提示", message = "", confirmText = "确定", cancelText = "取消" } = {}) {
  return new Promise(resolve => {
    const o = document.createElement("div"); o.className = "ui-overlay";
    const p = document.createElement("div"); p.className = "ui-panel";
    const h = document.createElement("div"); h.className = "ui-title"; h.textContent = title;
    const m = document.createElement("div"); m.className = "ui-msg"; m.textContent = message;
    const row = document.createElement("div"); row.className = "ui-row";
    const c = document.createElement("button"); c.type = "button"; c.className = "ui-btn ghost"; c.textContent = cancelText;
    const k = document.createElement("button"); k.type = "button"; k.className = "ui-btn"; k.textContent = confirmText;
    row.append(c, k); p.append(h, m, row); o.append(p); document.body.append(o);
    requestAnimationFrame(() => o.classList.add("show"));
    let done = false;
    function close(r) { if (done) return; done = true; document.removeEventListener("keydown", onKey); o.classList.remove("show"); setTimeout(() => o.remove(), 200); resolve(r); }
    function onKey(e) { if (e.key === "Escape") close(false); else if (e.key === "Enter") close(true); }
    k.onclick = () => close(true); c.onclick = () => close(false);
    o.addEventListener("click", e => { if (e.target === o) close(false); });
    document.addEventListener("keydown", onKey); setTimeout(() => k.focus(), 0);
  });
}

// ---- Single light-green theme (theme system removed) ----
const THEME = { start: "#F4F7F3", mid: "#ECF2EA", end: "#DFE8DC", surface: "#fff", textPrimary: "#20302a", textSecondary: "#5a6b60", border: "#cfdcc9", accent: "#5B9E5B" };
const REPEAT_CYCLE = [1, 2, 3, -1];
// Words per group is user-configurable (default 10). Groups split the active range
// evenly; the remainder lands in the last (smaller) group via ceil division.
function gsize() { const n = parseInt(settings.groupSize, 10); return (!n || n < 1) ? 10 : n; }
const OFFSET_LIMIT = 200;

const DEFAULTS = {
  accent: "US", speed: 1.0, repeat: 1, interval: 0.3, flipInterval: 0.3, autoAdvance: true,
  showZh: true, showPos: true, showPhon: true, showEn: true, showButtons: true, showPlay: true, showArrows: true,
  showPack: true, showGroup: true, showProgress: true,
  fontScaleEn: 2.8, fontScaleZh: 1.0, fontScalePhon: 0.7,
  fontScaleGroup: 1.0, fontScaleProgress: 1.0,
  moduleX: [0, 0, 0, 0, 0, 0], moduleY: [0, 0, 0, 0, 0, 0],
  hdrX: [0, 0, 0], hdrY: [0, 0, 0],  // 0=词包 1=分组 2=进度
  rangeStart: 1, rangeEnd: 0, // rangeEnd 0 = to the end (show all)
  packId: "coca17k", groupSize: 10, limitMode: "range",
};
const LS_SETTINGS = "wc_settings";
const LS_CUSTOM = "wc_custom_packs";
const LS_POS = "wc_pos";

const _loaded = loadJSON(LS_SETTINGS, {});
const settings = Object.assign({}, DEFAULTS, _loaded);
// Migrate old single fontScale -> separate EN/ZH scales.
if (_loaded.fontScale != null && _loaded.fontScaleEn == null) settings.fontScaleEn = _loaded.fontScale;
if (_loaded.fontScale != null && _loaded.fontScaleZh == null) settings.fontScaleZh = _loaded.fontScale;
if (!Array.isArray(settings.moduleX) || settings.moduleX.length !== 6) settings.moduleX = [0, 0, 0, 0, 0, 0];
if (!Array.isArray(settings.moduleY) || settings.moduleY.length !== 6) settings.moduleY = [0, 0, 0, 0, 0, 0];
if (!Array.isArray(settings.hdrX) || settings.hdrX.length !== 3) settings.hdrX = [0, 0, 0];
if (!Array.isArray(settings.hdrY) || settings.hdrY.length !== 3) settings.hdrY = [0, 0, 0];
// One-time: split the single 页头分组 toggle into three independent header modules
// (词包 / 分组 / 进度). Old users who had the header hidden keep all three hidden.
if (!_loaded.headerModules202607) {
  const shown = _loaded.showHeader !== false;
  settings.showPack = shown; settings.showGroup = shown; settings.showProgress = shown;
  settings.headerModules202607 = true;
}
delete settings.showHeader;
// One-time: adopt the 美音-based default pronunciation preset (accent + speed/repeat/interval/auto-flip);
// runs once for everyone, then respects the user's later choices.
if (!_loaded.pronDefaults202607) {
  settings.accent = "US"; settings.speed = 1.0; settings.repeat = 1;
  settings.interval = 0.3; settings.autoAdvance = true; settings.flipInterval = 0.3;
  settings.pronDefaults202607 = true;
}
// One-time: unify the three font-size sliders onto a common absolute base; reset to the
// new per-element defaults so equal slider position = equal rendered size. Runs once.
if (!_loaded.fontUnified202607) {
  settings.fontScaleEn = 2.8; settings.fontScaleZh = 1.0; settings.fontScalePhon = 0.7;
  settings.fontUnified202607 = true;
}
let customPacks = loadJSON(LS_CUSTOM, {});
let positions = loadJSON(LS_POS, {});

// ---- Runtime state ----
let pack = null;
let index = 0;
let repeatCounter = 0;
let advanceTimer = null;
let userPaused = false;
let repeatTimer = null;
let syllableMode = false;
let editMode = false;
let editBackup = null;

const $ = (id) => document.getElementById(id);
const audio = $("audio");
// 6 independently-draggable modules: 0=English 1=中文 2=词性 3=eye 4=音标 5=play
const MOD_COUNT = 6;
const els = {
  wordEn: $("wordEn"), wordZh: $("wordZh"), wordPos: $("wordPos"), wordPhon: $("wordPhon"),
  playBtn: $("playBtn"), progress: $("progress"),
  card: $("card"), mods: [$("mod0"), $("mod1"), $("mod2"), $("mod3"), $("mod4"), $("mod5")],
  // Header modules: 0=词包容器 1=分组徽标 2=进度
  hdrMods: [$("hdrPack"), $("groupBadge"), $("progress")],
};
const HDR_COUNT = 3;

// ---- Storage helpers ----
function loadJSON(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}
function safeSet(key, value, label) {
  try { localStorage.setItem(key, JSON.stringify(value)); }
  catch (e) { if (e && e.name === "QuotaExceededError") showToast(`存储空间不足，${label || "数据"}无法保存。请删除部分自定义词包后重试。`); }
}
const saveSettings = () => safeSet(LS_SETTINGS, settings, "设置");
const savePositions = () => safeSet(LS_POS, positions, "进度");
const saveCustom = () => safeSet(LS_CUSTOM, customPacks, "自定义词包");

// ---- Theme (fixed light-green) ----
function applyPalette() {
  const p = THEME;
  const r = document.documentElement.style;
  r.setProperty("--bg-start", p.start); r.setProperty("--bg-mid", p.mid); r.setProperty("--bg-end", p.end);
  r.setProperty("--surface", p.surface); r.setProperty("--text-primary", p.textPrimary);
  r.setProperty("--text-secondary", p.textSecondary); r.setProperty("--border", p.border);
  r.setProperty("--accent", p.accent);
  r.setProperty("--fs-en", String(settings.fontScaleEn));
  r.setProperty("--fs-zh", String(settings.fontScaleZh));
  r.setProperty("--fs-phon", String(settings.fontScalePhon));
  r.setProperty("--fs-group", String(settings.fontScaleGroup));
  r.setProperty("--fs-progress", String(settings.fontScaleProgress));
}

// ---- Chunking for the highlight view: single word -> syllables; phrase -> words.
function syllableChunks(word) {
  if (!word || word.length <= 3) return [word];
  const isV = (c) => "aeiouyAEIOUY".includes(c);
  const ch = [...word];
  const groups = [];
  for (let i = 0; i < ch.length;) {
    if (isV(ch[i])) { let j = i; while (j < ch.length && isV(ch[j])) j++; groups.push([i, j - 1]); i = j; }
    else i++;
  }
  if (groups.length <= 1) return [word];
  const cuts = new Set();
  for (let g = 0; g < groups.length - 1; g++) {
    const endV = groups[g][1], nextV = groups[g + 1][0];
    const cons = nextV - endV - 1;
    const cut = cons >= 2 ? endV + 2 : endV + 1;
    if (cut > 0 && cut < ch.length) cuts.add(cut);
  }
  const out = []; let cur = "";
  for (let k = 0; k < ch.length; k++) { if (cuts.has(k)) { out.push(cur); cur = ""; } cur += ch[k]; }
  out.push(cur);
  return out;
}
// Render the English word; in highlight mode each chunk gets an alternating soft band.
function renderEnglish(en) {
  els.wordEn.textContent = "";
  if (!syllableMode) { els.wordEn.textContent = en; return; }
  const isPhrase = /\s/.test(en);
  const chunks = isPhrase ? en.split(/\s+/) : syllableChunks(en);
  chunks.forEach((c, i) => {
    if (i > 0 && isPhrase) els.wordEn.appendChild(document.createTextNode(" "));
    const span = document.createElement("span");
    span.className = "chunk " + (i % 2 ? "chunk-b" : "chunk-a");
    span.textContent = c;
    els.wordEn.appendChild(span);
  });
}

// ---- Audio ----
// Bump when the local audio files change (e.g. re-normalised) so browsers refetch
// instead of serving stale cached audio.
const AUDIO_VER = "10";
// file:// 下浏览器禁止 fetch 本地资源，且路径不能带 ?query，需用 <audio> 元素并去掉查询串。
const IS_FILE = location.protocol === "file:";
function audioUrl(word, accent) {
  if (pack.audioBase) {
    const dir = accent === "UK" ? "uk" : "us";
    // Mirror config.safe_filename: path separators -> underscore.
    const safe = word.en.replace(/[\\/]/g, "_");
    const q = IS_FILE ? "" : `?n=${AUDIO_VER}`;
    return `${pack.audioBase}/${dir}/${encodeURIComponent(safe)}.mp3${q}`;
  }
  return youdaoUrl(word.en, accent);
}
function youdaoUrl(en, accent) {
  return `https://dict.youdao.com/dictvoice?type=${accent === "UK" ? 1 : 0}&audio=${encodeURIComponent(en)}`;
}
function setPlaying(on) { els.playBtn.classList.toggle("playing", on); }

// ---- Pitch-preserving playback ----
// All audio (local packs + online fallback) plays through the shared <audio> element.
// HTMLAudioElement supports pitch-preserving time-stretch, so any playbackRate keeps
// the voice natural (no chipmunk effect). AudioBufferSourceNode cannot do this, so the
// Web Audio path was removed entirely.
function applyPreservesPitch() {
  // Some browsers reset these flags per media load, so re-assert them before every play.
  try { audio.preservesPitch = true; } catch (_) {}
  try { audio.mozPreservesPitch = true; } catch (_) {}
  try { audio.webkitPreservesPitch = true; } catch (_) {}
}
applyPreservesPitch();

// Wait the user-set "翻页时间间隔" before flipping to the next word during auto-advance.
function scheduleAdvance() {
  clearTimeout(advanceTimer);
  const d = Math.max(0, parseFloat(settings.flipInterval) || 0) * 1000;
  if (d <= 0) { if (!userPaused) goNext(); return; }
  advanceTimer = setTimeout(() => { if (!userPaused) goNext(); }, d);  // play icon stays "on" through the pause
}
// Play the given word through the <audio> element with pitch-preserving speed.
function playViaAudio(word) {
  audio.dataset.fallback = "0";
  audio.src = audioUrl(word, settings.accent);
  applyPreservesPitch();
  audio.playbackRate = settings.speed;
  audio.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
}
function isPlaying() { return !audio.paused; }
function stopAudio() { clearTimeout(repeatTimer); clearTimeout(advanceTimer); audio.pause(); setPlaying(false); }
function playWord() {
  if (!pack) return;
  const word = pack.words[index];
  if (!word) return;
  clearTimeout(repeatTimer);
  clearTimeout(advanceTimer);
  audio.pause();
  repeatCounter = 0;
  userPaused = false;
  playViaAudio(word);            // local packs and online fallback both go through <audio>
}
audio.addEventListener("ended", () => {
  repeatCounter++;
  if (settings.repeat === -1 || repeatCounter < settings.repeat) {
    repeatTimer = setTimeout(() => { audio.currentTime = 0; applyPreservesPitch(); audio.playbackRate = settings.speed; audio.play().catch(() => {}); }, settings.interval * 1000);
  } else if (settings.autoAdvance && !userPaused) {
    scheduleAdvance();  // keep the "playing" icon steady; goNext -> playWord keeps it on
  } else {
    setPlaying(false);  // genuinely stopped
  }
});
audio.addEventListener("error", () => {
  if (audio.dataset.fallback === "1") {
    setPlaying(false);
    // Both local file and online fallback failed -> don't stall auto-play, skip on.
    if (settings.autoAdvance && !userPaused) setTimeout(() => { if (!userPaused) goNext(); }, 250);
    return;
  }
  if (!pack) return;
  const word = pack.words[index];
  if (!word) return;
  audio.dataset.fallback = "1";
  audio.src = youdaoUrl(word.en, settings.accent);
  applyPreservesPitch();
  audio.playbackRate = settings.speed;
  audio.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
});
function togglePlay() { if (isPlaying()) { userPaused = true; stopAudio(); } else playWord(); }

// ---- Display range ("仅限展示": only words [rangeStart..rangeEnd] are shown) ----
function rangeLo() {
  const len = pack.words.length;
  return Math.min(len - 1, Math.max(0, (settings.rangeStart || 1) - 1));
}
function rangeHi() {
  const len = pack.words.length;
  const end = (settings.rangeEnd && settings.rangeEnd > 0) ? Math.min(settings.rangeEnd, len) : len;
  return Math.max(rangeLo(), end - 1);
}
function rangeLen() { return rangeHi() - rangeLo() + 1; }

// ---- Navigation ----
function clampIndex(i) { return Math.max(rangeLo(), Math.min(rangeHi(), i)); }
function goTo(i, autoplay = true) {
  index = clampIndex(i);
  syllableMode = false;
  positions[pack.id] = index;
  savePositions();
  render();
  if (autoplay) playWord();
}
function goNext() { if (pack && index < rangeHi()) goTo(index + 1); }
function goPrev() { if (pack && index > rangeLo()) goTo(index - 1); }

// ---- Render ----
function applyModuleOffsets() {
  for (let i = 0; i < MOD_COUNT; i++) {
    els.mods[i].style.transform = `translate(${settings.moduleX[i]}px, ${settings.moduleY[i]}px)`;
  }
  applyHdrOffsets();
}
// Apply saved drag offsets to the three header modules (词包/分组/进度).
function applyHdrOffsets() {
  for (let i = 0; i < HDR_COUNT; i++) {
    const el = els.hdrMods[i];
    if (el) el.style.transform = `translate3d(${settings.hdrX[i]}px, ${settings.hdrY[i]}px, 0)`;
  }
}
// Shrink the (single-line) English word to fit width, so long words don't overflow
// and the module height stays stable.
function fitEnglish() {
  const el = els.wordEn;
  el.style.fontSize = "";
  const avail = (els.card.clientWidth || window.innerWidth) - 12;
  const w = el.scrollWidth;
  if (avail > 0 && w > avail) {
    const base = parseFloat(getComputedStyle(el).fontSize);
    el.style.fontSize = Math.max(12, base * avail / w) + "px";
  }
}
function render() {
  if (!pack) return;
  const word = pack.words[index];
  if (!word) return;

  renderEnglish(word.en);
  fitEnglish();

  els.wordZh.textContent = word.zh || "";
  els.wordPos.textContent = word.pos ? word.pos + "." : "";

  const ipa = settings.accent === "UK" ? word.uk : word.us;
  els.wordPhon.textContent = "";
  if (ipa) {
    const tag = document.createElement("span");
    tag.className = "tag"; tag.textContent = settings.accent === "UK" ? "英" : "美";
    els.wordPhon.appendChild(tag);
    els.wordPhon.appendChild(document.createTextNode("/" + ipa + "/"));
  }

  // Per-module visibility. POS follows the Chinese toggle (it's part of the meaning).
  els.mods[0].style.visibility = settings.showEn ? "visible" : "hidden";       // English
  els.mods[1].style.visibility = settings.showZh ? "visible" : "hidden";       // 中文释义
  els.mods[2].style.visibility = settings.showPos ? "visible" : "hidden";      // 词性
  els.mods[3].style.visibility = settings.showButtons ? "visible" : "hidden";  // 眼睛按钮
  els.mods[4].style.visibility = settings.showPhon ? "visible" : "hidden";     // 音标
  els.mods[5].style.visibility = settings.showPlay ? "visible" : "hidden";     // 播放键(占位, 手机版实际按钮在底栏)
  // 底栏播放键随 showPlay 显隐（手机版实际按钮）
  const cbPlay = $("playBtn"); if (cbPlay) cbPlay.style.visibility = settings.showPlay ? "visible" : "hidden";
  // Header modules toggle independently (词包 / 分组 / 进度); header stays present as anchor.
  $("hdrPack").style.visibility = settings.showPack ? "visible" : "hidden";
  $("groupBadge").style.visibility = settings.showGroup ? "visible" : "hidden";
  $("progress").style.visibility = settings.showProgress ? "visible" : "hidden";
  // Show/hide side arrows ("" lets the .editing CSS still hide them during edit).
  $("prevBtn").style.display = settings.showArrows ? "" : "none";
  $("nextBtn").style.display = settings.showArrows ? "" : "none";
  // 底栏上/下一词按钮随 showArrows 显隐（手机版实际按钮）
  const cbPrev = $("prevBtn2"), cbNext = $("nextBtn2");
  if (cbPrev) cbPrev.style.visibility = settings.showArrows ? "visible" : "hidden";
  if (cbNext) cbNext.style.visibility = settings.showArrows ? "visible" : "hidden";

  applyModuleOffsets();

  els.progress.textContent = `${index - rangeLo() + 1}/${rangeLen()}`;
  $("jumpInput").max = rangeLen();
  updateGroupUI();
  preloadAhead();  // keep the next 20 words' audio warm for gapless playback
  // No per-render animation: content swaps instantly so auto-play doesn't flash.
}

// ---- Preload: warm the browser HTTP cache for the next N words so auto-advance
// has minimal gap. Lightweight fetch prewarm only (no Web Audio decode).
const PRELOAD_AHEAD = 20;
const prefetched = new Set();   // urls already prewarmed this session
function preloadAhead() {
  if (!pack || !pack.audioBase) return;  // only local-audio packs (avoid hammering Youdao)
  if (IS_FILE) return;                    // file:// 无法 fetch，浏览器自行缓存 <audio> 请求
  for (let k = 0; k <= PRELOAD_AHEAD; k++) {       // include current (k=0)
    const j = index + k;
    if (j >= pack.words.length) break;
    const url = audioUrl(pack.words[j], settings.accent);
    if (prefetched.has(url)) continue;
    prefetched.add(url);
    fetch(url, { cache: "force-cache" }).catch(() => prefetched.delete(url));
  }
}

// ---- Groups (computed over the active display range) ----
function groupCount() { return pack ? Math.max(1, Math.ceil(rangeLen() / gsize())) : 1; }
function currentGroup() { return Math.floor((index - rangeLo()) / gsize()); }
function updateGroupUI() {
  const cur = currentGroup() + 1, gc = groupCount();
  $("groupLabel").textContent = `第 ${cur} 组 / 共 ${gc} 组`;
  // Mirror the current group into the header so it shows on the main screen
  // (the header — and thus this badge — follows the 显示页头 toggle).
  const badge = $("groupBadge");
  if (badge) badge.textContent = `第 ${cur}/${gc} 组`;
  const sel = $("groupSelect");
  const gs = gsize();
  const sig = `${pack.id}:${rangeLo()}:${rangeHi()}:${gs}`;
  if (sel.dataset.sig !== sig) {
    sel.innerHTML = ""; sel.dataset.sig = sig;
    const lo = rangeLo();
    for (let g = 0; g < gc; g++) {
      const o = document.createElement("option");
      o.value = g;
      o.textContent = `第 ${g + 1} 组（${lo + g * gs + 1}-${Math.min(lo + (g + 1) * gs, rangeHi() + 1)}）`;
      sel.appendChild(o);
    }
  }
  sel.value = currentGroup();
}

// ---- Pack management ----
function builtInPacks() {
  return [
    { id: "primary", name: "小学英语", url: "packs/primary.json?d=6" },
    { id: "junior", name: "初中英语", url: "packs/junior.json?d=6" },
    { id: "senior", name: "高中英语", url: "packs/senior.json?d=6" },
    { id: "coca5000", name: "COCA 5000 核心词", url: "packs/coca5000.json?d=6" },
    { id: "coca17k", name: "COCA 高频 17000 词", url: "packs/coca17k.json?d=6" },
  ];
}
function allPackMetas() { return [...builtInPacks(), ...Object.values(customPacks).map((p) => ({ id: p.id, name: p.name }))]; }
function rebuildPackSelects() {
  for (const sel of [$("packSelect"), $("packSelect2")]) {
    sel.innerHTML = "";
    for (const m of allPackMetas()) {
      const o = document.createElement("option");
      o.value = m.id; o.textContent = m.name;
      if (m.id === settings.packId) o.selected = true;
      sel.appendChild(o);
    }
  }
}
// file:// 下用 <script> 注入加载词包（fetch JSON 会被协议阻止），数据注册到 window.__WC_PACKS。
function loadPackViaScript(meta) {
  const store = (window.__WC_PACKS = window.__WC_PACKS || {});
  if (store[meta.id]) return Promise.resolve(store[meta.id]);
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = `packs/${meta.id}.js`;
    s.onload = () => store[meta.id] ? resolve(store[meta.id]) : reject(new Error(`pack not registered: ${meta.id}`));
    s.onerror = () => reject(new Error(`failed to load ${s.src}`));
    document.head.appendChild(s);
  });
}
async function loadPack(packId) {
  let loaded;
  if (customPacks[packId]) loaded = customPacks[packId];
  else {
    const meta = builtInPacks().find((p) => p.id === packId) || builtInPacks()[0];
    if (IS_FILE) {
      loaded = await loadPackViaScript(meta);
    } else {
      const res = await fetch(meta.url);
      if (!res.ok) throw new Error(`HTTP ${res.status} loading ${meta.id}`);
      loaded = await res.json();
    }
    loaded.id = meta.id;
  }
  if (!Array.isArray(loaded.words) || !loaded.words.length) { showToast("单词包为空"); return; }
  pack = loaded;
  settings.packId = pack.id;
  // If a saved range no longer fits this pack, fall back to showing all.
  if ((settings.rangeStart || 1) > pack.words.length) { settings.rangeStart = 1; settings.rangeEnd = 0; }
  saveSettings();
  index = clampIndex(positions[pack.id] || 0);
  rebuildPackSelects();
  render();
  stopAudio();
  writeSharedWordpack();
}

// 将当前词包写入共享 localStorage,供「单词小测」自动同步。
function writeSharedWordpack() {
  try {
    if (!pack || !Array.isArray(pack.words)) return;
    localStorage.setItem('__shared_wordpack', JSON.stringify({
      name: pack.name,
      groupSize: gsize(),
      words: pack.words.map((w) => ({ en: w.en, zh: w.zh, uk: w.uk, us: w.us })),
    }));
  } catch (_) {}
}

// ---- Custom pack parsing ----
function parseCustomPack(filename, text) {
  const baseName = filename.replace(/\.[^.]+$/, "");
  let words = [];
  const trimmed = text.trim();
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    const data = JSON.parse(trimmed);
    const arr = Array.isArray(data) ? data : (Array.isArray(data.words) ? data.words : []);
    words = arr.map(normalizeWord).filter((w) => w.en);
  } else words = parseCSV(trimmed);
  if (!words.length) throw new Error("未解析到任何单词");
  return { id: "custom_" + Date.now().toString(36), name: baseName || "自定义词包", words };
}
function normalizeWord(o) {
  if (typeof o === "string") return { en: o.trim() };
  return {
    en: (o.en || o.word || o["英文单词"] || "").trim(),
    zh: (o.zh || o.cn || o["中文释义"] || o.meaning || "").trim(),
    pos: (o.pos || o["词性"] || "").trim(),
    uk: (o.uk || o.ukIpa || o["英式音标"] || "").trim(),
    us: (o.us || o.usIpa || o["美式音标"] || "").trim(),
  };
}
function downloadSample() {
  const csv = [
    "# 单词卡片导入样本（CSV，UTF-8，用英文逗号 , 分隔，每行一个单词）",
    "# 每一列对应一个独立模块，模块之间完全分开：",
    "#   en  = 英文单词  【必填】",
    "#   zh  = 中文释义  【可选】",
    "#   uk  = 英式音标  【可选】",
    "#   us  = 美式音标  【可选】",
    "#   pos = 词性      【可选，如 n / v / adj / adv】",
    "# 不需要的列请留空但保留逗号；以 # 开头的行会被忽略。",
    "en,zh,uk,us,pos",
    "apple,苹果,ˈæpl,ˈæpəl,n",
    "run,奔跑,rʌn,rʌn,v",
    "beautiful,美丽的,ˈbjuːtɪfl,ˈbjutəfl,adj",
    "hello,你好,,,int",
    "serendipity,意外发现美好事物的运气,,,n",
  ].join("\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "单词卡片导入样本.csv";
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

function parseCSV(text) {
  text = text.replace(/^﻿/, "");  // strip UTF-8 BOM (Excel adds it)
  const lines = text.split(/\r?\n/).filter((l) => l.trim() && !l.trim().startsWith("#"));
  if (!lines.length) return [];
  const split = (l) => {
    const out = []; let field = "", q = false;
    for (let i = 0; i < l.length; i++) {
      const c = l[i];
      if (c === '"') q = !q;
      else if (c === "," && !q) { out.push(field.trim()); field = ""; }
      else field += c;
    }
    out.push(field.trim());
    return out.map((c) => c.replace(/^"|"$/g, ""));
  };
  const header = split(lines[0]).map((h) => h.toLowerCase());
  const known = ["en", "word", "英文单词", "zh", "中文释义", "uk", "英式音标", "us", "美式音标", "pos", "词性"];
  const hasHeader = header.some((h) => known.includes(h));
  const col = (names) => header.findIndex((h) => names.includes(h));
  const idx = { en: col(["en", "word", "英文单词"]), zh: col(["zh", "中文释义", "meaning"]), uk: col(["uk", "英式音标"]), us: col(["us", "美式音标"]), pos: col(["pos", "词性"]) };
  const rows = hasHeader ? lines.slice(1) : lines;
  return rows.map((l) => {
    const c = split(l);
    if (!hasHeader) return { en: c[0] };
    return { en: c[idx.en] || c[0] || "", zh: idx.zh >= 0 ? c[idx.zh] || "" : "", uk: idx.uk >= 0 ? c[idx.uk] || "" : "", us: idx.us >= 0 ? c[idx.us] || "" : "", pos: idx.pos >= 0 ? c[idx.pos] || "" : "" };
  }).filter((w) => w.en);
}
function renderCustomList() {
  const box = $("customPackList"); box.innerHTML = "";
  for (const p of Object.values(customPacks)) {
    const row = document.createElement("div"); row.className = "custom-item";
    const label = document.createElement("span"); label.textContent = `${p.name} (${p.words.length})`;
    row.appendChild(label);
    const del = document.createElement("button"); del.textContent = "删除";
    del.onclick = () => { delete customPacks[p.id]; saveCustom(); renderCustomList(); rebuildPackSelects(); if (settings.packId === p.id) loadPack("coca17k"); };
    row.appendChild(del); box.appendChild(row);
  }
}

// The visibility toggles live in the edit bar + settings sheet; keep both in sync.
function syncVisToggles() {
  const set = (id, v) => { const el = $(id); if (el) el.checked = v; };
  set("showEn", settings.showEn); set("showZh", settings.showZh);
  set("showPos", settings.showPos); set("showPhon", settings.showPhon);
  set("showButtons", settings.showButtons); set("showPlay", settings.showPlay);
  set("showArrows", settings.showArrows);
  set("showPack", settings.showPack); set("showGroup", settings.showGroup);
  set("showProgress", settings.showProgress);
  // Mobile sheet mirrors (2-suffixed):
  set("showEn2", settings.showEn); set("showZh2", settings.showZh);
  set("showPos2", settings.showPos); set("showPhon2", settings.showPhon);
  set("showButtons2", settings.showButtons); set("showPlay2", settings.showPlay);
  set("showArrows2", settings.showArrows);
  set("showPack2", settings.showPack); set("showGroup2", settings.showGroup);
  set("showProgress2", settings.showProgress);
}
// Sync the two header size sliders + their value labels (仿字号滑块).
function syncHdrFontSliders() {
  const s = (id, v) => { const el = $(id); if (el) el.value = v; };
  const t = (id, v) => { const el = $(id); if (el) el.textContent = v; };
  s("fontScaleGroup", settings.fontScaleGroup); t("fontValGroup", settings.fontScaleGroup.toFixed(1) + "×");
  s("fontScaleProgress", settings.fontScaleProgress); t("fontValProgress", settings.fontScaleProgress.toFixed(1) + "×");
}

// ---- Edit mode (draggable modules) ----
function enterEdit() {
  editBackup = { x: settings.moduleX.slice(), y: settings.moduleY.slice(), hx: settings.hdrX.slice(), hy: settings.hdrY.slice() };
  editMode = true;
  document.getElementById("app").classList.add("editing");
  const win = $("editBar");
  win.style.left = ""; win.style.top = ""; win.style.transform = "";  // reset float to default position
  win.hidden = false;
  syncVisToggles();
  $("fontScaleEn").value = settings.fontScaleEn; $("fontValEn").textContent = settings.fontScaleEn.toFixed(1) + "×";
  $("fontScaleZh").value = settings.fontScaleZh; $("fontValZh").textContent = settings.fontScaleZh.toFixed(1) + "×";
  $("fontScalePhon").value = settings.fontScalePhon; $("fontValPhon").textContent = settings.fontScalePhon.toFixed(1) + "×";
  syncHdrFontSliders();
  closeDrawer();
}
// Make the edit window draggable by its header.
function bindEditFloatDrag() {
  const win = $("editBar"), handle = $("editDragHandle");
  let sx = 0, sy = 0, baseL = 0, baseT = 0, dragging = false;
  handle.addEventListener("pointerdown", (e) => {
    dragging = true; handle.setPointerCapture(e.pointerId);
    const r = win.getBoundingClientRect();
    win.style.transform = "none"; win.style.left = r.left + "px"; win.style.top = r.top + "px";
    sx = e.clientX; sy = e.clientY; baseL = r.left; baseT = r.top;
  });
  handle.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const w = win.offsetWidth, h = win.offsetHeight;
    const nl = Math.max(6, Math.min(baseL + (e.clientX - sx), window.innerWidth - w - 6));
    const nt = Math.max(6, Math.min(baseT + (e.clientY - sy), window.innerHeight - h - 6));
    win.style.left = nl + "px"; win.style.top = nt + "px";
  });
  const end = (e) => { dragging = false; try { handle.releasePointerCapture(e.pointerId); } catch (_) {} };
  handle.addEventListener("pointerup", end);
  handle.addEventListener("pointercancel", end);
}
function exitEdit() { editMode = false; document.getElementById("app").classList.remove("editing"); $("editBar").hidden = true; }
function bindEditDrag() {
  els.mods.forEach((mod, i) => {
    let startX = 0, startY = 0, baseX = 0, baseY = 0, rafId = 0;
    // rAF-coalesced transform write: pointermove only stashes the latest coords,
    // the actual style write happens once per frame → smooth, jitter-free drag.
    const applyFrame = () => {
      rafId = 0;
      mod.style.transform = `translate3d(${settings.moduleX[i]}px, ${settings.moduleY[i]}px, 0)`;
    };
    mod.addEventListener("pointerdown", (e) => {
      if (!editMode) return;
      e.preventDefault();
      startX = e.clientX; startY = e.clientY; baseX = settings.moduleX[i]; baseY = settings.moduleY[i];
      mod.classList.add("dragging"); mod.setPointerCapture(e.pointerId);
    });
    mod.addEventListener("pointermove", (e) => {
      if (!editMode || !mod.hasPointerCapture(e.pointerId)) return;
      e.preventDefault();
      const clamp = (v) => Math.max(-OFFSET_LIMIT, Math.min(OFFSET_LIMIT, v));
      settings.moduleX[i] = clamp(baseX + (e.clientX - startX));
      settings.moduleY[i] = clamp(baseY + (e.clientY - startY));
      if (!rafId) rafId = requestAnimationFrame(applyFrame);
    });
    const end = (e) => {
      if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
      mod.style.transform = `translate3d(${settings.moduleX[i]}px, ${settings.moduleY[i]}px, 0)`;
      if (mod.hasPointerCapture(e.pointerId)) mod.releasePointerCapture(e.pointerId);
      mod.classList.remove("dragging");
    };
    mod.addEventListener("pointerup", end);
    mod.addEventListener("pointercancel", end);
  });
}
// Edit-mode drag for the three header modules (词包/分组/进度). rAF-coalesced like
// bindEditDrag. Offsets stored in hdrX/hdrY. The pack <select> is made
// non-interactive during edit (CSS) so the container receives the drag pointer.
function bindHdrDrag() {
  els.hdrMods.forEach((mod, i) => {
    if (!mod) return;
    let startX = 0, startY = 0, baseX = 0, baseY = 0, rafId = 0;
    const applyFrame = () => {
      rafId = 0;
      mod.style.transform = `translate3d(${settings.hdrX[i]}px, ${settings.hdrY[i]}px, 0)`;
    };
    // Clamp within the viewport so a module can roam most of the page but never escape it.
    const clampX = (v) => {
      const r = mod.getBoundingClientRect();
      const cur = settings.hdrX[i];
      const left = r.left - cur, right = r.right - cur;
      return Math.max(-left + 4, Math.min(v, window.innerWidth - right - 4));
    };
    const clampY = (v) => {
      const r = mod.getBoundingClientRect();
      const cur = settings.hdrY[i];
      const top = r.top - cur, bottom = r.bottom - cur;
      return Math.max(-top + 4, Math.min(v, window.innerHeight - bottom - 4));
    };
    mod.addEventListener("pointerdown", (e) => {
      if (!editMode) return;
      e.preventDefault();
      startX = e.clientX; startY = e.clientY; baseX = settings.hdrX[i]; baseY = settings.hdrY[i];
      mod.classList.add("dragging"); mod.setPointerCapture(e.pointerId);
    });
    mod.addEventListener("pointermove", (e) => {
      if (!editMode || !mod.hasPointerCapture(e.pointerId)) return;
      e.preventDefault();
      settings.hdrX[i] = clampX(baseX + (e.clientX - startX));
      settings.hdrY[i] = clampY(baseY + (e.clientY - startY));
      if (!rafId) rafId = requestAnimationFrame(applyFrame);
    });
    const end = (e) => {
      if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
      mod.style.transform = `translate3d(${settings.hdrX[i]}px, ${settings.hdrY[i]}px, 0)`;
      if (mod.hasPointerCapture(e.pointerId)) mod.releasePointerCapture(e.pointerId);
      mod.classList.remove("dragging");
    };
    mod.addEventListener("pointerup", end);
    mod.addEventListener("pointercancel", end);
  });
}

// ---- Drawer / bottom sheet / settings UI ----
function openDrawer() {
  // Opening settings during auto-advance pauses playback so it doesn't keep flipping.
  if (settings.autoAdvance) { userPaused = true; stopAudio(); }
  $("drawer").hidden = false; $("drawerMask").hidden = false;
  // Bottom-sheet slide-in: add .open on the next frame so the transition runs.
  requestAnimationFrame(() => { $("drawer").classList.add("open"); $("drawerMask").classList.add("open"); });
  syncDrawer();
}
function closeDrawer() {
  const d = $("drawer"), m = $("drawerMask");
  d.classList.remove("open"); m.classList.remove("open");
  // Hide after the slide-out transition finishes.
  setTimeout(() => { d.hidden = true; m.hidden = true; }, 260);
}
function syncDrawer() {
  $("speed").value = settings.speed; $("speedVal").textContent = settings.speed.toFixed(1) + "×";
  $("interval").value = settings.interval; $("intervalVal").textContent = settings.interval.toFixed(1) + "s";
  $("flipInterval").value = settings.flipInterval; $("flipIntervalVal").textContent = (parseFloat(settings.flipInterval) || 0).toFixed(1) + "s";
  $("fontScaleEn").value = settings.fontScaleEn; $("fontValEn").textContent = settings.fontScaleEn.toFixed(1) + "×";
  $("fontScaleZh").value = settings.fontScaleZh; $("fontValZh").textContent = settings.fontScaleZh.toFixed(1) + "×";
  $("fontScalePhon").value = settings.fontScalePhon; $("fontValPhon").textContent = settings.fontScalePhon.toFixed(1) + "×";
  syncHdrFontSliders();
  $("autoAdvance").checked = settings.autoAdvance;
  updateFlipRow();
  updateLimitMode();
  syncVisToggles();
  if (pack) {
    const len = pack.words.length;
    $("rangeStart").max = len; $("rangeEnd").max = len;
    $("rangeStart").value = settings.rangeStart || 1;
    $("rangeEnd").value = (settings.rangeEnd && settings.rangeEnd > 0) ? settings.rangeEnd : len;
    $("rangeInfo").textContent = (settings.rangeEnd && settings.rangeEnd > 0)
      ? `仅展示第 ${rangeLo() + 1}-${rangeHi() + 1} 个（共 ${rangeLen()}）`
      : `当前展示全部（共 ${len}）`;
  }
  $("repeatBtn").textContent = settings.repeat === -1 ? "∞" : settings.repeat + " 次";
  $("groupSizeInput").value = gsize();
  buildLimitGroupSelect();
  document.querySelectorAll("#accentSeg .seg-btn").forEach((b) => b.classList.toggle("active", b.dataset.accent === settings.accent));
  updateAccentQuick();
  renderCustomList();
}
// 翻页时间间隔 only matters when auto-advance is on, so hide it otherwise.
function updateFlipRow() {
  const row = $("flipIntervalRow");
  if (row) row.style.display = settings.autoAdvance ? "" : "none";
}
// 限定方式 二选一: show either the count-range row or the group-picker row.
function updateLimitMode() {
  const mode = settings.limitMode === "group" ? "group" : "range";
  document.querySelectorAll("#limitModeSeg .seg-btn").forEach((b) => b.classList.toggle("active", b.dataset.mode === mode));
  const r = $("rangeModeRow"), g = $("groupModeRow");
  if (r) r.style.display = mode === "range" ? "" : "none";
  if (g) g.style.display = mode === "group" ? "" : "none";
}
// Build the 分组选择 dropdown over the FULL pack (1..N) using the current group size.
function buildLimitGroupSelect() {
  const sel = $("limitGroupSelect");
  if (!sel || !pack) return;
  const gs = gsize(), n = pack.words.length, gc = Math.max(1, Math.ceil(n / gs));
  const sig = `${pack.id}:${gs}:${n}`;
  if (sel.dataset.sig !== sig) {
    sel.innerHTML = ""; sel.dataset.sig = sig;
    for (let g = 0; g < gc; g++) {
      const o = document.createElement("option");
      o.value = g;
      o.textContent = `第 ${g + 1} 组（${g * gs + 1}-${Math.min((g + 1) * gs, n)}）`;
      sel.appendChild(o);
    }
  }
  // Reflect the active range if it exactly matches a whole group.
  if (settings.rangeEnd && settings.rangeEnd > 0) {
    const lo = (settings.rangeStart || 1) - 1;
    if (lo % gs === 0) sel.value = Math.floor(lo / gs);
  }
}
// Restore every setting (display, appearance, playback, layout, range, pack) to defaults.
async function resetSettings() {
  if (!(await showConfirm({ title: "恢复默认设置", message: "确定将所有设置恢复为默认？自定义词包不会被删除。", confirmText: "恢复默认", cancelText: "取消" }))) return;
  stopAudio();
  Object.keys(settings).forEach((k) => delete settings[k]);
  Object.assign(settings, DEFAULTS, { moduleX: [0, 0, 0, 0, 0, 0], moduleY: [0, 0, 0, 0, 0, 0], hdrX: [0, 0, 0], hdrY: [0, 0, 0] });
  saveSettings();
  applyPalette();
  applyModuleOffsets();
  applyPreservesPitch();
  audio.playbackRate = settings.speed;
  loadPack(settings.packId);
  syncDrawer();
}

// ---- Mobile helpers ----
// Bottom-bar accent quick toggle label ("英"/"美").
function updateAccentQuick() {
  const q = $("accentQuick");
  if (q) q.textContent = settings.accent === "UK" ? "英" : "美";
}

// ---- Events ----
function bindEvents() {
  $("prevBtn").addEventListener("click", goPrev);
  $("nextBtn").addEventListener("click", goNext);
  els.playBtn.addEventListener("click", (e) => { e.stopPropagation(); if (!editMode) togglePlay(); });
  // Tapping the English word (single click) splits it into syllables; this is
  // handled inside the tap logic below so it composes with the three-zone nav.
  $("eyeBtn").addEventListener("click", (e) => { e.stopPropagation(); if (editMode) return; settings.showZh = !settings.showZh; saveSettings(); render(); });

  $("settingsFab").addEventListener("click", openDrawer);
  $("progress").addEventListener("click", openDrawer);
  $("drawerClose").addEventListener("click", closeDrawer);
  $("drawerMask").addEventListener("click", closeDrawer);

  $("speed").addEventListener("input", (e) => { settings.speed = parseFloat(e.target.value); $("speedVal").textContent = settings.speed.toFixed(1) + "×"; applyPreservesPitch(); audio.playbackRate = settings.speed; saveSettings(); });
  $("interval").addEventListener("input", (e) => { settings.interval = parseFloat(e.target.value); $("intervalVal").textContent = settings.interval.toFixed(1) + "s"; saveSettings(); });
  $("flipInterval").addEventListener("input", (e) => { settings.flipInterval = parseFloat(e.target.value); $("flipIntervalVal").textContent = settings.flipInterval.toFixed(1) + "s"; saveSettings(); });
  $("fontScaleEn").addEventListener("input", (e) => { settings.fontScaleEn = parseFloat(e.target.value); $("fontValEn").textContent = settings.fontScaleEn.toFixed(1) + "×"; applyPalette(); render(); saveSettings(); });
  $("fontScaleZh").addEventListener("input", (e) => { settings.fontScaleZh = parseFloat(e.target.value); $("fontValZh").textContent = settings.fontScaleZh.toFixed(1) + "×"; applyPalette(); render(); saveSettings(); });
  $("fontScalePhon").addEventListener("input", (e) => { settings.fontScalePhon = parseFloat(e.target.value); $("fontValPhon").textContent = settings.fontScalePhon.toFixed(1) + "×"; applyPalette(); render(); saveSettings(); });
  $("fontScaleGroup").addEventListener("input", (e) => { settings.fontScaleGroup = parseFloat(e.target.value); $("fontValGroup").textContent = settings.fontScaleGroup.toFixed(1) + "×"; applyPalette(); render(); saveSettings(); });
  $("fontScaleProgress").addEventListener("input", (e) => { settings.fontScaleProgress = parseFloat(e.target.value); $("fontValProgress").textContent = settings.fontScaleProgress.toFixed(1) + "×"; applyPalette(); render(); saveSettings(); });
  $("repeatBtn").addEventListener("click", () => { settings.repeat = REPEAT_CYCLE[(REPEAT_CYCLE.indexOf(settings.repeat) + 1) % REPEAT_CYCLE.length]; saveSettings(); syncDrawer(); });
  $("autoAdvance").addEventListener("change", (e) => { settings.autoAdvance = e.target.checked; saveSettings(); updateFlipRow(); });

  document.querySelectorAll("#limitModeSeg .seg-btn").forEach((b) => b.addEventListener("click", () => { settings.limitMode = b.dataset.mode; saveSettings(); updateLimitMode(); }));
  $("limitGroupApply").addEventListener("click", () => {
    if (!pack) return;
    const gs = gsize(), n = pack.words.length;
    const g = parseInt($("limitGroupSelect").value, 10) || 0;
    settings.rangeStart = g * gs + 1;
    settings.rangeEnd = Math.min((g + 1) * gs, n);
    saveSettings();
    goTo(rangeLo()); syncDrawer();
  });

  const visToggle = (id, key) => { const el = $(id); if (el) el.addEventListener("change", (e) => { settings[key] = e.target.checked; saveSettings(); syncVisToggles(); render(); }); };
  // Desktop-parity ids (in the hidden editBar):
  visToggle("showZh", "showZh"); visToggle("showPos", "showPos"); visToggle("showPhon", "showPhon"); visToggle("showEn", "showEn");
  visToggle("showButtons", "showButtons"); visToggle("showPlay", "showPlay"); visToggle("showArrows", "showArrows");
  visToggle("showPack", "showPack"); visToggle("showGroup", "showGroup"); visToggle("showProgress", "showProgress");
  // Mobile sheet mirrors (2-suffixed):
  visToggle("showZh2", "showZh"); visToggle("showPos2", "showPos"); visToggle("showPhon2", "showPhon"); visToggle("showEn2", "showEn");
  visToggle("showButtons2", "showButtons"); visToggle("showPlay2", "showPlay"); visToggle("showArrows2", "showArrows");
  visToggle("showPack2", "showPack"); visToggle("showGroup2", "showGroup"); visToggle("showProgress2", "showProgress");

  document.querySelectorAll("#accentSeg .seg-btn").forEach((b) => b.addEventListener("click", () => { settings.accent = b.dataset.accent; saveSettings(); syncDrawer(); render(); playWord(); }));
  $("resetSettingsBtn").addEventListener("click", resetSettings);

  $("packSelect").addEventListener("change", (e) => loadPack(e.target.value));
  $("packSelect2").addEventListener("change", (e) => loadPack(e.target.value));
  $("groupSelect").addEventListener("change", (e) => goTo(rangeLo() + parseInt(e.target.value, 10) * gsize()));
  $("groupSizeInput").addEventListener("change", (e) => {
    let n = parseInt(e.target.value, 10);
    if (isNaN(n) || n < 1) n = 10;
    settings.groupSize = n; e.target.value = n; saveSettings();
    goTo(rangeLo()); syncDrawer();   // re-group from the first word of the range
    writeSharedWordpack();           // 分组大小同步给「单词小测」
  });

  $("downloadSampleBtn").addEventListener("click", downloadSample);
  $("uploadBtn").addEventListener("click", () => $("uploadInput").click());
  $("uploadInput").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) { showToast("文件过大（上限 20 MB）"); e.target.value = ""; return; }
    try {
      const cp = parseCustomPack(file.name, await file.text());
      customPacks[cp.id] = cp; saveCustom();
      rebuildPackSelects(); renderCustomList();
      settings.packId = cp.id; saveSettings();
      await loadPack(cp.id);
      showToast(`已导入「${cp.name}」，共 ${cp.words.length} 个单词`);
    } catch (err) { showToast("解析失败：" + err.message); }
    e.target.value = "";
  });

  $("jumpBtn").addEventListener("click", () => { const n = parseInt($("jumpInput").value, 10); if (!isNaN(n)) { goTo(rangeLo() + n - 1); closeDrawer(); } });

  $("rangeApply").addEventListener("click", () => {
    if (!pack) return;
    const len = pack.words.length;
    let s = parseInt($("rangeStart").value, 10); let e = parseInt($("rangeEnd").value, 10);
    if (isNaN(s)) s = 1;
    if (isNaN(e)) e = len;
    s = Math.max(1, Math.min(s, len)); e = Math.max(s, Math.min(e, len));
    settings.rangeStart = s; settings.rangeEnd = e; saveSettings();
    goTo(rangeLo()); syncDrawer();
  });
  $("rangeClear").addEventListener("click", () => {
    settings.rangeStart = 1; settings.rangeEnd = 0; saveSettings();
    goTo(0); syncDrawer();
  });

  // Edit mode
  $("editLayoutBtn").addEventListener("click", enterEdit);
  bindEditFloatDrag();
  $("editSave").addEventListener("click", () => { saveSettings(); exitEdit(); });
  $("editCancel").addEventListener("click", () => { if (editBackup) { settings.moduleX = editBackup.x; settings.moduleY = editBackup.y; settings.hdrX = editBackup.hx; settings.hdrY = editBackup.hy; applyModuleOffsets(); } exitEdit(); });
  $("editReset").addEventListener("click", () => { settings.moduleX = [0, 0, 0, 0, 0, 0]; settings.moduleY = [0, 0, 0, 0, 0, 0]; settings.hdrX = [0, 0, 0]; settings.hdrY = [0, 0, 0]; applyModuleOffsets(); });
  bindEditDrag();
  bindHdrDrag();

  // ---- Mobile bottom control bar ----
  const bindTap = (id, fn) => { const el = $(id); if (el) el.addEventListener("click", (e) => { e.stopPropagation(); if (!editMode) fn(); }); };
  bindTap("prevBtn2", goPrev);
  bindTap("nextBtn2", goNext);
  const aq = $("accentQuick");
  if (aq) aq.addEventListener("click", (e) => {
    e.stopPropagation();
    if (editMode) return;
    settings.accent = settings.accent === "UK" ? "US" : "UK";
    saveSettings(); updateAccentQuick(); render(); playWord();
  });

  document.addEventListener("keydown", (e) => {
    if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT") return;
    if (editMode) return;
    if (e.key === "ArrowLeft") goPrev();
    else if (e.key === "ArrowRight") goNext();
    else if (e.key === " ") { e.preventDefault(); togglePlay(); }
  });

  // Pointer drag swipes between words; a TAP pauses/resumes when it lands on the
  // Chinese, or in the centre-lower zone (middle 60% width, lower half) — the left
  // and right sides are excluded because they hold the nav arrows.
  let dragStartX = null, dragStartY = null, startTarget = null;
  $("stage").addEventListener("pointerdown", (e) => {
    if (editMode) return;
    if (e.target.closest(".play-btn, .eye-btn, .nav-arrow")) return; // controls handle themselves
    dragStartX = e.clientX; dragStartY = e.clientY; startTarget = e.target;
  });
  window.addEventListener("pointerup", (e) => {
    if (dragStartX === null) return;
    const dx = e.clientX - dragStartX, dy = e.clientY - dragStartY;
    const sx = dragStartX, sy = dragStartY, t = startTarget;
    dragStartX = null; startTarget = null;
    if (editMode) return;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) { dx > 0 ? goPrev() : goNext(); return; }
    if (Math.abs(dx) < 12 && Math.abs(dy) < 12) {  // a tap, not a drag
      // Single click on the English word -> split into syllables.
      if (t && t.closest && t.closest(".word-en")) { syllableMode = !syllableMode; render(); return; }
      const W = window.innerWidth;
      if (sx < W / 3) { goPrev(); return; }      // left third -> previous word
      if (sx > W * 2 / 3) { goNext(); return; }  // right third -> next word
      togglePlay();                              // middle third, non-word -> pause / resume
    }
  });

  document.addEventListener("visibilitychange", () => { if (document.hidden) stopAudio(); });

  // Re-fit the layout when the viewport changes size.
  let resizeTimer = null;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { if (pack) render(); }, 120);
  });
}

// ---- Init ----
async function init() {
  // UI setup is isolated so a transient binding hiccup can never block the pack
  // from loading (which would leave the screen stuck at 0/0).
  try {
    applyPalette();
    rebuildPackSelects();
    bindEvents();
  } catch (e) {
    console.error("UI setup error:", e);
  }
  try { await loadPack(settings.packId); }
  catch (err) {
    if (settings.packId !== "coca17k") { console.warn("pack load failed, fallback:", err); await loadPack("coca17k"); }
    else els.wordEn.textContent = "加载失败";
  }
  // Re-fit once layout/fonts have settled so the first card is never mis-sized.
  requestAnimationFrame(() => { if (pack) render(); });
  window.addEventListener("load", () => { if (pack) render(); });
}
// Run only after the DOM is fully parsed so element lookups never hit null.
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
else init();
