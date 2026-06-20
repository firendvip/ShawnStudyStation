'use strict';

// Authentication routes: email code delivery, registration, login, and identity.
// Mounted at /api/auth.

const express = require('express');
const rateLimit = require('express-rate-limit');

const { query, getClient } = require('../db');
const { config } = require('../config');
const codes = require('../lib/codes');
const { sendEmailCode } = require('../lib/email');
const { hashPassword, verifyPassword } = require('../lib/password');
const { signToken } = require('../lib/token');
const { requireAuth } = require('../middleware/auth');
const { httpError } = require('../middleware/errorHandler');
const {
  validateEmail,
  normalizeEmail,
  validatePassword,
  validateCode,
  validatePurpose,
} = require('../lib/validate');

const router = express.Router();

const RATE_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const SEND_CODE_MAX = 20;
const AUTH_MAX = 30;
const MAX_SENDS_PER_HOUR = 5;
const TOO_MANY_REQUESTS = 429;

// IP-level limiters layered on top of per-email limits enforced in codes.js.
const sendCodeLimiter = rateLimit({
  windowMs: RATE_WINDOW_MS,
  max: SEND_CODE_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: '请求过于频繁，请稍后再试' },
});

const authLimiter = rateLimit({
  windowMs: RATE_WINDOW_MS,
  max: AUTH_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: '请求过于频繁，请稍后再试' },
});

/**
 * Look up a user by phone. Returns the row or null.
 * @param {string} phone
 * @returns {Promise<{id: number, phone: string, password_hash: string} | null>}
 */
async function findUserByPhone(phone) {
  const { rows } = await query(
    'SELECT id, phone, password_hash FROM users WHERE phone = $1',
    [phone]
  );
  return rows[0] || null;
}

/**
 * POST /send-code — issue and (in non-dev mode) deliver a verification code.
 */
router.post('/send-code', sendCodeLimiter, async (req, res, next) => {
  try {
    const { phone, purpose } = req.body || {};
    if (!validatePhone(phone) || !validatePurpose(purpose)) {
      throw httpError(400, '手机号或用途无效');
    }

    if ((await codes.secondsSinceLastSend(phone)) < 60) {
      throw httpError(TOO_MANY_REQUESTS, '请求过于频繁，请稍后再试');
    }
    if ((await codes.sendsInLastHour(phone)) >= MAX_SENDS_PER_HOUR) {
      throw httpError(TOO_MANY_REQUESTS, '请求过于频繁，请稍后再试');
    }

    const code = await codes.createCode(phone, purpose);
    const result = await sendSmsCode(phone, code);

    const payload = { ok: true };
    // Surface the code only in dev mode and never in production.
    if (result.dev && !config.isProduction) {
      payload.devCode = code;
    }
    return res.json(payload);
  } catch (err) {
    return next(err);
  }
});

/**
 * POST /register — verify code, create the user, and return a session token.
 */
router.post('/register', authLimiter, async (req, res, next) => {
  try {
    const { phone, code, password } = req.body || {};
    if (!validatePhone(phone) || !validateCode(code) || !validatePassword(password)) {
      throw httpError(400, '输入参数无效');
    }

    const codeOk = await codes.verifyAndConsume(phone, 'register', code);
    if (!codeOk) {
      throw httpError(400, '验证码无效或已过期');
    }

    if (await findUserByPhone(phone)) {
      throw httpError(409, '该手机号已注册');
    }

    const passwordHash = await hashPassword(password);
    const now = Date.now();

    // Create the user and its global_settings row atomically so a partial
    // failure never leaves an orphaned user without settings.
    const client = await getClient();
    let userId;
    try {
      await client.query('BEGIN');
      const insertResult = await client.query(
        `INSERT INTO users (phone, password_hash, created_at, updated_at)
         VALUES ($1, $2, $3, $3)
         RETURNING id`,
        [phone, passwordHash, now]
      );
      userId = insertResult.rows[0].id;
      await client.query(
        `INSERT INTO global_settings (user_id, data, updated_at)
         VALUES ($1, '{}', $2)
         ON CONFLICT (user_id) DO NOTHING`,
        [userId, now]
      );
      await client.query('COMMIT');
    } catch (txErr) {
      await client.query('ROLLBACK');
      // A concurrent register for the same phone can win the race between our
      // existence check and INSERT, tripping the UNIQUE(phone) constraint.
      // Translate that (Postgres error code 23505) into the same clean 409 the
      // pre-check returns, instead of leaking a raw 500.
      if (txErr && txErr.code === '23505') {
        throw httpError(409, '该手机号已注册');
      }
      throw txErr;
    } finally {
      client.release();
    }

    const user = { id: Number(userId), phone };
    const token = signToken(user);
    return res.json({ token, user });
  } catch (err) {
    return next(err);
  }
});

/**
 * POST /login — authenticate with phone + password.
 */
router.post('/login', authLimiter, async (req, res, next) => {
  try {
    const { phone, password } = req.body || {};
    if (!validatePhone(phone) || !validatePassword(password)) {
      throw httpError(400, '输入参数无效');
    }

    const record = await findUserByPhone(phone);
    // Generic message avoids leaking whether the account exists.
    const passwordOk = record && (await verifyPassword(password, record.password_hash));
    if (!record || !passwordOk) {
      throw httpError(401, '手机号或密码不正确');
    }

    const user = { id: record.id, phone: record.phone };
    const token = signToken(user);
    return res.json({ token, user });
  } catch (err) {
    return next(err);
  }
});

/**
 * GET /me — return the authenticated user's identity.
 */
router.get('/me', requireAuth, (req, res) => {
  res.json({ user: { id: req.user.id, phone: req.user.phone } });
});

module.exports = router;
