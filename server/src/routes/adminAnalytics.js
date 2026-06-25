'use strict';

// Admin analytics dashboard API (后台分析). All routes require an admin token
// (requireAuth + email allow-list). Mounted at /api/admin/analytics.
//
// Timestamps are epoch-millis (created_at BIGINT). Range queries filter on
// created_at BETWEEN $from AND $to; defaults to the last 30 days.

const express = require('express');

const { query } = require('../db');
const { httpError } = require('../middleware/errorHandler');
const { requireAdmin } = require('../middleware/requireAdmin');

const router = express.Router();

router.use(...requireAdmin);

const DAY = 86400000;
const RECENT_DEFAULT = 100;
const RECENT_MAX = 500;
const ACTIVE_DEFAULT_MIN = 5;
const ACTIVE_MAX_MIN = 1440;
const RETENTION_DAYS = 30;
const BY_VIEW_LIMIT = 100;

/**
 * Wrap an async route handler so rejected promises reach Express's error
 * handler via next(err).
 */
function asyncHandler(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

/** Parse a {from,to} epoch-millis range from query params (default: last 30d). */
function parseRange(q) {
  const now = Date.now();
  let to = Number(q.to);
  let from = Number(q.from);
  if (!Number.isFinite(to)) to = now;
  if (!Number.isFinite(from)) from = to - 30 * DAY;
  return { from: Math.floor(from), to: Math.floor(to) };
}

/** Local 00:00 today in epoch-millis. */
function todayStartMs() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Coerce a SQL count value to a Number (0 on null). */
function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** Coerce to Number or null (for averages/medians that may be null). */
function numOrNull(value) {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

// --- 1. Summary ---
router.get(
  '/summary',
  asyncHandler(async (req, res) => {
    const { from, to } = parseRange(req.query);
    const todayStart = todayStartMs();

    const mainSql = `
      SELECT
        COUNT(*) FILTER (WHERE type = 'pageview') AS pageviews,
        COUNT(DISTINCT session_id) AS visits,
        COUNT(DISTINCT visitor_id) AS unique_visitors,
        COUNT(DISTINCT session_id) AS sessions,
        COUNT(DISTINCT visitor_id) FILTER (WHERE user_id IS NOT NULL) AS logged_in_visitors,
        ROUND(AVG(dwell_ms) FILTER (WHERE dwell_ms IS NOT NULL)) AS avg_dwell_ms
      FROM analytics_events
      WHERE created_at BETWEEN $1 AND $2`;

    const todaySql = `
      SELECT
        COUNT(DISTINCT session_id) AS today_visits,
        COUNT(DISTINCT visitor_id) AS today_visitors
      FROM analytics_events
      WHERE created_at >= $1`;

    const [main, today] = await Promise.all([
      query(mainSql, [from, to]),
      query(todaySql, [todayStart]),
    ]);

    const m = main.rows[0] || {};
    const t = today.rows[0] || {};

    res.json({
      pageviews: num(m.pageviews),
      visits: num(m.visits),
      uniqueVisitors: num(m.unique_visitors),
      sessions: num(m.sessions),
      loggedInVisitors: num(m.logged_in_visitors),
      avgDwellMs: num(m.avg_dwell_ms),
      todayVisits: num(t.today_visits),
      todayVisitors: num(t.today_visitors),
      fieldDefs: {
        visits: '去重会话数',
        pageviews: 'pageview事件计数',
        uniqueVisitors: '去重访客数',
        sessions: '去重会话数',
        loggedInVisitors: '已登录的去重访客数',
        avgDwellMs: '非空停留时长均值(ms,取整)',
        todayVisits: '今日(本地0点起)去重会话数',
        todayVisitors: '今日去重访客数',
      },
    });
  })
);

// --- 2. Timeseries (gap-filled) ---
const METRIC_EXPR = Object.freeze({
  visitors: 'COUNT(DISTINCT visitor_id)',
  pageviews: "COUNT(*) FILTER (WHERE type = 'pageview')",
  sessions: 'COUNT(DISTINCT session_id)',
});

router.get(
  '/timeseries',
  asyncHandler(async (req, res) => {
    const { from, to } = parseRange(req.query);
    const metric = METRIC_EXPR[req.query.metric] ? req.query.metric : 'visitors';

    const sql = `
      WITH days AS (
        SELECT to_char(d, 'YYYY-MM-DD') AS date
        FROM generate_series(
          date_trunc('day', to_timestamp($1/1000.0)),
          date_trunc('day', to_timestamp($2/1000.0)),
          interval '1 day'
        ) AS d
      ),
      agg AS (
        SELECT to_char(date_trunc('day', to_timestamp(created_at/1000.0)),'YYYY-MM-DD') AS date,
               ${METRIC_EXPR[metric]} AS value
        FROM analytics_events
        WHERE created_at BETWEEN $1 AND $2
        GROUP BY 1
      )
      SELECT days.date, COALESCE(agg.value, 0)::bigint AS value
      FROM days LEFT JOIN agg ON days.date = agg.date
      ORDER BY days.date`;

    const { rows } = await query(sql, [from, to]);
    res.json(rows.map((r) => ({ date: r.date, value: num(r.value) })));
  })
);

// --- 3. By app ---
router.get(
  '/by-app',
  asyncHandler(async (req, res) => {
    const { from, to } = parseRange(req.query);
    const sql = `
      SELECT app,
             COUNT(*) FILTER (WHERE type = 'pageview') AS pageviews,
             COUNT(DISTINCT visitor_id) AS unique_visitors,
             COALESCE(ROUND(AVG(dwell_ms)), 0) AS avg_dwell_ms
      FROM analytics_events
      WHERE app IS NOT NULL AND created_at BETWEEN $1 AND $2
      GROUP BY app
      ORDER BY pageviews DESC`;
    const { rows } = await query(sql, [from, to]);
    res.json(
      rows.map((r) => ({
        app: r.app,
        pageviews: num(r.pageviews),
        uniqueVisitors: num(r.unique_visitors),
        avgDwellMs: num(r.avg_dwell_ms),
      }))
    );
  })
);

// --- 4. By view (optionally scoped to an app) ---
router.get(
  '/by-view',
  asyncHandler(async (req, res) => {
    const { from, to } = parseRange(req.query);
    const app = typeof req.query.app === 'string' && req.query.app ? req.query.app : null;

    const params = [from, to];
    let appFilter = '';
    if (app) {
      params.push(app);
      appFilter = ` AND app = $${params.length}`;
    }

    const sql = `
      SELECT view,
             COUNT(*) FILTER (WHERE type = 'pageview') AS pageviews,
             COUNT(DISTINCT visitor_id) AS unique_visitors,
             COALESCE(ROUND(AVG(dwell_ms)), 0) AS avg_dwell_ms
      FROM analytics_events
      WHERE view IS NOT NULL AND created_at BETWEEN $1 AND $2${appFilter}
      GROUP BY view
      ORDER BY pageviews DESC
      LIMIT ${BY_VIEW_LIMIT}`;
    const { rows } = await query(sql, params);
    res.json(
      rows.map((r) => ({
        view: r.view,
        pageviews: num(r.pageviews),
        uniqueVisitors: num(r.unique_visitors),
        avgDwellMs: num(r.avg_dwell_ms),
      }))
    );
  })
);

// --- 5. Dwell distribution ---
router.get(
  '/dwell',
  asyncHandler(async (req, res) => {
    const { from, to } = parseRange(req.query);
    const sql = `
      SELECT
        ROUND(AVG(dwell_ms)) AS avg_ms,
        ROUND(percentile_cont(0.5) WITHIN GROUP (ORDER BY dwell_ms)) AS median_ms,
        COUNT(*) FILTER (WHERE dwell_ms >= 0 AND dwell_ms < 10000) AS b0,
        COUNT(*) FILTER (WHERE dwell_ms >= 10000 AND dwell_ms < 30000) AS b1,
        COUNT(*) FILTER (WHERE dwell_ms >= 30000 AND dwell_ms < 60000) AS b2,
        COUNT(*) FILTER (WHERE dwell_ms >= 60000 AND dwell_ms < 180000) AS b3,
        COUNT(*) FILTER (WHERE dwell_ms >= 180000) AS b4
      FROM analytics_events
      WHERE dwell_ms IS NOT NULL AND created_at BETWEEN $1 AND $2`;
    const { rows } = await query(sql, [from, to]);
    const r = rows[0] || {};

    res.json({
      avgMs: numOrNull(r.avg_ms),
      medianMs: numOrNull(r.median_ms),
      buckets: [
        { label: '0-10s', min: 0, max: 10000, count: num(r.b0) },
        { label: '10-30s', min: 10000, max: 30000, count: num(r.b1) },
        { label: '30-60s', min: 30000, max: 60000, count: num(r.b2) },
        { label: '1-3m', min: 60000, max: 180000, count: num(r.b3) },
        { label: '3m+', min: 180000, max: null, count: num(r.b4) },
      ],
    });
  })
);

// --- 6. Recent events (latest N overall, NOT range-filtered) ---
router.get(
  '/recent',
  asyncHandler(async (req, res) => {
    let limit = Number(req.query.limit);
    if (!Number.isFinite(limit)) limit = RECENT_DEFAULT;
    limit = Math.min(RECENT_MAX, Math.max(1, Math.floor(limit)));

    const sql = `
      SELECT created_at, app, view, type, target,
             visitor_id AS "visitorId", user_id AS "userId"
      FROM analytics_events
      ORDER BY created_at DESC
      LIMIT $1`;
    const { rows } = await query(sql, [limit]);
    res.json(
      rows.map((r) => ({
        created_at: num(r.created_at),
        app: r.app,
        view: r.view,
        type: r.type,
        target: r.target,
        visitorId: r.visitorId,
        userId: r.userId === null ? null : num(r.userId),
      }))
    );
  })
);

// --- 7. Active visitors in a recent window ---
router.get(
  '/active',
  asyncHandler(async (req, res) => {
    let windowMinutes = Number(req.query.window);
    if (!Number.isFinite(windowMinutes)) windowMinutes = ACTIVE_DEFAULT_MIN;
    windowMinutes = Math.min(ACTIVE_MAX_MIN, Math.max(1, Math.floor(windowMinutes)));

    const cutoff = Date.now() - windowMinutes * 60000;
    const { rows } = await query(
      'SELECT COUNT(DISTINCT visitor_id) AS active FROM analytics_events WHERE created_at >= $1',
      [cutoff]
    );
    res.json({ activeVisitors: num(rows[0] && rows[0].active), windowMinutes });
  })
);

// --- 8. D1 retention over the last 30 days (approximate) ---
router.get(
  '/retention',
  asyncHandler(async (req, res) => {
    const from = Date.now() - RETENTION_DAYS * DAY;
    const sql = `
      WITH firsts AS (
        SELECT visitor_id,
               MIN(date_trunc('day', to_timestamp(created_at/1000.0))) AS first_day
        FROM analytics_events
        WHERE created_at >= $1
        GROUP BY visitor_id
      ),
      returned AS (
        SELECT DISTINCT f.visitor_id
        FROM firsts f
        JOIN analytics_events e ON e.visitor_id = f.visitor_id
         AND date_trunc('day', to_timestamp(e.created_at/1000.0)) = f.first_day + interval '1 day'
      )
      SELECT (SELECT COUNT(*) FROM firsts) AS cohort,
             (SELECT COUNT(*) FROM returned) AS retained`;
    try {
      const { rows } = await query(sql, [from]);
      const r = rows[0] || {};
      const cohort = num(r.cohort);
      const retained = num(r.retained);
      const d1 = cohort > 0 ? Math.round((retained / cohort) * 10000) / 10000 : null;
      res.json({
        d1,
        cohort,
        retained,
        note: '近30天首次出现访客的次日回访比例(近似)',
      });
    } catch (_err) {
      res.json({ d1: null, note: '留待扩展' });
    }
  })
);

module.exports = router;
