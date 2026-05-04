# Tickeasy API 完整文檔

## 基本資訊

### Base URL
- **生產環境**: `https://tickeasy-team-backend.onrender.com`
- **開發環境**: `http://localhost:3000`

### API 版本
當前版本：`v1`

所有 API 端點都以 `/api/v1` 為前綴。

### 認證方式
大部分 API 需要 JWT 認證。請在請求標頭中包含：
```
Authorization: Bearer {your_jwt_token}
```

### 錯誤回應格式
所有錯誤回應都遵循以下格式：
```json
{
  "status": "error",
  "message": "錯誤描述",
  "error": {
    "code": "ERROR_CODE",
    "details": {}
  }
}
```

## API 端點詳細說明

### 1. 認證相關 API (`/api/v1/auth`)

#### 1.1 用戶註冊
- **Method**: `POST`
- **Path**: `/api/v1/auth/register`
- **需要認證**: 否
- **請求內容**:
  ```json
  {
    "email": "user@example.com",
    "password": "password123",
    "name": "John Doe",
    "nickname": "Johnny",
    "phone": "0912345678",
    "birthday": "1990-01-01"
  }
  ```

#### 1.2 用戶登入
- **Method**: `POST`
- **Path**: `/api/v1/auth/login`
- **需要認證**: 否
- **請求內容**:
  ```json
  {
    "email": "user@example.com",
    "password": "password123"
  }
  ```

#### 1.3 驗證電子郵件
- **Method**: `POST`
- **Path**: `/api/v1/auth/verify-email`
- **需要認證**: 否
- **請求內容**:
  ```json
  {
    "email": "user@example.com",
    "code": "123456"
  }
  ```

#### 1.4 重新發送驗證碼
- **Method**: `POST`
- **Path**: `/api/v1/auth/resend-verification`
- **需要認證**: 否
- **請求內容**:
  ```json
  {
    "email": "user@example.com"
  }
  ```

#### 1.5 請求密碼重置
- **Method**: `POST`
- **Path**: `/api/v1/auth/request-password-reset`
- **需要認證**: 否
- **請求內容**:
  ```json
  {
    "email": "user@example.com"
  }
  ```

#### 1.6 重置密碼
- **Method**: `POST`
- **Path**: `/api/v1/auth/reset-password`
- **需要認證**: 否
- **請求內容**:
  ```json
  {
    "email": "user@example.com",
    "code": "123456",
    "newPassword": "newpassword123"
  }
  ```

#### 1.7 Google OAuth 登入
- **Method**: `GET`
- **Path**: `/api/v1/auth/google`
- **需要認證**: 否

#### 1.8 Google OAuth 回調
- **Method**: `GET`
- **Path**: `/api/v1/auth/google/callback`
- **需要認證**: 否

#### 1.9 更改密碼
- **Method**: `POST`
- **Path**: `/api/v1/auth/change-password`
- **需要認證**: 是
- **請求內容**:
  ```json
  {
    "oldPassword": "oldpassword123",
    "newPassword": "newpassword123"
  }
  ```

### 2. 用戶相關 API (`/api/v1/users`)

#### 2.1 獲取用戶資料
- **Method**: `GET`
- **Path**: `/api/v1/users/profile`
- **需要認證**: 是

#### 2.2 更新用戶資料
- **Method**: `PUT`
- **Path**: `/api/v1/users/profile`
- **需要認證**: 是
- **請求內容**:
  ```json
  {
    "name": "Jane Doe",
    "nickname": "Jane",
    "phone": "0987654321",
    "birthday": "1990-01-01",
    "gender": "女",
    "address": "台北市信義區",
    "country": "台灣",
    "preferredRegions": ["北部", "中部"],
    "preferredEventTypes": ["流行", "搖滾"]
  }
  ```

#### 2.3 獲取地區選項
- **Method**: `GET`
- **Path**: `/api/v1/users/profile/regions`
- **需要認證**: 否

#### 2.4 獲取活動類型選項
- **Method**: `GET`
- **Path**: `/api/v1/users/profile/event-types`
- **需要認證**: 否

#### 2.5 更新用戶角色
- **Method**: `PATCH`
- **Path**: `/api/v1/users/:id/role`
- **需要認證**: 是 (管理員)
- **請求內容**:
  ```json
  {
    "role": "admin"
  }
  ```

#### 2.6 獲取用戶訂單列表
- **Method**: `GET`
- **Path**: `/api/v1/users/orders`
- **需要認證**: 是

