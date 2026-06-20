'use strict';

// Password hashing utilities backed by bcryptjs.
// Plaintext passwords are never logged or persisted.

const bcrypt = require('bcryptjs');

const BCRYPT_COST = 12;

/**
 * Hash a plaintext password using bcrypt with a fixed work factor.
 * @param {string} plaintext
 * @returns {Promise<string>} the bcrypt hash
 */
async function hashPassword(plaintext) {
  return bcrypt.hash(plaintext, BCRYPT_COST);
}

/**
 * Verify a plaintext password against a stored bcrypt hash.
 * @param {string} plaintext
 * @param {string} hash
 * @returns {Promise<boolean>}
 */
async function verifyPassword(plaintext, hash) {
  return bcrypt.compare(plaintext, hash);
}

module.exports = { hashPassword, verifyPassword, BCRYPT_COST };
