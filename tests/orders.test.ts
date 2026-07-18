import { createServer } from 'http';
import type { Server } from 'http';
import { jest } from '@jest/globals';
import request from 'supertest';
import { Repository } from 'typeorm';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import app from '../app.js';
import { AppDataSource } from '../config/database.js';
import { Order } from '../models/order.js';
import { Payment } from '../models/payment.js';
import { TicketType } from '../models/ticket-type.js';
import { ConcertSession } from '../models/concert-session.js';
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
  generateTestToken,
} from './helpers/factories.js';

// ── 測試用夾具 ──────────────────────────────────────────────────────────
let testUser: User;
let authToken: string;
let testOrg: Organization;
let testVenue: Venue;
let testLocationTag: LocationTag;
let testMusicTag: MusicTag;
let testConcert: Concert;
let testSession: ConcertSession;

let server: Server;

// 測試建立的訂單 / 票種 / 支付 ID（用於後續清理）
const createdOrderIds: string[] = [];
const createdTicketTypeIds: string[] = [];
const createdPaymentIds: string[] = [];

// orderNumber 格式：yymmdd(6碼) + hhmmss(6碼) + '-' + orderId 末 4 碼大寫 hex
const ORDER_NUMBER_REGEX = /^\d{12}-[0-9A-F]{4}$/;

function orderPayload(overrides: Record<string, unknown> = {}) {
  return {
    purchaserName: '測試購票人',
    purchaserEmail: 'buyer@test.com',
    purchaserPhone: '0912345678',
    ...overrides,
  };
}

async function createTestTicketType(overrides: Partial<{
  totalQuantity: number;
  remainingQuantity: number;
}> = {}): Promise<TicketType> {
  const repo = AppDataSource.getRepository(TicketType);
  const now = new Date();
  const ticketType = await repo.save(repo.create({
    concertSessionId: testSession.sessionId,
    ticketTypeName: '一般票',
    entranceType: '一般入場',
    ticketBenefits: '無',
    ticketRefundPolicy: '不退票',
    ticketTypePrice: 1000,
    totalQuantity: overrides.totalQuantity ?? 10,
    remainingQuantity: overrides.remainingQuantity ?? 10,
    sellBeginDate: new Date(now.getTime() - 24 * 60 * 60 * 1000),
    sellEndDate: new Date(now.getTime() + 24 * 60 * 60 * 1000),
  }));
  createdTicketTypeIds.push(ticketType.ticketTypeId);
  return ticketType;
}

beforeAll(async () => {
  server = createServer(app).listen(0);
  testUser = await createTestUser({ name: 'Order Tester' });
  authToken = generateTestToken(testUser.userId, testUser.role);
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
    conTitle: `Order Test Concert ${Date.now()}`,
    conInfoStatus: 'published',
  }));

  const sessionRepo = AppDataSource.getRepository(ConcertSession);
  testSession = await sessionRepo.save(sessionRepo.create({
    concertId: testConcert.concertId,
    sessionTitle: '測試場次',
    // 退款測試需要場次日期在 7 天退款期限之外
    sessionDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  }));
});

afterAll(async () => {
  if (server) {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }

  if (!AppDataSource.isInitialized) return;

  // 按照 FK 依賴順序刪除
  if (createdPaymentIds.length > 0) {
    await AppDataSource.getRepository(Payment).delete(createdPaymentIds);
  }
  if (createdOrderIds.length > 0) {
    await AppDataSource.getRepository(Order).delete(createdOrderIds);
  }
  if (createdTicketTypeIds.length > 0) {
    await AppDataSource.getRepository(TicketType).delete(createdTicketTypeIds);
  }
  if (testSession) {
    await AppDataSource.getRepository(ConcertSession).delete({ sessionId: testSession.sessionId });
  }
  if (testConcert) {
    await AppDataSource.getRepository(Concert).delete({ concertId: testConcert.concertId });
  }
  await AppDataSource.getRepository(Organization).delete({ organizationId: testOrg.organizationId });
  await AppDataSource.getRepository(User).delete({ userId: testUser.userId });
  await AppDataSource.getRepository(Venue).delete({ venueId: testVenue.venueId });
  await AppDataSource.getRepository(LocationTag).delete({ locationTagId: testLocationTag.locationTagId });
  await AppDataSource.getRepository(MusicTag).delete({ musicTagId: testMusicTag.musicTagId });
});

