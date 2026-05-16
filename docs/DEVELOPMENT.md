# DEVELOPMENT.md

## 模組系統

專案使用 **ESM** (`"type": "module"` in package.json)。TypeScript 編譯後產生 ESM 輸出，因此：
- 相對引入路徑必須加 `.js` 副檔名（即使原始碼是 `.ts`）：`import { foo } from './bar.js'`
- 不可使用 CommonJS `require()`

## 命名規則

| 類別 | 規則 | 範例 |
|------|------|------|
| 檔案名稱 | kebab-case | `concert-session.ts`, `ticket-type.ts` |
| Entity class | PascalCase | `TicketType`, `ConcertSession` |
| DB table 名稱 | snake_case（在 `@Entity` decorator 指定） | `ticket_type`, `concert_session` |
| DB 欄位 | camelCase（TypeORM 自動映射） | `userId`, `orgName` |
| Controller function | camelCase | `createConcert`, `getUserProfile` |
| Route file | kebab-case | `routes/auth.ts` |
| Type/Interface | PascalCase | `CreateConcertRequest`, `ApiResponse` |
| Enum value | UPPER_SNAKE_CASE | `UserRole.ADMIN`, `ErrorCode.AUTH_UNAUTHORIZED` |

## 新增 API 端點步驟

1. **定義型別**：在 `types/<module>/` 新增 request / response interface
2. **撰寫 controller**：在 `controllers/<module>.ts` 新增 `handleErrorAsync` 包裝的 async function
3. **註冊路由**：在 `routes/<module>.ts` 新增路由，掛載對應的 middleware（`isAuthenticated` / `adminAuth`）
4. **掛載 router**：若是新模組，在 `app.ts` 的 `app.use('/api/v1/<path>', router)` 中掛載
5. **更新文件**：更新 `docs/FEATURES.md` 的功能列表與 `docs/ARCHITECTURE.md` 的路由總覽表

## 新增 TypeORM Entity 步驟

1. 在 `models/` 建立 `<entity-name>.ts`
2. 使用 `@Entity('<table_name>')` 標記，UUID PK 使用 `@PrimaryGeneratedColumn('uuid')`
3. 關聯使用 `@ManyToOne` / `@OneToMany` / `@OneToOne`，加 `@JoinColumn` 指定 FK 欄位
4. 確認 `config/database.ts` 的 entities glob `models/*.{ts,js}` 能掃描到（通常自動）
5. **建立 migration**：`npm run typeorm migration:generate -- -d config/database.ts -n <MigrationName>`
6. 執行：`npm run migrate`
7. **禁止** 使用 `synchronize: true`（目前已設為 `false`）

## 新增 Middleware 步驟

在 `middlewares/` 新增檔案，依照 `(req: Request, res: Response, next: NextFunction)` 簽名，錯誤統一透過 `next(ApiError.xxx())` 傳遞。

## 錯誤處理規範

使用 `ApiError` 工廠方法產生標準化錯誤：

```typescript
// 在 controller 內拋出，由全域 error handler 處理
throw ApiError.unauthorized();           // 401 A06
throw ApiError.notFound('演唱會');       // 404 D01
throw ApiError.create(409, '名稱重複', ErrorCode.DATA_ALREADY_EXISTS); // 自訂

// 有欄位錯誤時使用 validation
throw ApiError.validation('表單驗證失敗', {
  email: { code: ErrorCode.AUTH_EMAIL_REQUIRED, message: 'Email 為必填欄位' }
});
```

全域 error handler 統一回傳：
```json
{ "status": "failed", "message": "...", "code": "A06", "details": {} }
```

**查詢類 API 的空結果處理原則**：
- 列表查詢（search、popular、banners 等）無符合資料時，回傳 `200 + data: []`，不拋 `ApiError.notFound()`。
- 僅「查詢單一指定資源」（如 `GET /:id`）找不到時才拋 404。

## CI/CD 與 GitHub Secrets

`.github/workflows/ci.yml` 執行 Lint → Build → Integration Tests → Deploy → Discord 通知。

