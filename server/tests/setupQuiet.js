'use strict';

// setupFilesAfterEach-style quieting: the auth source logs every handled error
// (401/400/429) and every dev verification code to the console by design. That
// is correct production behaviour, but it floods the test report. Silence those
// two channels during tests so the PASS summary is readable. Real assertion
// failures still surface (Jest writes those to its own reporter, not console).
beforeAll(() => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterAll(() => {
  jest.restoreAllMocks();
});
