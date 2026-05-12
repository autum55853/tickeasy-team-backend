# ARCHITECTURE.md

## 目錄結構

```
tickeasy-team-backend/
├── bin/
│   └── server.ts          # HTTP server 啟動入口（listen port）
├── app.ts                 # Express app 設定、middleware 掛載、路由掛載、error handler
├── config/
│   └── database.ts        # TypeORM DataSource 設定（PostgreSQL 連線）
├── controllers/           # 路由 handler（業務邏輯）
│   ├── auth.ts
│   ├── concert.ts
│   ├── organization.ts
│   ├── upload.ts
│   └── user.ts
├── middlewares/
│   └── auth.ts            # isAuthenticated / optionalAuth / isAdmin / adminAuth
├── models/                # TypeORM entity 定義（對應 DB 表）
│   ├── user.ts
│   ├── organization.ts
│   ├── concert.ts
│   ├── concert-session.ts
│   ├── ticket-type.ts
│   ├── ticket.ts
│   ├── order.ts
│   ├── payment.ts
│   ├── venue.ts
│   └── location-tag.ts
├── routes/                # Express router 定義（路由與 middleware 組合）
│   ├── auth.ts
│   ├── concert.ts
│   ├── organization.ts
│   └── user.ts
├── services/
│   └── storage.ts         # S3 / Supabase Storage 上傳邏輯
├── types/                 # TypeScript 型別定義
│   ├── api.ts             # ApiResponse、ErrorCode enum
│   ├── auth/              # JWT payload、Auth request/response 型別
│   ├── concert/           # Concert request/response 型別
│   ├── organization/      # Organization request/response 型別
│   └── user/              # User request/response 型別
├── utils/
│   ├── index.ts           # generateToken / verifyToken / generateEmailToken
│   ├── apiError.ts        # ApiError 工廠類別
│   ├── handleErrorAsync.ts # async controller 錯誤包裝
│   └── email.ts           # sendVerificationEmail / sendPasswordResetEmail
├── migrations/            # TypeORM migration 檔案
├── docs/                  # 開發文件
└── .env.example           # 環境變數範本
```

## 啟動流程

```
bin/server.ts
  ├── import app from app.ts
  │     ├── helmet() / cors() / express.json() / cookieParser() / morgan()
  │     ├── /api/v1/auth          → routes/auth.ts
  │     ├── /api/v1/users         → routes/user.ts
  │     ├── /api/v1/organizations → routes/organization.ts
  │     ├── /api/v1/upload        → routes/upload.ts
  │     ├── /api/v1/concerts      → routes/concert.ts
  │     ├── /api/v1/ticket        → routes/ticket.ts
  │     ├── /api/v1/orders        → routes/orders.ts
  │     ├── /api/v1/payments      → routes/payment.ts
  │     ├── /api/v1/sessions      → routes/session.ts
  │     ├── /api/v1/knowledge-base → routes/knowledge-base.ts
  │     ├── /api/v1/smart-reply   → routes/smart-reply.ts
  │     ├── /api/v1/health        → routes/health.ts
  │     ├── global error handler
  │     └── 404 handler
  └── AppDataSource.initialize()   ← 非同步，必須完成後才繼續
        ├── scheduleConcertFinishJobs()
        ├── scheduleOrderExpiredJobs()
        └── server.listen(PORT)    ← 資料庫就緒後才開始接受請求
```

> **重要**：`app.ts` 不做任何資料庫初始化，僅負責 Express 設定。所有需要 TypeORM DataSource 的操作（包括 `AppDataSource.getRepository()`）必須在 `AppDataSource.initialize()` 完成後才能執行。若在 DB 初始化完成前有請求進入，TypeORM 會拋出 `"No metadata for 'Entity' was found"` 錯誤。

## API 路由總覽

### 認證 `/api/v1/auth`

| 方法 | 路徑 | 認證 | 說明 |
|------|------|------|------|
| POST | `/register` | — | 註冊（回傳 JWT + 發驗證信） |
| POST | `/login` | — | 登入（回傳 JWT） |
| POST | `/verify-email` | — | 驗證 Email（6 位數驗證碼） |
| POST | `/resend-verification` | — | 重新發送驗證碼（10 分鐘冷卻） |
| POST | `/request-password-reset` | — | 申請密碼重置（發重置碼） |
| POST | `/reset-password` | — | 重置密碼（需重置碼） |
| GET | `/google` | — | 跳轉至 Google OAuth |
| GET | `/google/callback` | — | Google OAuth callback（重定向至前端） |

