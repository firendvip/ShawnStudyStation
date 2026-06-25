'use strict';

// Admin AI provider settings (后台 AI 设置). All routes require an admin token
// (requireAuth + email allow-list). Mounted at /api/admin/ai-config.
//
// The API key is stored encrypted at rest and is NEVER returned in plaintext —
// reads return only hasKey + a masked preview.

const express = require('express');

const { httpError } = require('../middleware/errorHandler');
const { requireAdmin } = require('../middleware/requireAdmin');
const { getAiSettings, setAiSettings } = require('../lib/aiConfig');

const router = express.Router();

router.use(...requireAdmin);

const VALID_PROVIDERS = Object.freeze(['anthropic', 'openai']);
const DEFAULT_PROVIDER = 'anthropic';
const MASK_FULL_MIN = 7; // keys ≥7 chars get first3...last4; shorter get '***'

/**
 * Wrap an async route handler so rejected promises reach Express's error
 * handler via next(err).
 */
function asyncHandler(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

/** Build a non-reversible masked preview of an API key. NEVER returns plaintext. */
function maskKey(apiKey) {
  if (typeof apiKey !== 'string' || apiKey.length === 0) return '';
  if (apiKey.length >= MASK_FULL_MIN) {
    return `${apiKey.slice(0, 3)}...${apiKey.slice(-4)}`;
  }
  return '***';
}

/** Project the current settings into the safe wire shape (no plaintext key). */
async function publicView() {
  const { provider, model, apiKey } = await getAiSettings();
  return {
    provider,
    model,
    hasKey: Boolean(apiKey),
    keyMasked: maskKey(apiKey),
  };
}

/**
 * GET /api/admin/ai-config
 * Returns { provider, model, hasKey, keyMasked }. Never returns the plaintext key.
 */
router.get(
  '/',
  asyncHandler(async (_req, res) => {
    res.json(await publicView());
  })
);

/**
 * PUT /api/admin/ai-config
 * Body { provider?, apiKey?, model? }.
 *   provider — must be a known provider when present; defaults to 'anthropic'.
 *   model    — optional string.
 *   apiKey   — optional; when absent/empty the existing key is kept.
 * Returns the same shape as GET (re-read after write). NEVER logs the key.
 */
router.put(
  '/',
  asyncHandler(async (req, res) => {
    const body = req.body || {};

    let provider = DEFAULT_PROVIDER;
    if (body.provider !== undefined) {
      const p = typeof body.provider === 'string' ? body.provider.trim() : '';
      if (!VALID_PROVIDERS.includes(p)) {
        throw httpError(400, 'AI 提供商无效');
      }
      provider = p;
    }

    const model = typeof body.model === 'string' ? body.model.trim() : '';
    const apiKey = typeof body.apiKey === 'string' ? body.apiKey.trim() : '';

    await setAiSettings({ provider, model, apiKey });
    res.json(await publicView());
  })
);

module.exports = router;
