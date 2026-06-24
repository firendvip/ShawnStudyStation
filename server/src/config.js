'use strict';

// Centralised application configuration.
// Loads environment variables and exposes a single immutable config object.

const crypto = require('crypto');
require('dotenv').config();

const DEFAULT_PORT = 4000;
const JWT_SECRET_BYTES = 32;
const DEFAULT_SMTP_PORT = 465;

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

const DEFAULT_SMTP_FROM = '小善学习站 <no-reply@example.com>';

const smtp = Object.freeze({
  host: process.env.SMTP_HOST || '',
  port: Number(process.env.SMTP_PORT) || DEFAULT_SMTP_PORT,
  // Secure (implicit TLS) by default; set SMTP_SECURE=false for STARTTLS on 587.
  secure: String(process.env.SMTP_SECURE).toLowerCase() !== 'false',
  user: process.env.SMTP_USER || '',
  pass: process.env.SMTP_PASS || '',
});

// Whether the minimal SMTP credentials are present.
const emailCredsPresent = Boolean(smtp.host && smtp.user && smtp.pass);

/**
 * Resolve EMAIL_DEV_MODE. When explicitly set, honour it. When unset, default
 * to dev mode (log codes) whenever SMTP credentials are missing — so the app is
 * safe out of the box and never silently fails to deliver.
 */
function resolveEmailDevMode() {
  const raw = process.env.EMAIL_DEV_MODE;
  if (raw !== undefined && raw !== '') {
    return String(raw).toLowerCase() === 'true';
  }
  return !emailCredsPresent;
}

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
  corsOrigins: resolveCorsOrigins(),
  smtp,
  smtpFrom: process.env.SMTP_FROM || DEFAULT_SMTP_FROM,
  emailDevMode: resolveEmailDevMode(),
  // AI essay enrichment. Left blank => stub mode (local tokenisation only, no
  // external calls). Supply a provider + key later to enable aiEnrich().
  aiProvider: (process.env.AI_PROVIDER || '').trim(),
  aiApiKey: (process.env.AI_API_KEY || '').trim(),
});

/** True when an AI provider + key are configured (otherwise: stub mode). */
function isAiConfigured() {
  return Boolean(config.aiProvider && config.aiApiKey);
}

/**
 * True only when the minimal SMTP delivery settings are present.
 */
function isEmailConfigured() {
  const { host, port, user, pass } = config.smtp;
  return Boolean(host && port && user && pass && config.smtpFrom);
}

module.exports = { config, isEmailConfigured, isAiConfigured };
