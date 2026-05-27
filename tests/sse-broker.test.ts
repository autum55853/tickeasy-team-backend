import { jest } from '@jest/globals';
import { subscribe, publish, subscriberCount } from '../services/sse-broker.js';

// ── helpers ──────────────────────────────────────────────────────────────────

function makeMockRes() {
  return { write: jest.fn<() => void>() } as unknown as import('express').Response;
}

const SESSION_A = 'session-aaaa-0000-0000-000000000001';
const SESSION_B = 'session-bbbb-0000-0000-000000000002';

// ════════════════════════════════════════════════════════════════════════════
// subscribe / subscriberCount / unsubscribe
// ════════════════════════════════════════════════════════════════════════════

describe('sse-broker — subscribe & subscriberCount', () => {
  it('訂閱後 subscriberCount 回傳 1', () => {
    const res = makeMockRes();
    const unsub = subscribe(SESSION_A, res);

    expect(subscriberCount(SESSION_A)).toBe(1);

    unsub();
  });

  it('取消訂閱後 subscriberCount 回傳 0，map entry 被清除', () => {
    const res = makeMockRes();
    const unsub = subscribe(SESSION_A, res);
    unsub();

    expect(subscriberCount(SESSION_A)).toBe(0);
  });

  it('同 sessionId 兩個訂閱者 → count=2；各自取消後 count=0', () => {
    const r1 = makeMockRes();
    const r2 = makeMockRes();
    const u1 = subscribe(SESSION_A, r1);
    const u2 = subscribe(SESSION_A, r2);

    expect(subscriberCount(SESSION_A)).toBe(2);

    u1();
    expect(subscriberCount(SESSION_A)).toBe(1);
    u2();
    expect(subscriberCount(SESSION_A)).toBe(0);
  });

  it('不同 sessionId 各自獨立計數', () => {
    const rA = makeMockRes();
    const rB = makeMockRes();
    const uA = subscribe(SESSION_A, rA);
    const uB = subscribe(SESSION_B, rB);

    expect(subscriberCount(SESSION_A)).toBe(1);
    expect(subscriberCount(SESSION_B)).toBe(1);

    uA();
    uB();
  });

  it('無訂閱者時 subscriberCount 回傳 0', () => {
    expect(subscriberCount('nonexistent-session')).toBe(0);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// publish
// ════════════════════════════════════════════════════════════════════════════

describe('sse-broker — publish', () => {
  afterEach(() => {
    // 清理：確保測試間不互相污染
    // 取消所有訂閱（每次訂閱都需手動取消）
  });

  it('publish 寫入正確 data: ... 格式', () => {
    const res = makeMockRes();
    const unsub = subscribe(SESSION_A, res);

    const payload = {
      sessionId: SESSION_A,
      senderType: 'agent' as const,
      messageText: '您好，我是人工客服',
    };

    publish(SESSION_A, payload);

    const written = (res.write as jest.Mock).mock.calls[0]?.[0] as string;
    expect(written).toMatch(/^data: /);
    const jsonPart = written.replace(/^data: /, '').replace(/\n\n$/, '');
    expect(JSON.parse(jsonPart)).toMatchObject({
      sessionId: SESSION_A,
      senderType: 'agent',
      messageText: '您好，我是人工客服',
    });

    unsub();
  });

  it('多個訂閱者都收到訊息', () => {
    const r1 = makeMockRes();
    const r2 = makeMockRes();
    const u1 = subscribe(SESSION_A, r1);
    const u2 = subscribe(SESSION_A, r2);

    publish(SESSION_A, { sessionId: SESSION_A, senderType: 'agent', messageText: 'hello' });

    expect(r1.write).toHaveBeenCalledTimes(1);
    expect(r2.write).toHaveBeenCalledTimes(1);

    u1();
    u2();
  });

  it('sessionId 無訂閱者時 publish 不拋出錯誤', () => {
    expect(() => {
      publish('no-subscriber-session', { sessionId: 'no-subscriber-session', senderType: 'agent', messageText: 'test' });
    }).not.toThrow();
  });

  it('write 拋出錯誤時自動移除該訂閱者，不影響其他訂閱者', () => {
    const badRes = { write: jest.fn<() => void>().mockImplementation(() => { throw new Error('broken pipe'); }) } as unknown as import('express').Response;
    const goodRes = makeMockRes();

    const uBad = subscribe(SESSION_A, badRes);
    const uGood = subscribe(SESSION_A, goodRes);

    // publish 不應拋出，且 goodRes 仍收到訊息
    expect(() => {
      publish(SESSION_A, { sessionId: SESSION_A, senderType: 'agent', messageText: 'test' });
    }).not.toThrow();

    expect(goodRes.write).toHaveBeenCalledTimes(1);
    // badRes 已被移除，subscriberCount 降為 1
    expect(subscriberCount(SESSION_A)).toBe(1);

    uGood();
    // uBad 已被 publish 移除，再次取消不影響
    uBad();
  });
});

// ════════════════════════════════════════════════════════════════════════════
// heartbeat
// ════════════════════════════════════════════════════════════════════════════

describe('sse-broker — heartbeat', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('每 25 秒送出 ": heartbeat\\n\\n"', () => {
    const res = makeMockRes();
    const unsub = subscribe(SESSION_A, res);

    jest.advanceTimersByTime(25_000);
    expect(res.write).toHaveBeenCalledWith(': heartbeat\n\n');

    jest.advanceTimersByTime(25_000);
    expect(res.write).toHaveBeenCalledTimes(2);

    unsub();
  });

  it('取消訂閱後 heartbeat 停止', () => {
    const res = makeMockRes();
    const unsub = subscribe(SESSION_A, res);

    unsub();
    jest.advanceTimersByTime(50_000);

    expect(res.write).not.toHaveBeenCalled();
  });
});
