'use strict';

// Symmetric secret storage for at-rest encryption of sensitive config values
// (e.g. an AI provider API key) before they are written to the database.
//
// AES-256-GCM with a key derived from the app's JWT secret via scrypt. The
// packed format is base64( iv(12) || tag(16) || ciphertext ). Decryption never
// throws — it returns '' on any malformed/forged/tampered input — so callers can
// treat a bad blob as "no secret configured". Plaintext is NEVER logged.

const crypto = require('crypto');
const { config } = require('../config');

const ALGORITHM = 'aes-256-gcm';
const KEY_BYTES = 32; // AES-256
const IV_BYTES = 12; // GCM standard nonce length
const TAG_BYTES = 16; // GCM auth tag length
const KDF_SALT = 'ai-secret-store-salt-v1';

// Derived once at module load. Tied to config.jwtSecret: rotating the JWT secret
// invalidates previously stored ciphertexts (decrypt returns '').
const KEY = crypto.scryptSync(config.jwtSecret, KDF_SALT, KEY_BYTES);

/**
 * Encrypt a plaintext secret. Returns a single base64 string packing
 * iv(12) + tag(16) + ciphertext. NEVER log the plaintext.
 * @param {string} plaintext
 * @returns {string} base64 packed blob ('' for empty input)
 */
function encryptSecret(plaintext) {
  if (typeof plaintext !== 'string' || plaintext.length === 0) {
    return '';
  }
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]).toString('base64');
}

/**
 * Decrypt a packed base64 blob produced by encryptSecret. Returns the plaintext
 * on success, or '' on ANY failure (malformed, truncated, wrong key, tampered).
 * Never throws.
 * @param {string} packed
 * @returns {string}
 */
function decryptSecret(packed) {
  try {
    if (typeof packed !== 'string' || packed.length === 0) {
      return '';
    }
    const raw = Buffer.from(packed, 'base64');
    if (raw.length < IV_BYTES + TAG_BYTES) {
      return '';
    }
    const iv = raw.subarray(0, IV_BYTES);
    const tag = raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
    const ciphertext = raw.subarray(IV_BYTES + TAG_BYTES);
    const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return plaintext.toString('utf8');
  } catch (_err) {
    return '';
  }
}

module.exports = { encryptSecret, decryptSecret };
