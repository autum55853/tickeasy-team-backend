# Tickeasy Team Backend

演唱會票務系統後端 API 服務。

## 技術棧

| 類別 | 技術 |
|------|------|
| 語言 | TypeScript (ESM modules, `"type": "module"`) |
| 框架 | Express 4.x |
| ORM | TypeORM 0.3.x |
| 資料庫 | PostgreSQL (Supabase 雲端) |
| 認證 | JWT + Passport.js (Google OAuth 2.0) |
| 圖片儲存 | Multer + Sharp + Supabase Storage / AWS S3 |
| 郵件 | Nodemailer (Gmail SMTP) |
| 金流 | 綠界 ECPay |
| 測試 | Jest + Supertest |
| Lint | ESLint + TypeScript-ESLint |
| 安全 | Helmet, bcrypt (rounds=12), CORS |

## 快速開始

```bash
# 1. 安裝依賴
npm install

# 2. 複製環境變數設定
cp .env.example .env
# 填入各服務的 key（詳見 docs/DEVELOPMENT.md 環境變數表）

# 3. 執行資料庫 migration
npm run migrate

# 4. 啟動開發伺服器
npm run dev
```

伺服器預設啟動於 `http://localhost:3000`，API 根路徑為 `/api/v1/`。

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

## 文件索引

| 文件 | 說明 |
|------|------|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | 系統架構、目錄結構、API 路由總覽、DB Schema |
| [DEVELOPMENT.md](./DEVELOPMENT.md) | 開發規範、命名規則、環境變數、新增 API 步驟 |
| [FEATURES.md](./FEATURES.md) | 功能列表與行為描述 |
| [TESTING.md](./TESTING.md) | 測試規範與指南 |
| [CHANGELOG.md](./CHANGELOG.md) | 版本更新日誌 |
| [plans/](./plans/) | 開發計畫（進行中） |
| [plans/archive/](./plans/archive/) | 已完成計畫歸檔 |
