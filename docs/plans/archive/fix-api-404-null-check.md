# 計畫：修補 API 缺少防呆導致 HTTP 404 / 格式不一致問題

## 問題背景

部分 API 在 DB 無資料時缺乏防呆處理：
- 有些直接用 `res.status(404).json()` 回傳，繞過全域 error handler，回應格式不符合規範
- 有些缺少 null check，以 Optional chaining (`?.`) 掩蓋潛在錯誤
- `getConcertTickets` 未驗證前置資源（場次）是否存在就直接查票種

**目標**：統一改為 `throw ApiError.*()` 確保全域 handler 統一處理，並補齊 null check 防呆。

---

## 修改範圍

### 1. `controllers/ticket.ts` — `getConcertTickets`

**問題**：直接查 `TicketType`，未驗證 `concertSessionId` 對應的場次是否存在。

**修法**：
1. 新增 import：`ConcertSession as ConcertSessionEntity` from `'../models/concert-session.js'`
2. 查票種前，先以 `concertSessionRepository.findOne()` 驗證場次存在
3. 場次不存在 → `throw ApiError.notFound('演唱會場次')`
4. 場次存在後再查票種並回傳（空陣列也回傳 200）

---

### 2. `controllers/orders.ts`

#### `createOrder`

| 修改點 | 原始做法 | 修正後 |
|--------|----------|--------|
| 欄位未填寫 | `res.status(404).json(...)` | `throw ApiError.create(400, '欄位未填寫完全', ErrorCode.DATA_INVALID)` |
| 手機格式錯誤 | `res.status(404).json(...)` | `throw ApiError.invalidFormat('手機號碼')` |
| 票券已售罄 | `res.status(400).json(...)` | `throw ApiError.dataConstraintViolation('票券已售罄')` |

#### `refundOrder`

| 修改點 | 原始做法 | 修正後 |
|--------|----------|--------|
| 訂單編號錯誤 | `res.status(404).json(...)` | `throw ApiError.create(400, '訂單編號錯誤', ErrorCode.DATA_INVALID)` |
| `ticketType` 無 null check | `ticketType?.concertSessionId` | 查完後加 `if (!ticketType) throw ApiError.notFound('票種')` |
| 訂單不可退款 | `res.status(403).json(...)` | `throw ApiError.create(403, '此訂單不可退款', ErrorCode.AUTH_FORBIDDEN)` |
| 申請退款失敗 | `res.status(404).json(...)` | `throw ApiError.create(400, '申請退款失敗', ErrorCode.DATA_INVALID)` |

#### `getOrderInfo`

| 修改點 | 原始做法 | 修正後 |
|--------|----------|--------|
| 訂單不存在 | `res.status(404).json(...)` | `throw ApiError.notFound('訂單')` |

---

### 3. `controllers/user.ts` — `getTicketdetail`

| 修改點 | 原始做法 | 修正後 |
|--------|----------|--------|
| 查無票券 | `res.status(404).json(...)` | `throw ApiError.notFound('票券')` |

---

## 完成狀態

- [x] `controllers/ticket.ts` — 補場次存在驗證
- [x] `controllers/orders.ts` — 統一所有錯誤回傳格式
- [x] `controllers/user.ts` — 統一票券查無回傳格式
- [x] `npm run build` 通過
- [x] `npm run lint` 無新增警告
