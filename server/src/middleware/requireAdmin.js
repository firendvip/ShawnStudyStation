'use strict';

// Admin authorisation guard. Composes requireAuth (valid token) with an
// allow-list check against config.adminEmails. Email is normalised
// (trim + lowercase) before comparison.

const { requireAuth } = require('./auth');
const { httpError } = require('./errorHandler');
const { config } = require('../config');

function adminGuard(req, res, next) {
  const email = req.user && req.user.email ? String(req.user.email).trim().toLowerCase() : '';
  if (!email || !config.adminEmails.includes(email)) {
    return next(httpError(403, 'Forbidden'));
  }
  return next();
}

const requireAdmin = [requireAuth, adminGuard];
module.exports = { requireAdmin, adminGuard };
