# 專案目錄結構說明

> Tickeasy Team Backend — TypeScript + Express 4.x REST API  
> 資料庫：PostgreSQL (Supabase) + TypeORM  
> 認證：JWT + Google OAuth  
> 金流：ECPay  
> 圖片儲存：Supabase Storage

---

## 根目錄檔案

| 檔案 | 說明 |
|------|------|
| `app.ts` | Express 應用程式主設定：掛載所有 middleware（helmet、cors、morgan、cookieParser）、註冊所有路由、全域錯誤處理器與 404 處理 |
| `bin/server.ts` | HTTP Server 進入點：建立 server、監聽 port、啟動 `concertScheduler` 與 `orderScheduler` 排程任務 |
| `package.json` | 專案依賴、npm scripts（dev/build/migrate/test/lint） |
| `tsconfig.json` | TypeScript 編譯設定（target: ES2020, module: ESNext, strict mode） |
| `jest.config.cjs` | Jest 測試框架設定（使用 ts-jest，ESM 相容模式） |
| `eslint.config.js` | ESLint 設定（TypeScript 規則） |
| `Dockerfile` | Docker 映像建置流程：node:18-alpine → npm install → tsc 編譯 → 複製 views → 啟動 server |
| `docker-compose.yml` | 本地 Docker Compose 設定 |
| `render.yaml` | Render.com 部署設定（Docker runtime、singapore region、pre-deploy 執行 migration） |
| `.env.example` | 環境變數範本（含所有必要變數的說明，真實值請填入 `.env`） |
| `.gitignore` | Git 忽略規則（含 `.env`、`dist/`、`node_modules/`） |
| `.dockerignore` | Docker 建置時排除的檔案 |
| `supabase.sql` | 資料庫初始 Schema SQL（手動參考用） |
| `API.md` | API 端點文件 |
| `README.md` | 專案快速說明 |
| `GitFlow.md` | Git 分支策略說明 |
| `CLAUDE.md` | Claude AI 輔助開發規則（專案層級） |

---

## `config/` — 應用程式設定

| 檔案 | 說明 |
|------|------|
| `database.ts` | TypeORM `AppDataSource` 設定（PostgreSQL 連線、entity glob 掃描、migration 路徑）；`connectToDatabase()` 初始化函式；`synchronize: false` 確保不自動改 schema |
| `passport.ts` | Google OAuth 2.0 策略設定（`passport-google-oauth20`）：新用戶自動建立、既有用戶更新 token、`oauthProviders` JSONB 欄位管理 |
| `smart-reply-rules.ts` | 智能客服回覆規則設定檔：定義 `SmartReplyRule` 介面與 `SMART_REPLY_RULES` 陣列，支援 `tutorial`（圖文教學）與 `faq`（問答）兩種回覆類型 |
| `concert-reply-rules.ts` | 演唱會專屬智能回覆規則：針對演唱會查詢、推薦等關鍵字的預設回覆內容 |

---

## `models/` — TypeORM 資料模型（Entity）

每個 entity 對應資料庫中一張資料表，使用 TypeORM 裝飾器定義欄位與關聯。

| 檔案 | 資料表 | 說明 |
|------|--------|------|
| `index.ts` | — | 集中匯出所有 model，並於 `app.ts` 引入以確保 TypeORM 載入 |
| `user.ts` | `user` | 使用者：email、密碼（bcrypt 自動 hash）、角色（user/admin/superuser）、OAuth providers（JSONB）、軟刪除 |
| `organization.ts` | `organization` | 主辦單位（公司/個人）：隸屬某位 user，擁有多場演唱會 |
| `concert.ts` | `concert` | 演唱會主體：狀態（draft/reviewing/published/rejected/finished）、關聯 venue、location tag、music tag、sessions |
| `concert-session.ts` | `concertSession` | 演唱會場次：一場演唱會可有多個場次，每場次有多個票種 |
| `concert-review.ts` | `concertReview` | 演唱會審核記錄：記錄 AI 自動審核或人工審核的結果 |
| `ticket-type.ts` | `ticketType` | 票種：隸屬場次，定義票名、售價、座位數量等 |
| `order.ts` | `order` | 訂單：狀態（held/expired/paid/cancelled/refunded）、鎖定過期時間 |
| `ticket.ts` | `ticket` | 票券：狀態（purchased/refunded/used），對應具體一張票 |
| `payment.ts` | `payment` | 支付記錄：狀態（pending/completed/failed/refunded），對應 ECPay 交易 |
| `venue.ts` | `venues` | 場地：名稱、地址、容量、描述 |
| `location-tag.ts` | `locationTag` | 地區標籤（如：台北、高雄） |
| `music-tag.ts` | `musicTag` | 音樂類型標籤（如：流行、搖滾） |
| `support-session.ts` | `supportSession` | 客服會話：類型（bot/human/mixed）、狀態（active/waiting/closed/transferred）、優先級 |
| `support-message.ts` | `supportMessage` | 客服訊息：發送者類型（user/bot/agent）、訊息類型、AI 信心度等 metadata |
| `support-knowledge-base.ts` | `supportKnowledgeBase` | 智能客服知識庫：標題、內容、分類、標籤、向量嵌入（embedding vector） |
| `support-schedule.ts` | `supportSchedule` | 客服人員班表：agent、星期幾、上下班時間 |

