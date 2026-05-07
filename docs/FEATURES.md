# FEATURES.md

## 功能狀態總覽

| 模組 | 功能 | 狀態 |
|------|------|------|
| 認證 | Email 註冊 / 登入 | ✅ 完成 |
| 認證 | Email 驗證（6位數驗證碼） | ✅ 完成 |
| 認證 | 密碼重置流程 | ✅ 完成 |
| 認證 | Google OAuth 2.0 | ✅ 完成 |
| 用戶 | 個人資料查詢 / 更新 | ✅ 完成 |
| 用戶 | 地區 / 活動類型選項 | ✅ 完成 |
| 組織 | 組織 CRUD | ✅ 完成 |
| 組織 | 取得組織演唱會列表 | ✅ 完成 |
| 演唱會 | 建立 / 更新演唱會 | ✅ 完成 |
| 演唱會 | 草稿模式 | ✅ 完成 |
| 演唱會 | 票種管理（多票種） | ✅ 完成 |
| 演唱會 | 搜尋、篩選、分頁 | ✅ 完成 |
| 演唱會 | 熱門 / Banner 演唱會 | ✅ 完成 |
| 演唱會 | visitCount 計數 | ✅ 完成 |
| 演唱會 | promotion 權重管理（Admin） | ✅ 完成 |
| 演唱會 | 場地資料查詢 | ✅ 完成 |
| 圖片 | 圖片上傳（S3 / Supabase） | ✅ 完成 |
| 圖片 | 暫存圖片定時清理 | ✅ 完成 |
| 票券 | 查詢場次票種 | ✅ 完成 |
| 票券 | QR Code 驗票核銷 | ✅ 完成 |
| 訂單 | 建立訂單（含庫存鎖定） | ✅ 完成 |
| 訂單 | 查詢訂單資訊 | ✅ 完成 |
| 訂單 | 退款申請（ECPay） | ✅ 完成 |
| 訂單 | 取得用戶訂單清單 | ✅ 完成 |
| 訂單 | 取得票券詳情 | ✅ 完成 |
| 金流 | ECPay 綠界支付 | 🔧 進行中 |

---

## 1. 認證模組

### 1.1 Email 註冊

**必填欄位**：`email`、`password`、`name`
**選填欄位**：`nickname`、`phone`、`birthday`

**業務邏輯**：
1. 欄位驗證：email 長度 5~100、密碼格式 `/^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d]{8,}$/`、姓名長度 2~50、暱稱長度 1~20
2. 檢查 email 是否已存在（409 A04）
3. 建立用戶，`@BeforeInsert` 自動 bcrypt hash 密碼（rounds=12）
4. 發送 6 位數 Email 驗證碼（有效期 10 分鐘）
5. 回傳 JWT token + 用戶基本資料

**回應**：HTTP 201

### 1.2 Email 登入

**必填欄位**：`email`、`password`

**業務邏輯**：
1. 查找用戶，比較 bcrypt hash
2. 不論 email 不存在或密碼錯誤，統一回傳 401 A05（防止枚舉攻擊）
3. 回傳 JWT token + 用戶基本資料（排除 password 欄位）

### 1.3 Email 驗證

**必填欄位**：`email`、`code`（6 位數字）

**業務邏輯**：
1. 查找 email + verificationToken 不為 null + 未過期的用戶
2. 比對驗證碼（不符合 → 400 A09）
3. 設定 `isEmailVerified = true`，清除驗證碼欄位

### 1.4 重新發送驗證碼

**必填欄位**：`email`

**業務邏輯**：
- 同一 email 10 分鐘內只能發送一次（cooldown 機制，`lastVerificationAttempt`）
- 超出限制回傳 429 S03，含剩餘等待秒數

### 1.5 密碼重置

**流程**：
1. `POST /request-password-reset`（email）→ 發送 6 位數重置碼（10 分鐘有效），10 分鐘 cooldown
2. `POST /reset-password`（email + code + newPassword）→ 驗證碼比對 → 更新密碼

### 1.6 Google OAuth

**雙模式認證**：
- **GET 模式**（Google 重定向）：產生 JWT，透過 `?token=<jwt>` 重定向至前端
- **POST 模式**（前端直接呼叫）：回傳 JSON `{ token, user }`

**State 參數**：前端以 base64 encoded JSON 傳遞重定向目標 URL（`state.state` 欄位）

---

## 2. 用戶模組

### 2.1 個人資料查詢 `GET /api/v1/users/profile`

回傳欄位：`userId, email, name, nickname, role, phone, birthday, gender(中文), preferredRegions, preferredEventTypes, country, address, avatar, isEmailVerified, oauthProviders, searchHistory`

### 2.2 個人資料更新 `PUT /api/v1/users/profile`

所有欄位皆為**選填**（partial update）。

