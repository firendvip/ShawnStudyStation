'use strict';

// Standalone migration runner: applies src/schema.sql to the configured
// PostgreSQL database. Safe to run repeatedly — the schema is idempotent.
//
// Usage: npm run migrate

const { pool, ensureSchema } = require('./db');

async function main() {
  // eslint-disable-next-line no-console
  console.log('[migrate] Applying schema to PostgreSQL...');
  await ensureSchema();
  // eslint-disable-next-line no-console
  console.log('[migrate] Schema applied successfully.');
}

main()
  .then(async () => {
    await pool.end();
    process.exit(0);
  })
  .catch(async (err) => {
    // eslint-disable-next-line no-console
    console.error('[migrate] Migration failed:', err);
    try {
      await pool.end();
    } catch (_endErr) {
      // ignore pool shutdown errors during failure path
    }
    process.exit(1);
  });
