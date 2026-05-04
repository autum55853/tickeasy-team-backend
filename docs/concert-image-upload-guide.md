# 演唱會圖片上傳邏輯完整指南

## **概述**

演唱會圖片上傳系統採用「暫存 → 移動」的兩階段處理模式，確保圖片處理的完整性和一致性。

### **核心設計理念**

- **暫存優先**：所有圖片先上傳到暫存目錄
- **原子操作**：圖片處理失敗時自動回滾
- **路徑標準化**：統一的圖片儲存路徑規範
- **自動清理**：定期清理過期暫存圖片

---

## **1. 發布演唱會 (createConcert) 的圖片邏輯**

### **流程概述**

```
用戶上傳圖片 → 暫存到 temp 目錄 → 建立演唱會 → 移動圖片到正式位置 → 更新資料庫 URL
```

### **詳細步驟**

#### **步驟 1: 上傳暫存圖片**

##### 上傳橫幅圖片

```bash
POST /api/v1/upload/image
Content-Type: multipart/form-data

Form data:
- file: [圖片檔案]
- uploadContext: CONCERT_BANNER
- 不提供 targetId (自動判斷為暫存上傳)

# 成功回應
{
  "status": "success",
  "message": "圖片暫存成功",
  "data": "https://xxx.supabase.co/storage/v1/object/public/concert/temp/concert_banner/uuid-123.webp"
}

# 錯誤回應範例
{
  "status": "error",
  "message": "不支援的檔案類型，僅接受 JPEG, PNG, GIF 或 WebP 格式"
}
```

##### 上傳座位表圖片

```bash
POST /api/v1/upload/image
Content-Type: multipart/form-data

Form data:
- file: [圖片檔案]
- uploadContext: CONCERT_SEATING_TABLE
- 不提供 targetId (自動判斷為暫存上傳)

# 成功回應
{
  "status": "success",
  "message": "圖片暫存成功",
  "data": "https://xxx.supabase.co/storage/v1/object/public/concert/temp/concert_seating_table/uuid-456.webp"
}
```

#### **步驟 2: 建立演唱會**

```bash
POST /api/v1/concerts

{
  "organizationId": "org-uuid",
  "venueId": "venue-uuid",
  "locationTagId": "location-uuid",
  "musicTagId": "music-uuid",
  "title": "五月天 2024 台北演唱會",
  "introduction": "演唱會介紹...",
  "location": "台北小巨蛋",
  "address": "台北市松山區南京東路四段2號",
  "eventStartDate": "2024-06-01",
  "eventEndDate": "2024-06-03",
  "imgBanner": "https://xxx.supabase.co/storage/v1/object/public/concert/temp/concert_banner/uuid-123.webp",
  "ticketPurchaseMethod": "線上購票",
  "precautions": "注意事項...",
  "refundPolicy": "退票政策...",
  "conInfoStatus": "draft",
  "sessions": [
    {
      "sessionTitle": "五月天 2024 台北站 第一場",
      "sessionDate": "2024-06-01",
      "sessionStart": "19:30",
      "sessionEnd": "22:00",
      "imgSeattable": "https://xxx.supabase.co/storage/v1/object/public/concert/temp/concert_seating_table/uuid-456.webp",
      "ticketTypes": [
        {
          "ticketTypeName": "VIP搖滾區",
          "entranceType": "電子票",
          "ticketBenefits": "最佳視野",
          "ticketRefundPolicy": "演出前7天可退票",
          "ticketTypePrice": 3500,
          "totalQuantity": 100,
          "sellBeginDate": "2024-05-01T00:00:00Z",
          "sellEndDate": "2024-05-31T23:59:59Z"
        }
      ]
    }
  ]
}
```

#### **步驟 3: 後端處理邏輯**

