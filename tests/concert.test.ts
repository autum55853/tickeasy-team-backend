import request from 'supertest';
import app from '../app.js';
import { AppDataSource } from '../config/database.js';
import { Concert } from '../models/concert.js';
import { TicketType } from '../models/ticket-type.js';
import { User } from '../models/user.js';
import { Organization } from '../models/organization.js';
import { Venue } from '../models/venue.js';
import { LocationTag } from '../models/location-tag.js';
import { MusicTag } from '../models/music-tag.js';
import {
  createTestUser,
  createTestOrganization,
  createTestVenue,
  createTestLocationTag,
  createTestMusicTag,
  generateTestToken,
} from './helpers/factories.js';

// ── 測試用夾具 ──────────────────────────────────────────────────────────
let testUser: User;
let authToken: string;
let testOrg: Organization;
let testVenue: Venue;
let testLocationTag: LocationTag;
let testMusicTag: MusicTag;

// 測試建立的演唱會 ID（用於後續清理）
const createdConcertIds: string[] = [];

// ── 草稿演唱會的最小 payload ────────────────────────────────────────────
function draftPayload(overrides: Record<string, unknown> = {}) {
  return {
    organizationId: testOrg.organizationId,
    venueId: testVenue.venueId,
    locationTagId: testLocationTag.locationTagId,
    musicTagId: testMusicTag.musicTagId,
    title: `Test Concert ${Date.now()}`,
    conInfoStatus: 'draft',
    ticketTypes: [],
    ...overrides,
  };
}

// ── 完整 published 演唱會 payload ───────────────────────────────────────
function publishedPayload(overrides: Record<string, unknown> = {}) {
  const base = draftPayload({
    introduction: '測試介紹',
    location: '台北',
    address: '台北市信義區測試路1號',
    eventStartDate: '2026-09-01',
    eventEndDate: '2026-09-02',
    ticketPurchaseMethod: '線上購票',
    precautions: '請準時入場',
    refundPolicy: '不退票',
    conInfoStatus: 'published',
    imgBanner: 'https://example.com/banner.jpg',
    imgSeattable: 'https://example.com/seat.jpg',
    ticketTypes: [
      {
        ticketTypeName: '一般票',
        entranceType: '一般入場',
        ticketBenefits: '無',
        ticketRefundPolicy: '不退票',
        ticketTypePrice: 1000,
        totalQuantity: 100,
        sellBeginDate: '2026-08-01T00:00:00',
        sellEndDate: '2026-08-31T23:59:59',
      },
    ],
  });
  return { ...base, ...overrides };
}

beforeAll(async () => {
  testUser = await createTestUser({ name: 'Concert Tester' });
  authToken = generateTestToken(testUser.userId, testUser.role);
  testOrg = await createTestOrganization(testUser.userId);
  testVenue = await createTestVenue();
  testLocationTag = await createTestLocationTag();
  testMusicTag = await createTestMusicTag();
});

afterAll(async () => {
  if (!AppDataSource.isInitialized) return;

  // 按照 FK 依賴順序刪除
  if (createdConcertIds.length > 0) {
    await AppDataSource.getRepository(TicketType).delete(
      createdConcertIds.map(id => ({ concert: { concertId: id } })).reduce(
        (_, curr) => curr, {} as any
      )
    );
    for (const id of createdConcertIds) {
      await AppDataSource.getRepository(TicketType)
        .createQueryBuilder()
        .delete()
        .where('"concertId" = :id', { id })
        .execute();
      await AppDataSource.getRepository(Concert).delete({ concertId: id });
    }
  }

  await AppDataSource.getRepository(Organization).delete({ organizationId: testOrg.organizationId });
  await AppDataSource.getRepository(User).delete({ userId: testUser.userId });
  await AppDataSource.getRepository(Venue).delete({ venueId: testVenue.venueId });
  await AppDataSource.getRepository(LocationTag).delete({ locationTagId: testLocationTag.locationTagId });
  await AppDataSource.getRepository(MusicTag).delete({ musicTagId: testMusicTag.musicTagId });
});

