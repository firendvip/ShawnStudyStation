'use strict';

// Central error handler. Logs full detail server-side and returns a safe,
// stack-free JSON error to the client.

const INTERNAL_ERROR_MESSAGE = '服务器内部错误';
const SERVER_ERROR_STATUS = 500;

/**
 * Express error-handling middleware (must keep the 4-arg signature).
 */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  // eslint-disable-next-line no-console
  console.error('[error]', err);

  const status = err.status || SERVER_ERROR_STATUS;

  // Only surface the message when the error was explicitly marked safe to
  // expose (via httpError). All other errors — including unexpected 4xx
  // errors from third-party middleware — receive the generic message so
  // that internal details never leak to the client.
  const safeMessage = err.expose ? err.message : INTERNAL_ERROR_MESSAGE;

  res.status(status).json({ error: safeMessage });
}

/**
 * Create an error carrying an HTTP status and an expose flag so the central
 * handler can safely surface its message to the client.
 * @param {number} status
 * @param {string} message
 * @returns {Error}
 */
function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  err.expose = true;
  return err;
}

module.exports = { errorHandler, httpError };
