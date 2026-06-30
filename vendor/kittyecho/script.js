// 弦外小猫 KittyEcho — 落地页交互
// 英雄区小猫移植自 WordTaker 项目的 CatSkinFx（全效果版：头顶灯泡/闪光/汗滴/音符/Zzz）。
// React 组件 → vanilla：mountCatFx(root) 构建 DOM + rAF；落地页无真实麦克风，
// 用合成驱动循环演示各种状态，确保所有头顶效果都能被看到。
(function () {
  "use strict";

  const K = "#1b1b1f";
  // ===== CatSkinFx 常量（忠实移植自 CatSkinFx.jsx）=====
  const VOICE_THR = 0.35;
  const LOUD_THR = 0.7;
  const HOLD = 1000;
  const HYST = 0.05;
  const FX_DWELL = 300;
  const ENTER_MS = 1400;
  const RETURN_MS = 800;
  const WALK_W = 0.012; // 走动放慢（原 0.022）
  const PROC_W = 0.022;
  // 小猫整体放大倍数（走/睡/FX/Zzz 等比放大）
  const CAT_SCALE = 1.5;
  // 效果锚点：贴近头顶斜上方（按运动方向 dir 取左右）— 随 CAT_SCALE 等比放大
  const FRONT_SIDE_X = 22 * CAT_SCALE;
  const FRONT_UP_Y = -10 * CAT_SCALE;
  const NOTE_FRONT_BIAS = 8;
  // 音符随机发射器
  const NOTE_GLYPHS = ["♪", "♫", "♩", "♬"];
  const NOTE_COLORS = ["#7DB4FF", "#F7A8CB", "#B197FC", "#5ED0C5", "#FCD34D", "#86E08C", "#FF9F6B", "#F472B6"];
  const NOTE_MAX = 8;
  const NOTE_SPAWN_NORMAL = 330;
  const NOTE_SPAWN_LOUD = 150;
  const NOTE_SPREAD = 14;
  const NOTE_SIZE_MIN = 11;
  const NOTE_SIZE_MAX = 15;
  const NOTE_DX_MAX = 12;
  const NOTE_DY_MIN = -22;
  const NOTE_DY_MAX = -12;
  const NOTE_ROT_MAX = 40;
  const NOTE_DUR_MIN = 1.0;
  const NOTE_DUR_MAX = 1.7;
  const NOTE_DELAY_MAX = 0.25;
  // 睡眠 Zzz：三个升序 Z，贴头顶
  const ZZZ_CLASSES = ["cs-fxzz cs-fxzz-s", "cs-fxzz cs-fxzz-m", "cs-fxzz cs-fxzz-l"];
  const ZZZ_DELAYS = ["0s", ".7s", "1.4s"];
  const ZZZ_BASE_LEFT = 4;
  const ZZZ_STEP = 4;
  const ZZZ_BOTTOM = 22;

  function rand(min, max) { return min + Math.random() * (max - min); }
  function pick(arr) { return arr[(Math.random() * arr.length) | 0]; }
  const easeOut = (t) => 1 - (1 - t) * (1 - t);

  function eye(cx) {
    return `<ellipse cx="${cx}" cy="13" rx="2.6" ry="3.1" fill="#FDE047"/><ellipse cx="${cx + 0.3}" cy="13.5" rx="1" ry="1.9" fill="${K}"/><circle cx="${cx - 0.8}" cy="11.6" r=".7" fill="#fff"/>`;
  }
  const RUN_SVG = `<svg width="40" height="29" viewBox="0 0 46 32" xmlns="http://www.w3.org/2000/svg" style="display:block"><path class="cs-tail" d="M9 22 C 3 20, 3 11, 7 8" fill="none" stroke="${K}" stroke-width="3.6" stroke-linecap="round"/><rect class="cs-leg cs-lb" x="12" y="24" width="3" height="5" rx="1.5" fill="${K}"/><rect class="cs-leg cs-la" x="17" y="24" width="3" height="5" rx="1.5" fill="${K}"/><rect class="cs-leg cs-lb" x="23" y="24" width="3" height="5" rx="1.5" fill="${K}"/><rect class="cs-leg cs-la" x="28" y="24" width="3" height="5" rx="1.5" fill="${K}"/><ellipse cx="20" cy="21" rx="10" ry="7" fill="${K}"/><circle cx="32" cy="13" r="10" fill="${K}"/><path d="M25 6 L27 1 L31 5 Z" fill="${K}"/><path d="M39 6 L37 1 L33 5 Z" fill="${K}"/><g>${eye(28.4)}${eye(35.6)}</g><path d="M31 16 h2 l-1 1.2 z" fill="#F472B6"/></svg>`;
  const SLEEP_SVG = `<svg width="46" height="26" viewBox="0 0 44 24" xmlns="http://www.w3.org/2000/svg" style="display:block"><path d="M38 16 C 42 14, 42 20, 37.5 18.5" fill="none" stroke="${K}" stroke-width="3.6" stroke-linecap="round"/><ellipse cx="24" cy="16" rx="15" ry="7.5" fill="${K}"/><circle cx="11" cy="15" r="7.5" fill="${K}"/><path d="M6 9 L8 4 L12 8 Z" fill="${K}"/><path d="M7.5 14.8 q1.4 1.4 2.8 0" fill="none" stroke="#FDE047" stroke-width="1" stroke-linecap="round"/><path d="M12.5 14.8 q1.3 1.2 2.6 0" fill="none" stroke="#FDE047" stroke-width="1" stroke-linecap="round"/></svg>`;
  const FX_HTML = {
    bulb: '<span class="cs-fxbulb cs-fx-bob"><svg width="14" height="16" viewBox="0 0 14 16"><circle cx="7" cy="7" r="5.5" fill="#FDE047"/><rect x="4.5" y="12" width="5" height="2.6" rx="1" fill="#9CA3AF"/><line x1="7" y1="0" x2="7" y2="1.6" stroke="#FDE047" stroke-width="1" stroke-linecap="round"/><line x1="0.6" y1="3.2" x2="2" y2="4.2" stroke="#FDE047" stroke-width="1" stroke-linecap="round"/><line x1="13.4" y1="3.2" x2="12" y2="4.2" stroke="#FDE047" stroke-width="1" stroke-linecap="round"/></svg></span>',
    sparkle: '<span class="cs-fxstar cs-fx-tw"><svg width="14" height="14" viewBox="0 0 14 14"><path d="M7 0 L8.4 5.6 L14 7 L8.4 8.4 L7 14 L5.6 8.4 L0 7 L5.6 5.6 Z" fill="#FCD34D"/></svg></span>',
    sweat: '<span class="cs-fxsweat cs-fx-bob"><svg width="10" height="14" viewBox="0 0 10 14"><path d="M5 0 C 5 4, 9 7, 9 10 A 4 4 0 0 1 1 10 C 1 7, 5 4, 5 0 Z" fill="#60A5FA"/></svg></span>',
  };

  // 在容器内挂载一只全效果小猫（走/睡/音符/灯泡/闪光/汗滴/Zzz）。
  // driver(now) → { rec, busy, lvl, err } 提供合成输入。
  function mountCatFx(root, driver) {
    if (!root) return;
    root.innerHTML = "";
    const sleepWrap = document.createElement("div"); sleepWrap.className = "cs-sleeper"; sleepWrap.innerHTML = SLEEP_SVG; sleepWrap.style.display = "none";
    const runWrap = document.createElement("div"); runWrap.className = "cs-runner"; const flip = document.createElement("div"); flip.innerHTML = RUN_SVG; runWrap.appendChild(flip); runWrap.style.display = "none";
    const fx = document.createElement("div"); fx.className = "cs-fx"; fx.style.display = "none";
    const zzz = ZZZ_CLASSES.map((cls, i) => {
      const z = document.createElement("span");
      z.className = cls; z.textContent = "Z";
      z.style.animationDelay = ZZZ_DELAYS[i];
      z.style.display = "none";
      return z;
    });
    root.appendChild(sleepWrap); root.appendChild(runWrap); root.appendChild(fx);
    zzz.forEach((z) => root.appendChild(z));

    // 睡姿整体放大（transform 不影响布局，配合下方锚点定位）
    sleepWrap.style.transformOrigin = "left bottom";
    sleepWrap.style.transform = "scale(" + CAT_SCALE + ")";

    const W = root.clientWidth || 180;
    const C = W / 2;
    const AMP = Math.max(28, Math.min(120, W / 2 - 30 * CAT_SCALE));
    const ENTER_FROM = Math.max(14, C - AMP - 6);
    // 睡姿宽约 46px，放大后居中
    sleepWrap.style.left = (C - 22 * CAT_SCALE) + "px";
    const HEAD_X = C - 22 * CAT_SCALE + 11 * CAT_SCALE;
    function positionZzz(dir) {
      zzz.forEach((z, i) => {
        z.style.left = (HEAD_X + dir * (ZZZ_BASE_LEFT + i * ZZZ_STEP) * CAT_SCALE) + "px";
        z.style.top = "auto";
        z.style.bottom = (ZZZ_BOTTOM * CAT_SCALE + i * 3) + "px";
        z.style.setProperty("--zdir", String(dir));
      });
    }

    let mode = "rest-sleep", x = C, wp = 0, t0 = performance.now(), xRet = C, view = "";
    let fxShownType = null, fxShownAt = 0, lastDir = 1, zzzPlaced = false;
    let noteCount = 0, lastSpawn = 0;

    function clearNotes() {
      const kids = fx.querySelectorAll(".cs-fxnt");
      for (let i = 0; i < kids.length; i++) kids[i].remove();
      noteCount = 0;
    }
    function spawnNote(now) {
      if (noteCount >= NOTE_MAX) return;
      const el = document.createElement("span");
      el.className = "cs-fxnt";
      el.textContent = pick(NOTE_GLYPHS);
      el.style.color = pick(NOTE_COLORS);
      el.style.fontSize = rand(NOTE_SIZE_MIN, NOTE_SIZE_MAX).toFixed(1) + "px";
      el.style.left = (lastDir * NOTE_FRONT_BIAS + rand(-NOTE_SPREAD, NOTE_SPREAD)).toFixed(1) + "px";
      el.style.setProperty("--dx", rand(-NOTE_DX_MAX, NOTE_DX_MAX).toFixed(1) + "px");
      el.style.setProperty("--dy", rand(NOTE_DY_MIN, NOTE_DY_MAX).toFixed(1) + "px");
      el.style.setProperty("--rot", rand(-NOTE_ROT_MAX, NOTE_ROT_MAX).toFixed(0) + "deg");
      el.style.setProperty("--dur", rand(NOTE_DUR_MIN, NOTE_DUR_MAX).toFixed(2) + "s");
      el.style.animationDelay = rand(0, NOTE_DELAY_MAX).toFixed(2) + "s";
      el.addEventListener("animationend", () => { el.remove(); noteCount--; }, { once: true });
      fx.appendChild(el); noteCount++;
      lastSpawn = now;
    }
    function setView(v) {
      if (view === v) return; view = v;
      runWrap.style.display = v === "run" ? "block" : "none";
      sleepWrap.style.display = v === "sleep" ? "block" : "none";
      const zd = v === "sleep" ? "block" : "none";
      zzz.forEach((z) => { z.style.display = zd; });
    }
    function setFx(type) {
      if (fxShownType === type) return;
      fxShownType = type;
      clearNotes();
      if (!type) { fx.style.display = "none"; fx.innerHTML = ""; return; }
      if (type === "notes") { fx.innerHTML = ""; fx.style.display = "block"; return; }
      fx.innerHTML = FX_HTML[type] || "";
      fx.style.display = "block";
    }
    function positionFx(dir) { lastDir = dir; fx.style.transform = `translate(${x + dir * FRONT_SIDE_X}px, ${FRONT_UP_Y}px)`; }
    function renderRun(s, dir) { runWrap.style.transform = `translateX(${x - 20 * CAT_SCALE}px) scale(${s * CAT_SCALE})`; flip.style.transform = `scaleX(${dir})`; }
    setView("none"); setFx(null);

    // 醒来时 FX 周期轮播（音符/灯泡/闪光/汗滴）
    const AWAKE_FX_CYCLE = ["notes", "bulb", "sparkle", "notes", "sweat"];
    const AWAKE_FX_DWELL = 2200; // 每种 FX 停留时长
    let fxCycleIdx = 0, fxCycleAt = 0;

    let raf, cancelled = false;
    function frame(now) {
      if (cancelled) return;
      const awake = !!driver().awake;

      // 醒来走动时：FX 周期轮播
      if (awake && (mode === "walk" || mode === "enter")) {
        if (now - fxCycleAt >= AWAKE_FX_DWELL) {
          fxCycleIdx = (fxCycleIdx + 1) % AWAKE_FX_CYCLE.length;
          fxCycleAt = now;
        }
        const fxType = AWAKE_FX_CYCLE[fxCycleIdx];
        if (fxType !== fxShownType && (fxShownType === null || now - fxShownAt >= FX_DWELL)) {
          setFx(fxType); fxShownAt = now;
        }
        if (fxShownType === "notes" && now - lastSpawn >= NOTE_SPAWN_NORMAL) spawnNote(now);
      }

      if (mode === "rest-sleep") {
        // 默认持续睡觉
        x = C; setView("sleep"); setFx(null);
        if (!zzzPlaced) { positionZzz(lastDir); zzzPlaced = true; }
        if (awake) { mode = "enter"; t0 = now; setView("run"); setFx(null); zzzPlaced = false; fxCycleIdx = 0; fxCycleAt = now; }
      } else if (mode === "enter") {
        const te = Math.min(1, (now - t0) / ENTER_MS), k = easeOut(te);
        x = ENTER_FROM + (C - ENTER_FROM) * k; renderRun(0.32 + 0.68 * k, 1); positionFx(1);
        if (te >= 1) { wp = 0; if (!awake) { mode = "settle"; t0 = now; xRet = x; } else { mode = "walk"; t0 = now; xRet = x; } }
      } else if (mode === "walk") {
        if (!awake) { mode = "settle"; t0 = now; xRet = x; }
        else { wp += WALK_W; x = C + AMP * Math.sin(wp); const dir = Math.cos(wp) >= 0 ? 1 : -1; renderRun(1, dir); positionFx(dir); }
      } else if (mode === "settle") {
        if (awake) { mode = "walk"; wp = 0; setView("run"); }
        else {
          const tr = Math.min(1, (now - t0) / RETURN_MS), k = easeOut(tr);
          x = xRet + (C - xRet) * k; const dir = (C - x) >= 0 ? 1 : -1; renderRun(1, dir); positionFx(dir);
          if (tr >= 1) { mode = "rest-sleep"; setView("sleep"); setFx(null); x = C; zzzPlaced = false; }
        }
      }
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
    return () => { cancelled = true; cancelAnimationFrame(raf); clearNotes(); root.innerHTML = ""; };
  }

  // ===== 唤醒/休眠控制器：默认睡觉，点击/按键唤醒 =====
  // 自动回睡时长（仅 tap 触发的唤醒挂此定时器；按键模式不自动回睡）
  const AUTO_SLEEP_MS = 10000;

  function createCatController(root) {
    let awake = false;
    let autoSleepTimer = null;

    // 单个 CC0 喵叫文件，开始/结束共用；预加载、默认静音、失败静默兜底
    const MEOW_SRC = "assets/meow.mp3";
    let muted = true;
    try { muted = localStorage.getItem("kitty-muted") !== "0"; } catch (e) { muted = true; }
    let meow = null;
    try { meow = new Audio(MEOW_SRC); meow.preload = "auto"; } catch (e) { meow = null; }
    function playMeow() {
      if (muted || !meow) return;
      try { meow.currentTime = 0; const p = meow.play(); if (p && p.catch) p.catch(() => {}); }
      catch (e) { /* 静默兜底 */ }
    }

    function clearAutoSleep() { if (autoSleepTimer) { clearTimeout(autoSleepTimer); autoSleepTimer = null; } }
    function activate(withAutoSleep) {
      clearAutoSleep();
      if (!awake) { awake = true; playMeow(); }
      if (withAutoSleep) autoSleepTimer = setTimeout(() => deactivate(), AUTO_SLEEP_MS);
    }
    function deactivate() {
      clearAutoSleep();
      if (awake) { awake = false; playMeow(); }
    }
    function toggleTap() { if (awake) deactivate(); else activate(true); }   // 点击：自动回睡
    function toggleKey() { if (awake) deactivate(); else activate(false); }  // 按键：保持到再次按键

    // 挂载动画，驱动只读 awake 状态
    mountCatFx(root, () => ({ awake }));

    // 点击小猫（手机/通用）
    root.addEventListener("click", toggleTap);
    root.style.cursor = "pointer";

    return {
      toggleKey,
      get muted() { return muted; },
      setMuted(v) {
        muted = !!v;
        try { localStorage.setItem("kitty-muted", muted ? "1" : "0"); } catch (e) { /* ignore */ }
      },
    };
  }

  // ===== 平台引导提示 + 喇叭开关 =====
  function wakeHintText(p) {
    if (p === "mac") return "按 Option 唤醒/休眠小猫";
    if (p === "windows") return "按 Ctrl 唤醒/休眠小猫";
    return "点我唤醒/休眠小猫"; // ios / android / 未知
  }
  function wakeKeyFor(p) {
    if (p === "mac") return "Alt";      // mac Option → e.key === 'Alt'
    if (p === "windows") return "Control";
    return null;                         // 移动/未知：仅点击
  }

  const SPEAKER_ON = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4z" fill="#1b1b1f"/><path d="M16 8.5a4 4 0 0 1 0 7" fill="none" stroke="#1b1b1f" stroke-width="1.8" stroke-linecap="round"/><circle cx="19.5" cy="12" r="1.4" fill="#fde047"/></svg>';
  const SPEAKER_OFF = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4z" fill="#1b1b1f"/><line x1="16" y1="8" x2="22" y2="16" stroke="#9ca3af" stroke-width="1.8" stroke-linecap="round"/><line x1="22" y1="8" x2="16" y2="16" stroke="#9ca3af" stroke-width="1.8" stroke-linecap="round"/></svg>';

  function setupSpeakerButton(controller) {
    const btn = document.getElementById("catMute");
    if (!btn) return;
    function render() {
      btn.innerHTML = controller.muted ? SPEAKER_OFF : SPEAKER_ON;
      btn.setAttribute("aria-label", controller.muted ? "开启提示音" : "关闭提示音");
      btn.setAttribute("aria-pressed", controller.muted ? "false" : "true");
      btn.classList.toggle("cat-mute--on", !controller.muted);
    }
    btn.addEventListener("click", (e) => {
      e.stopPropagation(); // 不要误触发小猫
      controller.setMuted(!controller.muted);
      render();
    });
    render();
  }

  function setupWakeHint(controller) {
    const hintEl = document.getElementById("catHint");
    const p = detectPlatform();
    if (hintEl) hintEl.textContent = wakeHintText(p);
    const key = wakeKeyFor(p);
    if (!key) return; // 移动/未知：靠点击
    window.addEventListener("keydown", (e) => {
      if (e.repeat) return;            // 去抖：长按只触发一次
      if (e.key === key) controller.toggleKey();
    });
  }

  // ===== 设备检测 + 推荐下载 =====
  function detectPlatform() {
    const ua = navigator.userAgent || "";
    const touch = navigator.maxTouchPoints || 0;
    if (/HarmonyOS|OpenHarmony/i.test(ua)) return "harmony";
    if (/Android/i.test(ua)) return "android";
    if (/iPhone|iPod/i.test(ua)) return "ios";
    if (/iPad/i.test(ua) || (/Macintosh/i.test(ua) && touch > 1)) return "ios";
    if (/Macintosh|Mac OS X/i.test(ua)) return "mac";
    if (/Windows|Win32|Win64|WOW64/i.test(ua)) return "windows";
    return null;
  }
  function recommendDownload() {
    const hint = document.getElementById("download-hint");
    const buttons = document.querySelectorAll(".dl-btn");
    if (!hint || !buttons.length) return;
    const p = detectPlatform();
    if (!p) { hint.textContent = "选择适合你设备的版本"; return; }
    let matched = false;
    buttons.forEach((b) => { if (b.dataset.platform === p) { b.classList.add("dl-btn--recommended"); matched = true; } });
    if (matched) hint.innerHTML = "已为你高亮 <b>当前设备</b> 的版本";
    else hint.textContent = "选择适合你设备的版本";
  }

  // 启动
  function boot() {
    const heroCat = document.getElementById("heroCat");
    if (heroCat) {
      const controller = createCatController(heroCat);
      setupSpeakerButton(controller);
      setupWakeHint(controller);
    }
    recommendDownload();
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
