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
10. [附錄：範例情境](#10-附錄範例情境)

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
      "orgName": "星聲音樂工作室"
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

### 4.1 取得免費圖片來源（Unsplash）

推薦從 [Unsplash](https://unsplash.com/) 取得免費授權圖片，可下載後上傳。以下為可直接使用的圖片 URL（Unsplash License，免費商業用途）：

| 主題 | 下載 URL |
|------|---------|
| 演唱會人群 | `https://images.unsplash.com/photo-1501386761578-eac5c294458a?w=1920&q=80` |
| 舞台燈光 | `https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=1920&q=80` |
| 爵士音樂 | `https://images.unsplash.com/photo-1415201364774-f6f0bb35f28f?w=1920&q=80` |
| 古典交響 | `https://images.unsplash.com/photo-1465847899084-d164df4dedc6?w=1920&q=80` |
| 搖滾現場 | `https://images.unsplash.com/photo-1524368535928-5b5e00ddc76b?w=1920&q=80` |
| 電子音樂節 | `https://images.unsplash.com/photo-1540039155733-5bb30b53aa14?w=1920&q=80` |

> 使用方式：瀏覽器開啟 URL 下載圖片，再透過以下 API 上傳。

### 4.2 上傳 Banner（暫存）

不帶 `targetId` 即為暫存模式，圖片上傳後回傳暫存 URL，於建立演唱會時填入 `imgBanner`。

```
POST /api/v1/upload/image
Authorization: Bearer <JWT_TOKEN>
Content-Type: multipart/form-data

file: <concert_banner.jpg>
uploadContext: CONCERT_BANNER
```

### 4.3 上傳座位圖（暫存）

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
  "conTitle": "演唱會名稱",
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
      "conInfoStatus": "draft"
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
| `imgBanner` | ✅ | URL | 主視覺圖片 URL（Step 4 取得） |
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
| `imgSeattable` | URL | 座位圖 URL（Step 4 取得） |
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

> 具體的 Request Body 範例請參考 [第 10 節：附錄範例情境](#10-附錄範例情境)。

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
□ 4. 從 Unsplash 下載 Banner 圖片
□ 4. POST /api/v1/upload/image (CONCERT_BANNER, 無 targetId)       → 取得暫存 URL
□ 4. POST /api/v1/upload/image (CONCERT_SEATING_TABLE, 無 targetId) → 取得暫存 URL（每場次一次）
□ 5. POST /api/v1/concerts              → 取得 concertId（草稿）
□ 6. PUT  /api/v1/concerts/<concertId>  → 填寫完整資料
□ 7. PUT  /api/v1/concerts/<concertId>/submit → 提交審核
```

---

## 10. 附錄：範例情境

以下提供四種不同主題的演唱會範例，每次建立新演唱會時可從中挑選適合的情境做為參考基礎，避免每次填寫相同內容。

---

### 情境 A｜流行音樂演唱會

**Banner 圖片來源：**
```
https://images.unsplash.com/photo-1501386761578-eac5c294458a?w=1920&q=80
```

**PUT /api/v1/concerts/\<concertId\> Request Body：**

```json
{
  "organizationId": "<organizationId>",
  "venueId": "<venueId>",
  "locationTagId": "<locationTagId>",
  "musicTagId": "<musicTagId>",
  "conTitle": "2025 璀璨之夜流行音樂演唱會",
  "conIntroduction": "年度最受矚目的流行音樂盛典，集結台灣最具人氣的歌手，帶來超過三小時的精彩演出。從抒情到舞曲，從獨唱到合唱，每一首歌都是與觀眾共同的珍貴回憶。",
  "conLocation": "台北小巨蛋",
  "conAddress": "台北市松山區南京東路四段 2 號",
  "eventStartDate": "2025/09/20",
  "eventEndDate": "2025/09/21",
  "imgBanner": "<上傳 Unsplash 圖片後取得的暫存 URL>",
  "ticketPurchaseMethod": "官方網站、便利商店 ibon 機台、現場售票窗口，每人限購 4 張",
  "precautions": "禁止攜帶專業拍攝器材、自拍棒及外食，請於開演前 30 分鐘完成入場手續",
  "refundPolicy": "演出前 7 日可申請全額退票，演出前 3 日起不受理退票，特殊情況依主辦方公告辦理",
  "conInfoStatus": "draft",
  "sessions": [
    {
      "sessionDate": "2025/09/20",
      "sessionStart": "19:00",
      "sessionEnd": "22:30",
      "sessionTitle": "Day 1｜光之序章",
      "imgSeattable": "<座位圖暫存 URL>",
      "ticketTypes": [
        {
          "ticketTypeName": "白金 VIP 席",
          "entranceType": "VIP 專屬通道",
          "ticketBenefits": "第一排至第五排優先入座、演前粉絲見面會資格、限定周邊禮包",
          "ticketRefundPolicy": "演出前 7 日全額退票",
          "ticketTypePrice": 5800,
          "totalQuantity": 150,
          "sellBeginDate": "2025/08/01 10:00",
          "sellEndDate": "2025/09/19 23:59"
        },
        {
          "ticketTypeName": "搖滾區站席",
          "entranceType": "A 區入口",
          "ticketBenefits": "最靠近舞台的站立區，感受現場震撼氛圍",
          "ticketRefundPolicy": "演出前 7 日全額退票",
          "ticketTypePrice": 2800,
          "totalQuantity": 500,
          "sellBeginDate": "2025/08/01 10:00",
          "sellEndDate": "2025/09/19 23:59"
        },
        {
          "ticketTypeName": "一般坐席",
          "entranceType": "B 區入口",
          "ticketBenefits": "固定座位，視野良好",
          "ticketRefundPolicy": "演出前 7 日全額退票",
          "ticketTypePrice": 1800,
          "totalQuantity": 2000,
          "sellBeginDate": "2025/08/01 10:00",
          "sellEndDate": "2025/09/19 23:59"
        }
      ]
    },
    {
      "sessionDate": "2025/09/21",
      "sessionStart": "19:00",
      "sessionEnd": "22:30",
      "sessionTitle": "Day 2｜夢的終章",
      "imgSeattable": "<座位圖暫存 URL>",
      "ticketTypes": [
        {
          "ticketTypeName": "搖滾區站席",
          "entranceType": "A 區入口",
          "ticketBenefits": "最靠近舞台的站立區",
          "ticketRefundPolicy": "演出前 7 日全額退票",
          "ticketTypePrice": 2800,
          "totalQuantity": 500,
          "sellBeginDate": "2025/08/01 10:00",
          "sellEndDate": "2025/09/20 23:59"
        },
        {
          "ticketTypeName": "一般坐席",
          "entranceType": "B 區入口",
          "ticketBenefits": "固定座位，視野良好",
          "ticketRefundPolicy": "演出前 7 日全額退票",
          "ticketTypePrice": 1800,
          "totalQuantity": 2000,
          "sellBeginDate": "2025/08/01 10:00",
          "sellEndDate": "2025/09/20 23:59"
        }
      ]
    }
  ]
}
```

---

### 情境 B｜爵士音樂節

**Banner 圖片來源：**
```
https://images.unsplash.com/photo-1415201364774-f6f0bb35f28f?w=1920&q=80
```

**PUT /api/v1/concerts/\<concertId\> Request Body：**

```json
{
  "organizationId": "<organizationId>",
  "venueId": "<venueId>",
  "locationTagId": "<locationTagId>",
  "musicTagId": "<musicTagId>",
  "conTitle": "2025 台北國際爵士音樂節",
  "conIntroduction": "匯聚來自紐約、巴黎、東京的頂尖爵士樂手，在台北最具歷史感的室外廣場，共同演繹從 Bebop 到 Fusion 的多元爵士風格。聆聽薩克斯風與鋼琴的即興對話，感受爵士樂最純粹的靈魂。",
  "conLocation": "華山 1914 文化創意產業園區",
  "conAddress": "台北市中正區八德路一段 1 號",
  "eventStartDate": "2025/10/04",
  "eventEndDate": "2025/10/05",
  "imgBanner": "<上傳 Unsplash 圖片後取得的暫存 URL>",
  "ticketPurchaseMethod": "官網購票、Kktix 購票平台，現場當日票視剩餘座位開放販售",
  "precautions": "室外活動請自備雨具，場內禁止吸煙，請勿在演出中途喧嘩影響其他觀眾",
  "refundPolicy": "演出前 10 日可申請全額退票，10 日內不受理退票",
  "conInfoStatus": "draft",
  "sessions": [
    {
      "sessionDate": "2025/10/04",
      "sessionStart": "18:00",
      "sessionEnd": "21:30",
      "sessionTitle": "Opening Night — Blue Note Session",
      "imgSeattable": "<座位圖暫存 URL>",
      "ticketTypes": [
        {
          "ticketTypeName": "貴賓席（含調酒一杯）",
          "entranceType": "貴賓入口",
          "ticketBenefits": "前排指定座位、入場即享調酒一杯、限定紀念程序冊",
          "ticketRefundPolicy": "演出前 10 日全額退票",
          "ticketTypePrice": 2200,
          "totalQuantity": 80,
          "sellBeginDate": "2025/09/01 12:00",
          "sellEndDate": "2025/10/03 18:00"
        },
        {
          "ticketTypeName": "一般入場票",
          "entranceType": "一般入口",
          "ticketBenefits": "自由座，建議提早入場選位",
          "ticketRefundPolicy": "演出前 10 日全額退票",
          "ticketTypePrice": 900,
          "totalQuantity": 400,
          "sellBeginDate": "2025/09/01 12:00",
          "sellEndDate": "2025/10/03 18:00"
        }
      ]
    },
    {
      "sessionDate": "2025/10/05",
      "sessionStart": "17:00",
      "sessionEnd": "21:00",
      "sessionTitle": "Grand Finale — Jazz Fusion Night",
      "imgSeattable": "<座位圖暫存 URL>",
      "ticketTypes": [
        {
          "ticketTypeName": "貴賓席（含調酒一杯）",
          "entranceType": "貴賓入口",
          "ticketBenefits": "前排指定座位、入場即享調酒一杯、限定紀念程序冊",
          "ticketRefundPolicy": "演出前 10 日全額退票",
          "ticketTypePrice": 2200,
          "totalQuantity": 80,
          "sellBeginDate": "2025/09/01 12:00",
          "sellEndDate": "2025/10/04 17:00"
        },
        {
          "ticketTypeName": "一般入場票",
          "entranceType": "一般入口",
          "ticketBenefits": "自由座，建議提早入場選位",
          "ticketRefundPolicy": "演出前 10 日全額退票",
          "ticketTypePrice": 900,
          "totalQuantity": 400,
          "sellBeginDate": "2025/09/01 12:00",
          "sellEndDate": "2025/10/04 17:00"
        }
      ]
    }
  ]
}
```

---

### 情境 C｜古典交響樂音樂會

**Banner 圖片來源：**
```
https://images.unsplash.com/photo-1465847899084-d164df4dedc6?w=1920&q=80
```

**PUT /api/v1/concerts/\<concertId\> Request Body：**

```json
{
  "organizationId": "<organizationId>",
  "venueId": "<venueId>",
  "locationTagId": "<locationTagId>",
  "musicTagId": "<musicTagId>",
  "conTitle": "2025 台灣愛樂交響樂團年度音樂會",
  "conIntroduction": "台灣愛樂交響樂團年度旗艦演出，本屆以「自然的四季」為主題，演繹韋瓦第《四季》、德弗札克《新世界》及台灣作曲家錢南章的全新委創作品。由國際知名指揮家吳承澤執棒，帶領八十位演奏家共同打造一場震撼心靈的音響盛宴。",
  "conLocation": "國家音樂廳",
  "conAddress": "台北市中山南路 21-1 號",
  "eventStartDate": "2025/11/08",
  "eventEndDate": "2025/11/09",
  "imgBanner": "<上傳 Unsplash 圖片後取得的暫存 URL>",
  "ticketPurchaseMethod": "兩廳院售票系統（artsticket.com.tw）、現場售票窗口，每人限購 6 張",
  "precautions": "正式音樂廳演出，請著正式服裝；開演後謝絕遲到入場；全程禁止錄音錄影；演出中請關閉手機",
  "refundPolicy": "演出前 14 日可申請全額退票，演出前 7 日內不受理退票申請",
  "conInfoStatus": "draft",
  "sessions": [
    {
      "sessionDate": "2025/11/08",
      "sessionStart": "19:30",
      "sessionEnd": "22:00",
      "sessionTitle": "首演之夜",
      "imgSeattable": "<座位圖暫存 URL>",
      "ticketTypes": [
        {
          "ticketTypeName": "A 區（一樓前區）",
          "entranceType": "正廳入口",
          "ticketBenefits": "最佳聆聽位置，一樓前排中央區",
          "ticketRefundPolicy": "演出前 14 日全額退票",
          "ticketTypePrice": 3500,
          "totalQuantity": 200,
          "sellBeginDate": "2025/10/01 10:00",
          "sellEndDate": "2025/11/07 20:00"
        },
        {
          "ticketTypeName": "B 區（一樓後區）",
          "entranceType": "正廳入口",
          "ticketBenefits": "一樓後排，視野開闊",
          "ticketRefundPolicy": "演出前 14 日全額退票",
          "ticketTypePrice": 2200,
          "totalQuantity": 300,
          "sellBeginDate": "2025/10/01 10:00",
          "sellEndDate": "2025/11/07 20:00"
        },
        {
          "ticketTypeName": "C 區（二樓包廂）",
          "entranceType": "二樓包廂入口",
          "ticketBenefits": "包廂席，俯瞰舞台全景",
          "ticketRefundPolicy": "演出前 14 日全額退票",
          "ticketTypePrice": 1500,
          "totalQuantity": 150,
          "sellBeginDate": "2025/10/01 10:00",
          "sellEndDate": "2025/11/07 20:00"
        }
      ]
    },
    {
      "sessionDate": "2025/11/09",
      "sessionStart": "14:30",
      "sessionEnd": "17:00",
      "sessionTitle": "日場加演",
      "imgSeattable": "<座位圖暫存 URL>",
      "ticketTypes": [
        {
          "ticketTypeName": "A 區（一樓前區）",
          "entranceType": "正廳入口",
          "ticketBenefits": "最佳聆聽位置，一樓前排中央區",
          "ticketRefundPolicy": "演出前 14 日全額退票",
          "ticketTypePrice": 3500,
          "totalQuantity": 200,
          "sellBeginDate": "2025/10/01 10:00",
          "sellEndDate": "2025/11/08 15:00"
        },
        {
          "ticketTypeName": "B 區（一樓後區）",
          "entranceType": "正廳入口",
          "ticketBenefits": "一樓後排，視野開闊",
          "ticketRefundPolicy": "演出前 14 日全額退票",
          "ticketTypePrice": 2200,
          "totalQuantity": 300,
          "sellBeginDate": "2025/10/01 10:00",
          "sellEndDate": "2025/11/08 15:00"
        }
      ]
    }
  ]
}
```

---

### 情境 D｜電子音樂節

**Banner 圖片來源：**
```
https://images.unsplash.com/photo-1540039155733-5bb30b53aa14?w=1920&q=80
```

**PUT /api/v1/concerts/\<concertId\> Request Body：**

```json
{
  "organizationId": "<organizationId>",
  "venueId": "<venueId>",
  "locationTagId": "<locationTagId>",
  "musicTagId": "<musicTagId>",
  "conTitle": "FLUX 2025 電子音樂節",
  "conIntroduction": "FLUX 是台灣最具規模的室內電子音樂盛典，2025 年將帶來來自歐洲、日本與本地的頂尖 DJ 與電子音樂製作人，橫跨 Techno、House、Ambient 三大舞台。沉浸式視聽裝置搭配 360° 環繞音響，帶你體驗超越感官的音樂旅程。",
  "conLocation": "台北流行音樂中心",
  "conAddress": "台北市南港區市民大道八段 99 號",
  "eventStartDate": "2025/12/13",
  "eventEndDate": "2025/12/14",
  "imgBanner": "<上傳 Unsplash 圖片後取得的暫存 URL>",
  "ticketPurchaseMethod": "官網限量預售、Kktix 平台，現場不另售票，售完為止",
  "precautions": "18 歲以上方可入場（請攜帶證件備查）；禁止攜帶違禁品及危險物品；全場禁止錄影直播；保留拒絕特定人士入場之權利",
  "refundPolicy": "所有票券一經售出概不退票，如遇不可抗力因素取消，主辦方將全額退款",
  "conInfoStatus": "draft",
  "sessions": [
    {
      "sessionDate": "2025/12/13",
      "sessionStart": "20:00",
      "sessionEnd": "06:00",
      "sessionTitle": "Night 1 — TECHNO REALM",
      "imgSeattable": "<座位圖暫存 URL>",
      "ticketTypes": [
        {
          "ticketTypeName": "Early Bird 票（限量）",
          "entranceType": "主入口",
          "ticketBenefits": "優惠早鳥票，與一般票享有相同入場權益",
          "ticketRefundPolicy": "不退票",
          "ticketTypePrice": 1200,
          "totalQuantity": 200,
          "sellBeginDate": "2025/10/15 12:00",
          "sellEndDate": "2025/11/15 23:59"
        },
        {
          "ticketTypeName": "一般單日票",
          "entranceType": "主入口",
          "ticketBenefits": "Night 1 全場無限暢遊三大舞台",
          "ticketRefundPolicy": "不退票",
          "ticketTypePrice": 1800,
          "totalQuantity": 1500,
          "sellBeginDate": "2025/11/16 12:00",
          "sellEndDate": "2025/12/12 23:59"
        },
        {
          "ticketTypeName": "雙日通行票",
          "entranceType": "主入口",
          "ticketBenefits": "Night 1 & Night 2 雙日無限入場，含專屬休息室使用權",
          "ticketRefundPolicy": "不退票",
          "ticketTypePrice": 3000,
          "totalQuantity": 500,
          "sellBeginDate": "2025/10/15 12:00",
          "sellEndDate": "2025/12/12 23:59"
        }
      ]
    },
    {
      "sessionDate": "2025/12/14",
      "sessionStart": "20:00",
      "sessionEnd": "06:00",
      "sessionTitle": "Night 2 — HOUSE & AMBIENT",
      "imgSeattable": "<座位圖暫存 URL>",
      "ticketTypes": [
        {
          "ticketTypeName": "一般單日票",
          "entranceType": "主入口",
          "ticketBenefits": "Night 2 全場無限暢遊三大舞台",
          "ticketRefundPolicy": "不退票",
          "ticketTypePrice": 1800,
          "totalQuantity": 1500,
          "sellBeginDate": "2025/11/16 12:00",
          "sellEndDate": "2025/12/13 23:59"
        }
      ]
    }
  ]
}
```

---

> 以上四個情境提供不同音樂類型、不同場地規模與票種結構的完整範例。實際使用時，請將 `organizationId`、`venueId`、`locationTagId`、`musicTagId` 替換為查詢 API 取得的真實 ID，並將 `imgBanner` 與 `imgSeattable` 替換為上傳後取得的暫存 URL。
