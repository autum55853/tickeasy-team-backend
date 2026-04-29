---
paths:
  - "tests/**"
---

# 測試規則

## 測試框架

- **Jest** + **Supertest** 進行整合測試
- 整合測試優先於單元測試（避免 mock 導致與真實行為不符）
- 測試使用獨立的測試資料庫，不可污染 production / staging 資料庫

## 每個 API 端點至少測試

1. 成功路徑（Happy path）
2. 認證失敗（401 / 403）
3. 必填欄位缺少（400）
4. 業務邏輯邊界（409 重複、404 不存在）

## 測試環境設定

```typescript
// tests/helpers/setup.ts
import { AppDataSource } from '../../config/database.js';

beforeAll(async () => {
  await AppDataSource.initialize();
});

afterAll(async () => {
  await AppDataSource.destroy();
});
```

- 測試環境需在 `.env.test` 設定 `JWT_SECRET`、獨立的測試 DB 連線資訊
- Nodemailer 在測試環境必須 mock，不發送真實郵件

## 需要認證端點的測試模式

```typescript
// 先登入取得 token
const loginRes = await request(app)
  .post('/api/v1/auth/login')
  .send({ email: 'test@example.com', password: 'Test1234' });
const token = loginRes.body.data.token;

// 帶入 token 呼叫
const res = await request(app)
  .get('/api/v1/users/profile')
  .set('Authorization', `Bearer ${token}`);
```

## 資料清理

- 每個 test suite 結束後清理測試資料（使用 `afterEach` / `afterAll` 刪除或使用 transaction rollback）
- 避免測試間資料狀態互相污染

## ESM 注意事項

- Jest 預設不支援 ESM，確認 `jest.config.*` 已設定 `ts-jest` 並啟用 ESM 模式
- import 路徑使用 `.js` 副檔名（與正式程式碼相同）
- 不使用 `require()` 語法
