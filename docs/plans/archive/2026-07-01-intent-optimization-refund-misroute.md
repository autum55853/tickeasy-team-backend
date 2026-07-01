# 意圖優化：退票查詢被演唱會搜尋誤攔

> 狀態：待批准（計畫階段）
> 建立日期：2026-07-01
> 分支：AI
> 方向已定：**雙層修法**（意圖守門 + 收窄關鍵字）

## 問題描述

使用者詢問「我想詢問退票規定」，AI 客服回覆卻是「🎵 演唱會搜尋結果 / 很抱歉，目前沒有找到符合您查詢條件的演唱會」。

## 根因分析（已完成調查）

資料流（`services/smart-reply-service.ts`）：

1. `analyzeIntent("我想詢問退票規定")`
   → `fallbackKeywordMatching` 命中 instructionKeyword `'退票'`
   → 回 **GENERAL_SERVICE**，`shouldProceed=true`（意圖分類本身正確 ✅）
2. `processIntentBasedReply` → `GENERAL_SERVICE` case → `break` → `return null`
3. `processTraditionalReply`：
   - step 1 `matchTutorial`：讀 **DB**（非 config），DB 未 seed「退票退款教學」規則 → 落空
   - step 2 `matchFAQ`：同樣落空
   - **step 3 演唱會搜尋**（line 240）guard 只擋 `primaryIntent === CONCERT`，未擋 `GENERAL_SERVICE`
     → `isConcertRelatedQuery("退票規定")`：concertKeywords 含**裸關鍵字 `'票'`**（line 577），`"退票規定".includes('票')` → `true`
     → `searchConcerts` 回 0 筆 → 回傳 `concert_search_no_results`（= 截圖畫面）
   - step 4 知識庫搜尋 → 永遠搆不到

### 四個疊加缺陷

| # | 缺陷 | 層級 |
|---|------|------|
| A | step 3 演唱會搜尋未排除 `GENERAL_SERVICE/FOOD/HOTEL/TRANSPORT` 意圖 | 程式（根本） |
| B | concertKeywords 含裸 `'票'`，吃掉「退票/退款」等客服詞 | 程式（補強） |
| C | 演唱會搜尋（step 3）排在知識庫搜尋（step 4）之前 | 程式（順序，可選） |
| D | DB 未 seed「退票退款教學」規則（config 有、DB 無） | 資料（須確認） |

## 修改範圍

### 修改 1：意圖守門（缺陷 A，根本修法）

`services/smart-reply-service.ts` `processTraditionalReply` step 3（line 240）

現況：
```ts
if (!intentResult || intentResult.primaryIntent !== IntentType.CONCERT) {
```
改為白名單，只在無意圖 / CONCERT / UNKNOWN 時才跑演唱會搜尋：
```ts
const concertSearchableIntents = [IntentType.CONCERT, IntentType.UNKNOWN];
if (!intentResult || concertSearchableIntents.includes(intentResult.primaryIntent)) {
```
效果：`GENERAL_SERVICE`（退票、購票流程、帳戶等）不再被演唱會搜尋攔截，正確落到知識庫 / 中性回覆。

### 修改 2：收窄關鍵字（缺陷 B，治標補強）

`isConcertRelatedQuery` concertKeywords（line 577）

- 移除裸 `'票'`，保留語意明確者：`購票 / 買票 / 訂票 / 票價 / 售票 / 門票`
- 或於函式開頭加排除：命中 `退票 / 退款 / 退費` 則直接 `return false`
- 建議採「移除裸 `'票'`」為主，較不易誤傷正常演唱會查詢（`購票 / 票價` 已覆蓋）

### 修改 3（可選，缺陷 C）：調整順序

將 step 4 知識庫搜尋提前至 step 3 演唱會搜尋之前。
- 風險：可能影響現有演唱會查詢優先權，需回歸測試把關
- 建議：修改 1 已能解決本案；修改 3 列為**待討論**，非必要不動，避免超出範圍

### 缺陷 D：資料確認（非程式）

確認正式環境 DB 是否已 seed `config/smart-reply-rules.ts` 的「退票退款教學」規則。
- 若已 seed：修改 1 後 step 1 tutorial 即命中，退票查詢得到正確教學
- 若未 seed：修改 1 後會落到知識庫 / 中性回覆，須另行補 seed（列為後續資料任務，不在本次程式修改範圍）

## 副作用檢查（全域規則：檢查類似問題）

- instructionKeywords 中 `取票 / 領票 / 我的票券` 等含「票」的客服詞，原本同樣會被裸 `'票'` 誤攔 → 修改 1 一併解決
- `models/support-knowledge-base.ts:164` 的關鍵字清單含 `退票`，屬知識庫比對用，不受本次影響
- 真實演唱會查詢「我要買票 / 票價多少 / 演唱會門票」→ 由 `購票 / 票價 / 門票` 覆蓋，修改 2 後仍正常（回歸測試驗證）

## 測試計畫（依 CLAUDE.md 測試同步規則）

`tests/smart-reply-sse.test.ts` 補案例：

1. 「我想詢問退票規定」→ `type` 不得為 `concert_search`，應為 GENERAL_SERVICE 路徑（tutorial / knowledge / neutral）
2. 「我要買演唱會的票」→ 仍正確回 `concert_search`（回歸保護）
3. 「票價多少」→ 仍判為演唱會查詢（收窄關鍵字後回歸保護）

驗收：`npm run test` 全綠 + `npm run lint` 通過。

## 執行步驟

1. 計畫批准
2. 修改 1（意圖守門）
3. 修改 2（收窄關鍵字）
4. 補 / 修測試，跑 `npm run test`、`npm run lint` 全綠
5. 確認缺陷 D 資料狀態（回報，不在程式 commit 範圍）
6. commit（`fix(smart-reply): ...`）
7. 完成後將本檔移至 `docs/plans/archive/`

## 待決事項（需批准者確認）

1. 修改 3（調整 step 3/4 順序）是否納入本次？（預設：不納入，僅列風險）
2. 缺陷 D 若 DB 未 seed 退票教學，是否本次一併補 seed？（預設：另開資料任務）
3. 修改 2 採「移除裸 `'票'`」或「開頭排除退票詞」？（預設：移除裸 `'票'`）
