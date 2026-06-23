import { jest } from '@jest/globals';
import request from 'supertest';
import { AppDataSource } from '../config/database.js';
import { SupportSession, SessionStatus, SessionType } from '../models/support-session.js';
import { SupportMessage, SenderType } from '../models/support-message.js';
import { createTestUser } from './helpers/factories.js';
import { User } from '../models/user.js';

// ── Module mocks（必須在 dynamic import app 之前） ─────────────────────────

const mockSendSupportRequest = jest.fn<() => Promise<string | null>>().mockResolvedValue('discord-msg-id');
jest.unstable_mockModule('../services/discordService.js', () => ({
  sendSupportRequest: mockSendSupportRequest,
  verifyDiscordSignature: jest.fn<() => Promise<boolean>>().mockResolvedValue(true),
  patchInteractionResponse: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  sendConcertReviewRequest: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  default: {
    sendSupportRequest: mockSendSupportRequest,
  },
}));

// Mock chatService — 避免真實 OpenAI 呼叫
const mockChat = jest.fn<() => Promise<{ message: string; confidence: number; responseId: string | null; processingTime: number; aiUnavailable?: boolean }>>()
  .mockResolvedValue({ message: 'AI 回覆', confidence: 0.9, responseId: 'resp-abc', processingTime: 100 });
const mockContinueChat = jest.fn<() => Promise<{ message: string; confidence: number; responseId: string | null }>>()
  .mockResolvedValue({ message: 'AI 延續回覆', confidence: 0.85, responseId: null });
const mockCheckServiceStatus = jest.fn<() => Promise<{ ok: boolean }>>().mockResolvedValue({ ok: true });
jest.unstable_mockModule('../services/chat-service.js', () => ({
  chatService: {
    chat: mockChat,
    continueChat: mockContinueChat,
    checkServiceStatus: mockCheckServiceStatus,
  },
}));

// Mock smartReplyService — 關鍵字匹配，預設回傳 neutral（觸發 AI fallback）
const mockGetSmartReply = jest.fn<() => Promise<{ type: string; message: string; data?: { confidence: number } }>>()
  .mockResolvedValue({ type: 'neutral', message: '請問有什麼可以幫助您？', data: { confidence: 0.1 } });
jest.unstable_mockModule('../services/smart-reply-service.js', () => ({
  smartReplyService: { getSmartReply: mockGetSmartReply },
}));

// Mock sse-broker — subscribe 立即結束連線（避免 supertest 掛住）
type ResLike = { end: () => void };
const mockSubscribeSse = jest.fn<(sessionId: string, res: ResLike) => () => void>()
  .mockImplementation((_sessionId, res) => {
    setImmediate(() => res.end());
    return () => {};
  });
const mockPublishSse = jest.fn<() => void>();
jest.unstable_mockModule('../services/sse-broker.js', () => ({
  subscribe: mockSubscribeSse,
  publish: mockPublishSse,
  subscriberCount: jest.fn<() => number>().mockReturnValue(0),
  default: { subscribe: mockSubscribeSse, publish: mockPublishSse },
}));

const { default: app } = await import('../app.js');

// ── helpers ──────────────────────────────────────────────────────────────────

async function createSession(overrides: Partial<SupportSession> = {}): Promise<SupportSession> {
  const repo = AppDataSource.getRepository(SupportSession);
  const s = repo.create({
    userId: undefined,
    status: SessionStatus.ACTIVE,
    sessionType: SessionType.BOT,
    category: '一般諮詢',
    ...overrides,
  });
  return repo.save(s);
}

async function cleanupSession(sessionId: string) {
  await AppDataSource.getRepository(SupportMessage).delete({ sessionId });
  await AppDataSource.getRepository(SupportSession).delete({ supportSessionId: sessionId });
}

async function cleanupUser(userId: string) {
  await AppDataSource.getRepository(User).delete({ userId });
}

// ════════════════════════════════════════════════════════════════════════════
// GET /session/:sessionId/stream — 錯誤路徑
// ════════════════════════════════════════════════════════════════════════════

