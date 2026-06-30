'use strict';

// 英语作文 / 英读书屋 — custom article + book upload with an admin review workflow.
// Mounted at /api/composition. All routes require authentication.
//
// Data layer: PostgreSQL via the `pg` pool. All queries are async and
// parameterised ($1, $2 ...). user_id is always enforced server-side so users
// can only mutate their own rows; readers see approved content + their own.
//
// Parsing is split in two: parseTextToEssay() does local, AI-free tokenisation
// (synchronous, no external calls), producing the essay skeleton. aiEnrich() is
// a SEPARATE async step, called only on admin approve/reprocess, that fills the
// AI-only fields (m/p/us/uk, chunks, normal) via the configured provider.

const express = require('express');
const rateLimit = require('express-rate-limit');

const { query } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { httpError } = require('../middleware/errorHandler');
const { getAiSettings } = require('../lib/aiConfig');

const router = express.Router();

// Per-router body limit: composition accepts larger payloads than the global
// 1mb (books can be up to MAX_BOOK_TEXT_LEN = 200000 chars plus the parsed essay
// JSON). The global app.use(express.json({ limit: '1mb' })) still applies
// everywhere else; this 2mb override is scoped to /api/composition only.
router.use(express.json({ limit: '2mb' }));

// --- Constants ---

const MAX_TEXT_LEN = 3000; // composition 正文 cap (DoS guard + product limit)
const MAX_BOOK_TEXT_LEN = 200000; // 书籍正文 cap
const MAX_TITLE_LEN = 40; // hard cap on title (truncated if longer)
const MAX_PROMPT_LEN = 1000; // hard cap on 作文考题 (truncated if longer)
const LIST_LIMIT = 500;
const RATE_WINDOW_MS = 60 * 1000; // 1 minute
const POST_MAX_PER_WINDOW = 10; // ≤10 uploads per user per minute

// Allowed 学段 (level) values for compositions.
const VALID_LEVELS = Object.freeze(['小学', '初中', '高中', '大学']);
// Allowed 书籍难度 (book_level) values for books.
const VALID_BOOK_LEVELS = Object.freeze(['桥梁', '初章', '中章', '高章']);
// Allowed content types.
const VALID_CONTENT_TYPES = Object.freeze(['composition', 'book']);
// 收藏合集（多篇范文打包成一条收藏）的最大篇数 — DoS guard.
const MAX_COLLECTION_ITEMS = 200;

// aiEnrich tuning.
const AI_BATCH_SIZE = 10; // sentences per model call
const AI_MAX_SENTENCES = 400; // only enrich the first N sentences (cost guard)
const AI_TIMEOUT_MS = 60 * 1000; // per-call timeout
const AI_MAX_TOKENS = 4096;

/**
 * Wrap an async route handler so any rejected promise reaches Express's error
 * handler via next(err). Keeps handlers free of repetitive try/catch.
 * @param {Function} handler
 * @returns {Function}
 */
function asyncHandler(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

// --- Local (AI-free) parsing ----------------------------------------------

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
 * Does NOT call aiEnrich — enrichment is a separate async step run on approval.
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
  return { title, sentences };
}

// --- AI enrichment ---------------------------------------------------------

/** Reconstruct the source sentence text from a parsed sentence's tokens. */
function sentenceText(sentence) {
  if (!sentence || !Array.isArray(sentence.tokens)) return '';
  return sentence.tokens.map((t) => t.w).join(' ');
}

/**
 * Tolerant JSON-array extraction from a model response. Strips ```json fences
 * and isolates the outermost [ ... ]. Returns the parsed array or null.
 * @param {string} raw
 * @returns {Array|null}
 */
function tolerantParseArray(raw) {
  if (typeof raw !== 'string') return null;
  let s = raw.trim();
  s = s.replace(/```json/gi, '').replace(/```/g, '').trim();
  const start = s.indexOf('[');
  const end = s.lastIndexOf(']');
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    const parsed = JSON.parse(s.slice(start, end + 1));
    return Array.isArray(parsed) ? parsed : null;
  } catch (_err) {
    return null;
  }
}

