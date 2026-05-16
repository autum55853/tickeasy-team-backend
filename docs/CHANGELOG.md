# CHANGELOG.md

## [未發布]

### 新增
- **[2026-05-12] OpenAI → Gemini AI 全面遷移**
  - 新增 `services/geminiService.ts`，實作與 `openaiService` 相同介面（`AIReviewResponse`、`getChatCompletion`、`reviewConcert`、`testConnection`）
  - `embedding-service.ts`：改用 Gemini `text-embedding-004`（768 維，原 OpenAI 1536 維）；向量以 JSONB 儲存，無需 DB schema 遷移
  - `chat-service.ts`：以 DB 歷史重建取代 OpenAI Responses API，使用 `startChat() + sendMessage()` 維持對話記憶
  - `concertReviewService.ts`、`intent-classification-service.ts` import 改為 `geminiService`
  - `openaiService.ts` 加上棄用說明並保留供回滾參考（`[OpenAI]` 標記）
  - 新增環境變數 `GEMINI_API_KEY`；`OPENAI_API_KEY` 標為已棄用
  - **部署後動作**：呼叫 `POST /api/v1/knowledge-base/embeddings/update`（需 Admin token）重生所有知識庫向量（768 維）

- **[2026-05-11] CI Discord 通知**
  - GitHub Actions workflow 新增 `notify` job，於 Lint / Build / Test 完成後推送結果至 Discord 頻道
  - 使用 `sarisia/actions-status-discord@v1`，成功顯示綠色、失敗顯示紅色，含各 job 狀態與 Actions run 連結
  - 需在 GitHub Secrets 設定 `DISCORD_WEBHOOK`（Discord 頻道 Webhook URL）

### 修復
- **[2026-05-16] Discord 審核按鈕點擊顯示「此交互失敗」**
  - **根本原因**：`discordController.ts` 在送回 HTTP 回應前先 `await concertReviewService.submitManualReview()`，DB 操作耗時 2.4s+，加上網路延遲超過 Discord Interaction 3 秒 deadline。
  - **修復**：改用 Deferred Response 模式——按鈕點擊後立即回應 `{ type: 6 }` (DEFERRED_UPDATE_MESSAGE)，再異步執行審核，完成後呼叫 `patchInteractionResponse()` PATCH `/webhooks/{APPLICATION_ID}/{token}/messages/@original` 更新訊息。
  - **新增環境變數**：`DISCORD_APPLICATION_ID`（Discord Developer Portal → Application → General Information）。

- **[2026-05-11] Google OAuth 登入 — `redirect_uri_mismatch` / 已封鎖存取權**
  - **根本原因**：後端同時使用兩個 Google 服務（Gmail 寄信 + OAuth 登入），但 `config/passport.ts` 與 `utils/email.ts` 共用同一組 `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` 環境變數，導致 OAuth 登入送出 Gmail 的 Client ID，與 Google Cloud Console 登記 redirect URI 的 OAuth client 不符。
  - **修復**：拆開兩組 env var——OAuth 登入改用 `GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET` / `GOOGLE_OAUTH_CALLBACK_URL`；Gmail 寄信改用 `GOOGLE_GMAIL_CLIENT_ID` / `GOOGLE_GMAIL_CLIENT_SECRET`。部署時須確認 `GOOGLE_OAUTH_CLIENT_ID` 對應的 Google Cloud Console OAuth client 已登記正確的 redirect URI。

- **[2026-05-06] `/api/v1/concerts/banners` HTTP 500 — "No metadata for 'Concert' was found"**
  - **根本原因**：`app.ts` 在模組載入時就呼叫 `connectToDatabase()`（即 `AppDataSource.initialize()`），而 `bin/server.ts` 也呼叫一次 `AppDataSource.initialize()`，兩者在同一個事件迴圈 tick 中並行執行，造成競爭條件。同時 `server.listen()` 在 DB 初始化完成前就被呼叫，使伺服器在 TypeORM entity metadata 尚未載入時即開始接受請求。
  - **修復**：移除 `app.ts` 中的 `connectToDatabase()` 呼叫，讓 `app.ts` 僅負責 Express 設定。在 `bin/server.ts` 中確保執行順序為：`AppDataSource.initialize()` → 排程任務 → `server.listen()`，伺服器只在資料庫完全就緒後才開始接受連線。

### 進行中
- 訂單流程整合
- ECPay 綠界金流整合

---

## [0.3.0] - 2025

### 新增
- 演唱會建立支援票種陣列（`ticketTypes`），依草稿狀態決定驗證邏輯
- 演唱會修改限制僅能編輯草稿狀態，並全量重建票種
- 新增 `promotion` 欄位，排序優先為 promotion ASC 再來是 visitCount ASC
- 支援 Query String `take` 參數調整回傳資料數量
- 新增取得特定組織音樂會列表 API，支援分頁、篩選及排序

### 變更
- 演唱會回傳資料結構調整，包含 `concert` 與 `ticketTypes` 兩個物件

---

## [0.2.0] - 2025

### 新增
- 組織 CRUD 完整功能
- 演唱會搜尋（keyword、locationTagId、musicTagId、日期範圍、分頁）
- 演唱會熱門排行與首頁 Banner
- visitCount 計數端點
- 圖片上傳模組（Multer + Sharp + S3 / Supabase Storage）
- 暫存圖片定時清理機制

---

## [0.1.0] - 2025

### 新增
- 專案初始化（TypeScript + Express + TypeORM + Supabase）
- Email 註冊 / 登入
- Email 驗證（6 位數驗證碼，10 分鐘有效）
- 密碼重置流程
- Google OAuth 2.0 登入（雙模式：redirect / JSON）
- JWT 認證 middleware（isAuthenticated / optionalAuth / isAdmin / adminAuth）
- 用戶個人資料查詢 / 更新
- 地區 / 活動類型選項端點
- 統一 API 回應格式與錯誤碼體系
