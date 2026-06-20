'use strict';

// JWT issuing and verification (HS256, 7-day expiry).

const jwt = require('jsonwebtoken');
const { config } = require('../config');

const JWT_ALGORITHM = 'HS256';

/**
 * Sign a session token for an authenticated user.
 * @param {{id: number, phone: string}} payload
 * @returns {string} signed JWT
 */
function signToken(payload) {
  const claims = { id: payload.id, phone: payload.phone };
  return jwt.sign(claims, config.jwtSecret, {
    algorithm: JWT_ALGORITHM,
    expiresIn: config.jwtExpiresIn,
  });
}

/**
 * Verify a session token and return its decoded claims.
 * Throws if the token is invalid or expired.
 * @param {string} token
 * @returns {{id: number, phone: string, iat: number, exp: number}}
 */
function verifyToken(token) {
  return jwt.verify(token, config.jwtSecret, { algorithms: [JWT_ALGORITHM] });
}

module.exports = { signToken, verifyToken };