### GitHub Repository Secrets 必要設定

| Secret 名稱 | 用途 | 必要 |
|-------------|------|------|
| `DISCORD_WEBHOOK` | Discord 頻道 Webhook URL，CI 結果推送通知 | 是 |
| `RENDER_DEPLOY_HOOK_URL` | Render 部署觸發 Hook URL | 是（deploy job） |
| `JWT_SECRET` | CI 測試用 JWT Secret（未設定則使用預設測試值） | 否 |

**設定方式**：Repo → Settings → Secrets and variables → Actions → New repository secret

**取得 Discord Webhook URL**：Discord 頻道 → 編輯頻道 → 整合 → Webhook → 新增 Webhook → 複製 URL

## 環境變數

| 變數 | 用途 | 必要 | 預設值 |
|------|------|------|--------|
| `PORT` | HTTP 監聽埠 | 否 | 3000 |
| `NODE_ENV` | 環境模式 | 否 | development |
| `DB_HOST` | PostgreSQL 主機 | 是 | — |
| `DB_PASSWORD` | PostgreSQL 密碼 | 是 | — |
| `DB_PORT` | PostgreSQL 埠號 | 是 | — |
| `DB_NAME` | 資料庫名稱 | 是 | — |
| `DB_USER` | 資料庫用戶 | 是 | — |
| `DB_URL` | Supabase Project URL | 是（Storage） | — |
| `DB_ANON_KEY` | Supabase Anon Key | 是（Storage） | — |
| `AWS_REGION` | AWS S3 區域 | 是（S3） | — |
| `AWS_ACCESS_KEY_ID` | AWS Access Key | 是（S3） | — |
| `AWS_SECRET_ACCESS_KEY` | AWS Secret Key | 是（S3） | — |
| `AWS_S3_BUCKET` | S3 Bucket 名稱 | 是（S3） | — |
| `EMAILER_USER` | Gmail SMTP 帳號 | 是 | — |
| `EMAILER_OAUTH_REFRESH_TOKEN` | Gmail OAuth2 Refresh Token | 是 | — |
| `JWT_SECRET` | JWT 簽名密鑰 | 是 | — |
| `JWT_EXPIRES_DAY` | JWT 有效期 | 否 | 7d |
| `GOOGLE_OAUTH_CLIENT_ID` | Google OAuth 登入 Client ID（passport-google-oauth20） | 是（OAuth） | — |
| `GOOGLE_OAUTH_CLIENT_SECRET` | Google OAuth 登入 Client Secret | 是（OAuth） | — |
| `GOOGLE_OAUTH_CALLBACK_URL` | Google OAuth Callback URL（後端路徑） | 是（OAuth） | — |
| `GOOGLE_GMAIL_CLIENT_ID` | Gmail 寄信 Client ID（nodemailer OAuth2） | 是（Email） | — |
| `GOOGLE_GMAIL_CLIENT_SECRET` | Gmail 寄信 Client Secret | 是（Email） | — |
| `FRONTEND_URL` | 前端網址（OAuth 重定向） | 是 | — |
| `MERCHANTID` | ECPay 商店代號 | 是（金流） | — |
| `HASHKEY` | ECPay HashKey | 是（金流） | — |
| `HASHIV` | ECPay HashIV | 是（金流） | — |
| `HOST` | ECPay 主機 URL | 是（金流） | — |
| `REDIRECTURL` | 付款後重定向 URL | 是（金流） | — |
| `CLEANUP_TEMP_IMAGES_HOURS` | 清理幾小時前的暫存圖片 | 否 | 24 |
| `CLEANUP_INTERVAL_HOURS` | 每幾小時執行一次清理 | 否 | 6 |
| `GEMINI_API_KEY` | Gemini AI API Key（取代 OpenAI，用於 AI 審核 / 智慧客服 / Embedding） | 否 | — |
| `OPENAI_API_KEY` | ~~已棄用~~ — 原 OpenAI API Key，已由 `GEMINI_API_KEY` 取代 | 否 | — |
| `DISCORD_BOT_TOKEN` | Discord Bot Token，用於傳送審核訊息至頻道 | 否（Discord 功能） | — |
| `DISCORD_CHANNEL_ID` | Discord 目標頻道 ID | 否（Discord 功能） | — |
| `DISCORD_PUBLIC_KEY` | Discord 應用程式 Ed25519 公鑰，用於驗證 Interaction 簽名 | 否（Discord 功能） | — |
| `DISCORD_APPLICATION_ID` | Discord 應用程式 ID，用於 PATCH Interaction 訊息（deferred response） | 否（Discord 功能） | — |

