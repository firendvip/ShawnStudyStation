'use strict';

// Admin review workflow (后台审核) for 英读书屋 uploads. All routes require an
// admin token (requireAuth + email allow-list). Mounted at /api/admin/review.
//
// Approval is persisted FIRST (status='approved') so the article goes live even
// if AI enrichment fails or is unconfigured; aiEnrich() then best-effort fills
// the essay and sets ai_done=1 on success. Failures degrade gracefully with an
// aiWarning rather than blocking approval.

const express = require('express');

const { query } = require('../db');
const { httpError } = require('../middleware/errorHandler');
const { requireAdmin } = require('../middleware/requireAdmin');
const { _internals } = require('./composition');

const { aiEnrich } = _internals;

const router = express.Router();

router.use(...requireAdmin);

const TEXT_PREVIEW_LEN = 200;
const MAX_NOTES_LEN = 1000;
const AI_WARNING = 'AI未配置/失败,已通过但未做意群划分,可配置密钥后重试';

/**
 * Wrap an async route handler so rejected promises reach Express's error
 * handler via next(err).
 */
function asyncHandler(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

/** Validate and normalise the :id route param to a positive integer. */
function parseId(raw) {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) {
    throw httpError(400, '无效的文章 ID');
  }
  return id;
}

/** Tolerant essay parse from a stored parsed_data blob. */
function parseEssay(parsedData) {
  try {
    return JSON.parse(parsedData);
  } catch (_err) {
    return { title: '', sentences: [] };
  }
}

/**
 * Best-effort enrichment of a stored article's essay. Updates parsed_data +
 * ai_done on success. Never throws — returns { aiDone, aiWarning? }.
 * @param {number} id
 * @param {object} essay parsed essay object
 * @param {string} sourceText raw source text (for context)
 */
async function enrichAndPersist(id, essay, sourceText) {
  try {
    const enriched = await aiEnrich(essay, sourceText);
    await query(
      'UPDATE composition_articles SET parsed_data = $1, ai_done = 1 WHERE id = $2',
      [JSON.stringify(enriched), id]
    );
    return { aiDone: 1 };
  } catch (_err) {
    // AI_NOT_CONFIGURED, network/timeout, provider error — leave ai_done=0.
    return { aiDone: 0, aiWarning: AI_WARNING };
  }
}

/**
 * GET /api/admin/review/pending
 * Lists all pending submissions, newest-first, with an owner email + preview.
 */
router.get(
  '/pending',
  asyncHandler(async (_req, res) => {
    const { rows } = await query(
      `SELECT c.id, c.title, c.content_type, c.level, c.book_level, c.user_id,
              u.email AS owner_email, c.created_at, c.source_text, c.original_text
         FROM composition_articles c
         JOIN users u ON u.id = c.user_id
        WHERE c.status = 'pending'
        ORDER BY c.created_at DESC`
    );
    res.json(
      rows.map((r) => {
        const text = r.source_text || r.original_text || '';
        return {
          id: Number(r.id),
          title: r.title,
          contentType: r.content_type || 'composition',
          level: r.level || '',
          bookLevel: r.book_level || '',
          ownerId: Number(r.user_id),
          ownerEmail: r.owner_email,
          createdAt: Number(r.created_at),
          textPreview: text.slice(0, TEXT_PREVIEW_LEN),
        };
      })
    );
  })
);

/**
 * GET /api/admin/review/:id — full detail of one submission for review.
 */
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const { rows } = await query(
      `SELECT id, title, prompt, source_text, original_text, content_type,
              level, book_level, status, parsed_data
         FROM composition_articles
        WHERE id = $1`,
      [id]
    );
    const row = rows[0];
    if (!row) {
      throw httpError(404, '文章不存在');
    }
    res.json({
      id: Number(row.id),
      title: row.title,
      prompt: row.prompt || '',
      text: row.source_text || row.original_text || '',
      contentType: row.content_type || 'composition',
      level: row.level || '',
      bookLevel: row.book_level || '',
      status: row.status || 'pending',
      essay: parseEssay(row.parsed_data),
    });
  })
);

/**
 * PUT /api/admin/review/:id/approve
 * Persists status='approved' FIRST, then best-effort aiEnrich. Returns
 * { ok, status:'approved', aiDone, aiWarning? }.
 */
router.put(
  '/:id/approve',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);

    const { rows } = await query(
      'SELECT id, parsed_data, source_text, original_text FROM composition_articles WHERE id = $1',
      [id]
    );
    const row = rows[0];
    if (!row) {
      throw httpError(404, '文章不存在');
    }

    // Persist approval first so it goes live regardless of AI outcome.
    await query('UPDATE composition_articles SET status = $1, updated_at = $2 WHERE id = $3', [
      'approved',
      Date.now(),
      id,
    ]);

    const essay = parseEssay(row.parsed_data);
    const sourceText = row.source_text || row.original_text || '';
    const aiResult = await enrichAndPersist(id, essay, sourceText);

    res.json({ ok: true, status: 'approved', ...aiResult });
  })
);

/**
 * PUT /api/admin/review/:id/reject
 * Body { notes? } — sets status='rejected' + review_notes (capped).
 * Returns { ok, status:'rejected' }.
 */
router.put(
  '/:id/reject',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const body = req.body || {};
    const notes = typeof body.notes === 'string' ? body.notes.slice(0, MAX_NOTES_LEN) : '';

    const { rows } = await query(
      `UPDATE composition_articles
          SET status = 'rejected', review_notes = $1, updated_at = $2
        WHERE id = $3
        RETURNING id`,
      [notes, Date.now(), id]
    );
    if (!rows[0]) {
      throw httpError(404, '文章不存在');
    }
    res.json({ ok: true, status: 'rejected' });
  })
);

/**
 * PUT /api/admin/review/:id/reprocess
 * Re-runs aiEnrich on any existing article (any status). Returns
 * { ok, aiDone, aiWarning? }.
 */
router.put(
  '/:id/reprocess',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);

    const { rows } = await query(
      'SELECT id, parsed_data, source_text, original_text FROM composition_articles WHERE id = $1',
      [id]
    );
    const row = rows[0];
    if (!row) {
      throw httpError(404, '文章不存在');
    }

    const essay = parseEssay(row.parsed_data);
    const sourceText = row.source_text || row.original_text || '';
    const aiResult = await enrichAndPersist(id, essay, sourceText);

    res.json({ ok: true, ...aiResult });
  })
);

module.exports = router;