/** Build the strict-JSON instruction shared by both providers. */
function buildEnrichSystemPrompt() {
  return [
    '你是英语精读标注助手。严格只输出 JSON，不要任何解释、前言或代码围栏。',
    '输入是若干英文句子（按顺序）。输出一个 JSON 数组，长度与输入句子数完全相同，顺序一一对应。',
    '数组每个元素对应一句，结构为：',
    '{ "tokens": [{"w":"原词","m":"中文释义","p":"词性","us":"美音标","uk":"英音标"}], "chunks": [{"en":"意群英文","zh":"意群中文"}], "normal":"整句中文翻译" }',
    'tokens 的 w 必须与输入该句的单词顺序、数量保持一致（含标点）。',
    'm=中文释义, p=词性, us=美式音标, uk=英式音标, chunks=意群划分, normal=整句中文翻译。',
    '只输出 JSON 数组本身。',
  ].join('\n');
}

/** Build the user content listing the batch sentences for the model. */
function buildEnrichUserContent(batch) {
  const lines = batch.map((sentence, i) => {
    const text = sentence.normal && sentence.normal.trim() ? sentence.normal : sentenceText(sentence);
    return `${i + 1}. ${text}`;
  });
  return `请标注下面 ${batch.length} 个句子，输出长度为 ${batch.length} 的 JSON 数组：\n${lines.join('\n')}`;
}

/** Merge one enriched object into a base sentence, immutably & defensively. */
function mergeSentence(base, enriched) {
  if (!enriched || typeof enriched !== 'object') return base;
  const tokens = Array.isArray(enriched.tokens) && enriched.tokens.length
    ? enriched.tokens.map((t, i) => {
        const orig = base.tokens[i] || {};
        return {
          w: typeof t.w === 'string' && t.w ? t.w : orig.w || '',
          m: typeof t.m === 'string' ? t.m : '',
          p: typeof t.p === 'string' ? t.p : '',
          us: typeof t.us === 'string' ? t.us : '',
          uk: typeof t.uk === 'string' ? t.uk : '',
        };
      })
    : base.tokens;
  const chunks = Array.isArray(enriched.chunks)
    ? enriched.chunks
        .filter((c) => c && typeof c === 'object')
        .map((c) => ({ en: typeof c.en === 'string' ? c.en : '', zh: typeof c.zh === 'string' ? c.zh : '' }))
    : base.chunks;
  const normal = typeof enriched.normal === 'string' ? enriched.normal : base.normal;
  return { tokens, chunks, normal };
}

/** Call the Anthropic Messages API for one batch; returns the raw text or ''. */
async function callAnthropic({ apiKey, model, system, content }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);
  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: model || 'claude-opus-4-8',
        max_tokens: AI_MAX_TOKENS,
        system,
        messages: [{ role: 'user', content }],
      }),
    });
    if (!resp.ok) return '';
    const data = await resp.json();
    return (data && data.content && data.content[0] && data.content[0].text) || '';
  } finally {
    clearTimeout(timer);
  }
}

