-- PostgreSQL schema for 小善学习站.
-- Idempotent: every statement uses IF NOT EXISTS so it is safe to run repeatedly
-- (on boot and via `npm run migrate`).
--
-- Timestamps are stored as epoch-millis (BIGINT) to match the application code,
-- which uses Date.now(). Do NOT change this to timestamptz without also changing
-- every read/write site in the app.

CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS email_codes (
  id BIGSERIAL PRIMARY KEY,
  email TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  purpose TEXT NOT NULL,
  expires_at BIGINT NOT NULL,
  attempts INT NOT NULL DEFAULT 0,
  consumed SMALLINT NOT NULL DEFAULT 0,
  created_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_email_codes_email ON email_codes(email, created_at);

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

-- 英语作文 custom uploaded articles. parsed_data holds a JSON string
-- ({ title, sentences: [...] }). is_public defaults to 1 (public).
-- prompt = 作文考题 (optional). level = 学段 (小学/初中/高中/大学).
CREATE TABLE IF NOT EXISTS composition_articles (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  prompt TEXT,
  level TEXT,
  original_text TEXT,
  parsed_data TEXT NOT NULL,
  is_public SMALLINT NOT NULL DEFAULT 1,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

-- Idempotent column additions for databases created before prompt/level existed.
ALTER TABLE composition_articles ADD COLUMN IF NOT EXISTS prompt TEXT;
ALTER TABLE composition_articles ADD COLUMN IF NOT EXISTS level TEXT;

CREATE INDEX IF NOT EXISTS idx_comp_user ON composition_articles(user_id);
CREATE INDEX IF NOT EXISTS idx_comp_public ON composition_articles(is_public, created_at);

-- 我的作文 — personal copies. A user can transfer a public composition_articles
-- row here (source_id set) or create one manually (source_id NULL). These rows
-- are private to their owner; editing them never touches the public original.
-- parsed_data holds the same JSON string shape ({ title, sentences: [...] }).
CREATE TABLE IF NOT EXISTS my_articles (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_id BIGINT,
  title TEXT NOT NULL,
  prompt TEXT,
  level TEXT,
  original_text TEXT,
  parsed_data TEXT NOT NULL,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_my_user ON my_articles(user_id);

-- 埋点采集事件表 (analytics events). created_at = epoch-millis (Date.now()).
CREATE TABLE IF NOT EXISTS analytics_events (
  id BIGSERIAL PRIMARY KEY,
  visitor_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  user_id BIGINT,
  type TEXT NOT NULL,
  app TEXT,
  view TEXT,
  target TEXT,
  dwell_ms BIGINT,
  meta TEXT,
  referrer TEXT,
  ua TEXT,
  created_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ae_created ON analytics_events(created_at);
CREATE INDEX IF NOT EXISTS idx_ae_visitor ON analytics_events(visitor_id);
CREATE INDEX IF NOT EXISTS idx_ae_app ON analytics_events(app);
CREATE INDEX IF NOT EXISTS idx_ae_type ON analytics_events(type);