// ════════════════════════════════════════════════════════════════════════
// POST /api/v1/concerts（建立演唱會）
// ════════════════════════════════════════════════════════════════════════
describe('POST /api/v1/concerts', () => {
  it('成功建立草稿演唱會 → 201', async () => {
    const res = await request(app)
      .post('/api/v1/concerts')
      .set('Authorization', `Bearer ${authToken}`)
      .send(draftPayload());

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('success');
    expect(res.body.data.concert.conInfoStatus).toBe('draft');

    createdConcertIds.push(res.body.data.concert.concertId);
  });

  it('演唱會名稱重複 → 409', async () => {
    const payload = draftPayload({ title: `Duplicate ${Date.now()}` });
    // 先建立
    const first = await request(app)
      .post('/api/v1/concerts')
      .set('Authorization', `Bearer ${authToken}`)
      .send(payload);
    createdConcertIds.push(first.body.data.concert.concertId);

    // 再建立同名
    const res = await request(app)
      .post('/api/v1/concerts')
      .set('Authorization', `Bearer ${authToken}`)
      .send(payload);

    expect(res.status).toBe(409);
    expect(res.body.status).toBe('failed');
  });

  it('未認證 → 401', async () => {
    const res = await request(app)
      .post('/api/v1/concerts')
      .send(draftPayload());

    expect(res.status).toBe(401);
    expect(res.body.status).toBe('failed');
  });

  it('published 狀態缺少必填欄位 → 400', async () => {
    const res = await request(app)
      .post('/api/v1/concerts')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        ...draftPayload(),
        conInfoStatus: 'published',
        // 故意不帶 introduction, location 等必填欄位
      });

    expect(res.status).toBe(400);
    expect(res.body.status).toBe('failed');
  });

  it('published 狀態缺少主視覺圖 → 400', async () => {
    const res = await request(app)
      .post('/api/v1/concerts')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        ...publishedPayload(),
        imgBanner: undefined,
        imgSeattable: undefined,
      });

    expect(res.status).toBe(400);
    expect(res.body.status).toBe('failed');
  });

  it('結束時間早於開始時間 → 400', async () => {
    const res = await request(app)
      .post('/api/v1/concerts')
      .set('Authorization', `Bearer ${authToken}`)
      .send(publishedPayload({
        eventStartDate: '2026-09-10',
        eventEndDate: '2026-09-01',
      }));

    expect(res.status).toBe(400);
    expect(res.body.status).toBe('failed');
  });

  it('票種售票結束早於開始 → 400', async () => {
    const res = await request(app)
      .post('/api/v1/concerts')
      .set('Authorization', `Bearer ${authToken}`)
      .send(publishedPayload({
        ticketTypes: [{
          ticketTypeName: '一般票',
          entranceType: '一般入場',
          ticketBenefits: '無',
          ticketRefundPolicy: '不退票',
          ticketTypePrice: 1000,
          totalQuantity: 100,
          sellBeginDate: '2026-08-31T23:59:59',
          sellEndDate: '2026-08-01T00:00:00',
        }],
      }));

    expect(res.status).toBe(400);
    expect(res.body.status).toBe('failed');
  });
});