/** Call the OpenAI Chat Completions API for one batch; returns the raw text or ''. */
async function callOpenAi({ apiKey, model, system, content }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);
  try {
    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: model || 'gpt-4o-mini',
        max_tokens: AI_MAX_TOKENS,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content },
        ],
      }),
    });
    if (!resp.ok) return '';
    const data = await resp.json();
    return (data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '';
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Enrich an essay via the configured AI provider. Throws Error('AI_NOT_CONFIGURED')
 * when no key is set. Order-preserving: each batch maps back to its exact source
 * indices; a failed/garbled batch leaves those sentences unchanged. Only the
 * first AI_MAX_SENTENCES sentences are enriched. Returns a NEW essay object.
 * The API key is NEVER logged or surfaced in any error/response.
 * @param {{title: string, sentences: Array}} essay
 * @param {string} _text original source text (unused; context lives in tokens)
 * @returns {Promise<{title: string, sentences: Array}>}
 */
async function aiEnrich(essay, _text) {
  const { provider, model, apiKey } = await getAiSettings();
  if (!apiKey) {
    throw new Error('AI_NOT_CONFIGURED');
  }

  const sentences = Array.isArray(essay.sentences) ? essay.sentences : [];
  const newSentences = sentences.slice();
  const enrichCount = Math.min(newSentences.length, AI_MAX_SENTENCES);

  for (let start = 0; start < enrichCount; start += AI_BATCH_SIZE) {
    const end = Math.min(start + AI_BATCH_SIZE, enrichCount);
    const batch = newSentences.slice(start, end);
    const system = buildEnrichSystemPrompt();
    const content = buildEnrichUserContent(batch);

    let raw = '';
    if (provider === 'anthropic') {
      raw = await callAnthropic({ apiKey, model, system, content });
    } else if (provider === 'openai') {
      raw = await callOpenAi({ apiKey, model, system, content });
    } else {
      throw new Error('OPENAI_NOT_IMPLEMENTED');
    }

    const arr = tolerantParseArray(raw);
    if (!arr) continue; // batch failed — leave these sentences unchanged

    for (let i = 0; i < batch.length; i += 1) {
      if (arr[i]) {
        newSentences[start + i] = mergeSentence(newSentences[start + i], arr[i]);
      }
    }
  }

  return { title: essay.title, sentences: newSentences };
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
 * Map a composition_articles DB row to the flat wire shape returned to readers.
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
    bookLevel: row.book_level || '',
    contentType: row.content_type || 'composition',
    status: row.status || 'approved',
    essay: parseEssay(row.parsed_data),
    ownerId: Number(row.user_id),
    createdAt: Number(row.created_at),
    isMine: Number(row.user_id) === Number(currentUserId),
  };
}

/**
 * Pull the `items` array out of a collection row's parsed_data blob.
 * Stored shape: { items: [{ title, prompt, level, essay }, ...] }.
 * Tolerates bad/missing data by returning [].
 * @param {string} parsedData
 * @returns {Array}
 */
function parseCollectionItems(parsedData) {
  try {
    const obj = JSON.parse(parsedData);
    return obj && Array.isArray(obj.items) ? obj.items : [];
  } catch (_err) {
    return [];
  }
}

/**
 * Map a my_articles DB row to the wire shape for the 我的作文/收藏 list/item.
 * Collection rows (content_type='collection') return an `items` array instead of
 * a single `essay`; regular rows keep the flat essay shape (unchanged).
 * @param {object} row
 */