### 演唱會 `/api/v1/concerts`

| 方法 | 路徑 | 認證 | 說明 |
|------|------|------|------|
| POST | `/` | isAuthenticated | 建立演唱會（支援草稿） |
| PUT | `/:concertId` | isAuthenticated | 更新演唱會（限草稿狀態） |
| PATCH | `/:concertId/visit` | — | 增加 visitCount |
| PATCH | `/:concertId/promotion` | adminAuth | 設定 promotion 權重 |
| GET | `/popular` | — | 取得熱門演唱會（依 promotion → visitCount 排序） |
| GET | `/venues` | — | 取得所有場地資料 |
| GET | `/search` | — | 搜尋演唱會（支援篩選、分頁、排序） |
| GET | `/banners` | — | 取得首頁 Banner 演唱會（前 5 筆） |

### 用戶 `/api/v1/users`

| 方法 | 路徑 | 認證 | 說明 |
|------|------|------|------|
| GET | `/profile` | isAuthenticated | 取得個人資料 |
| PUT | `/profile` | isAuthenticated | 更新個人資料 |
| GET | `/profile/regions` | — | 取得地區選項清單 |
| GET | `/profile/event-types` | — | 取得活動類型選項清單 |
| GET | `/orders` | isAuthenticated | 取得用戶訂單清單（含票券資訊） |
| GET | `/ticket/:ticketId` | isAuthenticated | 取得單一票券詳情 |

### 票券 `/api/v1/ticket`

| 方法 | 路徑 | 認證 | 說明 |
|------|------|------|------|
| GET | `/:concertSessionId` | — | 取得場次票種列表（場次不存在 → 404） |
| POST | `/verify` | isAuthenticated | QR Code 驗票核銷（限主辦方或 admin） |

### 訂單 `/api/v1/orders`

| 方法 | 路徑 | 認證 | 說明 |
|------|------|------|------|
| POST | `/` | isAuthenticated | 建立訂單（含庫存鎖定，15 分鐘有效） |
| GET | `/:orderId` | isAuthenticated | 查詢訂單資訊（限本人） |
| POST | `/:orderId/refund` | isAuthenticated | 申請退款（呼叫 ECPay DoAction:R） |

### 組織 `/api/v1/organizations`

| 方法 | 路徑 | 認證 | 說明 |
|------|------|------|------|
| GET | `/` | isAuthenticated | 取得當前用戶的組織列表 |
| POST | `/` | isAuthenticated | 建立組織 |
| GET | `/:organizationId` | isAuthenticated | 取得單一組織（限擁有者） |
| PUT | `/:organizationId` | isAuthenticated | 更新組織（限擁有者） |
| DELETE | `/:organizationId` | isAuthenticated | 刪除組織（限擁有者） |
| GET | `/:organizationId/concerts` | isAuthenticated | 取得組織的演唱會列表（分頁、篩選、排序） |

## 統一回應格式

成功：
```json
{
  "status": "success",
  "message": "說明文字",
  "data": { ... }
}
```

失敗（由全域 error handler 統一產生）：
```json
{
  "status": "failed",
  "message": "錯誤說明",
  "code": "A06",
  "details": { ... }
}
```

## 認證與授權機制

**JWT 認證流程：**
1. `Authorization: Bearer <token>` header
2. `isAuthenticated` middleware：verify JWT → DB 查 user → 注入 `req.user = { userId, role, email, name, isEmailVerified }`
3. `optionalAuth`：同上但 token 不存在或無效時不阻止請求
4. `isAdmin`：檢查 `req.user.role === 'admin'`
5. `adminAuth`：`isAuthenticated` + 檢查 role 為 `admin` 或 `superuser`

**JWT 參數：**
- Secret：`JWT_SECRET` 環境變數
- 有效期：`JWT_EXPIRES_DAY`（預設 `7d`）
- Payload：`{ userId: string, role: string }`

**Google OAuth 流程：**
1. 前端透過 `?state=<base64-JSON>` 傳遞重定向目標 URL
2. Passport GoogleStrategy 驗證後調用 `googleLogin` controller
3. GET 請求（Google redirect）：產生 JWT，以 `?token=<jwt>` 重定向至前端
4. POST 請求（前端直接呼叫）：回傳 JSON `{ token, user }`

## 資料庫 Schema

### users

