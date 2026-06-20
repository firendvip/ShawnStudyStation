'use strict';

// Authentication middleware: a strict guard and an optional one.

const { verifyToken } = require('../lib/token');

const BEARER_PREFIX = 'Bearer ';

/**
 * Extract and verify a bearer token from the Authorization header.
 * @returns {{id: number, email: string} | null}
 */
function extractUser(req) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith(BEARER_PREFIX)) return null;

  const token = header.slice(BEARER_PREFIX.length).trim();
  if (!token) return null;

  try {
    const decoded = verifyToken(token);
    return { id: decoded.id, phone: decoded.phone };
  } catch (_err) {
    return null;
  }
}

/** Reject the request with 401 unless a valid token is present. */
function requireAuth(req, res, next) {
  const user = extractUser(req);
  if (!user) {
    return res.status(401).json({ error: '未授权' });
  }
  req.user = user;
  return next();
}

/** Attach req.user when a valid token is present; never reject. */
function optionalAuth(req, _res, next) {
  const user = extractUser(req);
  if (user) req.user = user;
  return next();
}

module.exports = { requireAuth, optionalAuth };
