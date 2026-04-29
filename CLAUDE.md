# CLAUDE.md

## 專案概述

Tickeasy Team Backend — TypeScript + Express 4.x REST API，PostgreSQL (Supabase)，TypeORM，JWT + Google OAuth 認證，ECPay 金流，AWS S3 / Supabase Storage 圖片儲存。

## 常用指令

```bash
npm run dev        # 開發模式 (tsx watch)
npm run build      # TypeScript 編譯
npm run start      # 啟動 production (需先 build)
npm run migrate    # 執行資料庫 migration
npm run test       # 執行 Jest 測試
npm run lint       # ESLint 檢查
npm run lint:fix   # ESLint 自動修正
```

## 關鍵規則

- API 回應格式統一為 `{ status: 'success' | 'failed', message: string, data?: T }`
- 錯誤碼格式：A=Auth / V=Validation / D=Data / S=System + 兩位序號（例：A06, D01）
- 所有 controller 函式使用 `handleErrorAsync` 包裝，或自行 try/catch + next(err)
- 只能修改草稿狀態（`conInfoStatus === 'draft'`）的演唱會
- TypeORM `synchronize: false` — 禁止讓 ORM 自動更改 schema，務必使用 migration
- 功能開發使用 `docs/plans/` 記錄計畫；完成後移至 `docs/plans/archive/`

## 詳細文件

- [docs/README.md](./docs/README.md) — 項目介紹與快速開始
- [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) — 架構、目錄結構、資料流、DB schema
- [docs/DEVELOPMENT.md](./docs/DEVELOPMENT.md) — 開發規範、命名規則、環境變數
- [docs/FEATURES.md](./docs/FEATURES.md) — 功能列表與行為描述
- [docs/TESTING.md](./docs/TESTING.md) — 測試規範與指南
- [docs/CHANGELOG.md](./docs/CHANGELOG.md) — 更新日誌

## 必要遵守項目

- 禁止在 controller 直接回傳錯誤，一律透過 `ApiError` 工廠方法拋出再由全域 error handler 處理
- JWT Secret 必須設定 `JWT_SECRET` 環境變數，否則啟動即報錯
- 新增 entity 後需在 `config/database.ts` 確認已被 entities glob 掃描到（`models/*.{ts,js}`）
- Google OAuth callback 的 state 參數使用 base64 encoded JSON，前端須對應解碼
- 圖片上傳先存暫存，定時清理任務依 `CLEANUP_TEMP_IMAGES_HOURS` / `CLEANUP_INTERVAL_HOURS` 執行