// ════════════════════════════════════════════════════════════════════════
// PUT /api/v1/concerts/:concertId（修改演唱會）
// ════════════════════════════════════════════════════════════════════════
describe('PUT /api/v1/concerts/:concertId', () => {
  let draftConcertId: string;

  beforeAll(async () => {
    const res = await request(app)
      .post('/api/v1/concerts')
      .set('Authorization', `Bearer ${authToken}`)
      .send(draftPayload({ title: `Update Test ${Date.now()}` }));

    draftConcertId = res.body.data.concert.concertId;
    createdConcertIds.push(draftConcertId);
  });

  it('成功更新草稿演唱會 → 200', async () => {
    const res = await request(app)
      .put(`/api/v1/concerts/${draftConcertId}`)
      .set('Authorization', `Bearer ${authToken}`)
      .send(draftPayload({ title: `Updated Title ${Date.now()}` }));

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
  });

  it('未認證 → 401', async () => {
    const res = await request(app)
      .put(`/api/v1/concerts/${draftConcertId}`)
      .send(draftPayload());

    expect(res.status).toBe(401);
    expect(res.body.status).toBe('failed');
  });

  it('演唱會不存在 → 404', async () => {
    const fakeId = '00000000-0000-0000-0000-000000000000';
    const res = await request(app)
      .put(`/api/v1/concerts/${fakeId}`)
      .set('Authorization', `Bearer ${authToken}`)
      .send(draftPayload());

    expect(res.status).toBe(404);
    expect(res.body.status).toBe('failed');
  });

  it('非草稿狀態不可編輯 → 400', async () => {
    // 直接在 DB 把狀態改成 published 再嘗試更新
    await AppDataSource.getRepository(Concert).update(
      { concertId: draftConcertId },
      { conInfoStatus: 'published' }
    );

    const res = await request(app)
      .put(`/api/v1/concerts/${draftConcertId}`)
      .set('Authorization', `Bearer ${authToken}`)
      .send(draftPayload());

    expect(res.status).toBe(400);
    expect(res.body.status).toBe('failed');

    // 還原回 draft 以免影響清理流程
    await AppDataSource.getRepository(Concert).update(
      { concertId: draftConcertId },
      { conInfoStatus: 'draft' }
    );
  });
});

// ════════════════════════════════════════════════════════════════════════
// PATCH /api/v1/concerts/:concertId/visit
// ════════════════════════════════════════════════════════════════════════
describe('PATCH /api/v1/concerts/:concertId/visit', () => {
  let concertId: string;

  beforeAll(async () => {
    const res = await request(app)
      .post('/api/v1/concerts')
      .set('Authorization', `Bearer ${authToken}`)
      .send(draftPayload({ title: `Visit Test ${Date.now()}` }));

    concertId = res.body.data.concert.concertId;
    createdConcertIds.push(concertId);
  });

  it('成功增加 visitCount → 200', async () => {
    const res = await request(app)
      .patch(`/api/v1/concerts/${concertId}/visit`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(typeof res.body.data.visitCount).toBe('number');
    expect(res.body.data.visitCount).toBeGreaterThan(0);
  });

  it('連續增加 → visitCount 累加', async () => {
    await request(app).patch(`/api/v1/concerts/${concertId}/visit`);
    const res = await request(app).patch(`/api/v1/concerts/${concertId}/visit`);

    expect(res.body.data.visitCount).toBeGreaterThanOrEqual(3);
  });

  it('演唱會不存在 → 404', async () => {
    const fakeId = '00000000-0000-0000-0000-000000000000';
    const res = await request(app)
      .patch(`/api/v1/concerts/${fakeId}/visit`);

    expect(res.status).toBe(404);
    expect(res.body.status).toBe('failed');
  });
});

// ════════════════════════════════════════════════════════════════════════
// PATCH /api/v1/concerts/:concertId/promotion
// ════════════════════════════════════════════════════════════════════════
describe('PATCH /api/v1/concerts/:concertId/promotion', () => {
  let concertId: string;

  beforeAll(async () => {
    const res = await request(app)
      .post('/api/v1/concerts')
      .set('Authorization', `Bearer ${authToken}`)
      .send(draftPayload({ title: `Promo Test ${Date.now()}` }));

    concertId = res.body.data.concert.concertId;
    createdConcertIds.push(concertId);
  });

  it('成功設定 promotion → 200', async () => {
    const res = await request(app)
      .patch(`/api/v1/concerts/${concertId}/promotion`)
      .send({ promotion: 5 });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.body.data.promotion).toBe(5);
  });

  it('promotion 為 0 → 200', async () => {
    const res = await request(app)
      .patch(`/api/v1/concerts/${concertId}/promotion`)
      .send({ promotion: 0 });

    expect(res.status).toBe(200);
    expect(res.body.data.promotion).toBe(0);
  });

  it('promotion 為負數 → 400', async () => {
    const res = await request(app)
      .patch(`/api/v1/concerts/${concertId}/promotion`)
      .send({ promotion: -1 });

    expect(res.status).toBe(400);
    expect(res.body.status).toBe('failed');
  });

  it('promotion 為字串 → 400', async () => {
    const res = await request(app)
      .patch(`/api/v1/concerts/${concertId}/promotion`)
      .send({ promotion: 'high' });

    expect(res.status).toBe(400);
    expect(res.body.status).toBe('failed');
  });

  it('演唱會不存在 → 404', async () => {
    const fakeId = '00000000-0000-0000-0000-000000000000';
    const res = await request(app)
      .patch(`/api/v1/concerts/${fakeId}/promotion`)
      .send({ promotion: 1 });

    expect(res.status).toBe(404);
    expect(res.body.status).toBe('failed');
  });
});

