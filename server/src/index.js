'use strict';

// Application entry point. Wires up security middleware, routes, and the
// central error handler, then starts the HTTP server.

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');

const { config, isEmailConfigured } = require('./config');
const { ensureSchema } = require('./db'); // PostgreSQL pool + schema bootstrap.
const authRoutes = require('./routes/auth');
const dataRoutes = require('./routes/data');
const { errorHandler } = require('./middleware/errorHandler');

const JSON_BODY_LIMIT = '1mb';

const app = express();

// Security headers and CORS. credentials disabled — auth is via bearer token.
// Permissive CORS for local demo: reflect ANY origin (including the literal
// `null` origin sent by file:// frontends). origin:true echoes the request
// origin back, so file:// pages can call this API without preflight failures.
app.use(helmet());
app.use(
  cors({
    origin: true,
    methods: ['GET', 'POST', 'PUT', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type'],
    credentials: false,
  })
);
app.use(express.json({ limit: JSON_BODY_LIMIT }));

// Health check.
app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

// Feature routes.
app.use('/api/auth', authRoutes);
app.use('/api', dataRoutes);

// 404 fallback (JSON).
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Central error handler (must be last).
app.use(errorHandler);

// Ensure the schema exists (idempotent), then start listening. A fresh
// container "just works" without a separate migrate step; the migrate script
// remains available for explicit/CI use.
ensureSchema()
  .then(() => {
    app.listen(config.port, () => {
      const smsMode = config.smsDevMode || !isSmsConfigured() ? 'DEV (codes logged to console)' : 'LIVE (Tencent Cloud)';
      // eslint-disable-next-line no-console
      console.log(`[server] 小善学习站 backend listening on port ${config.port} — SMS mode: ${smsMode}`);
    });
  })
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error('[server] Failed to initialise database schema. Refusing to start.', err);
    process.exit(1);
  });

module.exports = app;
