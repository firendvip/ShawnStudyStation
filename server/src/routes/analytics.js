'use strict';

// Public analytics collection endpoint (埋点采集). No authentication.
// Mounted at /api/analytics — defines POST /collect.
//
// Accepts BOTH application/json and text/plain (navigator.sendBeacon sends the
// latter). Body parsing is wired ON this router before the handler so that the
// global express.json (application/json only) and sendBeacon text/plain both
// land as a parsed object.

const express = require('express');
const rateLimit = require('express-rate-limit');

const { query } = require('../db');
const { httpError } = require('../middleware/errorHandler');

const router = express.Router();

// --- Limits ---
const ID_MAX = 64;
const SHORT_MAX = 200; // app / view / target
const META_MAX = 2000;
const HEADER_MAX = 500; // ua / referrer
const MAX_EVENTS = 50;
const BODY_LIMIT = '64kb';

const WHITELIST = Object.freeze([
  'pageview',
  'view_change',
  'dwell',
  'click',
  'app_open',
  'session_end',
  'custom',
]);

const COLLECT_WINDOW_MS = 60 * 1000;
const COLLECT_MAX = 120;

const collectLimiter = rateLimit({
  windowMs: COLLECT_WINDOW_MS,
  max: COLLECT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip,
});

/**
 * Wrap an async route handler so rejected promises reach Express's error
 * handler via next(err).
 */
function asyncHandler(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

/** Truncate a string to max chars; return null for non-strings/empty. */
function truncStr(value, max) {
  if (typeof value !== 'string') return null;
  return value.length > max ? value.slice(0, max) : value;
}

/** Coerce to a finite integer or null. */
function toIntOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.floor(n) : null;
}

// --- Body parsing middleware (order matters) ---

// 1. If a prior parser (global express.json) already CONSUMED + parsed the body
//    (req._body flag set by body-parser), skip re-reading the stream entirely
//    and jump straight to the POST handler. Note: express.json sets req.body to
//    a default {} for non-matching content types WITHOUT setting req._body, so we
//    must check the flag — not just that req.body is an object — otherwise
//    text/plain (sendBeacon) bodies would be dropped as an empty {}.
function skipIfParsed(req, _res, next) {
  if (req._body && req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
    return next('route');
  }
  return next();
}

// 2. Parse any content type (covers text/plain from sendBeacon). type:()=>true
//    makes express.json attempt every request; a >64kb body 413s automatically.
//    A JSON syntax error is normalised to our own exposed 400 so parser
//    internals never leak; a 413 (PayloadTooLargeError) is passed through.
const rawParseAnyBody = express.json({ type: () => true, limit: BODY_LIMIT });
function parseAnyBody(req, res, next) {
  rawParseAnyBody(req, res, (err) => {
    if (!err) return next();
    if (err.type === 'entity.too.large' || err.status === 413) return next(err);
    return next(httpError(400, 'Invalid JSON body'));
  });
}

// 3. Fallback: if the body stayed a Buffer/string, try JSON.parse it.
function fallbackParse(req, _res, next) {
  if (typeof req.body !== 'object' || req.body === null) {
    try {
      req.body = JSON.parse(req.body.toString());
    } catch (_err) {
      return next(httpError(400, 'Invalid JSON body'));
    }
  }
  if (typeof req.body !== 'object' || req.body === null || Array.isArray(req.body)) {
    return next(httpError(400, 'Invalid JSON body'));
  }
  return next();
}

// skipIfParsed uses next('route') to jump straight to the POST handler when the
// body is already parsed; otherwise the request flows through parseAnyBody +
// fallbackParse. Both paths converge on collectHandler below.
router.post('/collect', skipIfParsed, parseAnyBody, fallbackParse);

const collectHandler = asyncHandler(async (req, res) => {
  const body = req.body || {};

  // visitorId / sessionId: required strings, trimmed, ≤64 chars.
  if (typeof body.visitorId !== 'string' || typeof body.sessionId !== 'string') {
    throw httpError(400, 'visitorId and sessionId are required strings');
  }
  const visitorId = body.visitorId.trim().slice(0, ID_MAX);
  const sessionId = body.sessionId.trim().slice(0, ID_MAX);
  if (!visitorId || !sessionId) {
    throw httpError(400, 'visitorId and sessionId are required strings');
  }

  const userId = toIntOrNull(body.userId);

  if (!Array.isArray(body.events)) {
    throw httpError(400, 'events must be an array');
  }
  const events = body.events.slice(0, MAX_EVENTS);

  const createdAt = Date.now();
  const ua = truncStr(req.headers['user-agent'] || null, HEADER_MAX);
  const referrer = truncStr(req.headers.referer || null, HEADER_MAX);

  // Build accepted rows; silently drop events failing the type whitelist.
  const rows = [];
  for (const ev of events) {
    if (!ev || typeof ev !== 'object') continue;
    if (typeof ev.type !== 'string' || !WHITELIST.includes(ev.type)) continue;

    const meta = ev.meta === undefined || ev.meta === null ? null : truncStr(String(ev.meta), META_MAX);

    rows.push([
      visitorId,
      sessionId,
      userId,
      ev.type,
      truncStr(ev.app, SHORT_MAX),
      truncStr(ev.view, SHORT_MAX),
      truncStr(ev.target, SHORT_MAX),
      toIntOrNull(ev.dwellMs),
      meta,
      referrer,
      ua,
      createdAt,
    ]);
  }

  if (rows.length === 0) {
    return res.json({ ok: true, accepted: 0 });
  }

  // Multi-row parameterised INSERT: 12 columns per row.
  const COLS = 12;
  const params = [];
  const groups = rows.map((row, rowIdx) => {
    const base = rowIdx * COLS;
    const placeholders = row.map((_v, colIdx) => `$${base + colIdx + 1}`);
    params.push(...row);
    return `(${placeholders.join(', ')})`;
  });

  await query(
    `INSERT INTO analytics_events
       (visitor_id, session_id, user_id, type, app, view, target, dwell_ms, meta, referrer, ua, created_at)
     VALUES ${groups.join(', ')}`,
    params
  );

  return res.json({ ok: true, accepted: rows.length });
});

router.post('/collect', collectLimiter, collectHandler);

module.exports = router;