| 欄位 | 型別 | 說明 |
|------|------|------|
| userId | UUID PK | 主鍵（自動生成） |
| email | varchar unique | 登入 Email |
| password | varchar | bcrypt hash（rounds=12） |
| name | varchar | 真實姓名 |
| nickname | varchar | 暱稱 |
| role | enum | user / admin / superuser |
| phone | varchar | 手機號碼 |
| birthday | date | 生日 |
| gender | enum | male / female / other（API 回傳中文：男/女/其他） |
| preferredRegions | varchar[] | 偏好地區（Region enum 陣列） |
| preferredEventTypes | varchar[] | 偏好活動類型（EventType enum 陣列） |
| country | varchar | 國家 |
| address | varchar | 地址 |
| avatar | varchar | 大頭照 URL |
| isEmailVerified | boolean | Email 是否已驗證 |
| verificationToken | varchar | Email 驗證碼（6位數字） |
| verificationTokenExpires | timestamp | 驗證碼過期時間 |
| lastVerificationAttempt | timestamp | 最後一次發送驗證碼時間 |
| passwordResetToken | varchar | 密碼重置碼 |
| passwordResetExpires | timestamp | 重置碼過期時間 |
| lastPasswordResetAttempt | timestamp | 最後一次申請重置時間 |
| oauthProviders | jsonb | 已連結的 OAuth 提供商列表 |
| searchHistory | jsonb | 搜尋歷史紀錄 |
| createdAt / updatedAt | timestamp | 自動時間戳 |

### organization

| 欄位 | 型別 | 說明 |
|------|------|------|
| organizationId | UUID PK | 主鍵 |
| userId | UUID FK→users | 擁有者 |
| orgName | varchar unique | 組織名稱（最長 100 字） |
| orgAddress | varchar | 地址（最長 100 字） |
| orgMail | varchar | 聯絡信箱 |
| orgContact | varchar | 聯絡方式（最長 1000 字） |
| orgMobile | varchar | 手機（最長 200 字） |
| orgPhone | varchar | 電話（最長 200 字） |
| orgWebsite | varchar | 官網 URL（最長 200 字） |

### concert

| 欄位 | 型別 | 說明 |
|------|------|------|
| concertId | UUID PK | 主鍵 |
| organizationId | UUID FK | 主辦組織 |
| venueId | UUID FK | 場地 |
| locationTagId | UUID FK | 地區標籤 |
| musicTagId | UUID FK | 音樂類型標籤 |
| conTitle | varchar | 演唱會名稱（唯一） |
| conIntroduction | text | 介紹 |
| conLocation | varchar | 地點名稱 |
| conAddress | varchar | 地址 |
| eventStartDate | timestamp | 活動開始時間 |
| eventEndDate | timestamp | 活動結束時間 |
| imgBanner | varchar | 主視覺 URL |
| imgSeattable | varchar | 座位圖 URL |
| ticketPurchaseMethod | varchar | 購票方式說明 |
| precautions | text | 注意事項 |
| refundPolicy | text | 退票政策 |
| conInfoStatus | enum | draft / published / finished |
| reviewStatus | enum | pending / approved / rejected / skipped |
| visitCount | int | 瀏覽次數（預設 0） |
| promotion | int | 推薦權重（預設 0，越小越優先） |
| cancelledAt | timestamp | 取消時間（null 表示未取消） |

### ticketType

| 欄位 | 型別 | 說明 |
|------|------|------|
| ticketTypeId | UUID PK | 主鍵 |
| concertId | UUID FK | 所屬演唱會 |
| ticketTypeName | varchar | 票種名稱 |
| entranceType | varchar | 入場方式 |
| ticketBenefits | text | 票種權益說明 |
| ticketRefundPolicy | text | 退票政策 |
| ticketTypePrice | decimal | 票價（非負） |
| totalQuantity | int | 總數量（正整數） |
| remainingQuantity | int | 剩餘數量（初始等於 totalQuantity） |
| sellBeginDate | timestamp | 開賣時間 |
| sellEndDate | timestamp | 停售時間 |

### venues

| 欄位 | 型別 | 說明 |
|------|------|------|
| venueId | UUID PK | 主鍵 |
| venueName | varchar | 場地名稱 |
| venueDescription | text | 場地描述 |
| venueAddress | varchar | 地址 |
| venueCapacity | int | 容納人數 |
| venueImageUrl | varchar | 場地圖片 |
| googleMapUrl | varchar | Google Maps 連結 |
| isAccessible | boolean | 無障礙設施 |
| hasParking | boolean | 停車場 |
| hasTransit | boolean | 大眾交通 |

