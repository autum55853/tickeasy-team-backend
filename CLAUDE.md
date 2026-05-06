# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 專案概述

Tickeasy Team Backend — TypeScript + Express 4.x REST API，PostgreSQL (Supabase)，TypeORM，JWT + Google OAuth 認證，ECPay 金流，Supabase Storage / S3 圖片儲存，OpenAI 智慧回覆。

## 常用指令

```bash
npm run dev        # 開發模式 (tsx watch)
npm run build      # TypeScript 編譯（含複製 views/）
npm run start      # 啟動 production（需先 build）
npm run migrate    # 執行資料庫 migration

# Migration 生成（有 entity 異動時執行）
npm run typeorm migration:generate -- -d config/database.ts -n <MigrationName>

npm run test                          # 執行所有 Jest 測試
npm run test -- tests/auth.test.ts   # 執行單一測試檔案
npm run test -- --watch              # 監看模式
npm run test -- --coverage           # 含覆蓋率報告

npm run lint       # ESLint 檢查
npm run lint:fix   # ESLint 自動修正
```

## 關鍵規則

- API 回應格式統一為 `{ status: 'success' | 'failed', message: string, data?: T }`
- 錯誤碼格式：`A`=Auth / `V`=Validation / `D`=Data / `S`=System + 兩位序號（例：A06, D01）
- 所有 controller 函式使用 `handleErrorAsync` 包裝，或自行 try/catch + next(err)
- 禁止在 controller 直接回傳錯誤，一律透過 `ApiError` 工廠方法拋出再由全域 error handler 處理
- 只能修改草稿狀態（`conInfoStatus === 'draft'`）的演唱會
- TypeORM `synchronize: false` — 禁止讓 ORM 自動更改 schema，務必使用 migration
- 功能開發使用 `docs/plans/` 記錄計畫；完成後移至 `docs/plans/archive/`

## 架構摘要

### 啟動流程

```
bin/server.ts → app.ts
  ├── helmet / cors / express.json / cookieParser / morgan
  ├── connectToDatabase()（TypeORM）
  ├── /api/v1/auth          → routes/auth.ts
  ├── /api/v1/users         → routes/user.ts
  ├── /api/v1/organizations → routes/organization.ts
  ├── /api/v1/upload        → routes/upload.ts
  ├── /api/v1/concerts      → routes/concert.ts
  ├── /api/v1/ticket        → routes/ticket.ts
  ├── /api/v1/orders        → routes/orders.ts
  ├── /api/v1/payments      → routes/payment.ts
  ├── /api/v1/sessions      → routes/session.ts
  ├── /api/v1/knowledge-base → routes/knowledge-base.ts
  ├── /api/v1/smart-reply   → routes/smart-reply.ts
  ├── /api/v1/health        → routes/health.ts
  ├── 全域 error handler
  └── 404 handler
```

排程任務在 `scheduler/` 目錄，由 `node-schedule` 驅動：
- `concertScheduler.ts` — 演唱會狀態定時更新
- `orderScheduler.ts` — 訂單鎖定過期處理

### ESM 模組規則

專案使用 `"type": "module"`（ESM）。相對引入路徑必須加 `.js` 副檔名：

```typescript
import { foo } from './bar.js';   // ✅ 正確
import { foo } from './bar';      // ❌ 錯誤
```

### 認證流程

- JWT：`Authorization: Bearer <token>`，`isAuthenticated` middleware 驗證後注入 `req.user = { userId, role, email, name, isEmailVerified }`
- `adminAuth`：`isAuthenticated` + role 為 `admin` 或 `superuser`
- Google OAuth：前端透過 `?state=<base64-JSON>` 傳遞重定向 URL，callback 以 `?token=<jwt>` 重定向回前端

### 新增 API 端點步驟

1. 在 `types/<module>/` 定義 request / response interface
2. 在 `controllers/<module>.ts` 新增 `handleErrorAsync` 包裝的 async function
3. 在 `routes/<module>.ts` 新增路由（掛載 `isAuthenticated` / `adminAuth`）
4. 若是新模組，在 `app.ts` 以 `app.use('/api/v1/<path>', router)` 掛載
5. 更新 `docs/FEATURES.md` 與 `docs/ARCHITECTURE.md`

### 新增 Entity 步驟

1. 在 `models/` 建立 `<entity-name>.ts`，UUID PK 使用 `@PrimaryGeneratedColumn('uuid')`
2. 確認 `config/database.ts` 的 entities glob（`models/*.{ts,js}`）能掃描到
3. 執行 `npm run typeorm migration:generate -- -d config/database.ts -n <Name>`
4. 執行 `npm run migrate`

### Gender 欄位

DB 儲存英文 enum（`male` / `female` / `other`），API 收發中文（`男` / `女` / `其他`）。Controller 中有對應的 `toChineseGender` / `toEnglishGender` 轉換函式。

### 圖片上傳流程

Multer（記憶體緩衝）→ Sharp 壓縮 → 暫存區 → 正式確認後移至 S3 或 Supabase Storage。暫存清理依 `CLEANUP_TEMP_IMAGES_HOURS` / `CLEANUP_INTERVAL_HOURS` 環境變數排程。

## 必要遵守項目

- 新增 entity 後需確認 `config/database.ts` 的 entities glob 能掃描到（`models/*.{ts,js}`）
- `JWT_SECRET` 環境變數未設定時啟動即報錯
- Google OAuth callback 的 `state` 參數使用 base64 encoded JSON，前端須對應解碼
- 新增環境變數時同步更新 `.env.example`

## 詳細文件

- [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) — 路由總覽、DB schema、認證流程
- [docs/DEVELOPMENT.md](./docs/DEVELOPMENT.md) — 命名規則、錯誤處理範例、環境變數清單
- [docs/FEATURES.md](./docs/FEATURES.md) — 功能列表與行為描述
- [docs/TESTING.md](./docs/TESTING.md) — 測試規範與常見陷阱