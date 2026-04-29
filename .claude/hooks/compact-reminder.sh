#!/bin/bash
# Context 壓縮後（SessionStart）重新注入專案關鍵規則

cat << 'EOF'
# Tickeasy Backend 關鍵規則提醒（context 壓縮後自動注入）

- **回應格式**：`{ status: 'success' | 'failed', message, data? }`
- **錯誤處理**：一律透過 `ApiError` 工廠方法拋出，不直接 `res.json({ error })`
- **錯誤碼格式**：A=Auth / V=Validation / D=Data / S=System + 兩位序號（A06, D01）
- **Controller 包裝**：所有 async controller 使用 `handleErrorAsync` 包裝
- **演唱會修改**：只能修改 `conInfoStatus === 'draft'` 的演唱會
- **Schema 變更**：禁止 `synchronize: true`，必須使用 migration
- **ESM 引入**：相對路徑必須加 `.js` 副檔名（`import { foo } from './bar.js'`）
- **JWT Secret**：從 `JWT_SECRET` 環境變數讀取，不可硬編碼
- **密碼欄位**：回傳用戶資料時排除 `password`、token 相關欄位
- **Gender 欄位**：DB 儲存英文 enum，API 回傳/接收中文（男/女/其他）

詳細文件：docs/ARCHITECTURE.md、docs/FEATURES.md、docs/DEVELOPMENT.md
EOF