#### 2.7 獲取票券詳情
- **Method**: `GET`
- **Path**: `/api/v1/users/ticket/:ticketId`
- **需要認證**: 是

### 3. 組織相關 API (`/api/v1/organizations`)

#### 3.1 獲取所有組織
- **Method**: `GET`
- **Path**: `/api/v1/organizations`
- **需要認證**: 是

#### 3.2 獲取組織詳情
- **Method**: `GET`
- **Path**: `/api/v1/organizations/:organizationId`
- **需要認證**: 是

#### 3.3 創建組織
- **Method**: `POST`
- **Path**: `/api/v1/organizations`
- **需要認證**: 是
- **請求內容**:
  ```json
  {
    "orgName": "組織名稱",
    "orgAddress": "組織地址",
    "orgMail": "org@example.com",
    "orgContact": "聯絡方式",
    "orgMobile": "0912345678",
    "orgPhone": "02-12345678",
    "orgWebsite": "https://example.com"
  }
  ```

#### 3.4 更新組織
- **Method**: `PUT`
- **Path**: `/api/v1/organizations/:organizationId`
- **需要認證**: 是

#### 3.5 刪除組織
- **Method**: `DELETE`
- **Path**: `/api/v1/organizations/:organizationId`
- **需要認證**: 是

#### 3.6 獲取組織的演唱會列表
- **Method**: `GET`
- **Path**: `/api/v1/organizations/:organizationId/concerts`
- **需要認證**: 是
- **查詢參數**:
  - `status`: 狀態篩選
  - `page`: 頁碼
  - `limit`: 每頁數量
  - `sort`: 排序方式

### 4. 演唱會相關 API (`/api/v1/concerts`)

#### 4.1 獲取演唱會列表
- **Method**: `GET`
- **Path**: `/api/v1/concerts`
- **需要認證**: 否
- **查詢參數**:
  - `page`: 頁碼
  - `limit`: 每頁數量
  - `status`: 狀態篩選

#### 4.2 創建演唱會
- **Method**: `POST`
- **Path**: `/api/v1/concerts`
- **需要認證**: 是
- **請求內容**:
  ```json
  {
    "organizationId": "uuid",
    "venueId": "uuid",
    "locationTagId": "uuid",
    "musicTagId": "uuid",
    "conTitle": "演唱會名稱",
    "conIntroduction": "演唱會描述",
    "conLocation": "演唱會地點",
    "conAddress": "演唱會地址",
    "eventStartDate": "2024-06-01T19:00:00Z",
    "eventEndDate": "2024-06-01T22:00:00Z",
    "imgBanner": "https://example.com/banner.jpg",
    "ticketPurchaseMethod": "購票方式",
    "precautions": "注意事項",
    "refundPolicy": "退票政策",
    "conInfoStatus": "draft",
    "sessions": [
      {
        "sessionTitle": "場次名稱",
        "sessionDate": "2024-06-01",
        "sessionStart": "19:00",
        "sessionEnd": "22:00",
        "imgSeattable": "https://example.com/seattable.jpg",
        "ticketTypes": [
          {
            "ticketTypeName": "VIP票",
            "entranceType": "正門",
            "ticketBenefits": "VIP專屬福利",
            "ticketRefundPolicy": "退票政策",
            "ticketTypePrice": 5000,
            "totalQuantity": 100,
            "sellBeginDate": "2024-05-01T00:00:00Z",
            "sellEndDate": "2024-05-31T23:59:59Z"
          }
        ]
      }
    ]
  }
  ```

#### 4.3 更新演唱會
- **Method**: `PUT`
- **Path**: `/api/v1/concerts/:concertId`
- **需要認證**: 是

#### 4.4 獲取演唱會詳情
- **Method**: `GET`
- **Path**: `/api/v1/concerts/:concertId`
- **需要認證**: 否

#### 4.5 搜尋演唱會
- **Method**: `GET`
- **Path**: `/api/v1/concerts/search`
- **需要認證**: 否
- **查詢參數**:
  - `keyword`: 搜尋關鍵字
  - `locationTagId`: 地區標籤ID
  - `musicTagId`: 音樂標籤ID
  - `startDate`: 開始日期
  - `endDate`: 結束日期
  - `page`: 頁碼
  - `perPage`: 每頁數量
  - `sortedBy`: 排序方式

