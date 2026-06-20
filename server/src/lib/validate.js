'use strict';

// Boundary input validators. Each returns a boolean; keep them simple and strict.

const PHONE_RE = /^1[3-9]\d{9}$/;
const CODE_RE = /^\d{6}$/;
const PAGE_RE = /^[a-z0-9_-]{1,32}$/;
const PASSWORD_MIN = 8;
const PASSWORD_MAX = 64;
const PURPOSE_WHITELIST = Object.freeze(['register', 'login', 'reset']);

/** Mainland China mobile number. */
function validatePhone(value) {
  return typeof value === 'string' && PHONE_RE.test(value);
}

/** Password length within [8, 64]. */
function validatePassword(value) {
  return typeof value === 'string' && value.length >= PASSWORD_MIN && value.length <= PASSWORD_MAX;
}

/** Exactly six digits. */
function validateCode(value) {
  return typeof value === 'string' && CODE_RE.test(value);
}

/** Purpose must be a known SMS purpose. */
function validatePurpose(value) {
  return typeof value === 'string' && PURPOSE_WHITELIST.includes(value);
}

/** Page key: lowercase alphanumerics, hyphen, underscore, 1–32 chars. */
function validatePage(value) {
  return typeof value === 'string' && PAGE_RE.test(value);
}

module.exports = {
  validatePhone,
  validatePassword,
  validateCode,
  validatePurpose,
  validatePage,
  PURPOSE_WHITELIST,
};
