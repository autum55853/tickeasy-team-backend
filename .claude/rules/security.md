---
# 全域規則，不限定路徑
---

# 安全性規則

## 輸入驗證

- 所有來自 `req.body`、`req.params`、`req.query` 的資料視為不可信任，必須在 controller 層驗證
- 字串欄位必須驗證長度上限，防止超大輸入攻擊
- Email 驗證使用正則或專用驗證函式，不可只靠資料庫 unique constraint

## 密碼處理

- 密碼 hash 使用 bcrypt，`rounds=12`（已在 User entity `@BeforeInsert` 自動處理）
- 絕對不在 log 中輸出明文密碼、token 或任何機密資訊
- 回傳用戶資料時，必須排除 `password`、`verificationToken`、`passwordResetToken` 欄位

## JWT 安全

- JWT Secret 必須從 `JWT_SECRET` 環境變數讀取，不可硬編碼
- Token 有效期限制在合理範圍（預設 `7d`），不設定永久有效
- 敏感操作（如密碼重置）使用獨立的短效 token（`passwordResetToken`，10 分鐘有效）

## SQL Injection 防護

- 永遠使用 TypeORM QueryBuilder 的參數化查詢，不拼接 SQL 字串
- 模糊搜尋使用 `ILIKE :keyword` + `{ keyword: '%...%' }` 參數形式
- 不信任任何 ORM 自動 escape 外的動態 SQL

## XSS 防護

- API 為純 JSON，不產生 HTML，XSS 風險由前端負責處理
- 儲存至 DB 的 URL 欄位（如 imgBanner）不做 server-side 渲染，無需額外 sanitize

## CORS 與 Headers

- `cors()` 設定需明確指定允許的 origin，不使用 `origin: '*'` 在 production
- `helmet()` 已掛載，禁止移除或繞過

## 機密資訊管理

- `.env` 檔案禁止 commit 至版本控制（已在 `.gitignore` 排除）
- 新增環境變數時同步更新 `.env.example`（用假值或說明文字取代真實值）
- ECPay 的 `HASHKEY` / `HASHIV` / `MERCHANTID` 屬於金流機密，本地開發使用測試帳號

## 速率限制

- 驗證碼發送（email verification / password reset）有 10 分鐘 cooldown，不可移除
- 未來若新增其他高風險操作（如批次刪除），需評估是否加入 rate limiting