#### 4.6 獲取熱門演唱會
- **Method**: `GET`
- **Path**: `/api/v1/concerts/popular`
- **需要認證**: 否
- **查詢參數**:
  - `take`: 獲取數量

#### 4.7 獲取所有場地
- **Method**: `GET`
- **Path**: `/api/v1/concerts/venues`
- **需要認證**: 否

#### 4.8 獲取地區標籤
- **Method**: `GET`
- **Path**: `/api/v1/concerts/location-tags`
- **需要認證**: 否

#### 4.9 獲取音樂標籤
- **Method**: `GET`
- **Path**: `/api/v1/concerts/music-tags`
- **需要認證**: 否

#### 4.10 獲取首頁banner演唱會
- **Method**: `GET`
- **Path**: `/api/v1/concerts/banners`
- **需要認證**: 否

#### 4.11 檢查演唱會標題是否重複
- **Method**: `GET`
- **Path**: `/api/v1/concerts/check-title`
- **需要認證**: 否
- **查詢參數**:
  - `conTitle`: 演唱會標題

#### 4.12 提交演唱會審核
- **Method**: `PUT`
- **Path**: `/api/v1/concerts/:concertId/submit`
- **需要認證**: 是

#### 4.13 增加瀏覽次數
- **Method**: `PATCH`
- **Path**: `/api/v1/concerts/:concertId/visit`
- **需要認證**: 否

#### 4.14 設定推廣權重
- **Method**: `PATCH`
- **Path**: `/api/v1/concerts/:concertId/promotion`
- **需要認證**: 是
- **請求內容**:
  ```json
  {
    "promotion": 10
  }
  ```

#### 4.15 軟刪除演唱會
- **Method**: `PATCH`
- **Path**: `/api/v1/concerts/:concertId/cancel`
- **需要認證**: 是

#### 4.16 複製演唱會
- **Method**: `POST`
- **Path**: `/api/v1/concerts/:concertId/duplicate`
- **需要認證**: 是

#### 4.17 獲取演唱會審核記錄
- **Method**: `GET`
- **Path**: `/api/v1/concerts/:concertId/reviews`
- **需要認證**: 是

#### 4.18 手動審核演唱會
- **Method**: `POST`
- **Path**: `/api/v1/concerts/:concertId/manual-review`
- **需要認證**: 是 (管理員)
- **請求內容**:
  ```json
  {
    "reviewStatus": "approved",
    "reviewerNote": "審核意見"
  }
  ```

#### 4.19 獲取演唱會場次
- **Method**: `GET`
- **Path**: `/api/v1/concerts/:concertId/sessions`
- **需要認證**: 否

### 5. 票務相關 API (`/api/v1/ticket`)

#### 5.1 獲取場次票種
- **Method**: `GET`
- **Path**: `/api/v1/ticket/:concertSessionId`
- **需要認證**: 否

#### 5.2 驗票
- **Method**: `POST`
- **Path**: `/api/v1/ticket/verify`
- **需要認證**: 是
- **請求內容**:
  ```json
  {
    "qrCode": "TICKEASY|userId|orderId"
  }
  ```

### 6. 訂單相關 API (`/api/v1/orders`)

#### 6.1 創建訂單
- **Method**: `POST`
- **Path**: `/api/v1/orders`
- **需要認證**: 是
- **請求內容**:
  ```json
  {
    "ticketTypeId": "uuid",
    "purchaserName": "購買者姓名",
    "purchaserEmail": "purchaser@example.com",
    "purchaserPhone": "0912345678"
  }
  ```

#### 6.2 獲取訂單詳情
- **Method**: `GET`
- **Path**: `/api/v1/orders/:orderId`
- **需要認證**: 是

#### 6.3 訂單退款
- **Method**: `POST`
- **Path**: `/api/v1/orders/:orderId/refund`
- **需要認證**: 是
- **請求內容**:
  ```json
  {
    "orderId": "uuid"
  }
  ```

### 7. 場次相關 API (`/api/v1/sessions`)

#### 7.1 獲取場次檢票紀錄
- **Method**: `GET`
- **Path**: `/api/v1/sessions/:sessionId/check-inused`
- **需要認證**: 是

### 8. 支付相關 API (`/api/v1/payments`)

#### 8.1 獲取ECPay支付頁面
- **Method**: `GET`
- **Path**: `/api/v1/payments/:orderId`
- **需要認證**: 是

#### 8.2 ECPay支付回調
- **Method**: `POST`
- **Path**: `/api/v1/payments/return`
- **需要認證**: 否

