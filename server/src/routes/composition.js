'use strict';

// 英语作文 — custom article upload + public/private storage.
// Mounted at /api/composition. All routes require authentication.
//
// Data layer: PostgreSQL via the `pg` pool. All queries are async and
// parameterised ($1, $2 ...). user_id is always enforced server-side so users
// can only read their own private articles and mutate only their own rows.
//
// Parsing is intentionally pluggable: parseTextToEssay() does local, AI-free
// tokenisation today. When an AI key is supplied later, only aiEnrich() changes.

const express = require('express');
const rateLimit = require('express-rate-limit');

const { query } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { httpError } = require('../middleware/errorHandler');

const router = express.Router();

// --- Constants ---

const MAX_TEXT_LEN = 3000; // hard cap on stored text (DoS guard + product limit)
const MAX_TITLE_LEN = 40; // hard cap on title (truncated if longer)
const MAX_PROMPT_LEN = 1000; // hard cap on 作文考题 (truncated if longer)
const PUBLIC_LIST_LIMIT = 200;
const RATE_WINDOW_MS = 60 * 1000; // 1 minute
const POST_MAX_PER_WINDOW = 10; // ≤10 uploads per user per minute

// Allowed 学段 (level) values. Upload is rejected if level is not one of these.
const VALID_LEVELS = Object.freeze(['小学', '初中', '高中', '大学']);

/**
 * Wrap an async route handler so any rejected promise reaches Express's error
 * handler via next(err). Keeps handlers free of repetitive try/catch.
 * @param {Function} handler
 * @returns {Function}
 */
