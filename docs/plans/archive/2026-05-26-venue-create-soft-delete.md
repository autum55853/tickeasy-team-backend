# Venue 建立與軟刪除 API

**狀態**：已完成（2026-05-26）

## Context

演唱會場地（Venue）原本只能透過資料庫直接寫入，缺少管理員 CRUD API。需要：
1. 管理員新增場地端點（所有欄位必填）
2. 軟刪除端點（保留已關聯演唱會資料）

---

## 實作範圍

### 新增端點

| Method | Path | 說明 |
|--------|------|------|
| `POST` | `/api/v1/concerts/venues` | 新增場地（adminAuth） |
| `DELETE` | `/api/v1/concerts/venues/:venueId` | 軟刪除場地（adminAuth） |

### 資料層

- `models/venue.ts`：加入 `@DeleteDateColumn() deletedAt: Date \| null`
- Migration `AddVenueSoftDelete`：`venues` 表新增 `deletedAt TIMESTAMP WITH TIME ZONE`
- TypeORM `withDeleted` 查詢已關聯演唱會不受影響

### Request / Response 型別

- `types/vanue/index.ts`：`CreateVenueRequest`（含所有必填欄位）

---

## 關鍵決策

- **軟刪除而非硬刪除**：已關聯演唱會需要繼續顯示場地資訊，硬刪除會導致 FK 失效。
- **管理員限定**：場地是共用資源，只有 `adminAuth` 可以新增/刪除。

---

## 測試

`tests/concert.test.ts` 新增：
- 建立場地成功 / 缺少必填欄位 422
- 軟刪除成功 / 不存在場地 404
- 軟刪除後 GET 場地列表不回傳已刪除場地

---

## 相關 Commit

- `112132f` feat(venue): 新增場地建立、軟刪除 API 及 migration
- `240a647` test(concert): 新增場地建立與軟刪除 API 測試