### 9. 知識庫相關 API (`/api/v1/knowledge-base`)

#### 9.1 健康檢查
- **Method**: `GET`
- **Path**: `/api/v1/knowledge-base/health`
- **需要認證**: 否

#### 9.2 語義搜尋
- **Method**: `GET`
- **Path**: `/api/v1/knowledge-base/search`
- **需要認證**: 否
- **查詢參數**:
  - `q`: 搜尋查詢 (必需)
  - `limit`: 限制數量 (1-50)
  - `threshold`: 相似度閾值 (0-1)
  - `categories`: 分類篩選

#### 9.3 獲取查詢建議
- **Method**: `GET`
- **Path**: `/api/v1/knowledge-base/suggestions`
- **需要認證**: 否
- **查詢參數**:
  - `q`: 查詢參數 (必需)
  - `limit`: 限制數量 (1-10)

#### 9.4 獲取知識庫統計
- **Method**: `GET`
- **Path**: `/api/v1/knowledge-base/stats`
- **需要認證**: 否

#### 9.5 檢查嵌入服務狀態
- **Method**: `GET`
- **Path**: `/api/v1/knowledge-base/embedding-status`
- **需要認證**: 否

#### 9.6 測試語義搜尋
- **Method**: `POST`
- **Path**: `/api/v1/knowledge-base/test-search`
- **需要認證**: 否
- **請求內容**:
  ```json
  {
    "query1": "第一個測試查詢",
    "query2": "第二個測試查詢"
  }
  ```

#### 9.7 獲取知識庫列表
- **Method**: `GET`
- **Path**: `/api/v1/knowledge-base`
- **需要認證**: 是
- **查詢參數**:
  - `page`: 頁碼
  - `limit`: 每頁數量 (1-100)
  - `category`: 分類篩選
  - `search`: 搜尋關鍵字
  - `includeInactive`: 包含非活躍項目

#### 9.8 獲取知識庫項目詳情
- **Method**: `GET`
- **Path**: `/api/v1/knowledge-base/:id`
- **需要認證**: 是

#### 9.9 尋找相似內容
- **Method**: `GET`
- **Path**: `/api/v1/knowledge-base/:id/similar`
- **需要認證**: 是
- **查詢參數**:
  - `limit`: 限制數量 (1-20)

#### 9.10 創建知識庫項目
- **Method**: `POST`
- **Path**: `/api/v1/knowledge-base`
- **需要認證**: 是 (管理員)
- **請求內容**:
  ```json
  {
    "title": "問題標題",
    "content": "問題內容",
    "category": "常見問題",
    "tags": ["票務", "退票"],
    "isActive": true
  }
  ```

#### 9.11 更新知識庫項目
- **Method**: `PUT`
- **Path**: `/api/v1/knowledge-base/:id`
- **需要認證**: 是 (管理員)

#### 9.12 刪除知識庫項目
- **Method**: `DELETE`
- **Path**: `/api/v1/knowledge-base/:id`
- **需要認證**: 是 (管理員)

#### 9.13 批量更新嵌入向量
- **Method**: `POST`
- **Path**: `/api/v1/knowledge-base/embeddings/update`
- **需要認證**: 是 (管理員)

### 10. 智能客服 API (`/api/v1/smart-reply`)

#### 10.1 發送聊天訊息
- **Method**: `POST`
- **Path**: `/api/v1/smart-reply/chat`
- **需要認證**: 是
- **請求內容**:
  ```json
  {
    "message": "用戶訊息",
    "sessionId": "uuid"
  }
  ```

### 11. 檔案上傳 API (`/api/v1/upload`)

#### 11.1 上傳圖片
- **Method**: `POST`
- **Path**: `/api/v1/upload/image`
- **需要認證**: 是
- **請求格式**: `multipart/form-data`
- **請求參數**:
  - `file`: 圖片檔案 (必需，最大 5MB)
  - `uploadContext`: 上傳用途
  - `targetId`: 目標 ID
  - `isTemp`: 是否為暫存檔案

#### 11.2 刪除圖片
- **Method**: `DELETE`
- **Path**: `/api/v1/upload/image`
- **需要認證**: 是
- **請求內容**:
  ```json
  {
    "imageUrl": "https://example.com/image.jpg"
  }
  ```

### 12. 健康檢查 API (`/api/v1/health`)

#### 12.1 健康檢查
- **Method**: `GET`
- **Path**: `/api/v1/health`
- **需要認證**: 否

