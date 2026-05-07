import { jest } from '@jest/globals';
import request from 'supertest';
import { AppDataSource } from '../config/database.js';
import { User } from '../models/user.js';

// ── Email mock（必須在 app 動態 import 前設定）──────────────────────────
const mockSendVerificationEmail = jest.fn<(email: string, code: string) => Promise<void>>().mockResolvedValue(undefined);
const mockSendPasswordResetEmail = jest.fn<(email: string, code: string) => Promise<void>>().mockResolvedValue(undefined);

jest.unstable_mockModule('../utils/email.js', () => ({
  sendVerificationEmail: mockSendVerificationEmail,
  sendPasswordResetEmail: mockSendPasswordResetEmail,
  getTransporter: jest.fn<() => Promise<object>>().mockResolvedValue({}),
}));

// ── 動態 import app（email mock 已生效）──────────────────────────────────
const { default: app } = await import('../app.js');

// ── 測試用帳號 ──────────────────────────────────────────────────────────
const TEST_EMAIL = `auth-test-${Date.now()}@example.com`;
const TEST_PASSWORD = 'Test1234';
const TEST_NAME = 'Auth Tester';

let createdUserId: string;
let capturedVerificationCode: string;
let capturedResetCode: string;

// ── 清理測試資料 ────────────────────────────────────────────────────────
afterAll(async () => {
  if (AppDataSource.isInitialized) {
    await AppDataSource.getRepository(User).delete({ email: TEST_EMAIL });
  }
});

// ════════════════════════════════════════════════════════════════════════
// POST /api/v1/auth/register
// ════════════════════════════════════════════════════════════════════════
describe('POST /api/v1/auth/register', () => {
  beforeEach(() => {
    mockSendVerificationEmail.mockClear();
  });

  it('成功註冊 → 201，回傳 token 與 user', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: TEST_EMAIL, password: TEST_PASSWORD, name: TEST_NAME });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('success');
    expect(res.body.data.token).toBeDefined();
    expect(res.body.data.user.email).toBe(TEST_EMAIL);
    expect(res.body.data.user.password).toBeUndefined();
    expect(mockSendVerificationEmail).toHaveBeenCalledWith(TEST_EMAIL, expect.any(String));

    createdUserId = res.body.data.user.userId;
    capturedVerificationCode = mockSendVerificationEmail.mock.calls[0]?.[1] as string;
  });

  it('Email 已被使用 → 409', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: TEST_EMAIL, password: TEST_PASSWORD, name: TEST_NAME });

    expect(res.status).toBe(409);
    expect(res.body.status).toBe('failed');
  });

  it('缺少 email → 400', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ password: TEST_PASSWORD, name: TEST_NAME });

    expect(res.status).toBe(400);
    expect(res.body.status).toBe('failed');
  });

  it('缺少 password → 400', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'another@example.com', name: TEST_NAME });

    expect(res.status).toBe(400);
    expect(res.body.status).toBe('failed');
  });

  it('缺少 name → 400', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'another@example.com', password: TEST_PASSWORD });

    expect(res.status).toBe(400);
    expect(res.body.status).toBe('failed');
  });

  it('密碼格式不符（少於8碼）→ 400', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'another@example.com', password: 'abc123', name: TEST_NAME });

    expect(res.status).toBe(400);
    expect(res.body.status).toBe('failed');
  });

  it('密碼格式不符（純數字）→ 400', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'another@example.com', password: '12345678', name: TEST_NAME });

    expect(res.status).toBe(400);
    expect(res.body.status).toBe('failed');
  });

  it('姓名少於2字元 → 400', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'another@example.com', password: TEST_PASSWORD, name: 'A' });

    expect(res.status).toBe(400);
    expect(res.body.status).toBe('failed');
  });
});

// ════════════════════════════════════════════════════════════════════════
// POST /api/v1/auth/login
// ════════════════════════════════════════════════════════════════════════
describe('POST /api/v1/auth/login', () => {
  let authToken: string;

  it('成功登入 → 200，回傳 token', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: TEST_EMAIL, password: TEST_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.body.data.token).toBeDefined();
    expect(res.body.data.user.password).toBeUndefined();

    authToken = res.body.data.token;
  });

  it('缺少 email → 400', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ password: TEST_PASSWORD });

    expect(res.status).toBe(400);
    expect(res.body.status).toBe('failed');
  });

  it('缺少 password → 400', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: TEST_EMAIL });

    expect(res.status).toBe(400);
    expect(res.body.status).toBe('failed');
  });

  it('密碼錯誤 → 401', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: TEST_EMAIL, password: 'WrongPass1' });

    expect(res.status).toBe(401);
    expect(res.body.status).toBe('failed');
  });

  it('Email 不存在 → 401', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'noexist@example.com', password: TEST_PASSWORD });

    expect(res.status).toBe(401);
    expect(res.body.status).toBe('failed');
  });
});

