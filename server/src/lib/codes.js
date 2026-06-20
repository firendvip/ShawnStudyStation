'use strict';

// SMS verification code lifecycle: generation, hashed storage, expiry,
// attempt limiting, and per-phone rate-limit helpers.
// Codes are stored only as bcrypt hashes — never in plaintext.
//
// Data layer: PostgreSQL via the `pg` pool. All queries are async and use
// parameterised placeholders ($1, $2 ...) — never string interpolation.

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { query } = require('../db');
const { BCRYPT_COST } = require('./password');

const CODE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_ATTEMPTS = 5;
const ONE_HOUR_MS = 60 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;

/** Generate a cryptographically random six-digit code as a string. */
function generateCode() {
  return String(crypto.randomInt(100000, 1000000));
}

/**
 * Create and persist a new code for the given phone/purpose.
 * Returns the plaintext code (to be delivered via SMS).
 * @param {string} phone
 * @param {string} purpose
 * @returns {Promise<string>}
 */
async function createCode(phone, purpose) {
  const code = generateCode();
  const codeHash = await bcrypt.hash(code, BCRYPT_COST);
  const now = Date.now();
  await query(
    `INSERT INTO sms_codes (phone, code_hash, purpose, expires_at, attempts, consumed, created_at)
     VALUES ($1, $2, $3, $4, 0, 0, $5)`,
    [phone, codeHash, purpose, now + CODE_TTL_MS, now]
  );
  return code;
}

/**
 * Verify a submitted code against the latest active record and consume it on success.
 * Enforces expiry and a per-code maximum attempt count.
 * @param {string} phone
 * @param {string} purpose
 * @param {string} code
 * @returns {Promise<boolean>}
 */
async function verifyAndConsume(phone, purpose, code) {
  const { rows } = await query(
    `SELECT id, code_hash, attempts
       FROM sms_codes
      WHERE phone = $1
        AND purpose = $2
        AND consumed = 0
        AND expires_at > $3
      ORDER BY created_at DESC
      LIMIT 1`,
    [phone, purpose, Date.now()]
  );
  const row = rows[0];
  if (!row) return false;
  if (row.attempts >= MAX_ATTEMPTS) return false;

  // Count this verification attempt regardless of outcome.
  await query('UPDATE sms_codes SET attempts = attempts + 1 WHERE id = $1', [row.id]);

  const matches = await bcrypt.compare(code, row.code_hash);
  if (!matches) return false;

  await query('UPDATE sms_codes SET consumed = 1 WHERE id = $1', [row.id]);
  return true;
}

/**
 * Seconds since the most recent send for a phone, or Infinity if never sent.
 * @param {string} phone
 * @returns {Promise<number>}
 */
async function secondsSinceLastSend(phone) {
  const { rows } = await query(
    'SELECT MAX(created_at) AS last FROM sms_codes WHERE phone = $1',
    [phone]
  );
  const last = rows[0] && rows[0].last;
  if (last === null || last === undefined) return Infinity;
  return (Date.now() - Number(last)) / 1000;
}

/**
 * Number of sends for a phone within the last hour.
 * @param {string} phone
 * @returns {Promise<number>}
 */
async function sendsInLastHour(phone) {
  const { rows } = await query(
    'SELECT COUNT(*) AS count FROM sms_codes WHERE phone = $1 AND created_at >= $2',
    [phone, Date.now() - ONE_HOUR_MS]
  );
  // pg returns COUNT(*) as a string — coerce to a number.
  return rows[0] ? Number(rows[0].count) : 0;
}

module.exports = {
  generateCode,
  createCode,
  verifyAndConsume,
  secondsSinceLastSend,
  sendsInLastHour,
  CODE_TTL_MS,
  MAX_ATTEMPTS,
  RESEND_COOLDOWN_MS,
};