function myRowToItem(row) {
  const contentType = row.content_type || 'composition';
  if (contentType === 'collection') {
    return {
      id: Number(row.id),
      sourceId: row.source_id == null ? null : Number(row.source_id),
      title: row.title,
      contentType: 'collection',
      items: parseCollectionItems(row.parsed_data),
      createdAt: Number(row.created_at),
      updatedAt: Number(row.updated_at),
    };
  }
  return {
    id: Number(row.id),
    sourceId: row.source_id == null ? null : Number(row.source_id),
    title: row.title,
    prompt: row.prompt || '',
    level: row.level || '',
    bookLevel: row.book_level || '',
    contentType,
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

/**
 * Normalise + cap a content type's raw text. Returns { text, truncated }.
 * @param {string} rawText
 * @param {number} cap
 */
function capText(rawText, cap) {
  if (typeof rawText !== 'string' || !rawText.trim()) {
    throw httpError(400, '正文不能为空');
  }
  const trimmed = rawText.trim();
  const truncated = trimmed.length > cap;
  return { text: truncated ? trimmed.slice(0, cap) : trimmed, truncated };
}

// --- Rate limiter (per authenticated user) ---------------------------------

const postLimiter = rateLimit({
  windowMs: RATE_WINDOW_MS,
  max: POST_MAX_PER_WINDOW,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (req.user && req.user.id ? `u:${req.user.id}` : req.ip),
  message: { error: '上传过于频繁，请稍后再试' },
});

// All routes below require a valid session.
router.use(requireAuth);

// --- Routes ----------------------------------------------------------------

/**
 * POST /api/composition/articles
 * Body: { contentType, title, level?, bookLevel?, prompt?, text }
 *   contentType — required; 'composition' | 'book'.
 *   title       — required; trimmed; capped at MAX_TITLE_LEN.
 *   composition — level required (VALID_LEVELS); prompt optional; text ≤3000.
 *   book        — bookLevel required (VALID_BOOK_LEVELS); prompt ignored; text ≤200000.
 *   text        — required 正文; truncation reported via `truncated`.
 * Stored as status='pending', is_public=1, ai_done=0 — enriched only on approval.
 * Returns { ok, article:{ id, title, contentType, level, bookLevel, status,
 * essay, createdAt }, truncated }.
 */
router.post(
  '/articles',
  postLimiter,
  asyncHandler(async (req, res) => {
    const body = req.body || {};

    // contentType (required, known).
    const contentType = typeof body.contentType === 'string' ? body.contentType.trim() : '';
    if (!VALID_CONTENT_TYPES.includes(contentType)) {
      throw httpError(400, '内容类型无效');
    }

    // title (required, capped).
    const rawTitle = body.title;
    if (typeof rawTitle !== 'string' || !rawTitle.trim()) {
      throw httpError(400, '请填写标题');
    }
    const title = rawTitle.trim().slice(0, MAX_TITLE_LEN);

    let level = null;
    let bookLevel = null;
    let prompt = '';
    let textCap = MAX_TEXT_LEN;

    if (contentType === 'composition') {
      const lvl = typeof body.level === 'string' ? body.level.trim() : '';
      if (!VALID_LEVELS.includes(lvl)) {
        throw httpError(400, '请选择学段');
      }
      level = lvl;
      prompt = typeof body.prompt === 'string' ? body.prompt.trim().slice(0, MAX_PROMPT_LEN) : '';
      textCap = MAX_TEXT_LEN;
    } else {
      const bl = typeof body.bookLevel === 'string' ? body.bookLevel.trim() : '';
      if (!VALID_BOOK_LEVELS.includes(bl)) {
        throw httpError(400, '请选择书籍难度');
      }
      bookLevel = bl;
      prompt = ''; // prompt is ignored for books
      textCap = MAX_BOOK_TEXT_LEN;
    }

    const { text, truncated } = capText(body.text, textCap);
    const essay = parseTextToEssay(text, title);
    const parsedData = JSON.stringify(essay);

    const now = Date.now();
    const { rows } = await query(
      `INSERT INTO composition_articles
         (user_id, title, prompt, level, book_level, content_type, status,
          original_text, source_text, parsed_data, is_public, ai_done, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7, $7, $8, 1, 0, $9, $9)
       RETURNING id, created_at`,
      [req.user.id, title, prompt, level, bookLevel, contentType, text, parsedData, now]
    );

    const created = rows[0];
    res.json({
      ok: true,
      article: {
        id: Number(created.id),
        title,
        contentType,
        level: level || '',
        bookLevel: bookLevel || '',
        status: 'pending',
        essay,
        createdAt: Number(created.created_at),
      },
      truncated,
    });
  })
);

/**
 * GET /api/composition/articles
 * Returns a flat, de-duplicated, newest-first list under `articles`: every
 * approved article PLUS the caller's own (any status). Each item:
 *   { id, title, prompt, level, bookLevel, contentType, status, essay, ownerId,
 *     createdAt, isMine }.
 * `mine`/`public` are retained for backward compatibility.
 */
router.get(
  '/articles',
  asyncHandler(async (req, res) => {
    const userId = req.user.id;

    const { rows } = await query(
      `SELECT id, user_id, title, prompt, level, book_level, content_type, status,
              parsed_data, created_at
         FROM composition_articles
        WHERE status = 'approved' OR user_id = $1
        ORDER BY created_at DESC
        LIMIT $2`,
      [userId, LIST_LIMIT]
    );

    // Dedup by id (a row could match both predicates only once anyway).
    const seen = new Set();
    const articles = [];
    for (const row of rows) {
      const id = Number(row.id);
      if (seen.has(id)) continue;
      seen.add(id);
      articles.push(rowToItem(row, userId));
    }

    const mine = articles.filter((a) => a.isMine);
    const publicItems = articles.filter((a) => !a.isMine);

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
 * Public/private toggling no longer exists. Retained to return a stable 410.
 */
router.put(
  '/articles/:id',
  asyncHandler(async (req, res) => {
    parseId(req.params.id); // still validates the id shape (400 on garbage)
    throw httpError(410, '公开设置已统一，无需切换');
  })
);

/**
 * DELETE /api/composition/articles/:id — deletes only the caller's own article.
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

// --- 我的作文 / 收藏 (personal copies) -------------------------------------
// Mounted at /api/composition/my. All rows are private to req.user.id.

/**
 * Validate + normalise the manual-create / edit fields. `partial` (PUT) only
 * validates the fields that are present; required-field checks are skipped.
 * Handles both composition (level + 3000 cap) and book (bookLevel + 200000 cap).
 * Returns { contentType?, title?, prompt?, level?, bookLevel?, text?, truncated }.
 * @param {object} body
 * @param {boolean} partial
 * @param {string} [knownType] resolved content type (for partial book/comp caps)
 */
function normalizeMyFields(body, partial, knownType) {
  const out = { truncated: false };

  // contentType — required on create; defaults to 'composition'.
  let contentType = knownType;
  if (body.contentType !== undefined || !partial) {
    const ct = typeof body.contentType === 'string' ? body.contentType.trim() : '';
    if (!partial && !VALID_CONTENT_TYPES.includes(ct)) {
      throw httpError(400, '内容类型无效');
    }
    if (VALID_CONTENT_TYPES.includes(ct)) {
      contentType = ct;
      out.contentType = ct;
    }
  }
  if (!contentType) contentType = 'composition';
  const isBook = contentType === 'book';

  // title — required on create; capped.
  if (body.title !== undefined || !partial) {
    const rawTitle = body.title;
    if (typeof rawTitle !== 'string' || !rawTitle.trim()) {
      throw httpError(400, '请填写标题');
    }
    out.title = rawTitle.trim().slice(0, MAX_TITLE_LEN);
  }

  // level / bookLevel — required on create depending on content type.
  if (isBook) {
    if (body.bookLevel !== undefined || !partial) {
      const bl = typeof body.bookLevel === 'string' ? body.bookLevel.trim() : '';
      if (!VALID_BOOK_LEVELS.includes(bl)) {
        throw httpError(400, '请选择书籍难度');
      }
      out.bookLevel = bl;
    }
  } else if (body.level !== undefined || !partial) {
    const level = typeof body.level === 'string' ? body.level.trim() : '';
    if (!VALID_LEVELS.includes(level)) {
      throw httpError(400, '请选择学段');
    }
    out.level = level;
  }

  // prompt — optional; capped. (Books store '' but we don't reject it.)
  if (body.prompt !== undefined) {
    out.prompt =
      typeof body.prompt === 'string' && !isBook ? body.prompt.trim().slice(0, MAX_PROMPT_LEN) : '';
  }

  // text — required on create; capped per content type (truncation reported).
  if (body.text !== undefined || !partial) {
    const cap = isBook ? MAX_BOOK_TEXT_LEN : MAX_TEXT_LEN;
    const capped = capText(body.text, cap);
    out.text = capped.text;
    out.truncated = capped.truncated;
  }

  out.contentType = contentType;
  return out;
}

/**
 * POST /api/composition/my
 * Two modes, selected by the presence of `sourceId` in the body:
 *  - FAVORITE   { sourceId }: copy an APPROVED composition_articles row into the
 *    caller's my_articles (source_id = sourceId). 409 if already favorited;
 *    404 if no approved source.
 *  - MANUAL     { contentType, title, ..., text }: parse locally + store a fresh
 *    personal copy (source_id = NULL). Returns { truncated }.
 * Returns { ok, article } where article is the new my_articles item.
 */
router.post(
  '/my',
  postLimiter,
  asyncHandler(async (req, res) => {
    const body = req.body || {};
    const now = Date.now();

    // COLLECTION mode — body.contentType === 'collection' (favorite a whole pack
    // of essays as ONE row). Deduped per user by title (one collection only once).
    if (typeof body.contentType === 'string' && body.contentType.trim() === 'collection') {
      const rawTitle = body.title;
      if (typeof rawTitle !== 'string' || !rawTitle.trim()) {
        throw httpError(400, '请填写合集名称');
      }
      const title = rawTitle.trim().slice(0, MAX_TITLE_LEN);

      if (!Array.isArray(body.items) || body.items.length === 0) {
        throw httpError(400, '合集内容不能为空');
      }
      if (body.items.length > MAX_COLLECTION_ITEMS) {
        throw httpError(400, '合集篇数过多');
      }

      // Normalise items defensively: keep only well-formed entries with an essay.
      const items = body.items
        .filter((it) => it && typeof it === 'object' && it.essay && typeof it.essay === 'object')
        .map((it) => ({
          title: typeof it.title === 'string' ? it.title.slice(0, MAX_TITLE_LEN) : '',
          prompt: typeof it.prompt === 'string' ? it.prompt.slice(0, MAX_PROMPT_LEN) : '',
          level: VALID_LEVELS.includes(it.level) ? it.level : '高中',
          essay: it.essay,
        }));
      if (items.length === 0) {
        throw httpError(400, '合集内容无效');
      }

      // Dedup: same user + same collection title already exists → 409.
      const dup = await query(
        "SELECT 1 FROM my_articles WHERE user_id = $1 AND content_type = 'collection' AND title = $2",
        [req.user.id, title]
      );
      if (dup.rows[0]) {
        throw httpError(409, '已收藏');
      }

      const parsedData = JSON.stringify({ items });
      const { rows } = await query(
        `INSERT INTO my_articles
           (user_id, source_id, title, prompt, level, book_level, content_type,
            original_text, parsed_data, created_at, updated_at)
         VALUES ($1, NULL, $2, '', NULL, NULL, 'collection', '', $3, $4, $4)
         RETURNING id, source_id, title, prompt, level, book_level, content_type,
                   parsed_data, created_at, updated_at`,
        [req.user.id, title, parsedData, now]
      );
      return res.json({ ok: true, article: myRowToItem(rows[0]) });
    }

    // FAVORITE mode — body carries a sourceId.
    if (body.sourceId !== undefined && body.sourceId !== null && body.sourceId !== '') {
      const sourceId = parseId(body.sourceId);

      // Already favorited?
      const existing = await query(
        'SELECT 1 FROM my_articles WHERE user_id = $1 AND source_id = $2',
        [req.user.id, sourceId]
      );
      if (existing.rows[0]) {
        throw httpError(409, '已收藏');
      }

      const sourceResult = await query(
        `SELECT title, prompt, level, book_level, content_type, original_text, source_text, parsed_data
           FROM composition_articles
          WHERE id = $1 AND status = 'approved'`,
        [sourceId]
      );
      const source = sourceResult.rows[0];
      if (!source) {
        throw httpError(404, '原文不存在或不可收藏');
      }

      try {
        const { rows } = await query(
          `INSERT INTO my_articles
             (user_id, source_id, title, prompt, level, book_level, content_type,
              original_text, parsed_data, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10)
           RETURNING id, source_id, title, prompt, level, book_level, content_type,
                     parsed_data, created_at, updated_at`,
          [
            req.user.id,
            sourceId,
            source.title,
            source.prompt,
            source.level,
            source.book_level,
            source.content_type,
            source.original_text,
            source.parsed_data,
            now,
          ]
        );
        return res.json({ ok: true, article: myRowToItem(rows[0]) });
      } catch (err) {
        if (err && err.code === '23505') {
          throw httpError(409, '已收藏');
        }
        throw err;
      }
    }

    // MANUAL CREATE mode.
    const fields = normalizeMyFields(body, false);
    const essay = parseTextToEssay(fields.text, fields.title);
    const parsedData = JSON.stringify(essay);

    const { rows } = await query(
      `INSERT INTO my_articles
         (user_id, source_id, title, prompt, level, book_level, content_type,
          original_text, parsed_data, created_at, updated_at)
       VALUES ($1, NULL, $2, $3, $4, $5, $6, $7, $8, $9, $9)
       RETURNING id, source_id, title, prompt, level, book_level, content_type,
                 parsed_data, created_at, updated_at`,
      [
        req.user.id,
        fields.title,
        fields.prompt || '',
        fields.level || null,
        fields.bookLevel || null,
        fields.contentType,
        fields.text,
        parsedData,
        now,
      ]
    );

    return res.json({ ok: true, article: myRowToItem(rows[0]), truncated: fields.truncated });
  })
);

/**
 * GET /api/composition/my
 * Returns the caller's own personal copies, newest-first:
 *   { articles: [ { id, sourceId, title, prompt, level, bookLevel, contentType,
 *     essay, createdAt, updatedAt } ] }
 */
router.get(
  '/my',
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `SELECT id, source_id, title, prompt, level, book_level, content_type,
              parsed_data, created_at, updated_at
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
 * Body { title?, prompt?, text?, level?, bookLevel? } — partial update of the
 * caller's own MANUAL row only. Favorited rows (source_id NOT NULL) are read-only
 * (403). When `text` is provided it is re-parsed (cap depends on content_type).
 * 404 if missing/not owned. Returns { ok, article, truncated }.
 */
router.put(
  '/my/:id',
  postLimiter,
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const body = req.body || {};

    // Look up ownership + source/content_type first.
    const lookup = await query(
      'SELECT source_id, content_type FROM my_articles WHERE id = $1 AND user_id = $2',
      [id, req.user.id]
    );
    const existing = lookup.rows[0];
    if (!existing) {
      throw httpError(404, '文章不存在或无权限');
    }
    if (existing.source_id !== null && existing.source_id !== undefined) {
      throw httpError(403, '收藏的内容不可编辑');
    }
    // Collections are favorite-only packs — read-only (no editing).
    if (existing.content_type === 'collection') {
      throw httpError(403, '收藏的内容不可编辑');
    }

    const fields = normalizeMyFields(body, true, existing.content_type || 'composition');

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
    if (fields.bookLevel !== undefined) push('book_level', fields.bookLevel);
    if (fields.text !== undefined) {
      const essay = parseTextToEssay(fields.text, fields.title || '');
      push('original_text', fields.text);
      push('parsed_data', JSON.stringify(essay));
    }

    if (sets.length === 0) {
      throw httpError(400, '没有需要更新的字段');
    }

    push('updated_at', Date.now());

    params.push(id);
    const idIdx = params.length;
    params.push(req.user.id);
    const userIdx = params.length;

    const { rows } = await query(
      `UPDATE my_articles
          SET ${sets.join(', ')}
        WHERE id = $${idIdx} AND user_id = $${userIdx}
      RETURNING id, source_id, title, prompt, level, book_level, content_type,
                parsed_data, created_at, updated_at`,
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
 * (Favorite => unfavorite, manual => delete.) 404 if missing or not owned.
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
// Internal helpers exposed for the admin review router (aiEnrich on approve etc.).
module.exports._internals = { aiEnrich, parseTextToEssay, parseEssay };
