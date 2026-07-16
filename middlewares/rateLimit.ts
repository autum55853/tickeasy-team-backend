import rateLimit, { Options } from 'express-rate-limit';
import { ApiError } from '../utils/index.js';

/**
 * 是否應跳過限流：
 * - 測試環境預設跳過（既有整合測試會高頻連打 auth 端點取 token，不能被限流干擾）
 * - 測試中若要驗證限流行為，設 ENABLE_RATE_LIMIT_IN_TEST=true 即可啟用
 * - production / development 一律生效
 */
const shouldSkipRateLimit = (): boolean =>
  process.env.NODE_ENV === 'test' && process.env.ENABLE_RATE_LIMIT_IN_TEST !== 'true';

/**
 * 建立 auth 用 rate limiter（可覆寫參數，測試可注入較小的 limit）
 * 429 回應透過 ApiError.rateLimitExceeded()（ErrorCode S03）走全域錯誤處理，
 * 維持 { status: 'failed', message } 回應格式慣例。
 */
export const createAuthRateLimiter = (options: Partial<Options> = {}) =>
  rateLimit({
    windowMs: 15 * 60 * 1000, // 15 分鐘
    limit: 20, // 同 IP 15 分鐘 20 次
    standardHeaders: true, // 回 RateLimit-* 標頭
    legacyHeaders: false,
    skip: () => shouldSkipRateLimit(),
    handler: (_req, _res, next) => {
      next(ApiError.rateLimitExceeded());
    },
    ...options,
  });

/**
 * 一般 auth 端點限流：同 IP 15 分鐘 20 次
 * 掛在整個 /api/v1/auth router 上（login / register / OAuth 等）
 */
export const authRateLimiter = createAuthRateLimiter();

/**
 * 驗證碼類端點限流（更嚴）：同 IP 15 分鐘 10 次
 * 適用 verify-email / resend-verification / request-password-reset / reset-password
 */
export const verificationCodeRateLimiter = createAuthRateLimiter({ limit: 10 });