function asyncHandler(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

// --- Pluggable parsing stub ------------------------------------------------

// TODO: 接入 AI(Claude/OpenAI)填充 m/p/us/uk/chunks/normal。
// The ONLY place that should call an external model is aiEnrich() below. The
// rest of the pipeline is provider-agnostic. When a key is configured, swap the
// body of aiEnrich() to call the model and fill in the empty fields; nothing
// else here needs to change.

/**
 * Split raw text into sentences on sentence-final punctuation (. ! ? 。！？),
 * keeping the punctuation attached. Returns trimmed, non-empty sentences.
 * @param {string} text
 * @returns {string[]}
 */
function splitSentences(text) {
  const matches = text.match(/[^.!?。！？]+[.!?。！？]*/g) || [];
  return matches.map((s) => s.trim()).filter(Boolean);
}

/**
 * Tokenise a single sentence into word tokens. Only `w` (the surface form) is
 * filled today; m/p/us/uk are reserved for AI enrichment and stay empty.
 * @param {string} sentence
 * @returns {Array<{w: string, m: string, p: string, us: string, uk: string}>}
 */
function tokenizeSentence(sentence) {
  const words = sentence.match(/[A-Za-z0-9'’-]+|[^\sA-Za-z0-9]/g) || [];
  return words.map((w) => ({ w, m: '', p: '', us: '', uk: '' }));
}

/**
 * Local, AI-free essay parser. Produces the full essay shape used by the
 * built-in articles, with AI-only fields left blank for later enrichment.
 * @param {string} text
 * @param {string} title
 * @returns {{title: string, sentences: Array}}
 */
function parseTextToEssay(text, title) {
  const sentences = splitSentences(text).map((normalText) => ({
    tokens: tokenizeSentence(normalText),
    chunks: [], // 意群翻译 — filled by AI later
    normal: '', // 整句中文 — filled by AI later
  }));
  return aiEnrich({ title, sentences }, text);
}

/**
 * AI enrichment hook. STUB: returns the essay unchanged (no external call).
 * When an AI provider/key is configured, fill token.m/p/us/uk, sentence.chunks
 * and sentence.normal here. Keep this the single integration point.
 * @param {{title: string, sentences: Array}} essay
 * @param {string} _text original text (available for context-aware enrichment)
 * @returns {{title: string, sentences: Array}}
 */
function aiEnrich(essay, _text) {
  // Stub mode: no AI configured. Return as-is.
  return essay;
}

// --- Helpers ---------------------------------------------------------------

/** Parse a stored parsed_data blob back into an essay object, tolerating bad data. */
function parseEssay(parsedData) {
  try {
    return JSON.parse(parsedData);
  } catch (_err) {
    return { title: '', sentences: [] };
  }
}

/**
 * Map a DB row to the flat wire shape returned to the client.
 * `currentUserId` is used to compute `isMine`.
 * @param {object} row
 * @param {number} currentUserId
 */
function rowToItem(row, currentUserId) {
  return {
    id: Number(row.id),
    title: row.title,
    prompt: row.prompt || '',
    level: row.level || '',
    essay: parseEssay(row.parsed_data),
    ownerId: Number(row.user_id),
    createdAt: Number(row.created_at),
    isMine: Number(row.user_id) === Number(currentUserId),
  };
}

/**
 * Map a my_articles DB row to the wire shape for the 我的作文 list/item.
 * @param {object} row
 */
function myRowToItem(row) {
  return {
    id: Number(row.id),
    sourceId: row.source_id == null ? null : Number(row.source_id),
    title: row.title,
    prompt: row.prompt || '',
    level: row.level || '',
    essay: parseEssay(row.parsed_data),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

/** Validate and normalise the :id route param to a positive integer. */
function parseId(raw) {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) {
    throw httpError(400, '无效的文章 ID');
  }
  return id;
}

// --- Rate limiter (per authenticated user) ---------------------------------

const postLimiter = rateLimit({
  windowMs: RATE_WINDOW_MS,
  max: POST_MAX_PER_WINDOW,
  standardHeaders: true,
  legacyHeaders: false,
  // Key by user id (set by requireAuth, which runs before this) so the limit is
  // per-account, not per-shared-IP. Fall back to IP if user is somehow absent.
  keyGenerator: (req) => (req.user && req.user.id ? `u:${req.user.id}` : req.ip),
  message: { error: '上传过于频繁，请稍后再试' },
});

// All routes below require a valid session.
router.use(requireAuth);

// --- Routes ----------------------------------------------------------------

/**
 * POST /api/composition/articles
 * Body: { title, prompt?, text, level }
 *   title  — required; trimmed; empty => 400; capped at MAX_TITLE_LEN chars.
 *   level  — required; must be one of VALID_LEVELS, else 400.
 *   prompt — optional 作文考题; capped at MAX_PROMPT_LEN chars.
 *   text   — required 正文; trimmed; capped at MAX_TEXT_LEN (truncation reported
 *            via `truncated`).
 * All uploads are public (is_public always stored as 1). Any client isPublic is
 * ignored. Returns { ok, article:{ id, title, prompt, level, isPublic, essay,
 * createdAt }, truncated }.
 */
router.post(
  '/articles',
  postLimiter,
  asyncHandler(async (req, res) => {
    const body = req.body || {};

    // title (required, capped at 40 chars).
    const rawTitle = body.title;
    if (typeof rawTitle !== 'string' || !rawTitle.trim()) {
      throw httpError(400, '请填写标题');
    }
    const title = rawTitle.trim().slice(0, MAX_TITLE_LEN);

    // level (required, must be a known 学段).
    const level = typeof body.level === 'string' ? body.level.trim() : '';
    if (!VALID_LEVELS.includes(level)) {
      throw httpError(400, '请选择学段');
    }

    // text (required 正文, capped at 3000 chars).
    const rawText = body.text;
    if (typeof rawText !== 'string' || !rawText.trim()) {
      throw httpError(400, '正文不能为空');
    }
    const trimmed = rawText.trim();
    const truncated = trimmed.length > MAX_TEXT_LEN;
    const text = truncated ? trimmed.slice(0, MAX_TEXT_LEN) : trimmed;

    // prompt (optional 作文考题, capped at 1000 chars).
    const prompt =
      typeof body.prompt === 'string' ? body.prompt.trim().slice(0, MAX_PROMPT_LEN) : '';

    // Unified public storage: ignore any client-supplied isPublic.
    const isPublic = 1;
    const essay = parseTextToEssay(text, title);
    const parsedData = JSON.stringify(essay);

    const now = Date.now();
    const { rows } = await query(
      `INSERT INTO composition_articles
         (user_id, title, prompt, level, original_text, parsed_data, is_public, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)
       RETURNING id, created_at`,
      [req.user.id, title, prompt, level, text, parsedData, isPublic, now]
    );

    const created = rows[0];
    res.json({
      ok: true,
      article: {
        id: Number(created.id),
        title,
        prompt,
        level,
        isPublic,
        essay,
        createdAt: Number(created.created_at),
      },
      truncated,
    });
  })
);

/**
 * GET /api/composition/articles
 * Returns a flat, de-duplicated, newest-first list under `articles`:
 *   articles = the caller's own articles (all) + OTHER users' public articles,
 *              each item { id, title, prompt, level, essay, ownerId, createdAt,
 *              isMine }. The public portion is capped at PUBLIC_LIST_LIMIT.
 * `mine`/`public` are retained for backward compatibility but the client now
 * uses `articles`.
 */
router.get(
  '/articles',
  asyncHandler(async (req, res) => {
    const userId = req.user.id;

    const mineResult = await query(
      `SELECT id, user_id, title, prompt, level, parsed_data, is_public, created_at
         FROM composition_articles
        WHERE user_id = $1
        ORDER BY created_at DESC`,
      [userId]
    );

    const publicResult = await query(
      `SELECT id, user_id, title, prompt, level, parsed_data, is_public, created_at
         FROM composition_articles
        WHERE is_public = 1 AND user_id <> $1
        ORDER BY created_at DESC
        LIMIT $2`,
      [userId, PUBLIC_LIST_LIMIT]
    );

    const mine = mineResult.rows.map((row) => rowToItem(row, userId));
    const publicItems = publicResult.rows.map((row) => rowToItem(row, userId));

    // Flat list: own first, then others' public, sorted newest-first overall.
    const articles = [...mine, ...publicItems].sort((a, b) => b.createdAt - a.createdAt);

    res.json({
      articles,
      // Backward-compatible fields (deprecated).
      mine,
      public: publicItems,
    });
  })
);

/**
 * PUT /api/composition/articles/:id — DEPRECATED.
 * Public/private toggling no longer exists: every upload is public. The endpoint
 * is retained only to return a clear, stable response; it performs no mutation.
 */
router.put(
  '/articles/:id',
  asyncHandler(async (req, res) => {
    parseId(req.params.id); // still validates the id shape (400 on garbage)
    throw httpError(410, '公开设置已统一，无需切换');
  })
);

/**
 * DELETE /api/composition/articles/:id
 * Deletes only the caller's own article.
 */
router.delete(
  '/articles/:id',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);

    const { rows } = await query(
      `DELETE FROM composition_articles
        WHERE id = $1 AND user_id = $2
        RETURNING id`,
      [id, req.user.id]
    );

    if (!rows[0]) {
      throw httpError(404, '文章不存在或无权限');
    }
    res.json({ ok: true });
  })
);

// --- 我的作文 (personal copies) -------------------------------------------
// Mounted at /api/composition/my. All rows are private to req.user.id.

/**
 * Validate + normalise the manual-create / edit fields. `partial` (PUT) only
 * validates the fields that are present; required-field checks are skipped.
 * Returns { title?, prompt?, level?, text?, truncated }.
 * @param {object} body
 * @param {boolean} partial
 */
function normalizeMyFields(body, partial) {
  const out = { truncated: false };

  // title — required on create; capped at 40 chars.
  if (body.title !== undefined || !partial) {
    const rawTitle = body.title;
    if (typeof rawTitle !== 'string' || !rawTitle.trim()) {
      throw httpError(400, '请填写标题');
    }
    out.title = rawTitle.trim().slice(0, MAX_TITLE_LEN);
  }

  // level — required on create; must be a known 学段 when present.
  if (body.level !== undefined || !partial) {
    const level = typeof body.level === 'string' ? body.level.trim() : '';
    if (!VALID_LEVELS.includes(level)) {
      throw httpError(400, '请选择学段');
    }
    out.level = level;
  }

  // prompt — optional; capped at 1000 chars.
  if (body.prompt !== undefined) {
    out.prompt =
      typeof body.prompt === 'string' ? body.prompt.trim().slice(0, MAX_PROMPT_LEN) : '';
  }

  // text — required on create; capped at 3000 chars (truncation reported).
  if (body.text !== undefined || !partial) {
    const rawText = body.text;
    if (typeof rawText !== 'string' || !rawText.trim()) {
      throw httpError(400, '正文不能为空');
    }
    const trimmed = rawText.trim();
    out.truncated = trimmed.length > MAX_TEXT_LEN;
    out.text = out.truncated ? trimmed.slice(0, MAX_TEXT_LEN) : trimmed;
  }

  return out;
}

/**
 * POST /api/composition/my
 * Two modes, selected by the presence of `sourceId` in the body:
 *  - TRANSFER  { sourceId }: copy a PUBLIC composition_articles row into the
 *    caller's my_articles (source_id = sourceId). 404 if no public source.
 *  - CREATE    { title, prompt?, text, level }: parse text locally and store a
 *    fresh personal copy (source_id = NULL). Returns { truncated }.
 * Returns { ok, article } where article is the new my_articles item.
 */
router.post(
  '/my',
  postLimiter,
  asyncHandler(async (req, res) => {
    const body = req.body || {};
    const now = Date.now();

    // TRANSFER mode — body carries a sourceId.
    if (body.sourceId !== undefined && body.sourceId !== null && body.sourceId !== '') {
      const sourceId = parseId(body.sourceId);

      const sourceResult = await query(
        `SELECT title, prompt, level, original_text, parsed_data
           FROM composition_articles
          WHERE id = $1 AND is_public = 1`,
        [sourceId]
      );
      const source = sourceResult.rows[0];
      if (!source) {
        throw httpError(404, '原文不存在或不可转存');
      }

      const { rows } = await query(
        `INSERT INTO my_articles
           (user_id, source_id, title, prompt, level, original_text, parsed_data, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)
         RETURNING id, source_id, title, prompt, level, parsed_data, created_at, updated_at`,
        [
          req.user.id,
          sourceId,
          source.title,
          source.prompt,
          source.level,
          source.original_text,
          source.parsed_data,
          now,
        ]
      );

      return res.json({ ok: true, article: myRowToItem(rows[0]) });
    }

    // MANUAL CREATE mode.
    const fields = normalizeMyFields(body, false);
    const essay = parseTextToEssay(fields.text, fields.title);
    const parsedData = JSON.stringify(essay);

    const { rows } = await query(
      `INSERT INTO my_articles
         (user_id, source_id, title, prompt, level, original_text, parsed_data, created_at, updated_at)
       VALUES ($1, NULL, $2, $3, $4, $5, $6, $7, $7)
       RETURNING id, source_id, title, prompt, level, parsed_data, created_at, updated_at`,
      [req.user.id, fields.title, fields.prompt || '', fields.level, fields.text, parsedData, now]
    );

    return res.json({ ok: true, article: myRowToItem(rows[0]), truncated: fields.truncated });
  })
);

/**
 * GET /api/composition/my
 * Returns the caller's own personal copies, newest-first:
 *   { articles: [ { id, sourceId, title, prompt, level, essay, createdAt, updatedAt } ] }
 */
router.get(
  '/my',
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `SELECT id, source_id, title, prompt, level, parsed_data, created_at, updated_at
         FROM my_articles
        WHERE user_id = $1
        ORDER BY created_at DESC`,
      [req.user.id]
    );
    res.json({ articles: rows.map(myRowToItem) });
  })
);

