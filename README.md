# Tickeasy 後端專案

演唱會票務系統後端 API 服務，使用 TypeScript + Express 4.x 構建，提供會員認證、演唱會管理、訂單與金流等完整功能。

## 功能總覽

| 模組 | 功能 | 狀態 |
|------|------|------|
| 認證 | Email 註冊 / 登入、Email 驗證（6位數驗證碼）、密碼重置 | ✅ 完成 |
| 認證 | Google OAuth 2.0 登入 | ✅ 完成 |
| 用戶 | 個人資料查詢 / 更新、地區 / 活動類型選項 | ✅ 完成 |
| 組織 | 組織 CRUD、取得組織演唱會列表 | ✅ 完成 |
| 演唱會 | 建立 / 更新（草稿模式）、多票種管理 | ✅ 完成 |
| 演唱會 | 搜尋 / 篩選 / 分頁、熱門演唱會、首頁 Banner | ✅ 完成 |
| 演唱會 | visitCount 計數、promotion 權重管理（Admin） | ✅ 完成 |
| 圖片 | Multer + Sharp 上傳、Supabase Storage 儲存、暫存清理 | ✅ 完成 |
| 訂單 | 訂單流程 | 🔧 進行中 |
| 金流 | ECPay 綠界支付 | 🔧 進行中 |

## 技術棧

| 類別 | 技術 |
|------|------|
| 語言 | TypeScript（ESM modules） |
| 框架 | Express 4.x |
| ORM | TypeORM 0.3.x（migrations，`synchronize: false`） |
| 資料庫 | PostgreSQL（Supabase 雲端） |
| 認證 | JWT + Passport.js（Google OAuth 2.0） |
| 圖片儲存 | Multer + Sharp + Supabase Storage |
| 郵件 | Nodemailer（Gmail + Google OAuth2） |
| 金流 | 綠界 ECPay |
| 測試 | Jest + Supertest |
| Lint | ESLint + TypeScript-ESLint |
| 安全 | Helmet、bcrypt（rounds=12）、CORS |
| 部署 | Render.com（`render.yaml`） |

## 快速開始

### 先決條件

- Node.js v18+
- npm
- Supabase 帳號（資料庫 + Storage）
- Google Cloud 帳號（OAuth 2.0 + Gmail API）

### 安裝步驟

```bash
# 1. 複製專案
git clone <repository-url>
cd tickeasy-team-backend

# 2. 安裝相依套件
npm install

# 3. 設定環境變數
cp .env.example .env
# 填入各服務的金鑰（詳見下方環境變數說明）

# 4. 執行資料庫 migration
npm run migrate

# 5. 啟動開發伺服器
npm run dev
```

伺服器預設啟動於 `http://localhost:3000`，API 根路徑為 `/api/v1/`。

## 環境變數

複製 `.env.example` 並填入以下設定：

```dotenv
PORT=3000
NODE_ENV=development

# Supabase 資料庫
DB_HOST=         # Supabase DB 主機位址
DB_PORT=5432
DB_USER=         # 資料庫使用者名稱
DB_PASSWORD=     # 資料庫密碼
DB_NAME=postgres

# Supabase Storage
DB_URL=          # Supabase project URL
DB_ANON_KEY=     # Supabase anon key

# JWT
JWT_SECRET=      # 自訂安全密鑰（必填，否則無法啟動）
JWT_EXPIRES_DAY=7d

# Email（Gmail + Google OAuth2）
EMAILER_USER=                    # Gmail 帳號
EMAILER_OAUTH_REFRESH_TOKEN=     # Gmail OAuth2 refresh token
GOOGLE_GMAIL_CLIENT_ID=          # Gmail 寄信專用 Google OAuth Client ID
GOOGLE_GMAIL_CLIENT_SECRET=      # Gmail 寄信專用 Google OAuth Client Secret

# Google OAuth 第三方登入（passport-google-oauth20）
GOOGLE_OAUTH_CLIENT_ID=          # OAuth 登入專用 Client ID
GOOGLE_OAUTH_CLIENT_SECRET=      # OAuth 登入專用 Client Secret
GOOGLE_OAUTH_CALLBACK_URL=http://localhost:3000/api/v1/auth/google/callback
FRONTEND_URL=http://localhost:3010  # 登入成功後重定向的前端網址

# 綠界 ECPay 金流
MERCHANTID=
HASHKEY=
HASHIV=
HOST=            # ECPay API 主機
REDIRECTURL=     # 付款完成重定向 URL

# 暫存圖片清理
CLEANUP_TEMP_IMAGES_HOURS=24  # 清理多少小時前的暫存圖片
CLEANUP_INTERVAL_HOURS=6      # 每隔多少小時執行一次清理

# OpenAI（管理後台用）
OPENAI_API_KEY=
```

## 常用指令

| 指令 | 說明 |
|------|------|
| `npm run dev` | 開發模式（tsx watch，自動重啟） |
| `npm run build` | TypeScript 編譯至 `dist/` |
| `npm run start` | 啟動 production（需先 build） |
| `npm run migrate` | 執行資料庫 migration |
| `npm run test` | 執行 Jest 測試 |
| `npm run lint` | ESLint 靜態分析 |
| `npm run lint:fix` | ESLint 自動修正 |