### order

| 欄位 | 型別 | 說明 |
|------|------|------|
| orderId | UUID PK | 主鍵 |
| ticketTypeId | UUID FK | 票種 |
| userId | UUID FK | 購票者 |
| orderStatus | enum | held / expired / paid / cancelled / refunded |
| isLocked | boolean | 是否鎖定中 |
| lockToken | varchar | 鎖定 token |
| lockExpireTime | timestamp | 鎖定過期時間 |
| purchaserName/Email | varchar | 購票人資訊 |
| 發票相關欄位 | varchar | 電子發票資訊 |

### ticket

| 欄位 | 型別 | 說明 |
|------|------|------|
| ticketId | UUID PK | 主鍵 |
| orderId / ticketTypeId / userId | UUID FK | 關聯 |
| purchaserName / purchaserEmail | varchar | 購票人 |
| concertStartTime | timestamp | 演唱會開始時間 |
| seatNumber | varchar | 座位號碼 |
| qrCode | varchar unique | QR Code 字串 |
| status | enum | purchased / refunded / used |
| purchaseTime | timestamp | 購票時間 |

### payment

| 欄位 | 型別 | 說明 |
|------|------|------|
| paymentId | UUID PK | 主鍵 |
| orderId | UUID FK | 訂單 |
| method / provider | varchar | 付款方式、金流商 |
| status | enum | pending / completed / failed / refunded |
| amount | decimal | 金額 |
| currency | varchar | 幣別（預設 TWD） |
| paidAt | timestamp | 付款時間 |
| transactionId | varchar unique | 金流商交易 ID |
| rawPayload | jsonb | 金流商原始回傳資料 |

### locationTag / concertSession

- `locationTag`：UUID PK + `locationTagName` varchar
- `concertSession`：UUID PK + FK concertId + `sessionDate` (date) + `sessionStart/End` (time) + `sessionTitle` varchar

## 金流整合（ECPay）

環境變數：`MERCHANTID`、`HASHKEY`、`HASHIV`、`HOST`（ECPay 主機）、`REDIRECTURL`（付款後重定向）

## AI 服務架構

### 技術選型

| 功能 | 服務 | 模型 |
|------|------|------|
| 聊天 / 內容審核 | `services/geminiService.ts` | `gemini-2.0-flash` |
| 語意搜尋向量 | `services/embedding-service.ts` | `text-embedding-004`（768 維） |
| 意圖分類 | `services/intent-classification-service.ts` | 傳統關鍵字匹配（AI 開關可啟用 Gemini） |

> **注意**：OpenAI 原始實作保留於 `services/openaiService.ts`（加 `[OpenAI]` 標記），供回滾參考。

### Gemini 服務（`geminiService.ts`）

- 介面與舊 `openaiService` 相同（`AIReviewResponse`、`getChatCompletion`、`reviewConcert`、`testConnection`）
- 缺少 `GEMINI_API_KEY` 時降級警告（不拋出例外），`isInitialized = false`
- `getChatCompletion`：`system` role 轉為 `systemInstruction`，`assistant` 轉為 `model`
- `reviewConcert`：使用 `responseMimeType: 'application/json'` 取得結構化輸出

### 智慧客服對話（`chat-service.ts`）

- 初次對話（`chat()`）：以語意搜尋建立 context，呼叫 `model.generateContent(prompt)`
- 後續對話（`continueChat()`）：從 DB 載入最近 10 則 `SupportMessage` 重建 `Content[]` history，使用 `model.startChat({ history }).sendMessage()`
- 不再依賴 OpenAI Responses API 的 `responseId`；`responseId` 欄位保留但存 `undefined`

### Embedding 服務（`embedding-service.ts`）

- 向量維度：768（舊 OpenAI 為 1536）；以 JSONB 儲存，切換供應商不需 DB migration
- 切換供應商後需呼叫 `POST /api/v1/knowledge-base/embeddings/update`（需 Admin token）重生所有知識庫向量

## 圖片儲存架構

1. Multer 接收上傳的圖片（記憶體緩衝）
2. Sharp 進行圖片壓縮/轉換
3. 先儲存至暫存區
4. 正式確認後移至 S3（`AWS_S3_BUCKET`）或 Supabase Storage（`DB_URL` + `DB_ANON_KEY`）
5. 定時清理暫存（`CLEANUP_TEMP_IMAGES_HOURS` 小時前的暫存、每 `CLEANUP_INTERVAL_HOURS` 小時執行一次）
