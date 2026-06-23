'use strict';

// Jest config: load env BEFORE any module is required, run serially against the
// real Postgres test DB, and give bcrypt-heavy auth flows room to finish.
module.exports = {
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/tests/setupEnv.js'],
  setupFilesAfterEnv: ['<rootDir>/tests/setupQuiet.js'],
  testMatch: ['<rootDir>/tests/**/*.test.js'],
  testTimeout: 30000,
};
