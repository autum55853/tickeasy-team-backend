import { jest } from '@jest/globals';
import request from 'supertest';
import { AppDataSource } from '../config/database.js';
import { SupportSession, SessionStatus } from '../models/support-session.js';
import { SupportMessage, SenderType } from '../models/support-message.js';

// ── Mock discordService（bypass signature + 避免真實 HTTP 呼叫）────────────
const mockVerifySignature = jest.fn<() => Promise<boolean>>().mockResolvedValue(true);
const mockPatchInteractionResponse = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockSendSupportRequest = jest.fn<() => Promise<string | null>>().mockResolvedValue('discord-msg-id');
const mockSendConcertReviewRequest = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);

jest.unstable_mockModule('../services/discordService.js', () => ({
  verifyDiscordSignature: mockVerifySignature,
  patchInteractionResponse: mockPatchInteractionResponse,
  sendSupportRequest: mockSendSupportRequest,
  sendConcertReviewRequest: mockSendConcertReviewRequest,
  default: {
    verifyDiscordSignature: mockVerifySignature,
    patchInteractionResponse: mockPatchInteractionResponse,
    sendSupportRequest: mockSendSupportRequest,
    sendConcertReviewRequest: mockSendConcertReviewRequest,
  },
}));

const { default: app } = await import('../app.js');

// ── helpers ──────────────────────────────────────────────────────────────────

function sendInteraction(payload: object) {
  return request(app)
    .post('/api/v1/discord/interactions')
    .set('Content-Type', 'application/json')
    .set('x-signature-ed25519', 'test-sig')
    .set('x-signature-timestamp', 'test-ts')
    .send(JSON.stringify(payload));
}

async function createTestSession(overrides: Partial<SupportSession> = {}): Promise<SupportSession> {
  const repo = AppDataSource.getRepository(SupportSession);
  const session = repo.create({
    userId: undefined,
    status: SessionStatus.WAITING,
    category: '一般諮詢',
    discordMessageId: 'existing-discord-msg',
    discordFallbackAt: new Date(),
    ...overrides,
  });
  return repo.save(session);
}

// ════════════════════════════════════════════════════════════════════════════
// 基本驗證
// ════════════════════════════════════════════════════════════════════════════