describe('POST /api/v1/orders', () => {
  it('成功路徑：建立訂單、扣庫存、orderNumber 格式正確（一次寫入完成）', async () => {
    const ticketType = await createTestTicketType({ totalQuantity: 5, remainingQuantity: 5 });

    const res = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ ticketTypeId: ticketType.ticketTypeId, ...orderPayload() });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.body.data.orderId).toBeDefined();
    createdOrderIds.push(res.body.data.orderId);

    const savedOrder = await AppDataSource.getRepository(Order).findOne({
      where: { orderId: res.body.data.orderId },
    });
    expect(savedOrder).not.toBeNull();
    // orderNumber 已在 create 時一併寫入，格式與現行實作一致
    expect(savedOrder!.orderNumber).toMatch(ORDER_NUMBER_REGEX);
    expect(savedOrder!.orderNumber.endsWith(savedOrder!.orderId.slice(-4).toUpperCase())).toBe(true);

    const refreshedTicketType = await AppDataSource.getRepository(TicketType).findOne({
      where: { ticketTypeId: ticketType.ticketTypeId },
    });
    expect(refreshedTicketType!.remainingQuantity).toBe(4);
  });

  it('未帶 token 時回傳 401', async () => {
    const ticketType = await createTestTicketType();

    const res = await request(app)
      .post('/api/v1/orders')
      .send({ ticketTypeId: ticketType.ticketTypeId, ...orderPayload() });

    expect(res.status).toBe(401);
  });

  it('必填欄位缺少時回傳 400', async () => {
    const ticketType = await createTestTicketType();

    const res = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ ticketTypeId: ticketType.ticketTypeId });

    expect(res.status).toBe(400);
  });

  it('業務邊界：庫存已售罄時回傳錯誤，且不建立訂單', async () => {
    const ticketType = await createTestTicketType({ totalQuantity: 1, remainingQuantity: 0 });

    const res = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ ticketTypeId: ticketType.ticketTypeId, ...orderPayload() });

    expect(res.status).toBe(400);

    const orderCount = await AppDataSource.getRepository(Order).count({
      where: { ticketTypeId: ticketType.ticketTypeId },
    });
    expect(orderCount).toBe(0);
  });

  it('transaction rollback：建單流程中途失敗（save 拋錯）時，庫存不會被永久扣除', async () => {
    const ticketType = await createTestTicketType({ totalQuantity: 3, remainingQuantity: 3 });

    // 模擬「扣庫存成功後，建訂單 save() 失敗」的情境
    // 只攔截下一次呼叫，避免影響其他測試或無關的 repository.save()
    const saveSpy = jest
      .spyOn(Repository.prototype, 'save')
      .mockImplementationOnce(() => {
        throw new Error('模擬建立訂單 save 失敗');
      });

    try {
      const res = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ ticketTypeId: ticketType.ticketTypeId, ...orderPayload() });

      // 全域 error handler 對未帶 code 的一般 Error 回傳 500
      expect(res.status).toBe(500);
      expect(res.body.status).toBe('failed');
    } finally {
      saveSpy.mockRestore();
    }

    // 關鍵驗收：transaction 已 rollback，扣庫存的 UPDATE 也一併復原
    const refreshedTicketType = await AppDataSource.getRepository(TicketType).findOne({
      where: { ticketTypeId: ticketType.ticketTypeId },
    });
    expect(refreshedTicketType!.remainingQuantity).toBe(3);

    // 沒有半成品訂單留在資料庫
    const orderCount = await AppDataSource.getRepository(Order).count({
      where: { ticketTypeId: ticketType.ticketTypeId },
    });
    expect(orderCount).toBe(0);
  });
});

describe('POST /api/v1/orders/:orderId/refund', () => {
  async function createRefundableOrder(ticketTypeId: string) {
    const orderRepo = AppDataSource.getRepository(Order);
    const paymentRepo = AppDataSource.getRepository(Payment);

    const orderId = uuidv4();
    const order = await orderRepo.save(orderRepo.create({
      orderId,
      orderNumber: `250101120000-${orderId.slice(-4).toUpperCase()}`,
      ticketTypeId,
      userId: testUser.userId,
      orderStatus: 'paid',
      isLocked: false,
      lockToken: uuidv4(),
      lockExpireTime: new Date(Date.now() + 60 * 60 * 1000),
      ...orderPayload(),
    }));
    createdOrderIds.push(order.orderId);

    const payment = await paymentRepo.save(paymentRepo.create({
      orderId: order.orderId,
      method: 'credit',
      provider: 'ecpay',
      status: 'completed',
      amount: 1000,
      transactionId: `TEST${Date.now()}${Math.floor(Math.random() * 10000)}`,
      tradeNo: 'TESTTRADE001',
    }));
    createdPaymentIds.push(payment.paymentId);

    return order;
  }

  it('併發退款時庫存以原子方式遞增，不會發生 lost update', async () => {
    const ticketType = await createTestTicketType({ totalQuantity: 10, remainingQuantity: 5 });
    const orderA = await createRefundableOrder(ticketType.ticketTypeId);
    const orderB = await createRefundableOrder(ticketType.ticketTypeId);

    // Mock 綠界退款 API：延遲後回覆成功，拉開兩個請求「讀庫存」與「寫庫存」的時間差，
    // 使 read-modify-write 的 lost update 必然重現
    const axiosPostSpy = jest.spyOn(axios, 'post').mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 300));
      return { status: 200, data: 'RtnCode=1&RtnMsg=Succeeded' };
    });

    try {
      const [resA, resB] = await Promise.all([
        request(app)
          .post(`/api/v1/orders/${orderA.orderId}/refund`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({ orderId: orderA.orderId }),
        request(app)
          .post(`/api/v1/orders/${orderB.orderId}/refund`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({ orderId: orderB.orderId }),
      ]);

      expect(resA.status).toBe(200);
      expect(resB.status).toBe(200);
    } finally {
      axiosPostSpy.mockRestore();
    }

    // 關鍵驗收：兩筆退款各歸還 1 張，庫存必須是 5 + 2 = 7（lost update 時會是 6）
    const refreshedTicketType = await AppDataSource.getRepository(TicketType).findOne({
      where: { ticketTypeId: ticketType.ticketTypeId },
    });
    expect(refreshedTicketType!.remainingQuantity).toBe(7);
  });
});
