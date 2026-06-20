-- PostgreSQL schema for 小善学习站.
-- Idempotent: every statement uses IF NOT EXISTS so it is safe to run repeatedly
-- (on boot and via `npm run migrate`).
--
-- Timestamps are stored as epoch-millis (BIGINT) to match the application code,
-- which uses Date.now(). Do NOT change this to timestamptz without also changing
-- every read/write site in the app.

CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  phone TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS sms_codes (
  id BIGSERIAL PRIMARY KEY,
  phone TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  purpose TEXT NOT NULL,
  expires_at BIGINT NOT NULL,
  attempts INT NOT NULL DEFAULT 0,
  consumed SMALLINT NOT NULL DEFAULT 0,
  created_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sms_phone ON sms_codes(phone, created_at);

CREATE TABLE IF NOT EXISTS global_settings (
  user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  data TEXT NOT NULL DEFAULT '{}',
  updated_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS cuozi_data (
  user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  data TEXT NOT NULL DEFAULT '{}',
  updated_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS phonics_data (
  user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  data TEXT NOT NULL DEFAULT '{}',
  updated_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS page_data (
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  page TEXT NOT NULL,
  data TEXT NOT NULL DEFAULT '{}',
  updated_at BIGINT NOT NULL,
  PRIMARY KEY (user_id, page)
);
