'use strict';

// Centralised application configuration.
// Loads environment variables and exposes a single immutable config object.

const crypto = require('crypto');
require('dotenv').config();

const DEFAULT_PORT = 4000;
const JWT_SECRET_BYTES = 32;

const nodeEnv = process.env.NODE_ENV || 'development';
const isProduction = nodeEnv === 'production';

/**
 * Resolve the PostgreSQL connection string.
 * - Production: a DATABASE_URL is mandatory; refuse to boot otherwise.
 * - Development: must still be provided (no SQLite fallback exists anymore),
 *   but we surface a clear error rather than failing deep inside the pool.
 * Format: postgres://user:pass@host:port/dbname
 */
function resolveDatabaseUrl() {
  const fromEnv = process.env.DATABASE_URL && process.env.DATABASE_URL.trim();
  if (fromEnv) return fromEnv;

  if (isProduction) {
    throw new Error('DATABASE_URL is required in production. Refusing to start.');
  }

  throw new Error(
    'DATABASE_URL is not set. Provide a PostgreSQL connection string, ' +
      'e.g. postgres://xss:CHANGE_ME@localhost:5432/xss'
  );
}

/**
 * Resolve the JWT signing secret.
 * - Production: a real secret is mandatory; refuse to boot otherwise.
 * - Development: fall back to an ephemeral random secret (sessions reset on restart).
 */
function resolveJwtSecret() {
  const fromEnv = process.env.JWT_SECRET && process.env.JWT_SECRET.trim();
  if (fromEnv) return fromEnv;

  if (isProduction) {
    throw new Error('JWT_SECRET is required in production. Refusing to start.');
  }

  // eslint-disable-next-line no-console
  console.warn(
    '[config] JWT_SECRET not set — using an ephemeral random secret. ' +
      'All sessions will be invalidated on restart.'
  );
  return crypto.randomBytes(JWT_SECRET_BYTES).toString('hex');
}

const tencent = Object.freeze({
  secretId: process.env.TENCENT_SECRET_ID || '',
  secretKey: process.env.TENCENT_SECRET_KEY || '',
  sdkAppId: process.env.TENCENT_SMS_SDK_APP_ID || '',
  signName: process.env.TENCENT_SMS_SIGN_NAME || '',
  templateId: process.env.TENCENT_SMS_TEMPLATE_ID || '',
  region: process.env.TENCENT_SMS_REGION || 'ap-guangzhou',
});

/**
 * Resolve allowed CORS origins.
 * - CORS_ORIGIN env var: comma-separated list of exact origins.
 * - Development default: localhost:3000 and localhost:5173 (Vite).
 * - Production without CORS_ORIGIN: no origins allowed (safe default).
 */
function resolveCorsOrigins() {
  const raw = process.env.CORS_ORIGIN && process.env.CORS_ORIGIN.trim();
  if (raw) {
    return raw.split(',').map((o) => o.trim()).filter(Boolean);
  }
  if (isProduction) return [];
  return ['http://localhost:3000', 'http://localhost:5173'];
}

const config = Object.freeze({
  port: Number(process.env.PORT) || DEFAULT_PORT,
  nodeEnv,
  isProduction,
  jwtSecret: resolveJwtSecret(),
  jwtExpiresIn: '7d',
  databaseUrl: resolveDatabaseUrl(),
  // Enable SSL for managed Postgres providers that require it. rejectUnauthorized
  // is relaxed because many providers use certs not in the default CA bundle.
  pgSsl: String(process.env.PGSSL).toLowerCase() === 'true',
  smsDevMode: String(process.env.SMS_DEV_MODE).toLowerCase() === 'true',
  corsOrigins: resolveCorsOrigins(),
  tencent,
});

/**
 * True only when every Tencent Cloud SMS credential is present.
 */
function isSmsConfigured() {
  const { secretId, secretKey, sdkAppId, signName, templateId, region } = config.tencent;
  return Boolean(secretId && secretKey && sdkAppId && signName && templateId && region);
}

module.exports = { config, isSmsConfigured };
