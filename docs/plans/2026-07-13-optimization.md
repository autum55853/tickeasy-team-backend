# 2026-07-13 全端優化計畫（Backend 部分）

> 來源：2026-07-13 全專案（backend / frontend / dashboard）優化審查。
> 本檔只列 backend 項目；dashboard 與 frontend 項目見各自 repo 的 `docs/plans/2026-07-13-optimization.md`。
> 完成後移至 `docs/plans/archive/`。

## 優先序總覽

| # | 項目 | 類別 | 嚴重度 | 狀態 |
|---|------|------|--------|------|
| 1 | 升級 multer 至 2.x（DoS CVE） | 安全 | 🔴 高 | ✅ 完成（85d4fe3） |
| 2 | auth 端點加 rate limiting | 安全 | 🔴 高 | ✅ 完成（a20f892） |
| 3 | 建立訂單包 transaction | 正確性 | 🟠 中高 | ✅ 完成（191e0df） |
| 4 | 退款／過期釋放改原子加庫存 | 正確性 | 🟠 中高 | ✅ 完成（2026-07-17；scheduler 過期釋放經查已用 `increment()`，無需改） |
| 5 | 加 compression middleware | 效能 | 🟡 中 | ✅ 完成（2026-07-17；SSE text/event-stream 已排除壓縮） |
| 6 | morgan 依環境切格式 | 效能 | 🟡 低 | ✅ 完成（2026-07-17） |
| 7 | 建單合併兩次寫入 | 效能 | 🟢 低 | ✅ 完成（191e0df，與 3 同批） |
| 8 | 拆分 concert.ts（45KB） | 維護 | 🟢 低 | 待處理 |
| 9 | console.log 收斂為 logger | 維護 | 🟢 低 | 🔶 部分完成（2026-07-17 已清 controllers/orders.ts、payment.ts，含 PII 與金流參數 log；services/ 仍有約 150 處待收斂） |

---

## 1. 升級 multer 至 2.x

- **問題**：`multer@1.4.5-lts.2` 已停止維護，2025 年揭露多個 DoS CVE（惡意 multipart 請求可使 process 崩潰），修復皆在 2.x。
- **做法**：`npm i multer@^2.0.2`，確認 `@types/multer` 相容；upload 流程 API 幾乎相容，重點驗 `controllers/upload.ts` 的記憶體緩衝模式。
- **驗收**：`npm run build` 過、upload 相關測試綠、實際上傳一張圖走完 Sharp 壓縮 → 暫存 → 確認流程。

## 2. auth 端點 rate limiting

- **問題**：全 backend 無 express-rate-limit。login / register / forgot-password 可無限暴力嘗試（email 發送有 10 分鐘 cooldown，但密碼登入沒有限制）。
- **做法**：安裝 `express-rate-limit`，對 `/api/v1/auth/*` 掛限流（建議：同 IP 15 分鐘 20 次；驗證碼類端點更嚴）。錯誤回應沿用 `{ status: 'failed', message }` 格式與錯誤碼慣例（`A` 系列或 `S` 系列，實作時定案）。
- **注意**：Render 有反向代理，需設 `app.set('trust proxy', 1)` 才能拿到真實 client IP，否則所有人共用同一個限流桶。
- **驗收**：本地連打 login 超過閾值回 429；正常登入不受影響；測試補 429 案例。

## 3. 建立訂單包 transaction

- **問題**：`controllers/orders.ts` 扣庫存（原子 `remainingQuantity - 1`，本身正確）與 `orderRepository.save()` 非同一 transaction。save 失敗時庫存已扣、訂單不存在 → 該票永久少一張。
- **做法**：`AppDataSource.transaction()` 包住「扣庫存 → 建訂單 → 寫 orderNumber」，任一步失敗全部 rollback。
- **驗收**：模擬 save 失敗（測試中 mock throw），確認 `remainingQuantity` 不變；既有訂單測試全綠。

## 4. 退款／過期釋放改原子加庫存

- **問題**：`controllers/orders.ts:244` `ticketType.remainingQuantity += 1` 後 `save()` 是 read-modify-write，併發退款會 lost update（少加庫存）。
- **做法**：改 QueryBuilder 原子寫法 `set({ remainingQuantity: () => 'remainingQuantity + 1' })`。同步檢查 `scheduler/orderScheduler.ts` 的過期釋放是否同 pattern，一併修。
- **驗收**：退款測試綠；併發情境可用兩個並行請求驗證庫存加總正確。

## 5. compression middleware

- **問題**：`app.ts` 未掛 `compression()`，演唱會列表等大 JSON 回應未壓縮。
- **做法**：`npm i compression`，掛在 helmet 之後、路由之前。
- **驗收**：`curl -H "Accept-Encoding: gzip"` 回應帶 `Content-Encoding: gzip`。

## 6. morgan 依環境切格式

- **做法**：`NODE_ENV === 'production'` 用 `combined`，否則 `dev`。（進一步換 pino 為選配，不在本計畫範圍。）
- **驗收**：production build 啟動 log 格式正確。

## 7. 建單合併兩次寫入

- **問題**：save 訂單後再 update orderNumber，兩次 round-trip。
- **做法**：orderId 改為 save 前預產 UUID（`uuidv4()`），orderNumber 於 create 時一併生成。與項目 3 的 transaction 改動同批處理。
- **驗收**：orderNumber 格式不變、既有測試綠。

## 8. 拆分 concert.ts

- **問題**：45KB 單一 controller，最大檔，維護困難。
- **做法**：按「CRUD／審核／場次票種」拆檔或抽 service 層。純重構，不改行為。
- **驗收**：`npm run test` 全綠、`npm run lint` 過、API 路由行為不變。

## 9. console.log 收斂

- **問題**：payment、orders 散佈 `console.log('order update')` 等除錯輸出。
- **做法**：統一收進簡單 logger util（或至少移除無資訊量的輸出）；機密資訊絕不進 log（遵守 `.claude/rules/security.md`）。
- **驗收**：`grep -rn "console.log" controllers/ services/` 僅剩有意義的錯誤紀錄或為零。

---

## 跨 repo 項目（記錄，暫緩）

- **跨域 token 走 URL query**：前端跳轉 dashboard 帶 `?token=<jwt>`，會留在 Render 存取日誌、瀏覽器歷史、Referer。長期解法：backend 提供「短效一次性 code 換 token」端點，dashboard 拿 code 換 token。牽動 backend + frontend + dashboard 三邊，工程量大，另開計畫再做。

## 建議執行順序

1（multer）→ 2（rate limit）→ 3 + 7（同批）→ 4 → 5、6、9（零碎，可一批）→ 8（最後，純重構）

每項完成即跑 `npm run lint` + `npm run test`，全綠才進下一項（遵守 commit 規則）。