/**
 * PUT /api/composition/my/:id
 * Body { title?, prompt?, text?, level? } — partial update of the caller's own
 * row only. When `text` is provided it is re-parsed and parsed_data + original_text
 * are updated. 404 if the row is missing or not owned by the caller.
 * Returns { ok, article, truncated }.
 */
router.put(
  '/my/:id',
  postLimiter,
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const body = req.body || {};
    const fields = normalizeMyFields(body, true);

    // Build the SET list dynamically from the provided fields only (immutable).
    const sets = [];
    const params = [];
    const push = (col, val) => {
      params.push(val);
      sets.push(`${col} = $${params.length}`);
    };

    if (fields.title !== undefined) push('title', fields.title);
    if (fields.prompt !== undefined) push('prompt', fields.prompt);
    if (fields.level !== undefined) push('level', fields.level);
    if (fields.text !== undefined) {
      const essay = parseTextToEssay(fields.text, fields.title || '');
      push('original_text', fields.text);
      push('parsed_data', JSON.stringify(essay));
    }

    if (sets.length === 0) {
      throw httpError(400, '没有需要更新的字段');
    }

    push('updated_at', Date.now());

    // Owner filter ($id, $userId) appended last.
    params.push(id);
    const idIdx = params.length;
    params.push(req.user.id);
    const userIdx = params.length;

    const { rows } = await query(
      `UPDATE my_articles
          SET ${sets.join(', ')}
        WHERE id = $${idIdx} AND user_id = $${userIdx}
      RETURNING id, source_id, title, prompt, level, parsed_data, created_at, updated_at`,
      params
    );

    if (!rows[0]) {
      throw httpError(404, '文章不存在或无权限');
    }
    res.json({ ok: true, article: myRowToItem(rows[0]), truncated: fields.truncated });
  })
);

/**
 * DELETE /api/composition/my/:id — delete only the caller's own personal copy.
 * 404 if missing or not owned. Never affects the public original.
 */
router.delete(
  '/my/:id',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);

    const { rows } = await query(
      `DELETE FROM my_articles
        WHERE id = $1 AND user_id = $2
        RETURNING id`,
      [id, req.user.id]
    );

    if (!rows[0]) {
      throw httpError(404, '文章不存在或无权限');
    }
    res.json({ ok: true });
  })
);

module.exports = router;
