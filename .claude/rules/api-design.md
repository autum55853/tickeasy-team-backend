---
paths:
  - "routes/**"
  - "controllers/**"
  - "types/**"
---

# API 設計規則

## 回應格式

- 成功回應統一為 `{ status: 'success', message: string, data?: T }`
- 失敗回應統一為 `{ status: 'failed', message: string, code: string, details?: object }`
- 永遠不在 controller 內直接 `res.json({ error: ... })`，一律透過 `ApiError` 拋出

## 錯誤碼格式

- 格式：字母前綴 + 兩位序號，例如 `A06`、`D01`
- A = Auth 認證授權相關
- V = Validation 表單驗證相關
- D = Data 資料操作相關
- S = System 系統層級相關
- 新增錯誤碼前先確認 `types/api.ts` 中的 `ErrorCode` enum 是否已有對應值

## 錯誤拋出規範

```typescript
// 標準錯誤
throw ApiError.unauthorized();           // 401 A06
throw ApiError.notFound('演唱會');       // 404 D01
throw ApiError.forbidden();              // 403 A07

// 自訂錯誤
throw ApiError.create(409, '名稱重複', ErrorCode.DATA_ALREADY_EXISTS);

// 欄位驗證錯誤
throw ApiError.validation('表單驗證失敗', {
  email: { code: ErrorCode.AUTH_EMAIL_REQUIRED, message: 'Email 為必填欄位' }
});
```

## Controller 規範

- 所有 async controller 函式必須使用 `handleErrorAsync` 包裝
- 不允許 controller 直接 catch 後回傳 500，一律 `next(err)` 或 `throw`
- 需要認證的端點必須在 router 層掛載 `isAuthenticated` 或 `adminAuth` middleware

## 路由命名規範

- 路徑使用 kebab-case：`/api/v1/concert-sessions`
- 資源 ID 使用 `camelCase` param：`:concertId`、`:organizationId`
- 動作端點用動詞補充：`/visit`、`/promotion`、`/banners`
- HTTP 方法語意：GET=查詢、POST=建立、PUT=全量更新、PATCH=部分更新、DELETE=刪除

## TypeScript 型別

- Request body 型別定義在 `types/<module>/` 對應目錄
- Interface 命名使用 PascalCase + 用途後綴：`CreateConcertRequest`、`ConcertResponse`
- 不在 controller 內寫 inline 型別斷言，統一在 types/ 定義後 import