---

## `controllers/` — 請求處理層

接收 route 傳入的 `req`/`res`，執行業務邏輯或呼叫 service，回傳標準格式 `{ status, message, data }`。

| 檔案 | 說明 |
|------|------|
| `auth.ts` | 認證相關：register、login、verifyEmail、resendVerification、requestPasswordReset、resetPassword、changePassword、googleLogin |
| `user.ts` | 使用者：取得/更新個人資料、取得地區/活動類型選項、修改角色、取得訂單列表、取得票券詳情 |
| `organization.ts` | 主辦單位：CRUD、取得該組織的演唱會列表 |
| `concert.ts` | 演唱會：建立、修改（僅限草稿）、送審、取消、查詢（含分頁、篩選）、取得詳情 |
| `orders.ts` | 訂單：建立訂單（鎖票）、申請退款、查詢訂單詳情 |
| `payment.ts` | 金流：產生 ECPay 付款網址、接收 ECPay 非同步回調（return） |
| `ticket.ts` | 票券：取得場次可購票種、驗票（掃 QR Code） |
| `session-checkin.ts` | 場次報到：查詢已使用票券記錄 |
| `upload.ts` | 圖片上傳（支援暫存模式）與刪除 |
| `health.ts` | 健康檢查：`keep-alive` 端點（供 Render.com 保活用，含暫存圖片清理） |
| `knowledge-base-controller.ts` | 知識庫 CRUD：新增、查詢、更新、刪除知識庫條目，觸發 embedding 計算 |
| `smart-reply-controller.ts` | 智能客服：接收使用者訊息，透過分層策略（關鍵字 → 語義搜尋 → AI）回覆 |

---

## `routes/` — 路由定義層

負責 URL 路徑對應 controller 函式，並套用 middleware（如 `isAuthenticated`）。

| 檔案 | 路由前綴 | 說明 |
|------|----------|------|
| `auth.ts` | `/api/v1/auth` | 註冊、登入、信箱驗證、密碼重置、Google OAuth |
| `user.ts` | `/api/v1/users` | 個人資料、訂單列表、票券詳情、角色管理 |
| `organization.ts` | `/api/v1/organizations` | 主辦單位 CRUD |
| `concert.ts` | `/api/v1/concerts` | 演唱會 CRUD、送審、公開查詢 |
| `ticket.ts` | `/api/v1/ticket` | 取得票種、驗票 |
| `orders.ts` | `/api/v1/orders` | 建立訂單、退款、查詢 |
| `payment.ts` | `/api/v1/payments` | ECPay 付款網址、回調接收 |
| `session.ts` | `/api/v1/sessions` | 場次已使用票券記錄 |
| `upload.ts` | `/api/v1/upload` | 圖片上傳 / 刪除 |
| `knowledge-base.ts` | `/api/v1/knowledge-base` | 知識庫管理（含 admin 權限驗證） |
| `smart-reply.ts` | `/api/v1/smart-reply` | 智能客服對話（`optionalAuth`，不強制登入） |
| `health.ts` | `/api/v1/health` | 健康檢查、keep-alive |

---

## `middlewares/` — 中介層

| 檔案 | 說明 |
|------|------|
| `auth.ts` | JWT 驗證：`isAuthenticated`（強制登入）、`optionalAuth`（選擇性登入）、`isAdmin`（管理員）、`adminAuth`、`requireVerifiedEmail`（需信箱驗證）、`checkSessionAccess`（客服會話存取控制） |
| `upload.ts` | Multer 設定：記憶體儲存、1MB 大小限制、僅允許 JPEG/PNG/GIF/WebP |
| `index.ts` | 匯出 `uploadMiddleware` 與 `handleMulterError` |

---

## `services/` — 業務邏輯服務層

