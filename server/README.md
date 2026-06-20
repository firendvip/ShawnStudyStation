# 小善学习站 — Backend

Secure Node.js (Express + PostgreSQL) backend for the 小善学习站 study site.

Authentication is **email-based** with SMTP verification codes (via nodemailer), JWT bearer sessions, and per-page user data persisted in PostgreSQL. The website works fully anonymously; logged-in users get their data saved, separated by page into different tables.

## Requirements

- Node.js 18+
- PostgreSQL 13+ (a reachable database referenced by `DATABASE_URL`)

## Install

```bash
npm install
```

## Database

This backend requires a PostgreSQL database. Provide its connection string via
the `DATABASE_URL` environment variable (format `postgres://user:pass@host:port/dbname`).

### Quick local Postgres via Docker

```bash
docker run --name xss-pg -e POSTGRES_USER=xss -e POSTGRES_PASSWORD=CHANGE_ME \
  -e POSTGRES_DB=xss -p 5432:5432 -d postgres:16
```

Then set in your `.env`:

```
DATABASE_URL=postgres://xss:CHANGE_ME@localhost:5432/xss
PGSSL=false
```

For managed providers that require TLS, set `PGSSL=true`.

### Run migrations

Apply the schema (idempotent — safe to run repeatedly):

```bash
npm run migrate
```

The server also ensures the schema on boot, so a fresh container works without a
separate migrate step; `npm run migrate` remains available for explicit/CI use.

## Configure

Copy the example env file and edit values as needed:

```bash
cp .env.example .env
```

By default `EMAIL_DEV_MODE=true` (and it auto-enables whenever SMTP credentials are missing), so no real email is sent — verification codes are printed to the server console and (in non-production) returned in the `/send-code` response as `devCode`.

## Run

```bash
npm start      # production-style start
npm run dev    # same entry point, for local development
```

The server listens on `PORT` (default **4000**) and logs whether email is in DEV or LIVE mode on startup. It applies the schema (idempotent) before accepting connections.

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `PORT` | no | `4000` | HTTP listen port |
| `NODE_ENV` | no | `development` | `production` enables strict checks (e.g. mandatory `JWT_SECRET`) |
| `CORS_ORIGIN` | no | localhost (dev) / none (prod) | Comma-separated allowlist of exact origins (e.g. `https://app.example.com,https://admin.example.com`). When unset, dev falls back to `http://localhost:3000` and `http://localhost:5173`; production allows no origins. |
| `JWT_SECRET` | prod only | random (dev) | HS256 signing secret. **Required in production** or the server refuses to boot. In dev a random ephemeral secret is generated (sessions reset on restart). |
| `DATABASE_URL` | yes | — | PostgreSQL connection string (`postgres://user:pass@host:port/dbname`). Required in all environments; the server refuses to boot without it. |
| `PGSSL` | no | `false` | When `true`, connect with SSL (`rejectUnauthorized: false`) — needed by many managed Postgres providers. |
| `EMAIL_DEV_MODE` | no | `true` when SMTP creds missing | When `true`, codes are logged instead of emailed; auto-enabled if SMTP creds absent |
| `SMTP_HOST` | live email | — | SMTP server hostname |
| `SMTP_PORT` | no | `465` | SMTP port (465 implicit TLS, or 587 for STARTTLS) |
| `SMTP_SECURE` | no | `true` | `true` for implicit TLS on 465; set `false` for STARTTLS on 587 |
| `SMTP_USER` | live email | — | SMTP username |
| `SMTP_PASS` | live email | — | SMTP password / app-specific password |
| `SMTP_FROM` | no | `小善学习站 <no-reply@example.com>` | From header for verification emails |

## API

Base URL: `http://localhost:4000`

All request/response bodies are JSON. Authenticated endpoints require an
`Authorization: Bearer <token>` header.

### Health

```bash
curl http://localhost:4000/api/health
# {"ok":true}
```

### Auth

#### Send verification code

`purpose` is one of `register`, `login`, `reset`.

```bash
curl -X POST http://localhost:4000/api/auth/send-code \
  -H 'Content-Type: application/json' \
  -d '{"email":"user@example.com","purpose":"register"}'
# {"ok":true,"devCode":"123456"}   (devCode only in dev mode)
```

Per-email limits: at most one send per 60 seconds and 5 per hour.

#### Register

