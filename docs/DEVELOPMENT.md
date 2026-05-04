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
| `EMAILER_PASSWORD` | Gmail App Password | 是 | — |
| `JWT_SECRET` | JWT 簽名密鑰 | 是 | — |
| `JWT_EXPIRES_DAY` | JWT 有效期 | 否 | 7d |
| `GOOGLE_CLIENT_ID` | Google OAuth Client ID | 是（OAuth） | — |
| `GOOGLE_CLIENT_SECRET` | Google OAuth Secret | 是（OAuth） | — |
| `GOOGLE_CALLBACK_URL` | Google OAuth Callback URL | 是（OAuth） | — |
| `FRONTEND_URL` | 前端網址（OAuth 重定向） | 是 | — |
| `MERCHANTID` | ECPay 商店代號 | 是（金流） | — |
| `HASHKEY` | ECPay HashKey | 是（金流） | — |
| `HASHIV` | ECPay HashIV | 是（金流） | — |
| `HOST` | ECPay 主機 URL | 是（金流） | — |
| `REDIRECTURL` | 付款後重定向 URL | 是（金流） | — |
| `CLEANUP_TEMP_IMAGES_HOURS` | 清理幾小時前的暫存圖片 | 否 | 24 |
| `CLEANUP_INTERVAL_HOURS` | 每幾小時執行一次清理 | 否 | 6 |
| `OPENAI_API_KEY` | OpenAI API Key | 否 | — |

## 計畫歸檔流程

1. 計畫檔案命名格式：`YYYY-MM-DD-<feature-name>.md`
2. 計畫文件結構：User Story → Spec → Tasks
3. 功能完成後：移至 `docs/plans/archive/`
4. 更新 `docs/FEATURES.md` 和 `docs/CHANGELOG.md`

## Gender 欄位特殊處理

DB 儲存英文 enum（`male` / `female` / `other`），API 回傳與接收中文（`男` / `女` / `其他`）。Controller 中有對應的轉換函式 `toChineseGender` / `toEnglishGender`。新功能若涉及 gender 欄位需依循此模式。

## Region / EventType 選項

`models/user.ts` 定義了 `RegionOptions` 和 `EventTypeOptions` 陣列，提供中英文對照。`GET /api/v1/users/profile/regions` 和 `GET /api/v1/users/profile/event-types` 端點回傳這些選項，格式為 `{ label: 中文, value: 中文, subLabel: 英文 }`。
