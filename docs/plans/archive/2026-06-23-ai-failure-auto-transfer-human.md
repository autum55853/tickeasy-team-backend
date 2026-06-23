# AI 客服失效時自動轉人工客服

**狀態**：已完成（2026-06-23）

## 背景與問題

手動測試客服功能（停掉 Gemini / 拔 API key 模擬 AI 失效）時發現兩個症狀：

1. **前端視窗沒切換到人工客服** — 使用者看不到任何切換，也沒有切換按鈕出現
2. **Discord 沒收到使用者詢問的訊息** — 人工客服端完全收不到通知

## 根因分析（systematic-debugging Phase 1–2）

| # | 問題 | 位置 |
|---|------|------|
| **主因** | `chatService.chat()` / `continueChat()` AI 失效時 `return this.buildErrorResponse()`，**從不 throw** | `services/chat-service.ts:132,201,457,534,561` |
| 連鎖 | controller 的 Discord fallback + WAITING 邏輯**全部寫在 `catch` 內**，靠 chat 呼叫 throw 觸發；因主因從不 throw，整段 catch 是死碼 | `controllers/smart-reply-controller.ts:168,359` |
| 連鎖 | catch 內就算執行，也只設 `status = WAITING`，**未設 `sessionType = HUMAN`**，前端判斷人工模式靠 `sessionType === 'human'` | `smart-reply-controller.ts:174,371` |
| 次因 | Gemini `responseId` 恆為 `''`，`sendMessage` 的 `previousOpenAIResponseId` 永遠 undefined → 永走 keyword 分支，continueChat fallback 不可達 | `smart-reply-controller.ts:342,381` |
| 次因 | 前端 `sendMessageMutation.onSuccess` 不讀 `sessionType`，後端即使切了人工，前端 sendMessage 路徑也收不到 | `useCustomerService.ts:155` |

**結論**：AI 真正失效時（拔 key / 配額用罄），`chat()` 吞掉錯誤回傳道歉訊息，導致 catch 永不執行 → Discord 不送（症狀 2）、`sessionType` 不變 → 前端不切（症狀 1）。三症狀同一條死鏈。

## 修法（方向：AI 失效時自動轉，非手動按鈕）

讓「AI 失效」變成可被偵測的明確訊號，再由 controller 主動觸發轉人工。

### 後端

1. **`services/chat-service.ts`**
   - `ChatResponse` interface 新增選填欄位 `aiUnavailable?: boolean`
   - `buildErrorResponse()` 回傳時設 `aiUnavailable: true`
   - 理由：用獨立旗標區分「AI 失效」與「低信心但有正常回答」（`shouldTransfer` 在低信心時也是 true，不可重用）

2. **`controllers/smart-reply-controller.ts` `startSession`**
   - `chatService.chat()` 回來後，若 `aiReply.aiUnavailable === true`：
     - 呼叫 `sendSupportRequest(session, initialMessage, [])` 送 Discord
     - 設 `session.sessionType = SessionType.HUMAN`、`session.status = SessionStatus.WAITING`、`discordFallbackAt`
     - `finalMessage` 改道歉訊息、`strategy = 'discord_fallback'`
   - 既有 `catch` 區塊保留作防線，並補上 `session.sessionType = SessionType.HUMAN`
   - response 已回傳 `sessionType: session.sessionType`（line 224），切換後即為 `human` ✓

3. **`controllers/smart-reply-controller.ts` `sendMessage`**
   - response `data` 補回 `sessionType: session.sessionType`（讓前端 sendMessage 路徑可同步狀態）
   - 既有 continueChat `catch` 補上 `session.sessionType = SessionType.HUMAN`（防線）

### 前端

4. **`useCustomerService.ts` `startSessionMutation.onSuccess`** — 已讀 `response.data.sessionType`，後端回 `human` 時 `isHumanMode` 自動成立、視窗切換、SSE 啟動。**不需改**（僅驗證）

5. **`useCustomerService.ts` `sendMessageMutation.onSuccess`** — 新增讀 `response.data.sessionType`，為 `'human'` 且當前非人工時 `updateSession({ sessionType: 'human', status: 'transferred' })`（防線，涵蓋後端在 sendMessage 期間切換的情形）

## 範圍外（本次不處理，已知限制）

- **對話途中 AI 才失效（follow-up）**：因 Gemini 無 `responseId`，續談走 keyword-only，偵測不到 AI 失效。修復需重做對話延續設計，屬另案
- **SSE 跨域 cookie 認證**：人工回覆透過 SSE 推回前端，EventSource 僅 `withCredentials`（cookie），跨網域可能收不到，屬另案

## 驗證

- `npm run test`（後端 Jest）— 同步 `tests/smart-reply-sse.test.ts`、`tests/discord*.test.ts` 的 mock / 斷言
- `npm run lint`
- 前端 `npm run build`（型別檢查）+ `npm run lint`
- 手動：拔 Gemini key → 開新客服會話送訊息 → 確認前端切人工 + Discord 收到通知
