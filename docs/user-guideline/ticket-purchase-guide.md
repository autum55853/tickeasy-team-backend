# 如何在 Tickeasy 購票

本文件說明使用者透過 Tickeasy API 完成購票的完整流程，包含瀏覽演唱會、選擇票種、建立訂單、完成付款，以及退票申請。

## 目錄

1. [流程總覽](#1-流程總覽)
2. [步驟一：登入取得 Token](#2-步驟一登入取得-token)
3. [步驟二：瀏覽與搜尋演唱會](#3-步驟二瀏覽與搜尋演唱會)
4. [步驟三：查看場次與票種](#4-步驟三查看場次與票種)
5. [步驟四：建立訂單（鎖票）](#5-步驟四建立訂單鎖票)
6. [步驟五：前往付款](#6-步驟五前往付款)
7. [步驟六：查詢訂單狀態](#7-步驟六查詢訂單狀態)
8. [退票申請](#8-退票申請)
9. [常見錯誤排查](#9-常見錯誤排查)

---

## 1. 流程總覽

```
登入 → 瀏覽演唱會 → 選擇場次票種 → 建立訂單（鎖票 15 分鐘）→ 付款 → 取得票券
```

| 步驟 | API | 是否需要認證 |
|------|-----|------------|
| 登入 | `POST /api/v1/auth/login` | 否 |
| 瀏覽演唱會 | `GET /api/v1/concerts/search` | 否 |
| 查看演唱會詳情 | `GET /api/v1/concerts/:concertId` | 否 |
| 查看場次與票種 | `GET /api/v1/concerts/:concertId/sessions` | 否 |
| 查詢票種資訊 | `GET /api/v1/ticket/:concertSessionId` | 否 |
| 建立訂單 | `POST /api/v1/orders` | ✅ 需要 JWT |
| 前往付款 | `GET /api/v1/payments/:orderId` | ✅ 需要 JWT |
| 查詢訂單 | `GET /api/v1/orders/:orderId` | ✅ 需要 JWT |
| 退票申請 | `POST /api/v1/orders/:orderId/refund` | ✅ 需要 JWT |

> **重要：** 建立訂單後有 **15 分鐘** 的付款鎖票期，逾時未付款將自動釋放票券。

---

## 2. 步驟一：登入取得 Token

購票前須先登入取得 JWT Token。若尚未有帳號，請先完成註冊與 Email 驗證（參考 [如何成為 Tickeasy 舉辦方](./become-organizer-guide.md) 的步驟一與步驟二）。

```
POST /api/v1/auth/login
Content-Type: application/json
```

**Request Body：**

```json
{
  "email": "user@example.com",
  "password": "MyPassword123!"
}
```

**成功回應：**

```json
{
  "status": "success",
  "message": "登入成功",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "userId": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
      "name": "王小明",
      "email": "user@example.com",
      "isEmailVerified": true
    }
  }
}
```

記錄回傳的 `token`，後續所有需認證的 API 皆須帶入：

```
Authorization: Bearer <token>
```

> **Token 有效期限為 7 天**，過期後需重新登入。

---

## 3. 步驟二：瀏覽與搜尋演唱會

### 3.1 搜尋演唱會

```
GET /api/v1/concerts/search?keyword=星聲&locationTagId=<id>&musicTagId=<id>
```

| 查詢參數 | 必填 | 說明 |
|---------|------|------|
| `keyword` | ❌ | 關鍵字搜尋（演唱會名稱） |
| `locationTagId` | ❌ | 地點標籤 ID 篩選 |
| `musicTagId` | ❌ | 音樂類型 ID 篩選 |

### 3.2 查看熱門演唱會

```
GET /api/v1/concerts/popular
```

### 3.3 查看演唱會詳情

從搜尋結果取得 `concertId` 後，查看完整資訊：

```
GET /api/v1/concerts/<concertId>
```

**成功回應（部分欄位）：**

```json
{
  "status": "success",
  "message": "取得演唱會成功",
  "data": {
    "concert": {
      "concertId": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
      "conTitle": "2025 星聲之夜演唱會",
      "conLocation": "臺北小巨蛋",
      "conAddress": "台北市松山區南京東路四段 2 號",
      "eventStartDate": "2025-08-15",
      "eventEndDate": "2025-08-16",
      "imgBanner": "https://xxx.supabase.co/storage/v1/object/public/...",
      "ticketPurchaseMethod": "官網購票、現場購票，每人限購 4 張",
      "precautions": "禁止攜帶自拍棒、場內禁止錄影",
      "refundPolicy": "演出前 7 天可全額退票"
    }
  }
}
```

記錄 `concertId`，下一步查詢場次時需要。

---

## 4. 步驟三：查看場次與票種

### 4.1 取得演唱會所有場次

```
GET /api/v1/concerts/<concertId>/sessions
```

**成功回應：**

```json
{
  "status": "success",
  "message": "取得場次成功",
  "data": {
    "sessions": [
      {
        "sessionId": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
        "sessionTitle": "第一場：光之序曲",
        "sessionDate": "2025-08-15",
        "sessionStart": "19:00",
        "sessionEnd": "22:00",
        "imgSeattable": "https://xxx.supabase.co/storage/v1/object/public/..."
      },
      {
        "sessionId": "yyyyyyyy-yyyy-yyyy-yyyy-yyyyyyyyyyyy",
        "sessionTitle": "第二場：終章之歌",
        "sessionDate": "2025-08-16",
        "sessionStart": "19:00",
        "sessionEnd": "22:00"
      }
    ]
  }
}
```

記錄目標場次的 `sessionId`。

### 4.2 查詢場次票種與餘票

```
GET /api/v1/ticket/<concertSessionId>
```

**成功回應：**

```json
{
  "status": "success",
  "message": "獲取演唱會票券成功",
  "data": {
    "tickets": [
      {
        "ticketTypeId": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
        "ticketTypeName": "VIP 席",
        "entranceType": "VIP 入口",
        "ticketBenefits": "最佳觀賞位置、演出後專屬簽名會",
        "ticketRefundPolicy": "演出前 7 天全額退票",
        "ticketTypePrice": 3800,
        "totalQuantity": 200,
        "remainingQuantity": 45,
        "sellBeginDate": "2025-07-01T02:00:00.000Z",
        "sellEndDate": "2025-08-14T15:59:00.000Z"
      },
      {
        "ticketTypeId": "yyyyyyyy-yyyy-yyyy-yyyy-yyyyyyyyyyyy",
        "ticketTypeName": "一般席",
        "entranceType": "一般入口",
        "ticketBenefits": "標準觀賞席位",
        "ticketRefundPolicy": "演出前 7 天全額退票",
        "ticketTypePrice": 1800,
        "totalQuantity": 1000,
        "remainingQuantity": 312,
        "sellBeginDate": "2025-07-01T02:00:00.000Z",
        "sellEndDate": "2025-08-14T15:59:00.000Z"
      }
    ]
  }
}
```

確認 `remainingQuantity > 0` 且目前時間在 `sellBeginDate` 與 `sellEndDate` 之間，記錄目標票種的 `ticketTypeId`。

---

## 5. 步驟四：建立訂單（鎖票）

選定票種後，建立訂單，系統將自動扣減餘票並鎖定 **15 分鐘**。

```
POST /api/v1/orders
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body：**

```json
{
  "ticketTypeId": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "purchaserName": "王小明",
  "purchaserEmail": "user@example.com",
  "purchaserPhone": "0912345678"
}
```

| 欄位 | 必填 | 格式 | 說明 |
|------|------|------|------|
| `ticketTypeId` | ✅ | UUID | 目標票種 ID |
| `purchaserName` | ✅ | 文字 | 購票人姓名 |
| `purchaserEmail` | ✅ | Email | 購票人 Email |
| `purchaserPhone` | ✅ | 10 位數字，09 開頭 | 購票人手機號碼 |

**成功回應（HTTP 200）：**

```json
{
  "status": "success",
  "message": "訂單創建成功",
  "data": {
    "orderId": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
    "lockExpireTime": "2025-08-01T10:15:00.000Z"
  }
}
```

記錄 `orderId` 與 `lockExpireTime`，**務必在 `lockExpireTime` 前完成付款**，否則訂單自動取消、票券釋放。

---

## 6. 步驟五：前往付款

帶入 `orderId` 取得 ECPay 付款頁面，完成信用卡付款。

```
GET /api/v1/payments/<orderId>
Authorization: Bearer <token>
```

- 系統回傳 ECPay 付款表單頁面（HTML）
- 使用者在頁面中填寫信用卡資訊並送出
- 付款成功後：
  - 訂單狀態更新為 `paid`
  - 系統自動產生票券（含 QR Code）
  - 頁面導向前端完成頁面（`REDIRECTURL?oId=<orderId>`）

> **注意：** 需在 `lockExpireTime` 前完成付款，逾時訂單失效。

---

## 7. 步驟六：查詢訂單狀態

付款完成後可查詢訂單詳情確認狀態。

```
GET /api/v1/orders/<orderId>
Authorization: Bearer <token>
```

**成功回應：**

```json
{
  "status": "success",
  "message": "訂單資訊取得成功",
  "data": {
    "order": {
      "orderId": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
      "orderNumber": "250801101500-AB12",
      "orderStatus": "paid",
      "purchaserName": "王小明",
      "purchaserEmail": "user@example.com",
      "purchaserPhone": "0912345678",
      "isLocked": true,
      "lockExpireTime": "2025-08-01T10:15:00.000Z",
      "createdAt": "2025-08-01T10:00:00.000Z"
    },
    "concert": {
      "conTitle": "2025 星聲之夜演唱會",
      "conLocation": "臺北小巨蛋"
    }
  }
}
```

| 訂單狀態 | 說明 |
|---------|------|
| `held` | 已鎖票，等待付款 |
| `paid` | 付款成功，票券已產生 |
| `refunded` | 已退款 |

---

## 8. 退票申請

演出前 **7 天**內可申請退票，逾期不受理。

```
POST /api/v1/orders/<orderId>/refund
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body：**

```json
{
  "orderId": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
}
```

**成功回應：**

```json
{
  "status": "success",
  "message": "退款申請成功"
}
```

退款成功後：
- 訂單狀態更新為 `refunded`
- 款項退回原付款信用卡（處理時間依發卡銀行而定）
- 若仍在販售期間，系統自動補回票券庫存

---

## 9. 常見錯誤排查

| 錯誤訊息 | HTTP 狀態碼 | 原因 | 解決方式 |
|---------|------------|------|---------|
| `未授權` / `invalid token` | 401 | Token 未帶入或已過期 | 重新登入取得新 Token |
| `票券已售罄` | 409 | 餘票為 0 | 選擇其他票種或場次 |
| `不在販售時間內` | 400 | 目前時間超出 `sellBeginDate`~`sellEndDate` | 確認販售時間 |
| `欄位未填寫完全` | 400 | `purchaserName`、`purchaserEmail`、`purchaserPhone` 有缺漏 | 補齊所有必填欄位 |
| `手機號碼格式錯誤` | 400 | 手機格式不符（需 10 位數，09 開頭） | 使用正確格式，如 `0912345678` |
| `訂單不存在` | 404 | `orderId` 錯誤或非本人訂單 | 確認 `orderId` 正確 |
| `訂單已過期` | 400 | 超過 15 分鐘鎖票期未付款 | 重新建立訂單 |
| `此訂單不可退款` | 403 | 距演出不足 7 天 | 超過退票期限，無法退票 |

---

## 快速操作清單

```
□ 1. POST /api/v1/auth/login                           → 取得 JWT Token
□ 2. GET  /api/v1/concerts/search?keyword=<演唱會名稱>  → 找到目標演唱會
□ 3. GET  /api/v1/concerts/<concertId>/sessions        → 取得 sessionId
□ 4. GET  /api/v1/ticket/<concertSessionId>            → 確認餘票，取得 ticketTypeId
□ 5. POST /api/v1/orders                               → 鎖票，取得 orderId（15 分鐘內付款）
□ 6. GET  /api/v1/payments/<orderId>                   → 進入 ECPay 付款頁面，完成付款
□ 7. GET  /api/v1/orders/<orderId>                     → 確認訂單狀態為 paid
```