特殊欄位處理：
- `birthday`：null 可清空；空字串視為錯誤；需為有效日期字串
- `gender`：接受中文（`男/女/其他`）或英文 enum（`male/female/other`）；null 可清空
- `preferredRegions`：Region enum 陣列，值須在合法列表內
- `preferredEventTypes`：EventType enum 陣列，值須在合法列表內

### 2.3 選項端點

- `GET /api/v1/users/profile/regions`：回傳 `[{ label: 中文, value: 中文, subLabel: 英文 }]`
- `GET /api/v1/users/profile/event-types`：同格式

---

## 3. 組織模組

### 3.1 建立組織 `POST /api/v1/organizations`

**必填**：`orgName`（≤100字）、`orgAddress`（≤100字）
**選填**：`orgMail`（≤100）、`orgContact`（≤1000）、`orgMobile`（≤200）、`orgPhone`（≤200）、`orgWebsite`（≤200）

- 組織名稱全系統唯一（409 D02）
- 創建者的 `userId` 自動綁定（不可透過 API 指定）

### 3.2 查詢 / 更新 / 刪除組織

- 所有操作都驗證**必須是組織擁有者**（403 A07）
- `GET /api/v1/organizations`：只回傳當前登入用戶的組織，依 `createdAt DESC` 排序
- `PUT /api/v1/organizations/:organizationId`：partial update，若改名需確認新名稱未被其他組織使用
- `DELETE /api/v1/organizations/:organizationId`：硬刪除

### 3.3 取得組織演唱會列表 `GET /api/v1/organizations/:organizationId/concerts`

**Query 參數**：

| 參數 | 說明 | 預設值 |
|------|------|--------|
| `status` | 篩選 reviewStatus | 不篩選 |
| `limit` | 每頁筆數 | 10 |
| `page` | 頁碼 | 1 |
| `sort` | 排序（格式：`field:ASC,field2:DESC`） | `eventStartDate:DESC` |

---

## 4. 演唱會模組

### 4.1 建立演唱會 `POST /api/v1/concerts`

支援**草稿模式**：`conInfoStatus === 'draft'` 時跳過所有欄位驗證，可儲存不完整資料。

**非草稿時必填**：organizationId、venueId、locationTagId、musicTagId、title、introduction、location、address、eventStartDate、eventEndDate、ticketPurchaseMethod、precautions、refundPolicy、imgBanner、imgSeattable

**票種陣列**（非草稿時必填，可多個）：
- `ticketTypeName`、`entranceType`、`ticketBenefits`、`ticketRefundPolicy`（必填）
- `ticketTypePrice`（非負數字）、`totalQuantity`（正整數）
- `sellBeginDate`、`sellEndDate`（sellEnd 必須晚於 sellBegin）

**建立邏輯**：
1. 驗證演唱會名稱不重複（409 D02）
2. 建立 Concert entity
3. 建立所有 TicketType entity（`remainingQuantity = totalQuantity`）
4. 回傳 `{ concert, ticketTypes[] }`

### 4.2 更新演唱會 `PUT /api/v1/concerts/:concertId`

**限制**：只能更新 `conInfoStatus === 'draft'` 的演唱會（否則 400 D03）

更新邏輯：
1. 覆蓋演唱會主資料
2. 刪除舊有票種
3. 重新建立新票種（全量替換，非 patch）

### 4.3 搜尋演唱會 `GET /api/v1/concerts/search`

| Query 參數 | 說明 | 預設值 |
|----------|------|--------|
| `keyword` | 搜尋 conTitle / conIntroduction（ILIKE） | '' |
| `locationTagId` | 地區標籤篩選 | — |
| `musicTagId` | 音樂類型篩選 | — |
| `startDate` | 活動開始時間 >= | — |
| `endDate` | 活動結束時間 <= | — |
| `page` | 頁碼 | 1 |
| `perPage` | 每頁筆數 | 10 |
| `sortedBy` | `newToOld` / `oldToNew` | `newToOld` |

只回傳 `conInfoStatus === 'published'` 的演唱會。
回傳包含 venueName、locationTagName、musicTagName（join 查詢）。
結果含 `{ data, page, perPage, count, totalPages, sortedBy }`。
無符合條件資料時回傳 `200 + data: []`，不拋 404。

### 4.4 熱門演唱會 `GET /api/v1/concerts/popular`

**排序**：promotion ASC → visitCount ASC（promotion 越小越優先）
**Query 參數**：`take`（回傳筆數，預設 3）
只回傳 `published` 狀態演唱會。
無符合條件資料時回傳 `200 + data: []`，不拋 404。

### 4.5 首頁 Banner `GET /api/v1/concerts/banners`

同排序邏輯，固定回傳前 5 筆，回傳欄位：`concertId, conTitle, conIntroduction, imgBanner, promotion, visitCount`。
無符合條件資料時回傳 `200 + data: []`，不拋 404。

### 4.6 visitCount 計數 `PATCH /api/v1/concerts/:concertId/visit`

每次呼叫 +1，無需認證，無冷卻機制。

### 4.7 promotion 權重 `PATCH /api/v1/concerts/:concertId/promotion`

