import { createServer } from 'http';
import type { Server } from 'http';
import request from 'supertest';
import app from '../app.js';
import { AppDataSource } from '../config/database.js';
import { Concert } from '../models/concert.js';
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
} from './helpers/factories.js';

// ── 測試用夾具 ──────────────────────────────────────────────────────────
let testUser: User;
let testOrg: Organization;
let testVenue: Venue;
let testLocationTag: LocationTag;
let testMusicTag: MusicTag;
let testConcert: Concert;

let server: Server;

beforeAll(async () => {
  server = createServer(app).listen(0);
  testUser = await createTestUser({ name: 'Compression Tester' });
  testOrg = await createTestOrganization(testUser.userId);
  testVenue = await createTestVenue();
  testLocationTag = await createTestLocationTag();
  testMusicTag = await createTestMusicTag();

  const concertRepo = AppDataSource.getRepository(Concert);
  testConcert = await concertRepo.save(concertRepo.create({
    organizationId: testOrg.organizationId,
    venueId: testVenue.venueId,
    locationTagId: testLocationTag.locationTagId,
    musicTagId: testMusicTag.musicTagId,
    conTitle: `Compression Test Concert ${Date.now()}`,
    conInfoStatus: 'published',
    // 撐大回應內容，確保超過 compression 預設 1KB threshold
    conIntroduction: '演唱會介紹內容。'.repeat(600),
  }));
});

afterAll(async () => {
  if (server) {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }

  if (!AppDataSource.isInitialized) return;

  await AppDataSource.getRepository(Concert).delete({ concertId: testConcert.concertId });
  await AppDataSource.getRepository(Organization).delete({ organizationId: testOrg.organizationId });
  await AppDataSource.getRepository(User).delete({ userId: testUser.userId });
  await AppDataSource.getRepository(Venue).delete({ venueId: testVenue.venueId });
  await AppDataSource.getRepository(LocationTag).delete({ locationTagId: testLocationTag.locationTagId });
  await AppDataSource.getRepository(MusicTag).delete({ musicTagId: testMusicTag.musicTagId });
});

describe('回應壓縮（compression middleware）', () => {
  it('客戶端支援 gzip 時，大 JSON 回應以 gzip 壓縮傳輸', async () => {
    const res = await request(app)
      .get(`/api/v1/concerts/${testConcert.concertId}`)
      .set('Accept-Encoding', 'gzip');

    expect(res.status).toBe(200);
    // 先確認回應夠大（超過壓縮 threshold），此斷言失敗代表測試資料設計錯誤
    expect(JSON.stringify(res.body).length).toBeGreaterThan(1024);
    expect(res.headers['content-encoding']).toBe('gzip');
    // supertest 會自動解壓，內容應完整可讀
    expect(res.body.status).toBe('success');
    expect(res.body.data.concertId).toBe(testConcert.concertId);
  });

  it('客戶端不支援壓縮時，回應不帶 Content-Encoding 且內容完整', async () => {
    const res = await request(app)
      .get(`/api/v1/concerts/${testConcert.concertId}`)
      .set('Accept-Encoding', 'identity');

    expect(res.status).toBe(200);
    expect(res.headers['content-encoding']).toBeUndefined();
    expect(res.body.data.concertId).toBe(testConcert.concertId);
  });
});