describe('POST /api/v1/discord/interactions — 基本驗證', () => {
  beforeEach(() => {
    mockVerifySignature.mockClear();
    mockPatchInteractionResponse.mockClear();
  });

  it('缺少 signature headers → 401', async () => {
    const res = await request(app)
      .post('/api/v1/discord/interactions')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ type: 1 }));

    expect(res.status).toBe(401);
    expect(res.body.error).toContain('missing signature headers');
  });

  it('簽名驗證失敗 → 401', async () => {
    mockVerifySignature.mockResolvedValueOnce(false);

    const res = await sendInteraction({ type: 1 });

    expect(res.status).toBe(401);
    expect(res.body.error).toContain('invalid request signature');
  });

  it('type=1 PING → 回傳 { type: 1 }', async () => {
    const res = await sendInteraction({ type: 1 });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ type: 1 });
  });

  it('未知 interaction type → 204', async () => {
    const res = await sendInteraction({ type: 99 });

    expect(res.status).toBe(204);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 客服 fallback — type=3 按鈕（support_reply_）
// ════════════════════════════════════════════════════════════════════════════

describe('POST /api/v1/discord/interactions — type=3 客服按鈕', () => {
  let testSession: SupportSession;

  beforeAll(async () => {
    testSession = await createTestSession();
  });

  afterAll(async () => {
    if (testSession) {
      await AppDataSource.getRepository(SupportMessage).delete({ sessionId: testSession.supportSessionId });
      await AppDataSource.getRepository(SupportSession).delete({ supportSessionId: testSession.supportSessionId });
    }
  });

  beforeEach(() => {
    mockVerifySignature.mockClear();
    mockPatchInteractionResponse.mockClear();
  });

  it('support_reply_<sessionId> → 回傳 type=9 MODAL，含 reply_text 欄位', async () => {
    const res = await sendInteraction({
      type: 3,
      data: { custom_id: `support_reply_${testSession.supportSessionId}` },
      token: 'test-token',
    });

    expect(res.status).toBe(200);
    expect(res.body.type).toBe(9);
    expect(res.body.data.custom_id).toBe(`support_modal_${testSession.supportSessionId}`);

    const inputComp = res.body.data.components[0].components[0];
    expect(inputComp.custom_id).toBe('reply_text');
    expect(inputComp.type).toBe(4);
  });

  it('support_reply_ 的 MODAL title 為「回覆用戶問題」', async () => {
    const res = await sendInteraction({
      type: 3,
      data: { custom_id: `support_reply_${testSession.supportSessionId}` },
      token: 'test-token',
    });

    expect(res.body.data.title).toBe('回覆用戶問題');
  });

  it('無效 custom_id（非 support_reply_ 且格式錯誤）→ 400', async () => {
    const res = await sendInteraction({
      type: 3,
      data: { custom_id: 'unknown_action_abc' },
      token: 'test-token',
    });

    expect(res.status).toBe(400);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 客服 fallback — type=5 Modal submit（support_modal_）
// ════════════════════════════════════════════════════════════════════════════

describe('POST /api/v1/discord/interactions — type=5 Modal submit', () => {
  let testSession: SupportSession;

  beforeAll(async () => {
    testSession = await createTestSession();
  });

  afterAll(async () => {
    if (testSession) {
      await AppDataSource.getRepository(SupportMessage).delete({ sessionId: testSession.supportSessionId });
      await AppDataSource.getRepository(SupportSession).delete({ supportSessionId: testSession.supportSessionId });
    }
  });

  beforeEach(() => {
    mockVerifySignature.mockClear();
    mockPatchInteractionResponse.mockClear();
  });

  it('replyText 為空白 → 回傳 type=4 錯誤（ephemeral）', async () => {
    const res = await sendInteraction({
      type: 5,
      data: {
        custom_id: `support_modal_${testSession.supportSessionId}`,
        components: [{ components: [{ value: '   ' }] }],
      },
      token: 'test-token',
      member: { user: { id: 'admin-123', username: 'AdminUser' } },
    });

    expect(res.status).toBe(200);
    expect(res.body.type).toBe(4);
    expect(res.body.data.content).toContain('回覆內容不可為空');
    expect(res.body.data.flags).toBe(64);
  });

  it('有效回覆 → type=4 成功，DB 存入 SupportMessage，session 狀態改為 ACTIVE', async () => {
    const replyText = '您好，感謝等待，這是人工客服回覆。';

    const res = await sendInteraction({
      type: 5,
      data: {
        custom_id: `support_modal_${testSession.supportSessionId}`,
        components: [{ components: [{ value: replyText }] }],
      },
      token: 'test-interaction-token',
      member: { user: { id: 'admin-456', username: 'AdminUser456' } },
    });

    expect(res.status).toBe(200);
    expect(res.body.type).toBe(4);
    expect(res.body.data.content).toBe('✅ 已回覆用戶');
    expect(res.body.data.flags).toBe(64);

    // 等待非同步 IIFE 完成
    await new Promise(resolve => setTimeout(resolve, 400));

    // SupportMessage 存入 DB
    const msgRepo = AppDataSource.getRepository(SupportMessage);
    const msg = await msgRepo.findOne({
      where: { sessionId: testSession.supportSessionId, senderType: SenderType.AGENT },
    });
    expect(msg).not.toBeNull();
    expect(msg!.messageText).toBe(replyText);
    expect(msg!.metadata.discordUserId).toBe('admin-456');
    expect(msg!.metadata.discordUsername).toBe('AdminUser456');

    // session 狀態更新為 ACTIVE
    const sessionRepo = AppDataSource.getRepository(SupportSession);
    const updated = await sessionRepo.findOne({ where: { supportSessionId: testSession.supportSessionId } });
    expect(updated!.status).toBe(SessionStatus.ACTIVE);

    // patchInteractionResponse 被呼叫，content 含管理員名稱
    expect(mockPatchInteractionResponse).toHaveBeenCalledWith(
      'test-interaction-token',
      expect.objectContaining({
        content: expect.stringContaining('AdminUser456'),
        components: [],
      }),
    );
  });

  it('session 不存在 → response 仍為 type=4 成功（非同步 warn，不影響回應）', async () => {
    // 合法格式 UUID 但 DB 中不存在
    const nonExistentId = '00000000-0000-0000-0000-000000000000';
    const res = await sendInteraction({
      type: 5,
      data: {
        custom_id: `support_modal_${nonExistentId}`,
        components: [{ components: [{ value: '有效回覆內容' }] }],
      },
      token: 'test-token',
      member: { user: { id: 'admin-123', username: 'Admin' } },
    });

    expect(res.status).toBe(200);
    expect(res.body.type).toBe(4);
    expect(res.body.data.content).toBe('✅ 已回覆用戶');
  });

  it('未知 modal custom_id → 400', async () => {
    const res = await sendInteraction({
      type: 5,
      data: {
        custom_id: 'unknown_modal_id',
        components: [{ components: [{ value: '內容' }] }],
      },
      token: 'test-token',
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('unknown modal custom_id');
  });

  it('user 欄位從 interaction.user 取得（無 member）', async () => {
    const replyText = '來自 DM 的管理員回覆';
    const newSession = await createTestSession();

    const res = await sendInteraction({
      type: 5,
      data: {
        custom_id: `support_modal_${newSession.supportSessionId}`,
        components: [{ components: [{ value: replyText }] }],
      },
      token: 'test-dm-token',
      user: { id: 'dm-admin-789', username: 'DmAdmin' },
    });

    expect(res.status).toBe(200);
    expect(res.body.type).toBe(4);

    await new Promise(resolve => setTimeout(resolve, 400));

    const msgRepo = AppDataSource.getRepository(SupportMessage);
    const msg = await msgRepo.findOne({
      where: { sessionId: newSession.supportSessionId, senderType: SenderType.AGENT },
    });
    expect(msg?.metadata.discordUserId).toBe('dm-admin-789');
    expect(msg?.metadata.discordUsername).toBe('DmAdmin');

    // 清理
    await AppDataSource.getRepository(SupportMessage).delete({ sessionId: newSession.supportSessionId });
    await AppDataSource.getRepository(SupportSession).delete({ supportSessionId: newSession.supportSessionId });
  });
});