```typescript
// controllers/concert.ts - createConcert 函數

// 1. 建立 Concert 記錄
const newConcert = concertRepository.create(concertData);
const savedConcert = await concertRepository.save(newConcert);

// 2. 處理橫幅圖片
if (imgBanner) {
  try {
    // 檢查是否為暫存圖片，如果是則移動到正式位置
    savedConcert.imgBanner = await concertImageService.processConcertBanner(
      imgBanner,
      savedConcert.concertId,
      savedConcert.conTitle
    );
    await concertRepository.save(savedConcert);
  } catch (error) {
    // 如果圖片處理失敗，刪除已建立的 concert 記錄
    await concertRepository.remove(savedConcert);
    throw error; // 重新拋出錯誤
  }
}

// 3. 處理每個場次的座位表圖片
for (const session of sessions) {
  const sessionEntity = sessionRepository.create({
    concert: savedConcert,
    sessionTitle: session.sessionTitle,
    sessionDate: new Date(session.sessionDate),
    sessionStart: session.sessionStart,
    sessionEnd: session.sessionEnd,
    imgSeattable: session.imgSeattable,
  });
  const savedSession = await sessionRepository.save(sessionEntity);

  if (session.imgSeattable) {
    try {
      // 檢查是否為暫存圖片，如果是則移動到正式位置
      savedSession.imgSeattable =
        await concertImageService.processConcertSeatingTable(
          session.imgSeattable,
          savedSession.sessionId,
          savedSession.sessionTitle
        );
      await sessionRepository.save(savedSession);
    } catch (error) {
      // 如果圖片處理失敗，刪除已建立的 concert 和相關 session 記錄
      await concertRepository.remove(savedConcert);
      throw error; // 重新拋出錯誤
    }
  }
}
```

#### **步驟 4: 圖片移動邏輯**

```typescript
// services/concertImageService.ts

export async function processConcertBanner(
  imgBanner: string,
  concertId: string,
  concertTitle?: string
): Promise<string> {
  if (!imgBanner) return imgBanner;

  const concertInfo = concertTitle
    ? `演唱會「${concertTitle}」(${concertId})`
    : `演唱會 ${concertId}`;

  if (imageService.isTempUrl(imgBanner)) {
    try {
      // 暫存圖片 → 移動到正式位置
      // 從: temp/concert_banner/uuid-123.webp
      // 到: concerts/{concertId}/banner.webp
      const { bucket, filePath: tempPath } =
        imageService.extractPathInfo(imgBanner);
      const officialPath = getConcertBannerPath(concertId);
      const newUrl = await imageService.moveImage(
        tempPath,
        officialPath,
        bucket
      );

      console.log(`${concertInfo} 的橫幅圖片已移動到正式位置: ${newUrl}`);
      return newUrl;
    } catch (error) {
      console.error(`移動 ${concertInfo} 的橫幅圖片失敗:`, error);

      // 根據錯誤類型提供更具體的錯誤訊息
      if (error instanceof Error) {
        if (error.message.includes('無法解析圖片 URL')) {
          throw ApiError.invalidFormat(
            `${concertInfo} 的橫幅圖片 URL：${imgBanner}`
          );
        } else if (error.message.includes('無法下載圖片')) {
          throw ApiError.notFound(`${concertInfo} 的暫存橫幅圖片，請重新上傳`);
        } else if (error.message.includes('無法上傳到新位置')) {
          throw ApiError.systemError();
        } else if (error.message.includes('Supabase 環境變數未設定')) {
          throw ApiError.systemError();
        }
      }

      throw ApiError.systemError();
    }
  } else {
    // 非暫存圖片 → 驗證 URL 有效性
    try {
      const isValidUrl = await imageService.validateImageUrl(imgBanner);
      if (!isValidUrl) {
        throw ApiError.invalidFormat(
          `${concertInfo} 的橫幅圖片 URL：${imgBanner}`
        );
      }
      console.log(`${concertInfo} 的橫幅圖片 URL 驗證通過: ${imgBanner}`);
      return imgBanner;
    } catch (error) {
      console.error(`驗證 ${concertInfo} 的橫幅圖片 URL 失敗:`, error);

      if (error instanceof ApiError) {
        throw error; // 重新拋出已經格式化的錯誤
      }

      throw ApiError.invalidFormat(`${concertInfo} 的橫幅圖片`);
    }
  }
}
```