| 檔案 | 說明 |
|------|------|
| `imageService.ts` | 圖片操作的基礎 Supabase Storage 用戶端（上傳、刪除、取得 URL） |
| `storage-supabase.ts` | 完整圖片上傳流程：接收 Buffer → `sharp` 壓縮轉 WebP → 上傳至 Supabase Storage |
| `storage-s3.ts` | S3 儲存方案（目前已全部註解，保留備用） |
| `concertImageService.ts` | 演唱會圖片專用路徑產生（banner、seating table）並呼叫 `imageService` |
| `concertReviewService.ts` | 演唱會 AI 審核流程：查詢演唱會資料 → 呼叫 `openaiService` → 寫入 `concertReview` 紀錄 → 更新 concert 狀態 |
| `openaiService.ts` | OpenAI API 封裝：演唱會內容審核（`AIReviewResponse`），依據 `reviewRulesService` 規則建立 prompt |
| `reviewRulesService.ts` | 審核規則設定服務：定義內容審核標準（敏感詞、虛假宣傳、價格合理性等） |
| `chat-service.ts` | 聊天服務：整合 OpenAI Responses API 與 Supabase，管理客服會話與訊息 |
| `smart-reply-service.ts` | 智能回覆分層策略：關鍵字過濾 → 圖文教學 → 語義搜尋 → AI 回覆 |
| `intent-classification-service.ts` | 意圖識別：使用 OpenAI 分析使用者查詢意圖（演唱會/美食/住宿/交通/一般客服） |
| `concert-search-service.ts` | 演唱會搜尋：支援藝人名、地區、時間、場地等多維度查詢（供客服系統使用） |
| `knowledge-base-service.ts` | 知識庫管理：CRUD + 觸發 embedding 計算 |
| `embedding-service.ts` | 向量嵌入：使用 OpenAI `text-embedding-3-small` 將文字轉換為 1536 維向量 |
| `semantic-search-service.ts` | 語義搜尋：計算查詢向量後與知識庫向量比對，回傳最相似結果 |
| `supabase-service.ts` | Supabase 用戶端封裝（`SupabaseService` class），供客服相關服務使用 |
| `ticketVerificationService.ts` | 驗票服務：解析 QR Code → 查詢 ticket/order → 更新票券狀態為 `used` |

---

## `scheduler/` — 排程任務

| 檔案 | 執行時間 | 說明 |
|------|----------|------|
| `concertScheduler.ts` | 每天 00:10 | 檢查所有已發布演唱會，若全部場次已結束則將狀態改為 `finished` |
| `orderScheduler.ts` | 每分鐘 | 找出所有 `held` 且 `lockExpireTime` 已過的訂單，更新為 `expired` 並釋放票券庫存 |

---

## `utils/` — 工具函式

| 檔案 | 說明 |
|------|------|
| `apiError.ts` | `ApiError` 工廠類別：統一建立帶有錯誤碼的 HTTP 錯誤物件（如 `ApiError.unauthorized()`、`ApiError.notFound()`） |
| `handleErrorAsync.ts` | `handleErrorAsync(fn)` 高階函式：包裝非同步 controller，自動 catch 並傳給 `next(err)` |
| `email.ts` | Nodemailer 封裝：發送信箱驗證信、密碼重置信 |
| `date.ts` | 日期處理工具（使用 `date-fns`、`date-fns-tz`） |
| `index.ts` | 集中匯出所有 utils |

---

## `types/` — TypeScript 型別定義

| 路徑 | 說明 |
|------|------|
| `api.ts` | `ApiResponse<T>`、`PaginatedResponse<T>`、`ErrorCode` 枚舉（A/V/D/S 分類） |
| `common.ts` | 通用型別 |
| `express.d.ts` | 擴充 Express `Request`，加入 `req.user` 屬性 |
| `auth/` | 認證相關型別：JWT payload（`jwt.ts`）、request/response DTO |
| `user/` | 使用者 request/response DTO |
| `concert/` | 演唱會相關型別 |
| `organization/` | 主辦單位型別 |
| `upload/` | 圖片上傳 context 與參數型別 |
| `vanue/` | 場地型別（注意：目錄名為 vanue，非 venue） |
| `ecpay_aio_nodejs.ts` | ECPay npm 套件的 TypeScript 型別補充聲明 |
| `node-schedule.d.ts` | node-schedule 型別補充聲明 |

---

## `tests/` — 測試

| 路徑 | 說明 |
|------|------|
| `auth.test.ts` | 認證 API 整合測試（register、login、verify-email 等） |
| `user.test.ts` | 使用者 API 整合測試 |
| `concert.test.ts` | 演唱會 API 整合測試 |
| `helpers/dbSetup.ts` | 測試用資料庫初始化/清理 |
| `helpers/envSetup.ts` | 測試用環境變數設定 |
| `helpers/factories.ts` | 測試資料工廠（快速建立 user、concert 等測試物件） |

