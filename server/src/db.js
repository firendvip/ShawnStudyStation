'use strict';

// PostgreSQL (node-postgres / `pg`) connection bootstrap.
// Exposes a connection Pool, an async `query` helper, a `getClient` helper for
// transactions, and an idempotent `ensureSchema` for boot-time schema setup.

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const { config } = require('./config');

const SCHEMA_FILE = path.join(__dirname, 'schema.sql');

// Sensible pool defaults for a production multi-user workload.
const POOL_MAX = 10;
const CONNECTION_TIMEOUT_MS = 10 * 1000; // fail fast if a connection can't be acquired
const IDLE_TIMEOUT_MS = 30 * 1000;

// SSL is opt-in via PGSSL (needed by many managed Postgres providers).
const ssl = config.pgSsl ? { rejectUnauthorized: false } : undefined;

const pool = new Pool({
  connectionString: config.databaseUrl,
  max: POOL_MAX,
  connectionTimeoutMillis: CONNECTION_TIMEOUT_MS,
  idleTimeoutMillis: IDLE_TIMEOUT_MS,
  ssl,
});

// A pool-level error handler prevents an idle-client error from crashing the
// process. Errors are logged with full detail server-side.
pool.on('error', (err) => {
  // eslint-disable-next-line no-console
  console.error('[db] Unexpected error on idle PostgreSQL client:', err);
});

/**
 * Run a parameterised query against the pool.
 * @param {string} text - SQL with $1, $2 ... placeholders
 * @param {Array} [params] - bound parameters
 * @returns {Promise<import('pg').QueryResult>}
 */
function query(text, params) {
  return pool.query(text, params);
}

/**
 * Acquire a dedicated client from the pool (for transactions).
 * The caller MUST call client.release() when finished.
 * @returns {Promise<import('pg').PoolClient>}
 */
function getClient() {
  return pool.connect();
}

/**
 * Apply the schema. Idempotent — every statement uses IF NOT EXISTS — so it is
 * safe to run on every boot and as many times as needed.
 * @returns {Promise<void>}
 */
async function ensureSchema() {
  const schema = fs.readFileSync(SCHEMA_FILE, 'utf8');
  await pool.query(schema);
}

module.exports = { pool, query, getClient, ensureSchema };