---

## **2. 更新演唱會 (updateConcert) 的圖片邏輯**

### **流程概述**

```
用戶上傳新圖片 → 暫存到 temp 目錄 → 更新演唱會 → 移動新圖片到正式位置 → 刪除舊圖片 → 更新資料庫 URL
```

### **詳細步驟**

#### **步驟 1: 上傳新的暫存圖片 (如果需要更換圖片)**

```bash
# 上傳新的橫幅圖片
POST /api/v1/upload/image
Content-Type: multipart/form-data

Form data:
- file: [新的圖片檔案]
- uploadContext: CONCERT_BANNER
- 不提供 targetId (自動判斷為暫存上傳)

# 回應
{
  "status": "success",
  "message": "圖片暫存成功",
  "data": "https://xxx.supabase.co/storage/v1/object/public/concert/temp/concert_banner/uuid-789.webp"
}
```

#### **步驟 2: 更新演唱會**

```bash
PUT /api/v1/concerts/{concertId}

{
  "organizationId": "org-uuid",
  "venueId": "venue-uuid",
  "locationTagId": "location-uuid",
  "musicTagId": "music-uuid",
  "title": "五月天 2024 台北演唱會 (更新版)",
  "introduction": "更新的演唱會介紹...",
  "location": "台北小巨蛋",
  "address": "台北市松山區南京東路四段2號",
  "eventStartDate": "2024-06-01",
  "eventEndDate": "2024-06-03",
  // 如果要更換橫幅圖片，提供新的暫存 URL
  "imgBanner": "https://xxx.supabase.co/storage/v1/object/public/concert/temp/concert_banner/uuid-789.webp",
  "ticketPurchaseMethod": "線上購票",
  "precautions": "更新的注意事項...",
  "refundPolicy": "更新的退票政策...",
  "conInfoStatus": "draft",
  // 如果要更換座位表圖片，提供新的暫存 URL
  "sessions": [
    {
      "sessionTitle": "五月天 2024 台北站 第一場 (更新版)",
      "sessionDate": "2024-06-01",
      "sessionStart": "19:30",
      "sessionEnd": "22:00",
      "imgSeattable": "https://xxx.supabase.co/storage/v1/object/public/concert/temp/concert_seating_table/uuid-999.webp",
      "ticketTypes": [
        {
          "ticketTypeName": "VIP搖滾區",
          "entranceType": "電子票",
          "ticketBenefits": "最佳視野",
          "ticketRefundPolicy": "演出前7天可退票",
          "ticketTypePrice": 3800, // 更新價格
          "totalQuantity": 120,    // 更新數量
          "sellBeginDate": "2024-05-01T00:00:00Z",
          "sellEndDate": "2024-05-31T23:59:59Z"
        }
      ]
    }
  ]
}
```

#### **步驟 3: 後端處理邏輯**