**需要 adminAuth**（admin 或 superuser）。
`promotion` 必須為非負整數。

### 4.8 場地資料 `GET /api/v1/concerts/venues`

回傳所有場地完整資料，無需認證。

---

## 5. 圖片上傳模組

- 上傳端點：`/api/v1/upload`（詳細路由待補）
- 流程：Multer 接收 → Sharp 處理 → 暫存 → 確認後移至永久儲存
- 定時清理：依 `CLEANUP_TEMP_IMAGES_HOURS` 刪除過期暫存

---

## 6. 票券模組

### 6.1 查詢場次票種 `GET /api/v1/ticket/:concertSessionId`

無需認證。

**業務邏輯**：
1. 驗證 `concertSessionId` 對應的演唱會場次是否存在（不存在 → 404 D01）
2. 查詢該場次下所有票種，回傳陣列（場次無票種時回傳空陣列）

**回傳欄位**：`ticketTypeId`、`ticketTypeName`、`entranceType`、`ticketBenefits`、`ticketRefundPolicy`、`ticketTypePrice`、`totalQuantity`、`remainingQuantity`、`sellBeginDate`、`sellEndDate`

### 6.2 驗票核銷 `POST /api/v1/ticket/verify`

**需要 isAuthenticated**；只有該票券對應演唱會的主辦方或管理員可核銷。

**必填欄位**：`qrCode`（字串）

**業務邏輯**：由 `TicketVerificationService` 處理，驗證 QR Code 後將票券標記為已使用。

---

## 7. 訂單模組

### 7.1 建立訂單 `POST /api/v1/orders`

**需要 isAuthenticated**。

**必填欄位**：`ticketTypeId`（UUID）、`purchaserName`、`purchaserEmail`、`purchaserPhone`

**驗證邏輯**：
1. `ticketTypeId` 必須為有效 UUID 格式（400 V08）
2. `purchaserName`、`purchaserEmail`、`purchaserPhone` 不可全為空（400 D03）
3. `purchaserPhone` 必須為 10 碼且以 `09` 開頭（400 V08）
4. 票種必須存在（404 D01）
5. 當前時間必須在票種販售區間內（`sellBeginDate` ≤ now ≤ `sellEndDate`）
6. 原子性扣庫存（`remainingQuantity > 0` 條件更新，失敗代表已售罄 → 400 D10）

**建立邏輯**：
- 建立狀態為 `held` 的訂單，`isLocked = true`，鎖定有效期 **15 分鐘**
- 產生 `orderNumber`（格式：`YYMMDDHHMMSS-XXXX`，XXXX 為 orderId 末 4 碼）

**回應**：`{ orderId, lockExpireTime }`

### 7.2 退款申請 `POST /api/v1/orders/:orderId/refund`

**需要 isAuthenticated**。

**必填欄位（body）**：`orderId`（必須與 URL params 相符）

**驗證邏輯**：
1. URL `orderId` 與 body `orderId` 必須相符（400 D03）
2. `orderId` 必須為有效 UUID 格式（400 V08）
3. 訂單必須存在（404 D01）
4. 只有訂單擁有者可申請退款（403 A07）
5. 退款截止日為演唱會場次日期前 **7 天**，超過則拒絕（403 A07）
6. 支付記錄必須存在且狀態為 `completed`（否則 403 A07）

**退款流程**：
1. 呼叫 ECPay API（`DoAction: R`）進行信用卡退刷
2. ECPay 回傳 `RtnCode=1` → 將訂單改為 `refunded`、付款改為 `refunded`
3. 若當前時間仍在票種販售區間內，`remainingQuantity + 1`

### 7.3 查詢訂單資訊 `GET /api/v1/orders/:orderId`

**需要 isAuthenticated**。

查詢條件同時過濾 `orderId` 與 `userId`（確保只能查自己的訂單）。

**回應**：`{ order, concert }`（concert 為巢狀 join 取得的演唱會資料，找不到時為 null）

訂單不存在（含不屬於當前用戶）→ 404 D01

### 7.4 取得用戶訂單清單 `GET /api/v1/users/orders`

**需要 isAuthenticated**。

回傳當前登入用戶名下所有票券及對應訂單資料（含演唱會、場次資訊），每張票券為一筆。

**回傳欄位**：`orderStatus`、`orderNumber`、`orderId`、`orderCreatedAt`、`ticketTypeName`、`price`、`sessionDate/Start/End/Title`、`concertName/Address/Description/Status`、`qrCode`、`tickerStatus`、`ticketId`

### 7.5 取得票券詳情 `GET /api/v1/users/ticket/:ticketId`

**需要 isAuthenticated**。

查詢條件同時過濾 `ticketId` 與 `userId`。票券不存在（含不屬於當前用戶）→ 404 D01

**回傳資料**：票券狀態、QR Code、演唱會名稱/地點、場次日期、訂單編號、購票時間、票種名稱/價格、主辦方組織資訊
