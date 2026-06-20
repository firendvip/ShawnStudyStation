'use strict';

// Per-page user data storage. All routes require authentication.
// Mounted at /api.
//
// Data layer: PostgreSQL via the `pg` pool. All queries are async and
// parameterised ($1, $2 ...). Table names come only from a hardcoded internal
// whitelist — never from user input — so interpolating them is injection-safe.

const express = require('express');

const { query } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { httpError } = require('../middleware/errorHandler');
const { validatePage } = require('../lib/validate');

const router = express.Router();

const MAX_DATA_BYTES = 200 * 1024; // ~200 KB per record

// Whitelisted single-row tables keyed by user_id. Table names NEVER come from
// user input — only from this internal map — to prevent SQL injection.
const SINGLE_ROW_TABLES = Object.freeze({
  global_settings: 'global_settings',
  cuozi_data: 'cuozi_data',
  phonics_data: 'phonics_data',
});

// Set of allowed single-row table names. Used as a defence-in-depth guard so a
// table name can never reach SQL unless it is one of these literals — even if a
// future call site is added carelessly.
const ALLOWED_TABLES = new Set(Object.values(SINGLE_ROW_TABLES));

/**
 * Assert that a table name is in the whitelist before it is interpolated into
 * SQL. Throws (500-class, non-exposed) if not — this should never fire for
 * internal callers and signals a programming error if it does.
 */
function assertAllowedTable(table) {
  if (!ALLOWED_TABLES.has(table)) {
    throw new Error(`Refusing to query non-whitelisted table: ${table}`);
  }
}

// All routes below require a valid session.
router.use(requireAuth);

/**
 * Wrap an async route handler so any rejected promise reaches Express's error
 * handler via next(err). Keeps handlers free of repetitive try/catch.
 * @param {Function} handler
 * @returns {Function}
 */
function asyncHandler(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

/**
 * Validate that the supplied value is a plain object within the size budget.
 * Throws an exposed 400 error otherwise.
 */
function ensureValidData(data) {
  const isPlainObject =
    data !== null &&
    typeof data === 'object' &&
    !Array.isArray(data) &&
    Object.getPrototypeOf(data) === Object.prototype;

  if (!isPlainObject) {
    throw httpError(400, '数据格式无效或过大');
  }

  let serialized;
  try {
    serialized = JSON.stringify(data);
  } catch (_err) {
    throw httpError(400, '数据格式无效或过大');
  }

  if (Buffer.byteLength(serialized, 'utf8') >= MAX_DATA_BYTES) {
    throw httpError(400, '数据格式无效或过大');
  }
  return serialized;
}

/** Read and parse the JSON blob for a single-row table, defaulting to {}. */
async function getJson(table, userId) {
  assertAllowedTable(table);
  const { rows } = await query(`SELECT data FROM ${table} WHERE user_id = $1`, [userId]);
  const row = rows[0];
  if (!row) return {};
  try {
    return JSON.parse(row.data);
  } catch (_err) {
    return {};
  }
}

/** Upsert the JSON blob for a single-row table. Returns updated_at. */
async function putJson(table, userId, serialized) {
  assertAllowedTable(table);
  const updatedAt = Date.now();
  await query(
    `INSERT INTO ${table} (user_id, data, updated_at)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id) DO UPDATE SET data = EXCLUDED.data, updated_at = EXCLUDED.updated_at`,
    [userId, serialized, updatedAt]
  );
  return updatedAt;
}

/** Register GET + PUT handlers for a single-row table at the given path. */
function registerSingleRowRoutes(path, table) {
  router.get(
    path,
    asyncHandler(async (req, res) => {
      res.json({ data: await getJson(table, req.user.id) });
    })
  );

  router.put(
    path,
    asyncHandler(async (req, res) => {
      const serialized = ensureValidData((req.body || {}).data);
      const updatedAt = await putJson(table, req.user.id, serialized);
      res.json({ ok: true, updated_at: updatedAt });
    })
  );
}

registerSingleRowRoutes('/settings', SINGLE_ROW_TABLES.global_settings);
registerSingleRowRoutes('/cuozi', SINGLE_ROW_TABLES.cuozi_data);
registerSingleRowRoutes('/phonics', SINGLE_ROW_TABLES.phonics_data);

// --- Generic per-page storage (composite key user_id + page) ---

router.get(
  '/page/:page',
  asyncHandler(async (req, res) => {
    const { page } = req.params;
    if (!validatePage(page)) throw httpError(400, '页面标识无效');

    const { rows } = await query(
      'SELECT data FROM page_data WHERE user_id = $1 AND page = $2',
      [req.user.id, page]
    );
    const row = rows[0];
    let data = {};
    if (row) {
      try {
        data = JSON.parse(row.data);
      } catch (_err) {
        data = {};
      }
    }
    res.json({ data });
  })
);

router.put(
  '/page/:page',
  asyncHandler(async (req, res) => {
    const { page } = req.params;
    if (!validatePage(page)) throw httpError(400, '页面标识无效');

    const serialized = ensureValidData((req.body || {}).data);
    const updatedAt = Date.now();
    await query(
      `INSERT INTO page_data (user_id, page, data, updated_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, page) DO UPDATE SET data = EXCLUDED.data, updated_at = EXCLUDED.updated_at`,
      [req.user.id, page, serialized, updatedAt]
    );
    res.json({ ok: true, updated_at: updatedAt });
  })
);

module.exports = router;
