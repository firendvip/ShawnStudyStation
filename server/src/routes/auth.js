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
 * Look up a user by email. Returns the row or null.
 * @param {string} email
 * @returns {Promise<{id: number, email: string, password_hash: string} | null>}
 */
async function findUserByEmail(email) {
  const { rows } = await query(
    'SELECT id, email, password_hash FROM users WHERE email = $1',
    [email]
  );
  return rows[0] || null;
}

/**
 * Look up a user by id. Returns the row or null.
 * @param {number} id
 * @returns {Promise<{id: number, email: string, password_hash: string} | null>}
 */
async function findUserById(id) {
  const { rows } = await query(
    'SELECT id, email, password_hash FROM users WHERE id = $1',
    [id]
  );
  return rows[0] || null;
}

/**
 * POST /send-code — issue and (in non-dev mode) deliver a verification code.
 */
router.post('/send-code', sendCodeLimiter, async (req, res, next) => {
  try {
    const { email, purpose } = req.body || {};
    if (!validateEmail(email) || !validatePurpose(purpose)) {
      throw httpError(400, '邮箱或用途无效');
    }

    const normalizedEmail = normalizeEmail(email);
    // 按 (邮箱, 用途) 分别限流，避免某一用途（如 register）刷码挤占另一用途（如 reset）的配额
    if ((await codes.secondsSinceLastSend(normalizedEmail, purpose)) < 60) {
      throw httpError(TOO_MANY_REQUESTS, '请求过于频繁，请稍后再试');
    }
    if ((await codes.sendsInLastHour(normalizedEmail, purpose)) >= MAX_SENDS_PER_HOUR) {
      throw httpError(TOO_MANY_REQUESTS, '请求过于频繁，请稍后再试');
    }

    const code = await codes.createCode(normalizedEmail, purpose);
    const result = await sendEmailCode(normalizedEmail, code);

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
    const { email, code, password } = req.body || {};
    if (!validateEmail(email) || !validateCode(code) || !validatePassword(password)) {
      throw httpError(400, '输入参数无效');
    }

    const normalizedEmail = normalizeEmail(email);
    const codeOk = await codes.verifyAndConsume(normalizedEmail, 'register', code);
    if (!codeOk) {
      throw httpError(400, '验证码无效或已过期');
    }

    if (await findUserByEmail(normalizedEmail)) {
      throw httpError(409, '该邮箱已注册');
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
        `INSERT INTO users (email, password_hash, created_at, updated_at)
         VALUES ($1, $2, $3, $3)
         RETURNING id`,
        [normalizedEmail, passwordHash, now]
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
      // A concurrent register for the same email can win the race between our
      // existence check and INSERT, tripping the UNIQUE(email) constraint.
      // Translate that (Postgres error code 23505) into the same clean 409 the
      // pre-check returns, instead of leaking a raw 500.
      if (txErr && txErr.code === '23505') {
        throw httpError(409, '该邮箱已注册');
      }
      throw txErr;
    } finally {
      client.release();
    }

    const user = { id: Number(userId), email: normalizedEmail };
    const token = signToken(user);
    return res.json({ token, user });
  } catch (err) {
    return next(err);
  }
});

/**
 * POST /login — authenticate with email + password.
 */
router.post('/login', authLimiter, async (req, res, next) => {
  try {
    const { email, password } = req.body || {};
    if (!validateEmail(email) || !validatePassword(password)) {
      throw httpError(400, '输入参数无效');
    }

    const normalizedEmail = normalizeEmail(email);
    const record = await findUserByEmail(normalizedEmail);
    // Generic message avoids leaking whether the account exists.
    const passwordOk = record && (await verifyPassword(password, record.password_hash));
    if (!record || !passwordOk) {
      throw httpError(401, '邮箱或密码不正确');
    }

    const user = { id: record.id, email: record.email };
    const token = signToken(user);
    return res.json({ token, user });
  } catch (err) {
    return next(err);
  }
});

/**
 * POST /verify-code — verify (and consume) an email code without side effects.
 * Used as an identity proof (e.g. resetting the local diary password). Returns
 * { ok: true } on success; never reveals whether the email is registered.
 */
router.post('/verify-code', authLimiter, async (req, res, next) => {
  try {
    const { email, code, purpose } = req.body || {};
    if (!validateEmail(email) || !validateCode(code) || !validatePurpose(purpose)) {
      throw httpError(400, '输入参数无效');
    }
    const ok = await codes.verifyAndConsume(normalizeEmail(email), purpose, code);
    if (!ok) throw httpError(400, '验证码无效或已过期');
    return res.json({ ok: true });
  } catch (err) {
    return next(err);
  }
});

/**
 * GET /me — return the authenticated user's identity.
 */
router.get('/me', requireAuth, (req, res) => {
  res.json({ user: { id: req.user.id, email: req.user.email } });
});

/**
 * POST /verify-password — verify a password against the logged-in user's own
 * password (no token issued). Returns { ok }. Used so embedded tools can gate
 * content behind the user's account login password.
 */
router.post('/verify-password', authLimiter, requireAuth, async (req, res, next) => {
  try {
    const { password } = req.body || {};
    if (typeof password !== 'string' || !password) {
      return res.json({ ok: false });
    }
    const record = await findUserById(req.user.id);
    const ok = !!record && (await verifyPassword(password, record.password_hash));
    return res.json({ ok });
  } catch (err) {
    return next(err);
  }
});

/**
 * POST /change-password — change the logged-in user's password.
 * Requires a valid session and verification of the current password.
 */
router.post('/change-password', authLimiter, requireAuth, async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body || {};
    if (!validatePassword(currentPassword) || !validatePassword(newPassword)) {
      throw httpError(400, '输入参数无效');
    }
    if (currentPassword === newPassword) {
      throw httpError(400, '新密码不能与当前密码相同');
    }

    const record = await findUserById(req.user.id);
    if (!record) {
      throw httpError(404, '用户不存在');
    }
    const currentOk = await verifyPassword(currentPassword, record.password_hash);
    if (!currentOk) {
      throw httpError(400, '当前密码不正确');
    }

    const passwordHash = await hashPassword(newPassword);
    await query(
      'UPDATE users SET password_hash = $1, updated_at = $2 WHERE id = $3',
      [passwordHash, Date.now(), record.id]
    );
    return res.json({ ok: true });
  } catch (err) {
    return next(err);
  }
});

/**
 * POST /reset-password — reset a forgotten password via an emailed code.
 * Consumes a 'reset' verification code, sets the new password, and returns a
 * fresh session token so the user is logged straight in.
 */
router.post('/reset-password', authLimiter, async (req, res, next) => {
  try {
    const { email, code, password } = req.body || {};
    if (!validateEmail(email) || !validateCode(code) || !validatePassword(password)) {
      throw httpError(400, '输入参数无效');
    }

    const normalizedEmail = normalizeEmail(email);
    const record = await findUserByEmail(normalizedEmail);
    const codeOk = await codes.verifyAndConsume(normalizedEmail, 'reset', code);
    // 统一错误信息：无论邮箱是否注册、验证码是否正确，都返回同一提示，
    // 避免泄露某邮箱是否已注册（账户枚举）。两条路径都执行 verifyAndConsume，时延一致。
    if (!record || !codeOk) {
      throw httpError(400, '验证码无效或已过期');
    }

    const passwordHash = await hashPassword(password);
    await query(
      'UPDATE users SET password_hash = $1, updated_at = $2 WHERE id = $3',
      [passwordHash, Date.now(), record.id]
    );

    const user = { id: record.id, email: record.email };
    const token = signToken(user);
    return res.json({ token, user });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