```bash
curl -X POST http://localhost:4000/api/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"phone":"13800138000","code":"123456","password":"supersecret"}'
# {"token":"<jwt>","user":{"id":1,"phone":"13800138000"}}
```

#### Login

```bash
curl -X POST http://localhost:4000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"phone":"13800138000","password":"supersecret"}'
# {"token":"<jwt>","user":{"id":1,"phone":"13800138000"}}
```

#### Current user

```bash
curl http://localhost:4000/api/auth/me \
  -H 'Authorization: Bearer <jwt>'
# {"user":{"id":1,"phone":"13800138000"}}
```

### Per-page data (all require auth)

Each endpoint stores/returns a single JSON object under `data`.

#### Global settings

```bash
curl http://localhost:4000/api/settings -H 'Authorization: Bearer <jwt>'
# {"data":{}}

curl -X PUT http://localhost:4000/api/settings \
  -H 'Authorization: Bearer <jwt>' -H 'Content-Type: application/json' \
  -d '{"data":{"theme":"dark"}}'
# {"ok":true,"updated_at":1718870400000}
```

#### Cuozi (错字) data

```bash
curl http://localhost:4000/api/cuozi -H 'Authorization: Bearer <jwt>'

curl -X PUT http://localhost:4000/api/cuozi \
  -H 'Authorization: Bearer <jwt>' -H 'Content-Type: application/json' \
  -d '{"data":{"words":["蓝","篮"]}}'
```

#### Phonics data

```bash
curl http://localhost:4000/api/phonics -H 'Authorization: Bearer <jwt>'

curl -X PUT http://localhost:4000/api/phonics \
  -H 'Authorization: Bearer <jwt>' -H 'Content-Type: application/json' \
  -d '{"data":{"progress":42}}'
```

#### Generic page storage

Page key must match `^[a-z0-9_-]{1,32}$`.

```bash
curl http://localhost:4000/api/page/math-drill -H 'Authorization: Bearer <jwt>'
# {"data":{}}

curl -X PUT http://localhost:4000/api/page/math-drill \
  -H 'Authorization: Bearer <jwt>' -H 'Content-Type: application/json' \
  -d '{"data":{"level":3}}'
# {"ok":true,"updated_at":1718870400000}
```

## Security Model

- **Passwords**: hashed with bcrypt (cost factor 12). Plaintext is never logged or stored.
- **SMS codes**: six random digits via `crypto.randomInt`, stored only as bcrypt hashes. Each code expires after 5 minutes and allows at most 5 verification attempts; a code is consumed (single-use) on success.
- **Rate limiting**: per-IP limits via `express-rate-limit` (20 sends / 15 min, 30 auth attempts / 15 min) plus per-phone limits (1 send / 60s, 5 sends / hour).
- **Sessions**: stateless JWT (HS256, 7-day expiry) passed as `Authorization: Bearer`. In production a real `JWT_SECRET` is mandatory.
- **SQL**: every query is parameterised (`$1, $2 ...` placeholders) via `pg`. Table names come only from a hardcoded internal whitelist — never from user input. Registration creates the user and its settings row inside a single transaction.
- **Input validation**: phone, password, code, purpose, and page identifiers are validated at the boundary; stored data must be a plain object under ~200 KB.
- **Transport/headers**: `helmet` sets secure HTTP headers; CORS is restricted to the required methods/headers with credentials disabled. CORS uses an explicit allowlist (`CORS_ORIGIN`) with no wildcard origin reflection — dev falls back to localhost, and production blocks all origins when unset.
- **Error handling**: a central handler logs full errors server-side and returns generic, stack-free JSON to clients. Login uses a generic error to avoid account enumeration.

## Switching from Dev SMS to real Tencent Cloud SMS

1. In your Tencent Cloud SMS console, create an SMS signature and a template
   whose body accepts two parameters: the code and validity minutes
   (e.g. `您的验证码为{1}，{2}分钟内有效。`).
2. Fill in the `TENCENT_*` variables in `.env`:
   `TENCENT_SECRET_ID`, `TENCENT_SECRET_KEY`, `TENCENT_SMS_SDK_APP_ID`,
   `TENCENT_SMS_SIGN_NAME`, `TENCENT_SMS_TEMPLATE_ID`, and (optionally)
   `TENCENT_SMS_REGION`.
3. Set `SMS_DEV_MODE=false`.
4. Restart the server. Startup logs should now report `SMS mode: LIVE`.

If any Tencent variable is missing, the server automatically falls back to DEV mode for safety.
