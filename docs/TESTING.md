# TESTING.md

## 測試框架

- **Jest** + **Supertest**
- 設定檔：`jest.config.*`（需確認專案中的設定）

## 執行測試

```bash
npm run test          # 執行所有測試
npm run test -- --watch      # 監看模式
npm run test -- --coverage   # 含覆蓋率報告
```

## 測試檔案

目前專案尚未建立測試檔案。建議測試目錄結構：

```
tests/
├── auth.test.ts          # 認證 API 整合測試
├── concert.test.ts       # 演唱會 API 整合測試
├── organization.test.ts  # 組織 API 整合測試
├── user.test.ts          # 用戶 API 整合測試
└── helpers/
    ├── setup.ts          # 測試資料庫連線設定
    └── factories.ts      # 測試資料工廠函式
```

## 撰寫新測試

### 整合測試範例（Supertest）

```typescript
import request from 'supertest';
import app from '../app.js';
import { AppDataSource } from '../config/database.js';

beforeAll(async () => {
  await AppDataSource.initialize();
});

afterAll(async () => {
  await AppDataSource.destroy();
});

describe('POST /api/v1/auth/register', () => {
  it('成功註冊', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'test@example.com', password: 'Test1234', name: '測試用戶' });
    
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('success');
    expect(res.body.data.token).toBeDefined();
  });

  it('缺少必填欄位時回傳 400', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'test@example.com' });
    
    expect(res.status).toBe(400);
    expect(res.body.status).toBe('failed');
  });
});
```

### 需要認證的端點

```typescript
// 先登入取得 token
const loginRes = await request(app)
  .post('/api/v1/auth/login')
  .send({ email: 'test@example.com', password: 'Test1234' });
const token = loginRes.body.data.token;

// 使用 token 呼叫需要認證的端點
const res = await request(app)
  .get('/api/v1/users/profile')
  .set('Authorization', `Bearer ${token}`);
```

## 常見陷阱

1. **ESM 模組問題**：Jest 預設不支援 ESM，需在 `jest.config` 中設定 `transform` 或使用 `ts-jest`
2. **資料庫狀態污染**：整合測試需在每個測試後清理資料，或使用 transaction rollback
3. **Email 發送**：測試環境應 mock Nodemailer，避免發送真實郵件
4. **JWT Secret**：測試環境需設定 `JWT_SECRET` 環境變數（可在 `.env.test` 中設定）
5. **TypeORM synchronize**：測試資料庫應使用獨立的測試 DB，`synchronize: true` 在測試環境可接受但 production 絕對禁止

## 測試原則

- 整合測試優先於單元測試（避免 mock 導致與真實行為不符）
- 每個 API 端點至少測試：成功路徑、必填欄位缺少、認證失敗
- 邊界條件：欄位長度上下限、日期格式錯誤、重複資料衝突