```typescript
// controllers/concert.ts - updateConcert 函數

// 1. 查找現有演唱會
const concert = await concertRepository.findOne({ where: { concertId } });
if (!concert) {
  throw ApiError.notFound('演唱會不存在');
}

if (concert.conInfoStatus !== 'draft' && concert.conInfoStatus !== 'rejected') {
  throw ApiError.badRequest('僅能編輯草稿或被退回的演唱會');
}

// 2. 處理橫幅圖片更新（包含刪除舊圖片）
const newBannerUrl = await concertImageService.updateConcertBanner(
  imgBanner, // 新圖片 URL
  concert.imgBanner, // 舊圖片 URL
  concertId
);

// 3. 更新主資料
concert.organizationId = organizationId;
concert.venueId = venueId;
concert.locationTagId = locationTagId;
concert.musicTagId = musicTagId;
concert.conTitle = title;
concert.conIntroduction = introduction ?? '';
concert.conLocation = location ?? '';
concert.conAddress = address ?? '';
concert.eventStartDate = eventStartDate ? new Date(eventStartDate) : null;
concert.eventEndDate = eventEndDate ? new Date(eventEndDate) : null;
concert.ticketPurchaseMethod = ticketPurchaseMethod;
concert.precautions = precautions;
concert.refundPolicy = refundPolicy;
concert.conInfoStatus = conInfoStatus;
concert.imgBanner = newBannerUrl;

await concertRepository.save(concert);

// 4. 刪除並重建 sessions（包含圖片處理）
await sessionRepository.delete({ concert: { concertId } });

for (const session of sessions) {
  const sessionEntity = sessionRepository.create({
    concert,
    sessionTitle: session.sessionTitle,
    sessionDate: new Date(session.sessionDate),
    sessionStart: session.sessionStart,
    sessionEnd: session.sessionEnd,
    imgSeattable: session.imgSeattable,
  });
  const savedSession = await sessionRepository.save(sessionEntity);

  if (session.imgSeattable) {
    try {
      savedSession.imgSeattable =
        await concertImageService.processConcertSeatingTable(
          session.imgSeattable,
          savedSession.sessionId,
          savedSession.sessionTitle
        );
      await sessionRepository.save(savedSession);
    } catch (error) {
      throw error;
    }
  }
}
```

#### **步驟 4: 更新圖片邏輯**

```typescript
// services/concertImageService.ts

export async function updateConcertBanner(
  newImgBanner: string,
  oldImgBanner: string,
  concertId: string
): Promise<string> {
  // 如果沒有新圖片或圖片沒有變更，直接返回
  if (!newImgBanner || newImgBanner === oldImgBanner) {
    return newImgBanner;
  }

  // 處理新圖片（移動暫存圖片到正式位置或驗證 URL）
  const processedUrl = await processConcertBanner(newImgBanner, concertId);

  // 刪除舊圖片（如果不是暫存圖片）
  if (oldImgBanner && !imageService.isTempUrl(oldImgBanner)) {
    try {
      await imageService.deleteImageByUrl(oldImgBanner);
      console.log(`舊音樂會橫幅已刪除: ${oldImgBanner}`);
    } catch (error) {
      console.warn('刪除舊音樂會橫幅失敗:', error);
      // 不拋出錯誤，因為主要操作是更新
    }
  }

  return processedUrl;
}
```

---

## **3. 錯誤處理機制**

### **錯誤分類與處理**

#### **圖片格式錯誤 (400)**

```json
{
  "status": "error",
  "message": "演唱會「五月天 2024 台北演唱會」(concert-uuid) 的橫幅圖片 URL 格式不正確"
}
```

#### **圖片不存在錯誤 (404)**

```json
{
  "status": "error",
  "message": "找不到指定的演唱會「五月天 2024 台北演唱會」(concert-uuid) 的暫存橫幅圖片，請重新上傳"
}
```

#### **系統錯誤 (500)**

```json
{
  "status": "error",
  "message": "系統發生錯誤"
}
```

### **錯誤回滾機制**

#### **建立演唱會時圖片處理失敗**

```typescript
try {
  savedConcert.imgBanner = await concertImageService.processConcertBanner(
    imgBanner,
    savedConcert.concertId,
    savedConcert.conTitle
  );
  await concertRepository.save(savedConcert);
} catch (error) {
  // 如果圖片處理失敗，刪除已建立的 concert 記錄
  await concertRepository.remove(savedConcert);
  throw error; // 重新拋出錯誤
}
```

#### **場次圖片處理失敗**

```typescript
try {
  savedSession.imgSeattable =
    await concertImageService.processConcertSeatingTable(
      session.imgSeattable,
      savedSession.sessionId,
      savedSession.sessionTitle
    );
  await sessionRepository.save(savedSession);
} catch (error) {
  // 如果圖片處理失敗，刪除已建立的 concert 和相關 session 記錄
  await concertRepository.remove(savedConcert);
  throw error; // 重新拋出錯誤
}
```

#### **更新演唱會時圖片處理失敗**