// ════════════════════════════════════════════════════════════════════════
// GET /api/v1/concerts/venues
// ════════════════════════════════════════════════════════════════════════
describe('GET /api/v1/concerts/venues', () => {
  it('成功取得場地列表 → 200', async () => {
    const res = await request(app).get('/api/v1/concerts/venues');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(Array.isArray(res.body.data)).toBe(true);
    // 至少有 beforeAll 建立的 testVenue
    expect(res.body.data.length).toBeGreaterThan(0);
    expect(res.body.data[0]).toHaveProperty('venueId');
    expect(res.body.data[0]).toHaveProperty('venueName');
  });
});

// ════════════════════════════════════════════════════════════════════════
// GET /api/v1/concerts/popular
// ════════════════════════════════════════════════════════════════════════
describe('GET /api/v1/concerts/popular', () => {
  it('回應格式正確（有資料回 200，無資料回 404）', async () => {
    const res = await request(app).get('/api/v1/concerts/popular');

    expect([200, 404]).toContain(res.status);
    expect(res.body.status).toBeDefined();

    if (res.status === 200) {
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data[0]).toHaveProperty('concertId');
    }
  });

  it('take 參數限制回傳數量', async () => {
    const res = await request(app).get('/api/v1/concerts/popular?take=1');

    if (res.status === 200) {
      expect(res.body.data.length).toBeLessThanOrEqual(1);
    } else {
      expect(res.status).toBe(404);
    }
  });
});

// ════════════════════════════════════════════════════════════════════════
// GET /api/v1/concerts/search
// ════════════════════════════════════════════════════════════════════════
describe('GET /api/v1/concerts/search', () => {
  it('回應格式正確（有資料回 200，無資料回 404）', async () => {
    const res = await request(app).get('/api/v1/concerts/search');

    expect([200, 404]).toContain(res.status);
    expect(res.body.status).toBeDefined();

    if (res.status === 200) {
      expect(res.body).toHaveProperty('data');
      expect(res.body).toHaveProperty('count');
      expect(res.body).toHaveProperty('totalPages');
    }
  });

  it('keyword 搜尋不存在的關鍵字 → 404', async () => {
    const res = await request(app)
      .get('/api/v1/concerts/search?keyword=zzz_no_match_9999');

    expect(res.status).toBe(404);
    expect(res.body.status).toBe('failed');
  });
});

// ════════════════════════════════════════════════════════════════════════
// GET /api/v1/concerts/banners
// ════════════════════════════════════════════════════════════════════════
describe('GET /api/v1/concerts/banners', () => {
  it('回應格式正確（有資料回 200，無資料回 404）', async () => {
    const res = await request(app).get('/api/v1/concerts/banners');

    expect([200, 404]).toContain(res.status);
    expect(res.body.status).toBeDefined();

    if (res.status === 200) {
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeLessThanOrEqual(5);
    }
  });
});