---

## `scripts/` — 執行腳本

| 檔案 | 說明 |
|------|------|
| `cleanupTempImages.ts` | 清理 Supabase Storage 中超過設定時間（`CLEANUP_TEMP_IMAGES_HOURS`）的暫存圖片，由 `health.keepAlive` 定期觸發 |

---

## `docs/` — 文件

| 路徑 | 說明 |
|------|------|
| `README.md` | 專案介紹與快速開始 |
| `ARCHITECTURE.md` | 架構、目錄結構、資料流、DB Schema 說明 |
| `DEVELOPMENT.md` | 開發規範、命名規則、環境變數說明 |
| `FEATURES.md` | 功能列表與行為描述 |
| `TESTING.md` | 測試規範與指南 |
| `CHANGELOG.md` | 版本更新日誌 |
| `concert-image-upload-guide.md` | 演唱會圖片上傳流程說明 |
| `concert-scheduler-guide.md` | 演唱會排程任務說明 |
| `smart-reply-rules-guide.md` | 智能回覆規則設定指南 |
| `plans/` | 功能開發計畫（進行中） |
| `plans/archive/` | 已完成的開發計畫存檔 |

---

## `views/` — EJS 模板

| 檔案 | 說明 |
|------|------|
| `ecpay.ejs` | ECPay 付款表單頁面（server-side render，用於提交付款資料至綠界） |
| `error.ejs` | 錯誤頁面模板 |
| `index.ejs` | 預設首頁模板 |

---

## `public/` — 靜態資源

| 路徑 | 說明 |
|------|------|
| `stylesheets/style.css` | 預設 CSS（Express generator 產生，目前基本用途） |

---

## `.claude/` — Claude AI 輔助開發設定

| 路徑 | 說明 |
|------|------|
| `rules/api-design.md` | API 設計規範（回應格式、錯誤碼） |
| `rules/database.md` | 資料庫操作規範 |
| `rules/git-commit.md` | Git commit message 格式規範 |
| `rules/security.md` | 資安規則（輸入驗證、密碼、JWT、SQL injection 防護） |
| `rules/testing.md` | 測試規範 |
| `agents/` | Claude 專屬 agent 設定（code-reviewer、debugger、doc-writer 等） |
| `hooks/auto-format.sh` | 存檔後自動執行 ESLint fix |
| `hooks/compact-reminder.sh` | 對話精簡提醒 hook |
| `settings.json` | Claude Code 專案設定 |

---

## `.github/` — CI/CD

| 路徑 | 說明 |
|------|------|
| `workflows/ci.yml` | GitHub Actions：push/PR 時自動執行 lint + build + test |

---

## 主要資料流

```
HTTP Request
  → routes/         (URL 對應、middleware 套用)
  → middlewares/    (JWT 驗證、檔案上傳處理)
  → controllers/    (解析請求、呼叫 service)
  → services/       (業務邏輯、資料庫操作)
  → models/         (TypeORM Entity)
  → PostgreSQL (Supabase)
  → controllers/    (組裝回應)
HTTP Response { status, message, data }
```

## 環境變數速查

| 變數 | 用途 |
|------|------|
| `PORT` | Server 監聽 port（預設 3000） |
| `NODE_ENV` | 環境（development / production） |
| `DB_HOST/PORT/USER/PASSWORD/NAME` | PostgreSQL 連線資訊 |
| `DB_URL` / `DB_ANON_KEY` | Supabase Storage 連線 |
| `JWT_SECRET` | JWT 簽名密鑰（**必填**，未設定即報錯） |
| `JWT_EXPIRES_DAY` | JWT 有效期（預設 7d） |
| `GOOGLE_CLIENT_ID/SECRET/CALLBACK_URL` | Google OAuth 設定 |
| `FRONTEND_URL` | 前端網址（OAuth redirect 用） |
| `EMAILER_USER` / `EMAILER_OAUTH_REFRESH_TOKEN` | Gmail OAuth 寄信設定 |
| `MERCHANTID/HASHKEY/HASHIV` | ECPay 金流設定 |
| `HOST/REDIRECTURL` | ECPay 回調網址設定 |
| `OPENAI_API_KEY` | OpenAI API 金鑰（AI 審核、智能客服、embedding） |
| `CLEANUP_TEMP_IMAGES_HOURS` | 暫存圖片清理時限（預設 24 小時） |
| `CLEANUP_INTERVAL_HOURS` | 清理任務執行間隔（預設 6 小時） |
