'use strict';

// Jest setup file — runs BEFORE any test module (and therefore before any
// `require('../src/...')`). Establishes a fully isolated, deterministic env so
// the auth source resolves config against the local `xss_test` database in dev
// (email DEV) mode. NEVER point this at production data.

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-xxx';
// Local Postgres 16, current macOS user, no password.
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL || 'postgres://localhost:5432/xss_test';

// Force email DEV mode (codes returned as devCode) and ensure no SMTP creds
// leak in from a developer's shell.
process.env.EMAIL_DEV_MODE = 'true';
delete process.env.SMTP_HOST;
delete process.env.SMTP_USER;
delete process.env.SMTP_PASS;
