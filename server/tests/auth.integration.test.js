'use strict';

// Integration tests for the Express auth system against a REAL local Postgres
// (xss_test). No mocks: every assertion exercises actual SQL, bcrypt hashing,
// and JWT signing/verification.
//
// Env is established in tests/setupEnv.js (NODE_ENV=test, JWT_SECRET,
// DATABASE_URL -> xss_test, EMAIL_DEV_MODE=true) BEFORE these requires run.

const express = require('express');
const request = require('supertest');

const authRouter = require('../src/routes/auth');
const { errorHandler } = require('../src/middleware/errorHandler');
const { ensureSchema, pool, query } = require('../src/db');

// Build a fresh app per the harness guidance: avoids src/index.js's app.listen
// (no port conflicts) while exercising the identical router + error handler.
function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRouter);
  app.use(errorHandler);
  return app;
}

const app = buildApp();

// Unique email per case so the per-(email,purpose) 60s send-code cooldown never
// trips across cases, and concurrent code rows never collide.
let emailSeq = 0;
function freshEmail() {
  emailSeq += 1;
  return `user_${Date.now()}_${emailSeq}_${Math.random().toString(36).slice(2, 8)}@example.com`;
}

const PASSWORD = 'pass1234';

// --- Flow helpers (each hits the real HTTP surface) ---------------------------

async function sendCode(email, purpose) {
  const res = await request(app)
    .post('/api/auth/send-code')
    .send({ email, purpose });
  return res;
}

async function registerUser(email, password = PASSWORD) {
  const codeRes = await sendCode(email, 'register');
  expect(codeRes.status).toBe(200);
  expect(codeRes.body.ok).toBe(true);
  const devCode = codeRes.body.devCode;
  expect(devCode).toMatch(/^\d{6}$/);

  const regRes = await request(app)
    .post('/api/auth/register')
    .send({ email, code: devCode, password });
  return regRes;
}

async function login(email, password) {
  return request(app).post('/api/auth/login').send({ email, password });
}

beforeAll(async () => {
  // Idempotent schema apply against the isolated test DB.
  await ensureSchema();
});

beforeEach(async () => {
  // Clean slate between cases. CASCADE clears global_settings etc. that FK users.
  await query('TRUNCATE TABLE users, email_codes RESTART IDENTITY CASCADE');
});

afterAll(async () => {
  await pool.end();
});

