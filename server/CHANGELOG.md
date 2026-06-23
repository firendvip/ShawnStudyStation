# Changelog

All notable changes to the server are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/), versioning follows SemVer.

## [1.1.0] - 2026-06-22

### Added
- `POST /api/auth/change-password` — change the logged-in user's password.
  Requires a valid session and verifies the current password; rejects when the
  new password equals the current one.
- `POST /api/auth/reset-password` — forgot-password flow. Consumes a `reset`
  email verification code, sets the new password, and returns a fresh session
  token (auto login). Completes the previously-orphaned `reset` purpose.

### Security
- `reset-password` no longer reveals whether an email is registered: identical
  error (`验证码无效或已过期`) and verification path for unknown emails and wrong
  codes (fixes account enumeration).
- CORS now honours the configured allowlist (`config.corsOrigins` / `CORS_ORIGIN`)
  in production instead of reflecting any origin; dev stays permissive for
  `file://` frontends.
- Email-code send rate limits (60s cooldown, 5/hour) are now scoped per
  `(email, purpose)`, so flooding one purpose can't block another (e.g. a
  `register` flood can no longer starve a victim's `reset` emails).

### Fixed
- Corrected misleading JSDoc on `validatePassword` (documented `[8,64]` while the
  implementation enforces `[4,64]`).