- 拋出具體錯誤訊息，讓前端處理
- 舊圖片和資料保持不變
- 不進行回滾操作

#### **刪除舊圖片失敗**

```typescript
try {
  await imageService.deleteImageByUrl(oldImgBanner);
  console.log(`舊音樂會橫幅已刪除: ${oldImgBanner}`);
} catch (error) {
  console.warn('刪除舊音樂會橫幅失敗:', error);
  // 不拋出錯誤，因為主要操作是更新
}
```

---

## **4. 圖片路徑變化總結**

### **橫幅圖片路徑變化**

```
上傳暫存: temp/concert_banner/uuid-123.webp
↓ (移動)
正式位置: concerts/{concertId}/banner.webp

完整 URL 範例:
暫存: https://xxx.supabase.co/storage/v1/object/public/concert/temp/concert_banner/uuid-123.webp
正式: https://xxx.supabase.co/storage/v1/object/public/concert/concerts/concert-uuid/banner.webp
```

### **座位表圖片路徑變化**

```
上傳暫存: temp/concert_seating_table/uuid-456.webp
↓ (移動)
正式位置: sessions/{sessionId}/seattable.webp

完整 URL 範例:
暫存: https://xxx.supabase.co/storage/v1/object/public/concert/temp/concert_seating_table/uuid-456.webp
正式: https://xxx.supabase.co/storage/v1/object/public/concert/sessions/session-uuid/seattable.webp
```

### **路徑生成函數**

```typescript
// services/concertImageService.ts

function getConcertBannerPath(concertId: string): string {
  return `concerts/${concertId}/banner.webp`;
}

function getConcertSeatingTablePath(sessionId: string): string {
  return `sessions/${sessionId}/seattable.webp`;
}
```

---

## **5. 暫存圖片清理機制**

### **自動清理觸發**

```bash
# 保活端點會自動觸發清理
GET /api/v1/health/keep-alive

# 回應
{
  "status": "success",
  "message": "服務正常運行",
  "data": {
    "timestamp": "2024-01-15T10:30:00.000Z",
    "uptime": "2 hours 15 minutes",
    "cleanupInfo": {
      "lastCleanup": "2024-01-15T04:00:00.000Z",
      "deletedFiles": 5
    }
  }
}
```

### **清理邏輯**

```typescript
// services/storage-supabase.ts

async function cleanupTempImages(hours: number = 24): Promise<number> {
  let totalDeleted = 0;

  // 只檢查 concert bucket，因為只有它會有暫存圖片
  const bucket = 'concert';

  // 需要檢查的暫存目錄
  const tempDirs = ['temp/concert_banner', 'temp/concert_seating_table'];

  for (const tempDir of tempDirs) {
    console.log(`檢查 ${bucket}/${tempDir} 目錄...`);

    // 獲取暫存目錄下的檔案
    const { data: files, error: listError } = await supabase.storage
      .from(bucket)
      .list(tempDir, {
        sortBy: { column: 'created_at', order: 'asc' },
      });

    if (listError) {
      console.error(`獲取 ${bucket}/${tempDir} 的暫存檔案列表失敗:`, listError);
      continue;
    }

    if (!files || files.length === 0) {
      console.log(`${bucket}/${tempDir} 中沒有暫存檔案`);
      continue;
    }

    // 計算時間閾值
    const threshold = new Date();
    threshold.setHours(threshold.getHours() - hours);

    // 篩選出過期檔案
    const filesToDelete = files.filter((file) => {
      if (!file.created_at) return false;
      const createdAt = new Date(file.created_at);
      return createdAt < threshold;
    });

    if (filesToDelete.length === 0) {
      console.log(`${bucket}/${tempDir} 中沒有過期的暫存檔案`);
      continue;
    }

    // 刪除過期檔案
    const filePaths = filesToDelete.map((file) => `${tempDir}/${file.name}`);
    const { error: deleteError } = await supabase.storage
      .from(bucket)
      .remove(filePaths);

    if (deleteError) {
      console.error(`刪除 ${bucket}/${tempDir} 的暫存檔案失敗:`, deleteError);
      continue;
    }

    console.log(
      `已從 ${bucket}/${tempDir} 中刪除 ${filePaths.length} 個暫存檔案`
    );
    totalDeleted += filePaths.length;
  }

  return totalDeleted;
}
```