## 重要說明

### 密碼要求
- 最少 8 個字符
- 至少包含一個字母（大寫或小寫）
- 至少包含一個數字
- 只能包含字母和數字（不允許特殊字符）

### HTTP 狀態碼
| 狀態碼 | 說明 |
|--------|------|
| 200 | 成功 |
| 201 | 創建成功 |
| 400 | 錯誤的請求 |
| 401 | 未認證 |
| 403 | 禁止訪問 |
| 404 | 找不到資源 |
| 409 | 衝突 |
| 422 | 無法處理的實體 |
| 429 | 請求過於頻繁 |
| 500 | 伺服器內部錯誤 |

### 分頁

#### 分頁查詢參數
- `page`: 頁碼 (從 1 開始，預設: 1)
- `limit`: 每頁項目數 (預設: 10，最大: 100)
- `perPage`: 每頁項目數 (某些端點使用，與 limit 同義)
- `take`: 獲取數量 (用於特定端點，如熱門內容)
- `sort`: 排序方式 (格式: `field:direction`，如 `createdAt:DESC`)
- `sortedBy`: 排序方式 (某些端點使用，如 `newToOld`, `oldToNew`)

#### 分頁回應格式
支援分頁的端點會在回應中包含分頁資訊：

**格式一**（標準格式）：
```json
{
  "status": "success",
  "message": "獲取成功",
  "data": {
    "items": [...],
    "pagination": {
      "page": 1,
      "limit": 10,
      "total": 100,
      "totalPages": 10,
      "hasNext": true,
      "hasPrev": false
    }
  }
}
```

**格式二**（演唱會搜尋等）：
```json
{
  "status": "success",
  "message": "成功取得搜尋資料",
  "data": [...],
  "page": 1,
  "perPage": 10,
  "count": 100,
  "totalPages": 10,
  "sortedBy": "newToOld"
}
```

**格式三**（組織演唱會列表等）：
```json
{
  "status": "success",
  "message": "成功獲取音樂會列表",
  "data": {
    "concerts": [...],
    "pagination": {
      "totalCount": 100,
      "totalPages": 10,
      "currentPage": 1,
      "limit": 10
    }
  }
}
```

### 數據枚舉值

#### 訂單狀態 (OrderStatus)
- `held`: 保留中 (鎖定15分鐘)
- `paid`: 已付款
- `cancelled`: 已取消
- `refunded`: 已退款

#### 演唱會狀態 (ConInfoStatus)
- `draft`: 草稿
- `reviewing`: 審核中
- `published`: 已發布
- `rejected`: 已退回

#### 審核狀態 (ReviewStatus)
- `pending`: 待審核
- `approved`: 審核通過
- `rejected`: 審核退回

#### 票券狀態 (TicketStatus)
- `purchased`: 已購買
- `used`: 已使用
- `cancelled`: 已取消

#### 支付狀態 (PaymentStatus)
- `pending`: 待處理
- `completed`: 已完成
- `failed`: 失敗
- `refunded`: 已退款

#### 用戶角色 (UserRole)
- `user`: 一般用戶
- `admin`: 管理員
- `superuser`: 超級用戶

#### 性別選項
- `男`: 男性
- `女`: 女性
- `其他`: 其他

### 排序參數詳細說明

#### 演唱會排序欄位
- `eventStartDate`: 活動開始日期
- `createdAt`: 創建時間
- `updatedAt`: 更新時間
- `visitCount`: 瀏覽次數
- `promotion`: 推廣權重

#### 排序方向
- `ASC`: 升序
- `DESC`: 降序

#### 排序格式
- 單一排序：`sort=createdAt:DESC`
- 多重排序：`sort=promotion:ASC,visitCount:DESC`

### 篩選參數

#### 演唱會篩選
- `status`: 演唱會狀態 (`draft`, `reviewing`, `published`, `rejected`)
- `locationTagId`: 地區標籤ID
- `musicTagId`: 音樂標籤ID
- `organizationId`: 組織ID
- `startDate`: 開始日期篩選
- `endDate`: 結束日期篩選
- `keyword`: 關鍵字搜尋

#### 訂單篩選
- `status`: 訂單狀態 (`held`, `paid`, `cancelled`, `refunded`)

#### 知識庫篩選
- `category`: 分類篩選
- `search`: 搜尋關鍵字
- `includeInactive`: 包含非活躍項目 (boolean)