## 常見陷阱

### TypeORM "No metadata for 'Entity' was found"

**症狀**：HTTP 500，錯誤訊息為 `No metadata for "XxxEntity" was found`。

**原因**：`AppDataSource.getRepository(Entity)` 或任何 TypeORM 操作在 `AppDataSource.initialize()` 完成之前被呼叫。常見觸發情境：
- 伺服器已開始接受 HTTP 請求，但 DB 初始化尚未完成（啟動後的短暫時間窗口）
- 在 `app.ts` 模組載入期間就呼叫 `AppDataSource.initialize()`，與 `bin/server.ts` 中的呼叫形成並行競爭

**正確做法**：`server.listen()` 必須放在 `AppDataSource.initialize().then()` 回呼內，確保伺服器只在資料庫完全就緒後才接受請求。`app.ts` 不應包含任何 DB 初始化邏輯。

```typescript
// bin/server.ts — 正確的啟動順序
AppDataSource.initialize()
  .then(async () => {
    await scheduleConcertFinishJobs();
    await scheduleOrderExpiredJobs();
    server.listen(port);  // ← DB 就緒後才 listen
  })
  .catch(err => {
    console.error('資料庫連接失敗:', err);
    process.exit(1);
  });
```

### Google OAuth `redirect_uri_mismatch` / 已封鎖存取權

**症狀**：Google OAuth 登入頁面顯示「已封鎖存取權：這個應用程式的要求無效」或 `400: redirect_uri_mismatch`。

**原因**：後端有兩個 Google 服務（Gmail 寄信 + OAuth 登入），若兩者共用同一組 env var（`GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`），其中一個 client 的設定會蓋過另一個，導致送出的 `client_id` 與 Google Cloud Console 中登記 redirect URI 的 OAuth client 不符。

**正確做法**：兩個服務使用獨立 env var：
- OAuth 登入（`config/passport.ts`）：`GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET` / `GOOGLE_OAUTH_CALLBACK_URL`
- Gmail 寄信（`utils/email.ts`）：`GOOGLE_GMAIL_CLIENT_ID` / `GOOGLE_GMAIL_CLIENT_SECRET`

確認 `GOOGLE_OAUTH_CLIENT_ID` 對應的 Google Cloud Console OAuth client 已加入正確的 **Authorized redirect URI**（後端 callback 路徑，例如 `https://example.com/api/v1/auth/google/callback`）。

## 計畫歸檔流程

1. 計畫檔案命名格式：`YYYY-MM-DD-<feature-name>.md`
2. 計畫文件結構：User Story → Spec → Tasks
3. 功能完成後：移至 `docs/plans/archive/`
4. 更新 `docs/FEATURES.md` 和 `docs/CHANGELOG.md`

## Gender 欄位特殊處理

DB 儲存英文 enum（`male` / `female` / `other`），API 回傳與接收中文（`男` / `女` / `其他`）。Controller 中有對應的轉換函式 `toChineseGender` / `toEnglishGender`。新功能若涉及 gender 欄位需依循此模式。

## Region / EventType 選項

`models/user.ts` 定義了 `RegionOptions` 和 `EventTypeOptions` 陣列，提供中英文對照。`GET /api/v1/users/profile/regions` 和 `GET /api/v1/users/profile/event-types` 端點回傳這些選項，格式為 `{ label: 中文, value: 中文, subLabel: 英文 }`。
