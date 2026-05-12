# 主辦方建立演唱會操作指南

本文件說明主辦方透過 Tickeasy API 建立演唱會的完整流程，包含帳號準備、組織建立、圖片上傳、演唱會草稿儲存與提交審核。

## 目錄

1. [前置條件](#1-前置條件)
2. [建立主辦組織](#2-建立主辦組織)
3. [查詢參考資料](#3-查詢參考資料)
4. [上傳圖片（暫存模式）](#4-上傳圖片暫存模式)
5. [建立演唱會草稿](#5-建立演唱會草稿)
6. [填寫完整資料](#6-填寫完整資料)
7. [提交審核](#7-提交審核)
8. [狀態流轉說明](#8-狀態流轉說明)
9. [圖片管理補充](#9-圖片管理補充)

---

## 1. 前置條件

### 1.1 帳號準備

主辦方需完成以下步驟才能建立組織與演唱會：

| 步驟 | API | 說明 |
|------|-----|------|
| 註冊帳號 | `POST /api/v1/auth/register` | 填寫 email / 密碼 |
| 驗證 Email | `POST /api/v1/auth/verify-email` | 收取驗證信並確認 |
| 登入取得 Token | `POST /api/v1/auth/login` | 回傳 JWT |

> **注意：建立組織需要 Email 已驗證，未驗證帳號呼叫建立組織 API 會回傳 403。**

### 1.2 認證 Header

後續所有需登入的請求皆須帶入：

```
Authorization: Bearer <JWT_TOKEN>
```

---

## 2. 建立主辦組織

演唱會必須隸屬於一個組織。若尚未建立組織，先執行此步驟。

```
POST /api/v1/organizations
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json
```

**Request Body：**

```json
{
  "orgName": "星聲音樂工作室",
  "orgAddress": "台北市信義區松壽路 9 號",
  "orgMail": "contact@starvoice.tw",
  "orgContact": "王小明",
  "orgMobile": "0912-345-678",
  "orgPhone": "02-2720-0000",
  "orgWebsite": "https://starvoice.tw"
}
```

| 欄位 | 必填 | 說明 |
|------|------|------|
| `orgName` | ✅ | 組織名稱，全系統唯一 |
| `orgAddress` | ✅ | 組織地址 |
| `orgMail` | ❌ | 聯絡信箱 |
| `orgContact` | ❌ | 聯絡人姓名 |
| `orgMobile` | ❌ | 手機 |
| `orgPhone` | ❌ | 電話 |
| `orgWebsite` | ❌ | 官網 |

**成功回應：**

```json
{
  "status": "success",
  "message": "創建組織成功",
  "data": {
    "organization": {
      "organizationId": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
      "orgName": "星聲音樂工作室",
      ...
    }
  }
}
```

記錄回傳的 `organizationId`，後續建立演唱會時需要。

---

## 3. 查詢參考資料

建立演唱會前需查詢場地、地點標籤、音樂標籤的 ID。這三支 API 可平行呼叫，不需認證。

```
GET /api/v1/concerts/venues
GET /api/v1/concerts/location-tags
GET /api/v1/concerts/music-tags
```

從回傳資料中找到對應項目，記錄其 ID 備用：

| 資料 | 欄位名稱 | 用途 |
|------|---------|------|
| 場地清單 | `venueId` | 指定演出場地 |
| 地點標籤 | `locationTagId` | 篩選/搜尋用分類 |
| 音樂標籤 | `musicTagId` | 篩選/搜尋用分類 |

---

## 4. 上傳圖片（暫存模式）

演唱會需要兩種圖片：
- **Banner 主視覺**（整場演唱會一張）
- **座位圖**（每個場次一張）

圖片來源可使用 [Unsplash](https://unsplash.com/s/photos/concert) 搜尋 `concert` 取得免費授權圖片。

### 4.1 上傳 Banner（暫存）

不帶 `targetId` 即為暫存模式，圖片上傳後回傳暫存 URL，於建立演唱會時填入 `imgBanner`。

```
POST /api/v1/upload/image
Authorization: Bearer <JWT_TOKEN>
Content-Type: multipart/form-data

file: <concert_banner.jpg>
uploadContext: CONCERT_BANNER
```

### 4.2 上傳座位圖（暫存）

每個場次需要一張座位圖，重複此步驟取得各場次的 URL。

```
POST /api/v1/upload/image
Authorization: Bearer <JWT_TOKEN>
Content-Type: multipart/form-data

file: <seating_chart.jpg>
uploadContext: CONCERT_SEATING_TABLE
```

**成功回應（兩者相同格式）：**

```json
{
  "status": "success",
  "message": "圖片暫存成功",
  "data": "https://xxx.supabase.co/storage/v1/object/public/temp/concert_banner_xxx.jpg"
}
```

記錄回傳的暫存 URL，後續填入演唱會資料。

> **支援格式：** JPEG、PNG、GIF、WebP

---

## 5. 建立演唱會草稿

可先建立一筆空草稿取得 `concertId`，再逐步填寫資料。草稿模式後端不驗證欄位完整性。

```
POST /api/v1/concerts
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json
```

**最簡草稿 Request Body：**

```json
{
  "organizationId": "<Step 2 取得的 organizationId>",
  "conTitle": "2025 星聲之夜演唱會",
  "conInfoStatus": "draft"
}
```

**成功回應：**

```json
{
  "status": "success",
  "message": "活動新增成功",
  "data": {
    "concert": {
      "concertId": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
      "conInfoStatus": "draft",
      ...
    }
  }
}
```

記錄回傳的 `concertId`。

---

## 6. 填寫完整資料

使用 PUT 更新草稿，填入全部欄位。

```
PUT /api/v1/concerts/<concertId>
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json
```

**完整 Request Body：**

```json
{
  "organizationId": "<organizationId>",
  "venueId": "<Step 3 取得的 venueId>",
  "locationTagId": "<Step 3 取得的 locationTagId>",
  "musicTagId": "<Step 3 取得的 musicTagId>",
  "conTitle": "2025 星聲之夜演唱會",
  "conIntroduction": "一年一度的年度大型演唱會，集結多位頂尖歌手，帶來震撼人心的演出體驗。",
  "conLocation": "臺北小巨蛋",
  "conAddress": "台北市松山區南京東路四段 2 號",
  "eventStartDate": "2025/08/15",
  "eventEndDate": "2025/08/16",
  "imgBanner": "<Step 4.1 取得的暫存 URL>",
  "ticketPurchaseMethod": "官網購票、現場購票，每人限購 4 張",
  "precautions": "禁止攜帶自拍棒、場內禁止錄影、請於開演前 30 分鐘入場",
  "refundPolicy": "演出前 7 天可全額退票，演出前 3 天內不接受退票申請",
  "conInfoStatus": "draft",
  "sessions": [
    {
      "sessionDate": "2025/08/15",
      "sessionStart": "19:00",
      "sessionEnd": "22:00",
      "sessionTitle": "第一場：光之序曲",
      "imgSeattable": "<Step 4.2 取得的暫存座位圖 URL>",
      "ticketTypes": [
        {
          "ticketTypeName": "VIP 席",
          "entranceType": "VIP 入口",
          "ticketBenefits": "最佳觀賞位置、演出後專屬簽名會",
          "ticketRefundPolicy": "演出前 7 天全額退票",
          "ticketTypePrice": 3800,
          "totalQuantity": 200,
          "sellBeginDate": "2025/07/01 10:00",
          "sellEndDate": "2025/08/14 23:59"
        },
        {
          "ticketTypeName": "一般席",
          "entranceType": "一般入口",
          "ticketBenefits": "標準觀賞席位",
          "ticketRefundPolicy": "演出前 7 天全額退票",
          "ticketTypePrice": 1800,
          "totalQuantity": 1000,
          "sellBeginDate": "2025/07/01 10:00",
          "sellEndDate": "2025/08/14 23:59"
        }
      ]
    },
    {
      "sessionDate": "2025/08/16",
      "sessionStart": "19:00",
      "sessionEnd": "22:00",
      "sessionTitle": "第二場：終章之歌",
      "imgSeattable": "<另一張暫存座位圖 URL>",
      "ticketTypes": [
        {
          "ticketTypeName": "一般席",
          "entranceType": "一般入口",
          "ticketBenefits": "標準觀賞席位",
          "ticketRefundPolicy": "演出前 7 天全額退票",
          "ticketTypePrice": 1800,
          "totalQuantity": 1000,
          "sellBeginDate": "2025/07/01 10:00",
          "sellEndDate": "2025/08/14 23:59"
        }
      ]
    }
  ]
}
```

### 欄位說明

**演唱會基本資料**

| 欄位 | 必填（非草稿） | 格式 | 說明 |
|------|--------------|------|------|
| `organizationId` | ✅ | UUID | 主辦組織 |
| `venueId` | ✅ | UUID | 場地 |
| `locationTagId` | ✅ | UUID | 地點標籤 |
| `musicTagId` | ✅ | UUID | 音樂類型 |
| `conTitle` | ✅ | 最長 50 字 | 演唱會名稱 |
| `conIntroduction` | ✅ | 長文字 | 演唱會介紹 |
| `conLocation` | ✅ | 最長 50 字 | 地點名稱 |
| `conAddress` | ✅ | 最長 2000 字 | 完整地址 |
| `eventStartDate` | ✅ | `yyyy/MM/dd` | 活動開始日期 |
| `eventEndDate` | ✅ | `yyyy/MM/dd` | 活動結束日期 |
| `imgBanner` | ✅ | URL | 主視覺圖片 URL |
| `ticketPurchaseMethod` | ✅ | 長文字 | 購票方式說明 |
| `precautions` | ✅ | 長文字 | 注意事項 |
| `refundPolicy` | ✅ | 長文字 | 退票政策 |
| `conInfoStatus` | ✅ | enum | `draft` 或其他狀態 |

**場次（sessions）**

| 欄位 | 格式 | 說明 |
|------|------|------|
| `sessionDate` | `yyyy/MM/dd` | 場次日期 |
| `sessionStart` | `HH:mm` | 開演時間 |
| `sessionEnd` | `HH:mm` | 結束時間 |
| `sessionTitle` | 文字 | 場次名稱 |
| `imgSeattable` | URL | 座位圖 |
| `ticketTypes` | 陣列 | 該場次票種清單 |

**票種（ticketTypes）**

| 欄位 | 格式 | 說明 |
|------|------|------|
| `ticketTypeName` | 文字 | 票種名稱 |
| `entranceType` | 文字 | 入場方式 |
| `ticketBenefits` | 文字 | 票種福利 |
| `ticketRefundPolicy` | 文字 | 退票政策 |
| `ticketTypePrice` | 整數 | 票價（新台幣） |
| `totalQuantity` | 整數 | 總票數 |
| `sellBeginDate` | `yyyy/MM/dd HH:mm` | 開賣時間 |
| `sellEndDate` | `yyyy/MM/dd HH:mm` | 截止販售時間 |

---

## 7. 提交審核

草稿完整後，提交進入審核流程。

```
PUT /api/v1/concerts/<concertId>/submit
Authorization: Bearer <JWT_TOKEN>
```

- 系統將 `conInfoStatus` 從 `draft` → `reviewing`
- 觸發 AI 自動審核，審核結果可能為 `published`（通過）或 `rejected`（退回）
- 審核記錄可透過下方 API 查詢：

```
GET /api/v1/concerts/<concertId>/reviews
Authorization: Bearer <JWT_TOKEN>
```

---

## 8. 狀態流轉說明

```
draft → reviewing → published（上架）
                 ↘ rejected → (修改) → 再次 submit → reviewing
                                                           ↓
                                                       published
```

| 狀態 | 說明 | 可修改 | 可刪除 |
|------|------|--------|--------|
| `draft` | 草稿 | ✅ | ✅ |
| `reviewing` | 審核中 | ❌ | ✅ |
| `published` | 已上架 | ❌ | ❌ |
| `rejected` | 審核退回 | ✅ | ✅ |
| `finished` | 演出結束（系統自動） | ❌ | ❌ |

---

## 9. 圖片管理補充

### 替換已建立演唱會的 Banner

演唱會建立後，帶 `targetId` 上傳，系統自動更新 DB 並刪除舊圖：

```
POST /api/v1/upload/image
Content-Type: multipart/form-data

file: <new_banner.jpg>
uploadContext: CONCERT_BANNER
targetId: <concertId>
```

### 替換已建立場次的座位圖

```
POST /api/v1/upload/image
Content-Type: multipart/form-data

file: <new_seating.jpg>
uploadContext: CONCERT_SEATING_TABLE
targetId: <sessionId>
```

### 刪除圖片

```
DELETE /api/v1/upload/image
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json

{
  "url": "<圖片 URL>",
  "uploadContext": "CONCERT_BANNER",
  "targetId": "<concertId>"
}
```

---

## 快速操作清單

```
□ 1. 登入取得 JWT
□ 2. POST /api/v1/organizations         → 取得 organizationId
□ 3. GET /api/v1/concerts/venues        → 取得 venueId
□ 3. GET /api/v1/concerts/location-tags → 取得 locationTagId
□ 3. GET /api/v1/concerts/music-tags    → 取得 musicTagId
□ 4. POST /api/v1/upload/image (CONCERT_BANNER, 無 targetId) → 取得暫存 URL
□ 4. POST /api/v1/upload/image (CONCERT_SEATING_TABLE, 無 targetId) → 取得暫存 URL（每場次一次）
□ 5. POST /api/v1/concerts              → 取得 concertId（草稿）
□ 6. PUT  /api/v1/concerts/<concertId>  → 填寫完整資料
□ 7. PUT  /api/v1/concerts/<concertId>/submit → 提交審核
```
