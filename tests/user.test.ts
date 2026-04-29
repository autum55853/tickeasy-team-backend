import request from 'supertest';
import app from '../app.js';
import { AppDataSource } from '../config/database.js';
import { User } from '../models/user.js';
import { createTestUser, generateTestToken } from './helpers/factories.js';

let testUser: User;
let authToken: string;

beforeAll(async () => {
  testUser = await createTestUser({ name: 'User Tester' });
  authToken = generateTestToken(testUser.userId, testUser.role);
});

afterAll(async () => {
  if (AppDataSource.isInitialized && testUser) {
    await AppDataSource.getRepository(User).delete({ userId: testUser.userId });
  }
});

// ════════════════════════════════════════════════════════════════════════
// GET /api/v1/users/profile
// ════════════════════════════════════════════════════════════════════════
describe('GET /api/v1/users/profile', () => {
  it('成功取得用戶資料 → 200', async () => {
    const res = await request(app)
      .get('/api/v1/users/profile')
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.body.data.user.userId).toBe(testUser.userId);
    expect(res.body.data.user.email).toBe(testUser.email);
    expect(res.body.data.user.password).toBeUndefined();
  });

  it('未帶 token → 401', async () => {
    const res = await request(app).get('/api/v1/users/profile');

    expect(res.status).toBe(401);
    expect(res.body.status).toBe('failed');
  });

  it('token 無效 → 401', async () => {
    const res = await request(app)
      .get('/api/v1/users/profile')
      .set('Authorization', 'Bearer invalid.token.here');

    expect(res.status).toBe(401);
    expect(res.body.status).toBe('failed');
  });
});

// ════════════════════════════════════════════════════════════════════════
// PUT /api/v1/users/profile
// ════════════════════════════════════════════════════════════════════════
describe('PUT /api/v1/users/profile', () => {
  it('成功更新姓名 → 200', async () => {
    const res = await request(app)
      .put('/api/v1/users/profile')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ name: 'Updated Name' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.body.data.user.name).toBe('Updated Name');
  });

  it('成功更新性別（中文）→ 200', async () => {
    const res = await request(app)
      .put('/api/v1/users/profile')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ gender: '男' });

    expect(res.status).toBe(200);
    expect(res.body.data.user.gender).toBe('男');
  });

  it('成功清除性別（null）→ 200', async () => {
    const res = await request(app)
      .put('/api/v1/users/profile')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ gender: null });

    expect(res.status).toBe(200);
    expect(res.body.data.user.gender).toBeNull();
  });

  it('性別為空字串 → 400', async () => {
    const res = await request(app)
      .put('/api/v1/users/profile')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ gender: '' });

    expect(res.status).toBe(400);
    expect(res.body.status).toBe('failed');
  });

  it('性別值無效 → 400', async () => {
    const res = await request(app)
      .put('/api/v1/users/profile')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ gender: '不明' });

    expect(res.status).toBe(400);
    expect(res.body.status).toBe('failed');
  });

  it('偏好地區含無效值 → 400', async () => {
    const res = await request(app)
      .put('/api/v1/users/profile')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ preferredRegions: ['北部', 'INVALID_REGION'] });

    expect(res.status).toBe(400);
    expect(res.body.status).toBe('failed');
  });

  it('成功更新偏好地區 → 200', async () => {
    const res = await request(app)
      .put('/api/v1/users/profile')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ preferredRegions: ['北部', '南部'] });

    expect(res.status).toBe(200);
    expect(res.body.data.user.preferredRegions).toEqual(
      expect.arrayContaining(['北部', '南部'])
    );
  });

  it('偏好活動類型含無效值 → 400', async () => {
    const res = await request(app)
      .put('/api/v1/users/profile')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ preferredEventTypes: ['流行音樂', 'INVALID'] });

    expect(res.status).toBe(400);
    expect(res.body.status).toBe('failed');
  });

  it('生日格式錯誤 → 400', async () => {
    const res = await request(app)
      .put('/api/v1/users/profile')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ birthday: 'not-a-date' });

    expect(res.status).toBe(400);
    expect(res.body.status).toBe('failed');
  });

  it('未帶 token → 401', async () => {
    const res = await request(app)
      .put('/api/v1/users/profile')
      .send({ name: 'No Auth' });

    expect(res.status).toBe(401);
    expect(res.body.status).toBe('failed');
  });
});

// ════════════════════════════════════════════════════════════════════════
// GET /api/v1/users/profile/regions
// ════════════════════════════════════════════════════════════════════════
describe('GET /api/v1/users/profile/regions', () => {
  it('成功取得地區選項（不需認證）→ 200', async () => {
    const res = await request(app).get('/api/v1/users/profile/regions');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);

    const first = res.body.data[0];
    expect(first).toHaveProperty('label');
    expect(first).toHaveProperty('value');
    expect(first).toHaveProperty('subLabel');
  });
});

// ════════════════════════════════════════════════════════════════════════
// GET /api/v1/users/profile/event-types
// ════════════════════════════════════════════════════════════════════════
describe('GET /api/v1/users/profile/event-types', () => {
  it('成功取得活動類型選項（不需認證）→ 200', async () => {
    const res = await request(app).get('/api/v1/users/profile/event-types');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);

    const first = res.body.data[0];
    expect(first).toHaveProperty('label');
    expect(first).toHaveProperty('value');
    expect(first).toHaveProperty('subLabel');
  });
});