### **環境變數配置**

```env
# .env 檔案
CLEANUP_INTERVAL_HOURS=6    # 清理間隔（小時）
CLEANUP_AGE_HOURS=24        # 清理超過多少小時的檔案
```

---

## **6. 完整 API 範例**

### **完整的演唱會建立流程**

```bash
# 1. 上傳橫幅圖片
curl -X POST "http://localhost:3000/api/v1/upload/image" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -F "file=@banner.jpg" \
  -F "uploadContext=CONCERT_BANNER"

# 回應: { "data": "https://xxx.supabase.co/storage/v1/object/public/concert/temp/concert_banner/uuid-123.webp" }

# 2. 上傳座位表圖片
curl -X POST "http://localhost:3000/api/v1/upload/image" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -F "file=@seating.jpg" \
  -F "uploadContext=CONCERT_SEATING_TABLE"

# 回應: { "data": "https://xxx.supabase.co/storage/v1/object/public/concert/temp/concert_seating_table/uuid-456.webp" }

# 3. 建立演唱會
curl -X POST "http://localhost:3000/api/v1/concerts" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "organizationId": "org-uuid",
    "venueId": "venue-uuid",
    "locationTagId": "location-uuid",
    "musicTagId": "music-uuid",
    "title": "五月天 2024 台北演唱會",
    "introduction": "演唱會介紹...",
    "location": "台北小巨蛋",
    "address": "台北市松山區南京東路四段2號",
    "eventStartDate": "2024-06-01",
    "eventEndDate": "2024-06-03",
    "imgBanner": "https://xxx.supabase.co/storage/v1/object/public/concert/temp/concert_banner/uuid-123.webp",
    "ticketPurchaseMethod": "線上購票",
    "precautions": "注意事項...",
    "refundPolicy": "退票政策...",
    "conInfoStatus": "draft",
    "sessions": [
      {
        "sessionTitle": "五月天 2024 台北站 第一場",
        "sessionDate": "2024-06-01",
        "sessionStart": "19:30",
        "sessionEnd": "22:00",
        "imgSeattable": "https://xxx.supabase.co/storage/v1/object/public/concert/temp/concert_seating_table/uuid-456.webp",
        "ticketTypes": [
          {
            "ticketTypeName": "VIP搖滾區",
            "entranceType": "電子票",
            "ticketBenefits": "最佳視野",
            "ticketRefundPolicy": "演出前7天可退票",
            "ticketTypePrice": 3500,
            "totalQuantity": 100,
            "sellBeginDate": "2024-05-01T00:00:00Z",
            "sellEndDate": "2024-05-31T23:59:59Z"
          }
        ]
      }
    ]
  }'

# 成功回應: 演唱會建立成功，圖片已移動到正式位置
```

---

## **7. 最佳實踐建議**

### **前端開發建議**

1. **圖片上傳前驗證**：檢查檔案大小和格式
2. **顯示上傳進度**：提供良好的用戶體驗
3. **錯誤處理**：根據不同錯誤類型顯示對應訊息
4. **暫存圖片預覽**：上傳後立即顯示預覽

### **後端開發建議**

1. **原子操作**：確保圖片處理失敗時能正確回滾
2. **詳細日誌**：記錄圖片處理的每個步驟
3. **錯誤分類**：提供具體的錯誤訊息和上下文
4. **定期清理**：避免暫存圖片佔用過多儲存空間

### **運維建議**

1. **監控儲存空間**：定期檢查 Supabase Storage 使用量
2. **備份策略**：重要圖片應有備份機制
3. **效能監控**：監控圖片處理的效能指標
4. **清理日誌**：記錄暫存圖片清理的執行情況

---

這樣的設計確保了圖片處理的完整性、一致性和可靠性！