## API 路由總覽

所有路由前綴為 `/api/v1/`。

### 認證 `/auth`

| 方法 | 路徑 | 說明 |
|------|------|------|
| POST | `/register` | 註冊（回傳 JWT + 發驗證信） |
| POST | `/login` | 登入（回傳 JWT） |
| POST | `/verify-email` | 驗證 Email（6 位數驗證碼） |
| POST | `/resend-verification` | 重新發送驗證碼（10 分鐘冷卻） |
| POST | `/request-password-reset` | 申請密碼重置 |
| POST | `/reset-password` | 重置密碼 |
| GET | `/google` | 跳轉至 Google OAuth |
| GET | `/google/callback` | Google OAuth callback |

### 演唱會 `/concerts`

| 方法 | 路徑 | 認證 | 說明 |
|------|------|------|------|
| POST | `/` | 需要 | 建立演唱會（支援草稿） |
| PUT | `/:concertId` | 需要 | 更新演唱會（限草稿狀態） |
| GET | `/search` | — | 搜尋演唱會（篩選、分頁、排序） |
| GET | `/popular` | — | 熱門演唱會 |
| GET | `/banners` | — | 首頁 Banner（前 5 筆） |
| GET | `/venues` | — | 所有場地資料 |
| PATCH | `/:concertId/visit` | — | 增加瀏覽次數 |
| PATCH | `/:concertId/promotion` | Admin | 設定 promotion 權重 |

### 用戶 `/users`

| 方法 | 路徑 | 說明 |
|------|------|------|
| GET | `/profile` | 取得個人資料 |
| PUT | `/profile` | 更新個人資料 |
| GET | `/profile/regions` | 地區選項清單 |
| GET | `/profile/event-types` | 活動類型選項清單 |

### 組織 `/organizations`

| 方法 | 路徑 | 說明 |
|------|------|------|
| GET | `/` | 取得當前用戶的組織列表 |
| POST | `/` | 建立組織 |
| GET | `/:organizationId` | 取得單一組織 |
| PUT | `/:organizationId` | 更新組織 |
| DELETE | `/:organizationId` | 刪除組織 |
| GET | `/:organizationId/concerts` | 組織的演唱會列表 |

### 統一回應格式

```json
// 成功
{ "status": "success", "message": "說明", "data": {} }

// 失敗
{ "status": "failed", "message": "錯誤說明", "code": "A06" }
```

## 專案結構

```
tickeasy-team-backend/
├── bin/server.ts          # HTTP server 啟動入口
├── app.ts                 # Express app 設定與路由掛載
├── config/database.ts     # TypeORM DataSource 設定
├── controllers/           # 路由 handler（業務邏輯）
├── middlewares/auth.ts    # isAuthenticated / optionalAuth / adminAuth
├── models/                # TypeORM entity（對應 DB 資料表）
├── routes/                # Express router 定義
├── services/storage.ts    # Supabase Storage 上傳邏輯
├── types/                 # TypeScript 型別定義
│   ├── api.ts             # ApiResponse、ErrorCode enum
│   ├── auth/
│   ├── concert/
│   ├── organization/
│   └── user/
├── utils/
│   ├── apiError.ts        # ApiError 工廠類別
│   ├── handleErrorAsync.ts
│   └── email.ts           # sendVerificationEmail / sendPasswordResetEmail
├── migrations/            # TypeORM migration 檔案
├── docs/                  # 開發文件
└── .env.example           # 環境變數範本
```

## 使用 Docker 開發

```bash
# 建立並啟動容器（首次或修改 Dockerfile 後需 --build）
docker-compose up --build
```

應用程式將在 `http://localhost:3000` 上運行，程式碼變更時自動重啟。

## 部署

專案已設定 `render.yaml`，可直接部署至 [Render.com](https://render.com)：

- **Region**：Singapore
- **Build**：`npm ci && npm run build`
- **Migration**：`npm run migrate`（pre-deploy）
- **Start**：`node dist/bin/server.js`
- **Health Check**：`GET /api/v1/health`

## 文件索引

| 文件 | 說明 |
|------|------|
| [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) | 系統架構、目錄結構、API 路由總覽、DB Schema |
| [docs/DEVELOPMENT.md](./docs/DEVELOPMENT.md) | 開發規範、命名規則、環境變數、新增 API 步驟 |
| [docs/FEATURES.md](./docs/FEATURES.md) | 功能列表與行為描述 |
| [docs/TESTING.md](./docs/TESTING.md) | 測試規範與指南 |
| [docs/CHANGELOG.md](./docs/CHANGELOG.md) | 版本更新日誌 |
| [docs/PROJECT_STRUCTURE.md](./docs/PROJECT_STRUCTURE.md) | 專案目錄結構詳細說明 |
| [docs/plans/](./docs/plans/) | 開發計畫（進行中） |
