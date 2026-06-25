/* 小善学习站 埋点采集脚本 (tracker) — 自包含 IIFE。
 * 由后端 GET /api/analytics/track.js 提供，注入到主站与所有子页面。
 * 注意：家庭自用场景，代码刻意忽略 navigator.doNotTrack（DNT）。
 * 全程 try/catch，任何报错都不能影响宿主页面。
 */
(function () {
  'use strict';
  try {
    var cs = document.currentScript;
    // 解析后端 base：用脚本自身来源（file:// 页面也能正确指到后端）。
    var BASE = '';
    try {
      BASE = new URL(cs.src).origin;
    } catch (e) {
      BASE = '';
    }
    var COLLECT_URL = BASE + '/api/analytics/collect';
    var APP = (cs && cs.dataset && cs.dataset.app) || 'unknown';

    // --- 访客 / 会话 ---
    var VID_KEY = 'xss_vid';
    var SID_KEY = 'xss_sid';
    var SID_TS_KEY = 'xss_sid_ts';
    var TOKEN_KEY = 'xss_token';
    var SESSION_IDLE_MS = 30 * 60 * 1000; // 30 分钟无活动换新会话

    function uuid() {
      try {
        if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
      } catch (e) {}
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        var r = (Math.random() * 16) | 0;
        var v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
      });
    }

    function getVisitorId() {
      try {
        var v = localStorage.getItem(VID_KEY);
        if (!v) {
          v = uuid();
          localStorage.setItem(VID_KEY, v);
        }
        return v;
      } catch (e) {
        return uuid();
      }
    }

    function getSessionId() {
      try {
        var now = Date.now();
        var sid = sessionStorage.getItem(SID_KEY);
        var ts = parseInt(sessionStorage.getItem(SID_TS_KEY) || '0', 10);
        if (!sid || !ts || now - ts > SESSION_IDLE_MS) {
          sid = uuid();
          sessionStorage.setItem(SID_KEY, sid);
        }
        sessionStorage.setItem(SID_TS_KEY, String(now));
        return sid;
      } catch (e) {
        return uuid();
      }
    }

    function getUserId() {
      // 容错：从 JWT payload 解 user id，失败则 null，不影响。
      try {
        var token = localStorage.getItem(TOKEN_KEY);
        if (!token) return null;
        var parts = token.split('.');
        if (parts.length < 2) return null;
        var b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
        var pad = b64.length % 4;
        if (pad) b64 += '===='.slice(pad);
        var payload = JSON.parse(decodeURIComponent(escape(atob(b64))));
        var id = payload.id || payload.userId || payload.sub || payload.uid;
        var n = Number(id);
        return Number.isFinite(n) ? Math.floor(n) : null;
      } catch (e) {
        return null;
      }
    }

    var VISITOR_ID = getVisitorId();

    // --- 上报队列 ---
    var queue = [];
    var BATCH_FLUSH = 10; // 满 10 条 flush
    var BATCH_MAX = 50; // 单批 ≤50
    var FLUSH_MS = 5000; // 每 5 秒 flush
    var flushTimer = null;

    function buildPayload(events) {
      var p = {
        visitorId: VISITOR_ID,
        sessionId: getSessionId(),
        events: events,
      };
      var uid = getUserId();
      if (uid != null) p.userId = uid;
      return p;
    }

    function send(events, useBeacon) {
      if (!events || !events.length) return;
      try {
        var body = JSON.stringify(buildPayload(events));
        if (useBeacon && navigator.sendBeacon) {
          // text/plain 让后端按 sendBeacon 分支解析。
          var blob = new Blob([body], { type: 'text/plain;charset=UTF-8' });
          navigator.sendBeacon(COLLECT_URL, blob);
          return;
        }
        // 在线时用 fetch，失败静默。
        fetch(COLLECT_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: body,
          keepalive: true,
        }).catch(function () {});
      } catch (e) {}
    }

    function flush(useBeacon) {
      try {
        if (!queue.length) return;
        // 单批 ≤50，剩余下次再发。
        var batch = queue.splice(0, BATCH_MAX);
        send(batch, useBeacon);
      } catch (e) {}
    }

    function scheduleFlush() {
      if (flushTimer) return;
      try {
        flushTimer = setTimeout(function () {
          flushTimer = null;
          flush(false);
        }, FLUSH_MS);
      } catch (e) {}
    }

    function enqueue(type, data) {
      try {
        data = data || {};
        var ev = { type: type };
        if (data.app != null) ev.app = String(data.app);
        else ev.app = APP;
        if (data.view != null) ev.view = String(data.view);
        if (data.target != null) ev.target = String(data.target);
        if (data.dwellMs != null) ev.dwellMs = data.dwellMs;
        if (data.meta != null) {
          ev.meta = typeof data.meta === 'string' ? data.meta : JSON.stringify(data.meta);
        }
        queue.push(ev);
        if (queue.length >= BATCH_FLUSH) flush(false);
        else scheduleFlush();
      } catch (e) {}
    }

    // 暴露全局手动埋点接口。
    window.xssTrack = function (type, data) {
      try {
        enqueue(type, data);
      } catch (e) {}
    };

    // --- pageview ---
    function deriveView() {
      try {
        return (
          document.title ||
          (location.pathname.split('/').pop() || location.hostname || 'page')
        ).slice(0, 200);
      } catch (e) {
        return 'page';
      }
    }
    enqueue('pageview', { app: APP, view: deriveView() });

    // --- dwell / session_end ---
    var enterTs = Date.now();
    var lastDwellSent = enterTs;

    function dwellMs() {
      return Math.max(0, Date.now() - enterTs);
    }

    var unloaded = false;
    function reportUnload() {
      if (unloaded) return;
      unloaded = true;
      try {
        enqueue('dwell', { app: APP, view: deriveView(), dwellMs: dwellMs() });
        enqueue('session_end', { app: APP, dwellMs: dwellMs() });
        flush(true); // sendBeacon 保证卸载时送达
      } catch (e) {}
    }

    // 心跳：在线时定时更新 dwell（不依赖卸载）。
    var HEARTBEAT_MS = 60 * 1000;
    try {
      setInterval(function () {
        try {
          if (document.visibilityState === 'visible') {
            enqueue('dwell', { app: APP, view: deriveView(), dwellMs: dwellMs() });
            lastDwellSent = Date.now();
          }
        } catch (e) {}
      }, HEARTBEAT_MS);
    } catch (e) {}

    try {
      document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'hidden') {
          enqueue('dwell', { app: APP, view: deriveView(), dwellMs: dwellMs() });
          flush(true);
        }
      });
    } catch (e) {}
    try {
      window.addEventListener('pagehide', reportUnload);
      window.addEventListener('beforeunload', reportUnload);
    } catch (e) {}

    // --- click 通用节点埋点 ---
    var CLICK_SELECTOR =
      'button, a, [role=menuitem], [data-track], input[type=button], input[type=submit], [onclick]';
    var lastClickKey = '';
    var lastClickTs = 0;
    var CLICK_DEDUP_MS = 400;

    function readableLabel(el) {
      try {
        var t =
          el.getAttribute('data-track') ||
          el.getAttribute('aria-label') ||
          el.getAttribute('title') ||
          (el.value && typeof el.value === 'string' ? el.value : '') ||
          (el.innerText || el.textContent || '').trim() ||
          el.id ||
          (typeof el.className === 'string' ? el.className : '');
        t = (t || '').replace(/\s+/g, ' ').trim();
        return t ? t.slice(0, 60) : (el.tagName || 'el').toLowerCase();
      } catch (e) {
        return 'el';
      }
    }

    function findInteractive(node) {
      try {
        var el = node;
        var depth = 0;
        while (el && el.nodeType === 1 && depth < 6) {
          if (el.matches && el.matches(CLICK_SELECTOR)) return el;
          el = el.parentElement;
          depth++;
        }
      } catch (e) {}
      return null;
    }

    try {
      document.addEventListener(
        'click',
        function (e) {
          try {
            var el = findInteractive(e.target);
            if (!el) return;
            var label = readableLabel(el);
            var now = Date.now();
            var key = label + '|' + (el.tagName || '');
            // 节流去重避免刷量。
            if (key === lastClickKey && now - lastClickTs < CLICK_DEDUP_MS) return;
            lastClickKey = key;
            lastClickTs = now;
            enqueue('click', {
              app: APP,
              target: label,
              meta: { tag: (el.tagName || '').toLowerCase() },
            });
          } catch (err) {}
        },
        true // 捕获阶段，先于页面处理
      );
    } catch (e) {}
  } catch (e) {
    // 顶层兜底：任何初始化报错都吞掉，绝不影响宿主页面。
  }
})();
