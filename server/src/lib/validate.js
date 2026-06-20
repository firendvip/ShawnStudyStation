'use strict';

// Boundary input validators. Each returns a boolean; keep them simple and strict.

// Pragmatic email pattern: localpart@domain.tld with no whitespace.
// Not a full RFC 5322 parser — deliberately strict-but-simple for boundary use.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EMAIL_MAX = 254;
const CODE_RE = /^\d{6}$/;
const PAGE_RE = /^[a-z0-9_-]{1,32}$/;
const PASSWORD_MIN = 8;
const PASSWORD_MAX = 64;
const PURPOSE_WHITELIST = Object.freeze(['register', 'login', 'reset']);

/**
 * Normalise an email for storage and lookup: trim surrounding whitespace and
 * lowercase. Storing/comparing in lowercase prevents duplicate accounts that
 * differ only by case. Returns '' for non-string input.
 * @param {*} value
 * @returns {string}
 */
function normalizeEmail(value) {
  if (typeof value !== 'string') return '';
  return value.trim().toLowerCase();
}

/** A syntactically valid email no longer than 254 chars (checked post-trim). */
function validateEmail(value) {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  return trimmed.length <= EMAIL_MAX && EMAIL_RE.test(trimmed);
}

/** Password length within [8, 64]. */
function validatePassword(value) {
  return typeof value === 'string' && value.length >= PASSWORD_MIN && value.length <= PASSWORD_MAX;
}

/** Exactly six digits. */
function validateCode(value) {
  return typeof value === 'string' && CODE_RE.test(value);
}

/** Purpose must be a known verification purpose. */
function validatePurpose(value) {
  return typeof value === 'string' && PURPOSE_WHITELIST.includes(value);
}

/** Page key: lowercase alphanumerics, hyphen, underscore, 1–32 chars. */
function validatePage(value) {
  return typeof value === 'string' && PAGE_RE.test(value);
}

module.exports = {
  validateEmail,
  normalizeEmail,
  validatePassword,
  validateCode,
  validatePurpose,
  validatePage,
  PURPOSE_WHITELIST,
};