// ════════════════════════════════════════════════════════════════════════
// POST /api/v1/auth/verify-email
// ════════════════════════════════════════════════════════════════════════
describe('POST /api/v1/auth/verify-email', () => {
  // 直接使用 register 時捕捉的驗證碼，避免 resend 觸發 10 分鐘 rate limit
  const verificationCode = () => capturedVerificationCode;

  it('缺少 email → 400', async () => {
    const res = await request(app)
      .post('/api/v1/auth/verify-email')
      .send({ code: '123456' });

    expect(res.status).toBe(400);
    expect(res.body.status).toBe('failed');
  });

  it('缺少 code → 400', async () => {
    const res = await request(app)
      .post('/api/v1/auth/verify-email')
      .send({ email: TEST_EMAIL });

    expect(res.status).toBe(400);
    expect(res.body.status).toBe('failed');
  });

  it('驗證碼錯誤 → 400', async () => {
    const res = await request(app)
      .post('/api/v1/auth/verify-email')
      .send({ email: TEST_EMAIL, code: '000000' });

    expect(res.status).toBe(400);
    expect(res.body.status).toBe('failed');
  });

  it('正確驗證碼 → 200，isEmailVerified: true', async () => {
    const res = await request(app)
      .post('/api/v1/auth/verify-email')
      .send({ email: TEST_EMAIL, code: verificationCode() });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.body.data.isEmailVerified).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════════════
// POST /api/v1/auth/resend-verification
// ════════════════════════════════════════════════════════════════════════
describe('POST /api/v1/auth/resend-verification', () => {
  it('缺少 email → 400', async () => {
    const res = await request(app)
      .post('/api/v1/auth/resend-verification')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.status).toBe('failed');
  });

  it('用戶不存在 → 404', async () => {
    const res = await request(app)
      .post('/api/v1/auth/resend-verification')
      .send({ email: 'noexist@example.com' });

    expect(res.status).toBe(404);
    expect(res.body.status).toBe('failed');
  });

  it('已驗證的帳號 → 400', async () => {
    // TEST_EMAIL 已在前一個 describe 完成驗證
    const res = await request(app)
      .post('/api/v1/auth/resend-verification')
      .send({ email: TEST_EMAIL });

    expect(res.status).toBe(400);
    expect(res.body.status).toBe('failed');
  });
});

// ════════════════════════════════════════════════════════════════════════
// POST /api/v1/auth/request-password-reset
// ════════════════════════════════════════════════════════════════════════
describe('POST /api/v1/auth/request-password-reset', () => {
  beforeEach(() => {
    mockSendPasswordResetEmail.mockClear();
  });

  it('缺少 email → 400', async () => {
    const res = await request(app)
      .post('/api/v1/auth/request-password-reset')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.status).toBe('failed');
  });

  it('用戶不存在 → 404', async () => {
    const res = await request(app)
      .post('/api/v1/auth/request-password-reset')
      .send({ email: 'noexist@example.com' });

    expect(res.status).toBe(404);
    expect(res.body.status).toBe('failed');
  });

  it('成功發送重置郵件 → 200', async () => {
    const res = await request(app)
      .post('/api/v1/auth/request-password-reset')
      .send({ email: TEST_EMAIL });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(mockSendPasswordResetEmail).toHaveBeenCalledWith(TEST_EMAIL, expect.any(String));
    capturedResetCode = mockSendPasswordResetEmail.mock.calls[0]?.[1] as string;
  });
});

// ════════════════════════════════════════════════════════════════════════
// POST /api/v1/auth/reset-password
// ════════════════════════════════════════════════════════════════════════
describe('POST /api/v1/auth/reset-password', () => {
  const NEW_PASSWORD = 'NewPass5678';
  // 直接使用 request-password-reset 成功時捕捉的碼，避免二次請求觸發 rate limit
  const resetCode = () => capturedResetCode;

  it('缺少 email → 400', async () => {
    const res = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ code: resetCode(), newPassword: NEW_PASSWORD });

    expect(res.status).toBe(400);
    expect(res.body.status).toBe('failed');
  });

  it('缺少 code → 400', async () => {
    const res = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ email: TEST_EMAIL, newPassword: NEW_PASSWORD });

    expect(res.status).toBe(400);
    expect(res.body.status).toBe('failed');
  });

  it('缺少 newPassword → 400', async () => {
    const res = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ email: TEST_EMAIL, code: resetCode() });

    expect(res.status).toBe(400);
    expect(res.body.status).toBe('failed');
  });

  it('密碼格式不符 → 400', async () => {
    const res = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ email: TEST_EMAIL, code: resetCode(), newPassword: 'short' });

    expect(res.status).toBe(400);
    expect(res.body.status).toBe('failed');
  });

  it('重置碼錯誤 → 400', async () => {
    const res = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ email: TEST_EMAIL, code: '000000', newPassword: NEW_PASSWORD });

    expect(res.status).toBe(400);
    expect(res.body.status).toBe('failed');
  });

  it('正確重置碼 → 200，可用新密碼登入', async () => {
    const res = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ email: TEST_EMAIL, code: resetCode(), newPassword: NEW_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');

    // 驗證新密碼可以登入
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: TEST_EMAIL, password: NEW_PASSWORD });

    expect(loginRes.status).toBe(200);
    expect(loginRes.body.data.token).toBeDefined();
  });
});