describe('GET /api/v1/smart-reply/session/:sessionId/stream — 錯誤路徑', () => {
  afterEach(() => {
    mockSubscribeSse.mockClear();
  });

  it('session 不存在 → 404', async () => {
    const res = await request(app)
      .get('/api/v1/smart-reply/session/00000000-0000-0000-0000-000000000000/stream');

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toContain('會話不存在');
  });

  it('session 已關閉 → 400', async () => {
    const session = await createSession({ status: SessionStatus.CLOSED });

    const res = await request(app)
      .get(`/api/v1/smart-reply/session/${session.supportSessionId}/stream`);

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toContain('已關閉');

    await cleanupSession(session.supportSessionId);
  });

  it('sessionId 格式錯誤（非 UUID）→ 400 驗證失敗', async () => {
    const res = await request(app)
      .get('/api/v1/smart-reply/session/not-a-uuid/stream');

    expect(res.status).toBe(400);
  });

  it('已登入用戶嘗試訂閱他人 session → 403', async () => {
    // 建立兩個真實用戶（符合 FK 約束）
    const otherUser = await createTestUser();
    const myUser = await createTestUser();

    // session 屬於 otherUser
    const session = await createSession({ userId: otherUser.userId });

    // 以 myUser 身份登入
    const jwt = (await import('jsonwebtoken')).default;
    const token = jwt.sign(
      { userId: myUser.userId, role: 'user', email: myUser.email, isEmailVerified: true },
      process.env.JWT_SECRET ?? 'test-secret',
    );

    const res = await request(app)
      .get(`/api/v1/smart-reply/session/${session.supportSessionId}/stream`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);

    await cleanupSession(session.supportSessionId);
    await cleanupUser(otherUser.userId);
    await cleanupUser(myUser.userId);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// GET /session/:sessionId/stream — 正常路徑
// ════════════════════════════════════════════════════════════════════════════

describe('GET /api/v1/smart-reply/session/:sessionId/stream — 正常路徑', () => {
  let session: SupportSession;

  beforeAll(async () => {
    session = await createSession();
  });

  afterAll(async () => {
    await cleanupSession(session.supportSessionId);
  });

  beforeEach(() => {
    mockSubscribeSse.mockClear();
    // 預設：subscribe 立即 end res
    mockSubscribeSse.mockImplementation((_sessionId, res) => {
      setImmediate(() => (res as ResLike).end());
      return () => {};
    });
  });

  it('匿名訂閱有效 session → Content-Type: text/event-stream', async () => {
    const res = await request(app)
      .get(`/api/v1/smart-reply/session/${session.supportSessionId}/stream`);

    expect(res.headers['content-type']).toMatch(/text\/event-stream/);
  });

  it('回應包含 ": connected" SSE comment', async () => {
    const res = await request(app)
      .get(`/api/v1/smart-reply/session/${session.supportSessionId}/stream`);

    expect(res.text).toContain(': connected');
  });

  it('subscribeSse 被以正確 sessionId 呼叫', async () => {
    await request(app)
      .get(`/api/v1/smart-reply/session/${session.supportSessionId}/stream`);

    expect(mockSubscribeSse).toHaveBeenCalledWith(
      session.supportSessionId,
      expect.anything(),
    );
  });

  it('query string token 驗證通過 → 連線建立', async () => {
    const jwt = (await import('jsonwebtoken')).default;
    const token = jwt.sign(
      { userId: null, role: 'user', email: 'anon@example.com', isEmailVerified: false },
      process.env.JWT_SECRET ?? 'test-secret',
    );

    const res = await request(app)
      .get(`/api/v1/smart-reply/session/${session.supportSessionId}/stream?token=${token}`);

    expect(res.headers['content-type']).toMatch(/text\/event-stream/);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// POST /session/:sessionId/message — 人工模式短路
// ════════════════════════════════════════════════════════════════════════════

describe('POST /session/:sessionId/message — sessionType=HUMAN 短路', () => {
  let humanSession: SupportSession;

  beforeAll(async () => {
    humanSession = await createSession({
      sessionType: SessionType.HUMAN,
      status: SessionStatus.WAITING,
      discordMessageId: 'existing-discord-msg',
    });
  });

  afterAll(async () => {
    await cleanupSession(humanSession.supportSessionId);
  });

  beforeEach(() => {
    mockSendSupportRequest.mockClear();
    mockChat.mockClear();
  });

  it('HUMAN session → 跳過 AI，直接轉送 Discord，回傳 strategy=human_forward', async () => {
    const res = await request(app)
      .post(`/api/v1/smart-reply/session/${humanSession.supportSessionId}/message`)
      .send({ message: '請問退票流程？' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.strategy).toBe('human_forward');
    expect(res.body.data.message).toBeNull();
  });

  it('HUMAN session → AI service 不被呼叫', async () => {
    await request(app)
      .post(`/api/v1/smart-reply/session/${humanSession.supportSessionId}/message`)
      .send({ message: '另一個問題' });

    expect(mockChat).not.toHaveBeenCalled();
  });

  it('HUMAN session → Discord sendSupportRequest 被呼叫', async () => {
    await request(app)
      .post(`/api/v1/smart-reply/session/${humanSession.supportSessionId}/message`)
      .send({ message: '還有問題' });

    expect(mockSendSupportRequest).toHaveBeenCalled();
  });

  it('訊息為空白 → 400', async () => {
    const res = await request(app)
      .post(`/api/v1/smart-reply/session/${humanSession.supportSessionId}/message`)
      .send({ message: '' });

    expect(res.status).toBe(400);
  });

  it('session 不存在 → 404', async () => {
    const res = await request(app)
      .post('/api/v1/smart-reply/session/00000000-0000-0000-0000-000000000099/message')
      .send({ message: '測試' });

    expect(res.status).toBe(404);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// POST /session/:sessionId/transfer — 設定 sessionType=HUMAN
// ════════════════════════════════════════════════════════════════════════════

describe('POST /session/:sessionId/transfer — escalateToHuman', () => {
  let session: SupportSession;

  beforeEach(async () => {
    session = await createSession({
      sessionType: SessionType.BOT,
      status: SessionStatus.ACTIVE,
    });
    mockSendSupportRequest.mockClear();
  });

  afterEach(async () => {
    await cleanupSession(session.supportSessionId);
  });

  it('轉接後 sessionType 改為 HUMAN', async () => {
    await request(app)
      .post(`/api/v1/smart-reply/session/${session.supportSessionId}/transfer`)
      .send({ reason: '想跟真人說話' });

    const repo = AppDataSource.getRepository(SupportSession);
    const updated = await repo.findOne({ where: { supportSessionId: session.supportSessionId } });

    expect(updated!.sessionType).toBe(SessionType.HUMAN);
  });

  it('轉接後 status 改為 WAITING', async () => {
    await request(app)
      .post(`/api/v1/smart-reply/session/${session.supportSessionId}/transfer`)
      .send({});

    const repo = AppDataSource.getRepository(SupportSession);
    const updated = await repo.findOne({ where: { supportSessionId: session.supportSessionId } });

    expect(updated!.status).toBe(SessionStatus.WAITING);
  });

  it('Discord sendSupportRequest 被呼叫', async () => {
    await request(app)
      .post(`/api/v1/smart-reply/session/${session.supportSessionId}/transfer`)
      .send({ reason: '需要人工' });

    expect(mockSendSupportRequest).toHaveBeenCalled();
  });

  it('session 已關閉時 → 400', async () => {
    const closed = await createSession({ status: SessionStatus.CLOSED });

    const res = await request(app)
      .post(`/api/v1/smart-reply/session/${closed.supportSessionId}/transfer`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('已關閉');

    await cleanupSession(closed.supportSessionId);
  });

  it('session 不存在 → 404', async () => {
    const res = await request(app)
      .post('/api/v1/smart-reply/session/00000000-0000-0000-0000-000000000099/transfer')
      .send({});

    expect(res.status).toBe(404);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// POST /session/start — AI 失效時自動轉人工
// ════════════════════════════════════════════════════════════════════════════

describe('POST /session/start — AI 失效自動轉人工', () => {
  const createdSessionIds: string[] = [];

  beforeEach(() => {
    mockSendSupportRequest.mockClear();
    mockChat.mockClear();
    // 關鍵字匹配 neutral → 進入 AI 分支
    mockGetSmartReply.mockResolvedValue({ type: 'neutral', message: '請問有什麼可以幫助您？', data: { confidence: 0.1 } });
  });

  afterAll(async () => {
    for (const id of createdSessionIds) await cleanupSession(id);
  });

  it('AI 回傳 aiUnavailable → sessionType=HUMAN 且 Discord 被呼叫', async () => {
    mockChat.mockResolvedValueOnce({ message: '抱歉，系統暫時無法處理您的請求', confidence: 0, responseId: '', processingTime: 10, aiUnavailable: true });

    const res = await request(app)
      .post('/api/v1/smart-reply/session/start')
      .send({ initialMessage: '請問退票流程？', category: '一般諮詢' });

    expect(res.status).toBe(201);
    expect(res.body.data.sessionType).toBe(SessionType.HUMAN);
    expect(mockSendSupportRequest).toHaveBeenCalled();

    createdSessionIds.push(res.body.data.sessionId);

    const repo = AppDataSource.getRepository(SupportSession);
    const saved = await repo.findOne({ where: { supportSessionId: res.body.data.sessionId } });
    expect(saved!.sessionType).toBe(SessionType.HUMAN);
    expect(saved!.status).toBe(SessionStatus.WAITING);
  });

  it('AI 正常回應 → 維持 BOT，不觸發 Discord', async () => {
    mockChat.mockResolvedValueOnce({ message: 'AI 正常回覆', confidence: 0.9, responseId: 'resp-ok', processingTime: 10 });

    const res = await request(app)
      .post('/api/v1/smart-reply/session/start')
      .send({ initialMessage: '一般問題', category: '一般諮詢' });

    expect(res.status).toBe(201);
    expect(res.body.data.sessionType).toBe(SessionType.BOT);
    expect(mockSendSupportRequest).not.toHaveBeenCalled();

    createdSessionIds.push(res.body.data.sessionId);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Discord MODAL_SUBMIT → publishSse 被呼叫
// ════════════════════════════════════════════════════════════════════════════

describe('Discord MODAL_SUBMIT → publishSse', () => {
  let session: SupportSession;

  beforeAll(async () => {
    session = await createSession({ status: SessionStatus.WAITING });
  });

  afterAll(async () => {
    await cleanupSession(session.supportSessionId);
  });

  beforeEach(() => {
    mockPublishSse.mockClear();
  });

  it('有效 modal 提交後 publishSse 以正確 sessionId 被呼叫', async () => {
    const replyText = '感謝等待，這是人工回覆';

    await request(app)
      .post('/api/v1/discord/interactions')
      .set('Content-Type', 'application/json')
      .set('x-signature-ed25519', 'test-sig')
      .set('x-signature-timestamp', 'test-ts')
      .send(JSON.stringify({
        type: 5,
        data: {
          custom_id: `support_modal_${session.supportSessionId}`,
          components: [{ components: [{ value: replyText }] }],
        },
        token: 'test-interaction-token',
        member: { user: { id: 'admin-001', username: 'TestAdmin' } },
      }));

    // 等待非同步 IIFE 完成（DB 操作 + publishSse 呼叫）
    await new Promise(resolve => setTimeout(resolve, 1500));

    expect(mockPublishSse).toHaveBeenCalledWith(
      session.supportSessionId,
      expect.objectContaining({
        sessionId: session.supportSessionId,
        senderType: SenderType.AGENT,
        messageText: replyText,
      }),
    );
  });

  it('publishSse payload 包含 discordUsername metadata', async () => {
    const replyText = '另一則人工回覆';
    const newSession = await createSession({ status: SessionStatus.WAITING });

    // 清除上一個測試殘留的 call
    mockPublishSse.mockClear();

    await request(app)
      .post('/api/v1/discord/interactions')
      .set('Content-Type', 'application/json')
      .set('x-signature-ed25519', 'test-sig')
      .set('x-signature-timestamp', 'test-ts')
      .send(JSON.stringify({
        type: 5,
        data: {
          custom_id: `support_modal_${newSession.supportSessionId}`,
          components: [{ components: [{ value: replyText }] }],
        },
        token: 'test-token-2',
        member: { user: { id: 'admin-002', username: 'SuperAdmin' } },
      }));

    await new Promise(resolve => setTimeout(resolve, 1500));

    expect(mockPublishSse).toHaveBeenCalled();
    const lastCall = mockPublishSse.mock.calls[mockPublishSse.mock.calls.length - 1] as unknown[];
    const payload = lastCall[1] as Record<string, unknown>;
    expect((payload.metadata as Record<string, unknown>)?.discordUsername).toBe('SuperAdmin');

    await cleanupSession(newSession.supportSessionId);
  });
});
