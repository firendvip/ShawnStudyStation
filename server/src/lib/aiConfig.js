'use strict';

// AI provider settings persisted in the app_config table. The API key is stored
// encrypted at rest (see secretStore) under the key `ai_api_key_enc`; provider
// and model are plain. getAiSettings() returns the decrypted key for server-side
// use only — it must NEVER be echoed back to a client.

const { query } = require('../db');
const { encryptSecret, decryptSecret } = require('./secretStore');

const KEY_PROVIDER = 'ai_provider';
const KEY_MODEL = 'ai_model';
const KEY_API_KEY_ENC = 'ai_api_key_enc';
const DEFAULT_PROVIDER = 'anthropic';

/**
 * Read all app_config rows for the AI settings into a { key: value } map.
 * @returns {Promise<Object<string,string>>}
 */
async function readConfigMap() {
  const { rows } = await query(
    'SELECT key, value FROM app_config WHERE key = ANY($1)',
    [[KEY_PROVIDER, KEY_MODEL, KEY_API_KEY_ENC]]
  );
  const map = {};
  for (const row of rows) {
    map[row.key] = row.value;
  }
  return map;
}

/**
 * Current AI settings. apiKey is the DECRYPTED key (server-side use only).
 * @returns {Promise<{provider: string, model: string, apiKey: string}>}
 */
async function getAiSettings() {
  const map = await readConfigMap();
  return {
    provider: map[KEY_PROVIDER] || DEFAULT_PROVIDER,
    model: map[KEY_MODEL] || '',
    apiKey: decryptSecret(map[KEY_API_KEY_ENC] || ''),
  };
}

/** Upsert a single app_config key. */
async function upsert(key, value, now) {
  await query(
    `INSERT INTO app_config (key, value, updated_at)
     VALUES ($1, $2, $3)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at`,
    [key, value, now]
  );
}

/**
 * Persist AI settings. The API key is only (re)written when a non-empty string
 * is supplied — an absent/empty apiKey leaves the existing stored key untouched.
 * @param {{provider?: string, model?: string, apiKey?: string}} settings
 * @returns {Promise<void>}
 */
async function setAiSettings({ provider, model, apiKey } = {}) {
  const now = Date.now();
  await upsert(KEY_PROVIDER, typeof provider === 'string' && provider ? provider : DEFAULT_PROVIDER, now);
  await upsert(KEY_MODEL, typeof model === 'string' ? model : '', now);
  if (typeof apiKey === 'string' && apiKey.length > 0) {
    await upsert(KEY_API_KEY_ENC, encryptSecret(apiKey), now);
  }
}

module.exports = { getAiSettings, setAiSettings };
