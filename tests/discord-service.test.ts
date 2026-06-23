import { jest } from '@jest/globals';

// Mock axios before discordService import
const mockPost = jest.fn<(url: string, data: unknown, config?: unknown) => Promise<{ data: { id?: string } }>>();
jest.unstable_mockModule('axios', () => ({
  default: { post: mockPost },
}));

const { sendSupportRequest } = await import('../services/discordService.js');
const { SupportSession, SessionStatus } = await import('../models/support-session.js');
const { SupportMessage, SenderType } = await import('../models/support-message.js');

// ── helpers ──────────────────────────────────────────────────────────────────

function makeSession(overrides: Record<string, unknown> = {}): InstanceType<typeof SupportSession> {
  const s = new SupportSession();
  s.supportSessionId = 'test-session-uuid';
  s.userId = 'test-user-uuid';
  s.category = '一般諮詢';
  s.status = SessionStatus.WAITING;
  s.discordMessageId = null;
  s.discordFallbackAt = null;
  return Object.assign(s, overrides);
}

const BOT_TOKEN = 'test-bot-token';
const SUPPORT_CHANNEL_ID = '123456789';

// ════════════════════════════════════════════════════════════════════════════
// discordService.sendSupportRequest
// ════════════════════════════════════════════════════════════════════════════

describe('discordService.sendSupportRequest', () => {
  const origToken = process.env.DISCORD_BOT_TOKEN;
  const origChannel = process.env.DISCORD_SUPPORT_CHANNEL_ID;

  beforeEach(() => {
    mockPost.mockReset();
    process.env.DISCORD_BOT_TOKEN = BOT_TOKEN;
    process.env.DISCORD_SUPPORT_CHANNEL_ID = SUPPORT_CHANNEL_ID;
  });

  afterAll(() => {
    const restore = (key: string, val: string | undefined) => {
      if (val !== undefined) process.env[key] = val;
      else delete process.env[key];
    };
    restore('DISCORD_BOT_TOKEN', origToken);
    restore('DISCORD_SUPPORT_CHANNEL_ID', origChannel);
  });

  it('DISCORD_SUPPORT_CHANNEL_ID 未設定時回傳 null，不呼叫 axios', async () => {
    delete process.env.DISCORD_SUPPORT_CHANNEL_ID;

    const result = await sendSupportRequest(makeSession(), '測試問題', []);

    expect(result).toBeNull();
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('axios 成功時回傳 message id', async () => {
    mockPost.mockResolvedValue({ data: { id: 'discord-msg-123' } });

    const result = await sendSupportRequest(makeSession(), '測試問題', []);

    expect(result).toBe('discord-msg-123');
    expect(mockPost).toHaveBeenCalledTimes(1);
  });

  it('請求 URL 指向 Bot channel messages 端點，帶 Bot 授權標頭', async () => {
    mockPost.mockResolvedValue({ data: { id: 'msg-id' } });

    await sendSupportRequest(makeSession(), '問題', []);

    const call = mockPost.mock.calls[0] as unknown[];
    const calledUrl = call[0] as string;
    const config = call[2] as { headers: Record<string, string> };
    expect(calledUrl).toBe(`https://discord.com/api/v10/channels/${SUPPORT_CHANNEL_ID}/messages`);
    expect(config.headers.Authorization).toBe(`Bot ${BOT_TOKEN}`);
  });

  it('payload 包含正確的 custom_id（support_reply_<sessionId>）', async () => {
    mockPost.mockResolvedValue({ data: { id: 'msg-id' } });

    await sendSupportRequest(makeSession(), '問題', []);

    const payload = (mockPost.mock.calls[0] as unknown[])[1] as Record<string, unknown>;
    const components = payload.components as Array<{ components: Array<{ custom_id: string }> }>;
    expect(components[0].components[0].custom_id).toBe('support_reply_test-session-uuid');
  });

  it('embed 包含 session 資訊', async () => {
    mockPost.mockResolvedValue({ data: { id: 'msg-id' } });

    await sendSupportRequest(makeSession(), '我想退票', []);

    const payload = (mockPost.mock.calls[0] as unknown[])[1] as Record<string, unknown>;
    const embeds = payload.embeds as Array<{ fields: Array<{ name: string; value: string }> }>;
    const fields = embeds[0].fields;
    const sessionField = fields.find(f => f.name === 'Session ID');
    const questionField = fields.find(f => f.name === '用戶問題');
    expect(sessionField?.value).toBe('test-session-uuid');
    expect(questionField?.value).toBe('我想退票');
  });

  it('歷史對話寫入 embed 近期對話欄位', async () => {
    mockPost.mockResolvedValue({ data: { id: 'msg-id' } });

    const msg = new SupportMessage();
    msg.senderType = SenderType.USER;
    msg.messageText = '請問退票流程？';

    await sendSupportRequest(makeSession(), '問題', [msg]);

    const payload = (mockPost.mock.calls[0] as unknown[])[1] as Record<string, unknown>;
    const embeds = payload.embeds as Array<{ fields: Array<{ name: string; value: string }> }>;
    const historyField = embeds[0].fields.find(f => f.name === '近期對話');
    expect(historyField?.value).toContain('請問退票流程？');
  });

  it('axios 拋出例外時回傳 null', async () => {
    mockPost.mockRejectedValue(new Error('network error'));

    const result = await sendSupportRequest(makeSession(), '問題', []);

    expect(result).toBeNull();
  });

  it('axios 回傳無 id 時回傳 null', async () => {
    mockPost.mockResolvedValue({ data: {} });

    const result = await sendSupportRequest(makeSession(), '問題', []);

    expect(result).toBeNull();
  });
});
