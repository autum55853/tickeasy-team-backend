# 如何成為 Tickeasy 舉辦方

本文件說明一般使用者如何透過 Tickeasy API 完成帳號驗證、建立主辦組織，正式成為可舉辦活動的舉辦方。

## 目錄

1. [流程總覽](#1-流程總覽)
2. [步驟一：註冊帳號](#2-步驟一註冊帳號)
3. [步驟二：驗證 Email](#3-步驟二驗證-email)
4. [步驟三：登入取得 Token](#4-步驟三登入取得-token)
5. [步驟四：建立主辦組織](#5-步驟四建立主辦組織)
6. [常見錯誤排查](#6-常見錯誤排查)
7. [完成後的下一步](#7-完成後的下一步)

---

## 1. 流程總覽

```
註冊帳號 → 驗證 Email → 登入 → 建立組織 → 成為舉辦方
```

| 步驟 | API | 是否需要認證 |
|------|-----|------------|
| 註冊帳號 | `POST /api/v1/auth/register` | 否 |
| 驗證 Email | `POST /api/v1/auth/verify-email` | 否 |
| 登入 | `POST /api/v1/auth/login` | 否 |
| 建立組織 | `POST /api/v1/organizations` | ✅ 需要 JWT |

> **重要：** Email 驗證是成為舉辦方的必要條件。未驗證的帳號呼叫建立組織 API 會回傳 `403 Forbidden`。

---

## 2. 步驟一：註冊帳號

```
POST /api/v1/auth/register
Content-Type: application/json
```

**Request Body：**

```json
{
  "name": "王小明",
  "email": "contact@example.com",
  "password": "MyPassword123!"
}
```

| 欄位 | 必填 | 說明 |
|------|------|------|
| `name` | ✅ | 使用者姓名 |
| `email` | ✅ | 登入用 Email（全系統唯一） |
| `password` | ✅ | 密碼（建議含大小寫字母與數字） |

**成功回應（HTTP 201）：**

```json
{
  "status": "success",
  "message": "帳號註冊成功，請查收驗證信",
  "data": null
}
```

系統會自動寄送驗證信至填寫的 Email，請前往信箱收取。

---

## 3. 步驟二：驗證 Email

開啟收到的驗證信，取得驗證碼（或點擊信中連結自動完成），再呼叫以下 API：

```
POST /api/v1/auth/verify-email
Content-Type: application/json
```

**Request Body：**

```json
{
  "email": "contact@example.com",
  "token": "<驗證信中的驗證碼>"
}
```

**成功回應：**

```json
{
  "status": "success",
  "message": "Email 驗證成功",
  "data": null
}
```

驗證成功後，帳號即具備建立組織的資格。

> **若未收到驗證信：** 請確認是否誤入垃圾郵件資料夾。如需重新發送，可呼叫 `POST /api/v1/auth/resend-verification`。

---

## 4. 步驟三：登入取得 Token

```
POST /api/v1/auth/login
Content-Type: application/json
```

**Request Body：**

```json
{
  "email": "contact@example.com",
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
      "email": "contact@example.com",
      "isEmailVerified": true
    }
  }
}
```

記錄回傳的 `token`，後續所有需認證的 API 都必須帶入此 Token。

**認證 Header 格式：**

```
Authorization: Bearer <token>
```

> **Token 有效期限為 7 天**，過期後需重新登入。

---

## 5. 步驟四：建立主辦組織

完成帳號驗證並取得 Token 後，即可建立主辦組織。

```
POST /api/v1/organizations
Authorization: Bearer <token>
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
| `orgName` | ✅ | 組織名稱（全系統唯一，不可與其他組織重複） |
| `orgAddress` | ✅ | 組織地址 |
| `orgMail` | ❌ | 主辦方聯絡信箱 |
| `orgContact` | ❌ | 聯絡人姓名 |
| `orgMobile` | ❌ | 手機號碼 |
| `orgPhone` | ❌ | 市話 |
| `orgWebsite` | ❌ | 官方網站 |

**成功回應（HTTP 201）：**

```json
{
  "status": "success",
  "message": "創建組織成功",
  "data": {
    "organization": {
      "organizationId": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
      "orgName": "星聲音樂工作室",
      "orgAddress": "台北市信義區松壽路 9 號",
      "orgMail": "contact@starvoice.tw",
      "orgContact": "王小明",
      "orgMobile": "0912-345-678",
      "orgPhone": "02-2720-0000",
      "orgWebsite": "https://starvoice.tw",
      "createdAt": "2025-08-01T10:00:00.000Z"
    }
  }
}
```

**請記錄 `organizationId`**，後續建立演唱會時需要填入此值。

---

## 6. 常見錯誤排查

| 錯誤訊息 | HTTP 狀態碼 | 原因 | 解決方式 |
|---------|------------|------|---------|
| `Email 未驗證` | 403 | 帳號尚未完成 Email 驗證 | 先完成步驟二的 Email 驗證 |
| `組織名稱已存在` | 400 | `orgName` 與其他組織重複 | 更換為不重複的組織名稱 |
| `未授權` / `invalid token` | 401 | Token 未帶入或已過期 | 重新登入取得新 Token |
| `Token 格式錯誤` | 401 | `Authorization` Header 格式不正確 | 確認格式為 `Bearer <token>`，中間有空格 |

---

## 7. 完成後的下一步

成功建立組織後，即正式成為 Tickeasy 舉辦方，可開始舉辦活動。

**後續流程：**

- 參考 [主辦方建立演唱會操作指南](./organizer-concert-creation-guide.md) 建立第一場演唱會
- 從步驟三開始，填入已取得的 `organizationId` 即可

**快速操作清單：**

```
□ 1. POST /api/v1/auth/register       → 註冊帳號
□ 2. POST /api/v1/auth/verify-email   → 驗證 Email
□ 3. POST /api/v1/auth/login          → 取得 JWT Token
□ 4. POST /api/v1/organizations       → 建立主辦組織，取得 organizationId
```
