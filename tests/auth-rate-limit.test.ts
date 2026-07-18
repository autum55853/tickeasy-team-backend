import request from 'supertest';

// ── 啟用限流（必須在 app 動態 import 前設定）─────────────────────────────
// 測試環境預設跳過限流（避免其他 auth 測試被限流干擾），
// 本檔透過 ENABLE_RATE_LIMIT_IN_TEST 啟用限流行為做 429 驗證。
// Jest 每個測試檔有獨立 module registry，本檔的限流計數器不會外洩到其他測試檔；
// 但 process.env 會跨檔存留，故 afterAll 必須清掉旗標。
process.env.ENABLE_RATE_LIMIT_IN_TEST = 'true';

const { default: app } = await import('../app.js');

afterAll(() => {
  delete process.env.ENABLE_RATE_LIMIT_IN_TEST;
});

// ════════════════════════════════════════════════════════════════════════
// auth 端點 rate limiting
// - 一般 auth 端點（router 級）：同 IP 15 分鐘 20 次
// - 驗證碼類端點（額外加掛）：同 IP 15 分鐘 10 次
//
// 注意：兩個 limiter 的計數器共用同一個 in-memory store 生命週期（本檔內），
// 且 router 級 limiter 會計入所有 /api/v1/auth/* 請求，以下測試順序是刻意設計：
//   verify-email x11（strict 在第 11 次觸發，此時 router 級桶 = 11 / 20）
//   → login x9（router 級桶 = 20 / 20，全部放行）
//   → login 第 10 次（router 級桶 = 21 → 429）
// 所有請求皆用「缺 password → 400 驗證錯誤」的 payload，不觸發 DB 查詢。
// ════════════════════════════════════════════════════════════════════════
describe('auth rate limiting', () => {
  const STRICT_LIMIT = 10; // 驗證碼類端點
  const AUTH_LIMIT = 20; // router 級一般限流

  describe('驗證碼類端點（15 分鐘 10 次）', () => {
    it(`連打 verify-email ${STRICT_LIMIT} 次以內 → 不回 429`, async () => {
      for (let i = 1; i <= STRICT_LIMIT; i++) {
        const res = await request(app)
          .post('/api/v1/auth/verify-email')
          .send({ email: 'rate-limit-test@example.com' });

        expect(res.status).not.toBe(429);
      }
    });

    it(`第 ${STRICT_LIMIT + 1} 次 verify-email → 429，回應格式 { status: 'failed', message }`, async () => {
      const res = await request(app)
        .post('/api/v1/auth/verify-email')
        .send({ email: 'rate-limit-test@example.com' });

      expect(res.status).toBe(429);
      expect(res.body.status).toBe('failed');
      expect(res.body.message).toContain('請求頻率過高');
    });
  });

  describe('一般 auth 端點（15 分鐘 20 次，router 級共用桶）', () => {
    it('桶內還有額度時連打 login → 不回 429（正常請求不受影響）', async () => {
      // 前面 verify-email 已計入 11 次，login 還能再打 9 次
      const remaining = AUTH_LIMIT - (STRICT_LIMIT + 1);
      for (let i = 1; i <= remaining; i++) {
        const res = await request(app)
          .post('/api/v1/auth/login')
          .send({ email: 'rate-limit-test@example.com' });

        expect(res.status).not.toBe(429);
        expect(res.status).toBe(400);
      }
    });

    it(`超過 ${AUTH_LIMIT} 次 → login 回 429，回應格式 { status: 'failed', message }`, async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'rate-limit-test@example.com', password: 'Test1234' });

      expect(res.status).toBe(429);
      expect(res.body.status).toBe('failed');
      expect(res.body.message).toContain('請求頻率過高');
    });

    it('限流掛在整個 /api/v1/auth router：register 也被同一個桶擋下 → 429', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({ email: 'rate-limit-test@example.com', password: 'Test1234', name: 'Rate Limit' });

      expect(res.status).toBe(429);
      expect(res.body.status).toBe('failed');
    });
  });
});
