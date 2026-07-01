# 修正 AI 客服後續對話延續失效（Gemini 遷移 regression）

**狀態**：已完成（2026-06-30）

> 接續 `2026-06-23-ai-failure-auto-transfer-human.md` 範圍外項目：「對話途中 AI 才失效（follow-up）…修復需重做對話延續設計，屬另案」。本次即處理該另案。

## 背景與問題

`2026-05-12-gemini-ai-migration.md` 把 AI 客服從 OpenAI Responses API 遷到 Gemini。OpenAI 時代靠 `responseId` 在伺服器端維護多輪對話狀態；Gemini 無此機制，`chatService.chat()` / `continueChat()` 一律回傳 `responseId: ''`。

但 `sendMessage`（後續訊息 controller）仍以 `responseId` 是否存在當作「是否延續 AI 對話」的閘門。

## 根因分析

| # | 問題 | 位置 |
|---|------|------|
| 主因 | Gemini `responseId` 恆為 `''`；`startSession` 存訊息時 `metadata.responseId = openaiResponseId \|\| undefined` → 實際存 `undefined` | `controllers/smart-reply-controller.ts:210` |
| 連鎖 | `sendMessage` 讀 `previousOpenAIResponseId = lastBotMessage?.metadata?.responseId` → 永遠 undefined | `smart-reply-controller.ts:360` |
| 連鎖 | 閘門 `if (previousOpenAIResponseId)` 永遠 falsy → 永走 else 分支，只跑 `getSmartReply()` 關鍵字匹配 | `smart-reply-controller.ts:362,400-407` |
| 連鎖 | `chatService.continueChat()`（含從 DB 重建 10 則歷史的 Gemini 多輪對話）永不被呼叫，為 dead code | `services/chat-service.ts:452-494` |
| 缺口 | `sendMessage` 只有 try/catch，缺 `aiUnavailable` 旗標偵測（`startSession` 已有） | `smart-reply-controller.ts:362-399` |
| 測試掩蓋 | `tests/smart-reply-sse.test.ts` mock `chat()` 回 `responseId: 'resp-abc'`（truthy），與真實 Gemini 的 `''` 不符 → 測試綠燈但 prod 壞 | `tests/smart-reply-sse.test.ts:24` |

**結論**：遷移後第二句起，AI 實質「失憶」，退化成純規則 bot；沒命中關鍵字 → `neutral` → 導客服信箱。超出票務範圍的問題在後續訊根本到不了 Gemini system prompt 把關。

## 修法（rules-first，與 startSession 對齊）

### 1. `services/chat-service.ts`
- `continueChat` 移除已棄用死參數 `previousResponseId`，簽名改 `continueChat(userMessage, options)`
- `ChatOptions` interface 移除棄用欄位 `previousResponseId`

### 2. `controllers/smart-reply-controller.ts` `sendMessage`
- 移除 `lastBotMessage` 查詢與 `previousOpenAIResponseId` 閘門
- 改為與 `startSession`（`:144-200`）一致：
  1. 先 `smartReplyService.getSmartReply(message)`（關鍵字優先，保留 tutorial/faq 結構化高品質回覆）
  2. `type === 'neutral'` 才 `chatService.continueChat()`（history 由 chat-service 從 DB 重建）
  3. `aiReply.aiUnavailable` → 轉 Discord 人工（複用 `sendSupportRequest`）、`sessionType=HUMAN`、`status=WAITING`、`strategy='discord_fallback'`
  4. 正常回覆 → `strategy='gemini_continue'`
  5. `catch` → 同樣 Discord fallback 防線
- 既有「`confidence < 0.6 → WAITING`」轉接判斷不變

### 3. `tests/smart-reply-sse.test.ts`
- `mockContinueChat` 改真實 Gemini 行為（`responseId: ''`、型別補 `aiUnavailable`）
- 新增 BOT 模式延續測試 4 例：neutral→`gemini_continue`、關鍵字命中不呼叫 continueChat、`aiUnavailable`→HUMAN+Discord、throw→discord_fallback

## 範圍外（本次不處理）
- SSE stream（`streamSession`）為純被動訂閱，無此 bug，不動
- 寫死客服資訊（`02-1234-5678`、`support@tickeasy.com`）抽環境變數 — 另案
- `startSession` 邏輯本身正確，其 `metadata.responseId` 存的 dead data 暫保留以縮小 diff

## 驗證（已通過）
- `npx eslint` 三檔 — No issues
- `npm run test` — 143 passed / 143（7 suites），含 4 新測試
- grep 殘留僅 `[OpenAI]` 歷史註解，無作用碼
- commit `05346ae`（branch `AI`），已 push 至 `autum55853/tickeasy-team-backend`
