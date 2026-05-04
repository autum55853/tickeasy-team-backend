# 排程器邏輯完整指南

## **概述**

演唱會後台系統設計了一套排程機制，能夠根據場次結束時間，自動將演唱會狀態從 published 更新為 finished，確保前台顯示資料的時效性與準確性。

### **核心設計理念**

- **狀態自動化**：無須人工操作，系統每日自動執行狀態檢查
- **條件明確**：僅當所有場次皆結束，才標記為 finished
- **可測試可擴充**：支援測試模式（每秒排程）、正式模式（每日排程）
- **資料一致性**：更新狀態前再次確認所有場次皆已結束

---

## **1. 演唱會狀態自動更新邏輯**

### **流程概述**

```
系統啟動 → 註冊每日排程 → 每日執行一次 → 檢查演唱會場次 → 所有場次結束 → 更新演唱會狀態為 finishedL
```

### **詳細步驟**

#### **步驟 1: 系統啟動後初始化排程**

```bash
// bin/server.ts
AppDataSource.initialize()
  .then(async () => {
    console.log('資料庫已連線');
    await scheduleConcertFinishJobs(); // 啟動排程任務
  })
  .catch((err) => {
    console.error('資料庫連線失敗:', err);
  });
```

#### **步驟 2: 建立每日排程任務**

```bash
// scheduler/concertScheduler.ts
import schedule from 'node-schedule';

export async function scheduleConcertFinishJobs() {
  schedule.scheduleJob('10 0 * * *', async () => {
    console.log('每日排程執行中：檢查演唱會是否結束');
    // 執行邏輯見下方
  });

  console.log('每天 00:10 執行一次');
}

```

#### **步驟 3: 每日任務檢查與狀態更新**

```typescript
const concerts = await concertRepo.find({
  where: { conInfoStatus: 'published' },
});

for (const concert of concerts) {
  const sessions = await sessionRepo.find({
    where: { concertId: concert.concertId },
  });

  const allEnded = sessions.every((s) => {
    const endTime = new Date(`${s.sessionDate}T${s.sessionEnd}`);
    return endTime < new Date();
  });

  if (allEnded) {
    concert.conInfoStatus = 'finished';
    await concertRepo.save(concert);
    console.log(`演唱會 ${concert.concertId} 已結束，自動更新為 finished`);
  }
}
```

---

## **2. 測試模式（每秒排程）**

### **用途說明**

在開發或測試階段，可改用「每秒排程」模式，以立即觀察演唱會狀態是否正確更新。

#### **設定方式**

```typescript
// 將 schedule 設為每秒執行
schedule.scheduleJob('* * * * * *', async () => {
  console.log('🔁 測試用：每秒執行演唱會狀態更新檢查');
  // 檢查邏
  //
  // 輯同上
});
```

---

## **3. 錯誤處理與日誌紀錄**

### **錯誤處理策略**

- 若資料庫查詢失敗 → 中斷排程本次執行，並記錄錯誤

- 若某演唱會場次格式錯誤或日期解析失敗 → 該筆略過，其他演唱會照常處理

### **日誌紀錄內容(範例)**

| 時間     | 內容                       |
| -------- | -------------------------- |
| 00:10:00 | 開始執行狀態更新任務       |
| 00:10:01 | 檢查演唱會 XXX             |
| 00:10:02 | 更新演唱會 XXX 為 finished |
| 00:10:03 | 發現錯誤：Session 欄位錯誤 |
| 00:10:03 | 本次排程處理完畢           |