describe('Auth integration (real Postgres)', () => {
  test('1. register full chain: send-code -> devCode -> register -> token; /me returns user', async () => {
    const email = freshEmail();

    const regRes = await registerUser(email);
    expect(regRes.status).toBe(200);
    expect(typeof regRes.body.token).toBe('string');
    expect(regRes.body.token.length).toBeGreaterThan(0);
    expect(regRes.body.user).toMatchObject({ email });
    expect(typeof regRes.body.user.id).toBe('number');

    const meRes = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${regRes.body.token}`);
    expect(meRes.status).toBe(200);
    expect(meRes.body.user).toMatchObject({ id: regRes.body.user.id, email });
  });

  test('2. login: correct credentials succeed; wrong password -> 401', async () => {
    const email = freshEmail();
    await registerUser(email);

    const ok = await login(email, PASSWORD);
    expect(ok.status).toBe(200);
    expect(typeof ok.body.token).toBe('string');
    expect(ok.body.user).toMatchObject({ email });

    const bad = await login(email, 'wrong-password');
    expect(bad.status).toBe(401);
    expect(bad.body.error).toBe('邮箱或密码不正确');
  });

  test('3. change-password: old fails / new works; wrong current -> 400; new==old -> 400', async () => {
    const email = freshEmail();
    const NEW_PASSWORD = 'newpass99';
    await registerUser(email);

    const loginRes = await login(email, PASSWORD);
    expect(loginRes.status).toBe(200);
    const token = loginRes.body.token;

    // wrong currentPassword -> 400
    const wrongCurrent = await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: 'not-the-current', newPassword: NEW_PASSWORD });
    expect(wrongCurrent.status).toBe(400);
    expect(wrongCurrent.body.error).toBe('当前密码不正确');

    // new == old -> 400
    const sameAsOld = await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: PASSWORD, newPassword: PASSWORD });
    expect(sameAsOld.status).toBe(400);
    expect(sameAsOld.body.error).toBe('新密码不能与当前密码相同');

    // correct change
    const change = await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: PASSWORD, newPassword: NEW_PASSWORD });
    expect(change.status).toBe(200);
    expect(change.body.ok).toBe(true);

    // old password no longer works
    const oldLogin = await login(email, PASSWORD);
    expect(oldLogin.status).toBe(401);

    // new password works
    const newLogin = await login(email, NEW_PASSWORD);
    expect(newLogin.status).toBe(200);
    expect(newLogin.body.user).toMatchObject({ email });
  });

  test('4. reset-password via email: send-code(reset) -> reset -> new works, old fails', async () => {
    const email = freshEmail();
    const RESET_PASSWORD = 'reset5678';
    await registerUser(email);

    const codeRes = await sendCode(email, 'reset');
    expect(codeRes.status).toBe(200);
    const devCode = codeRes.body.devCode;
    expect(devCode).toMatch(/^\d{6}$/);

    const resetRes = await request(app)
      .post('/api/auth/reset-password')
      .send({ email, code: devCode, password: RESET_PASSWORD });
    expect(resetRes.status).toBe(200);
    expect(typeof resetRes.body.token).toBe('string');
    expect(resetRes.body.user).toMatchObject({ email });

    const newLogin = await login(email, RESET_PASSWORD);
    expect(newLogin.status).toBe(200);

    const oldLogin = await login(email, PASSWORD);
    expect(oldLogin.status).toBe(401);
  });

  describe('5. security asserts', () => {
    test('reset-password with wrong code -> 400', async () => {
      const email = freshEmail();
      await registerUser(email);
      await sendCode(email, 'reset'); // a real reset code exists, but we submit a wrong one

      const res = await request(app)
        .post('/api/auth/reset-password')
        .send({ email, code: '000000', password: 'reset5678' });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('验证码无效或已过期');
    });

    test('a register code cannot be used to reset (purpose isolation)', async () => {
      const email = freshEmail();

      // Obtain a valid REGISTER code but do NOT consume it via register.
      const regCodeRes = await sendCode(email, 'register');
      const registerCode = regCodeRes.body.devCode;
      expect(registerCode).toMatch(/^\d{6}$/);

      // Register the user with a separate fresh register code so the account exists,
      // proving the rejection below is purpose isolation, not "user missing".
      const codeRes2 = await sendCode(email, 'register').catch(() => null);
      // send-code has a 60s cooldown per (email,purpose); insert the account directly
      // to guarantee existence without tripping the cooldown.
      const { hashPassword } = require('../src/lib/password');
      const hash = await hashPassword(PASSWORD);
      const now = Date.now();
      await query(
        `INSERT INTO users (email, password_hash, created_at, updated_at)
         VALUES ($1, $2, $3, $3)`,
        [email, hash, now]
      );
      void codeRes2;

      // Attempt reset using the REGISTER-purpose code -> must fail (purpose mismatch).
      const res = await request(app)
        .post('/api/auth/reset-password')
        .send({ email, code: registerCode, password: 'reset5678' });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('验证码无效或已过期');

      // Account is intact: original password still logs in.
      const stillWorks = await login(email, PASSWORD);
      expect(stillWorks.status).toBe(200);
    });

    test('reset on unregistered email returns unified error (no info leak)', async () => {
      const unknownEmail = freshEmail(); // never registered

      // Even with a "code" supplied, an unregistered email yields the SAME
      // 400 + message as a wrong code — no account-enumeration signal.
      const res = await request(app)
        .post('/api/auth/reset-password')
        .send({ email: unknownEmail, code: '123456', password: 'reset5678' });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('验证码无效或已过期');

      // Cross-check: identical shape to the wrong-code path on a real account.
      const realEmail = freshEmail();
      await registerUser(realEmail);
      await sendCode(realEmail, 'reset');
      const wrongCodeRes = await request(app)
        .post('/api/auth/reset-password')
        .send({ email: realEmail, code: '000000', password: 'reset5678' });
      expect(wrongCodeRes.status).toBe(res.status);
      expect(wrongCodeRes.body.error).toBe(res.body.error);
    });
  });
});
