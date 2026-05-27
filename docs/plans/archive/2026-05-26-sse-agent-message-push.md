# SSE 即時客服訊息推播

**狀態**：已完成（2026-05-26）

## Context

Discord 人工客服 fallback 實作後，管理員在 Discord 透過 Modal 回覆訊息，回覆會存入 `SupportMessage`，但前端用戶必須**主動輪詢** session history 才能知道有新回覆。目標：改為即時 push（Server-Sent Events），讓用戶不需輪詢即可收到訊息。

延伸 `docs/plans/archive/2026-05-23-discord-support-fallback.md`。

---

## 資料流

```
管理員在 Discord Modal 送出回覆
  ↓
POST /api/v1/discord/interactions（已存在）
  ↓
discordController MODAL_SUBMIT handler
  → 寫入 SupportMessage
  → publishSse(sessionId, payload)   ← 新增
  → patchInteractionResponse（Discord 回調）
  ↓
sseBroker.publish()
  → 遍歷 subscribers[sessionId]
  → res.write(`data: {...}\n\n`)
  ↓
前端 EventSource 收到 message event
```

---

## 新增檔案

### `services/sse-broker.ts`

- `subscribe(sessionId, res)` → 回傳 unsubscribe callback（cleanup interval + Set）
- `publish(sessionId, payload)` → 廣播給所有訂閱者，寫入失敗自動移除
- `subscriberCount(sessionId)` → 測試用
- Heartbeat 每 25 秒 `: heartbeat\n\n` 保持連線
- 純 in-memory；多實例需改 Redis pub/sub（已於 JSDoc 標註）

---

## 修改檔案

### `middlewares/auth.ts` — `sseOptionalAuth`

EventSource 原生不支援 `Authorization` header，token 來源優先順序：
1. `Authorization: Bearer <token>`（fetch-based EventSource polyfill）
2. Cookie `auth_token`（同源情境）
3. Query string `?token=...`（跨域 fallback）

無 token → 放行為匿名，route 內以 sessionId 做存取控管。

### `routes/smart-reply.ts`

新增：
```
GET /api/v1/smart-reply/session/:sessionId/stream
  middleware: sseOptionalAuth + validateUUID
  handler: SmartReplyController.streamSession
```

### `controllers/smart-reply-controller.ts` — `streamSession`

- 驗證 session 存在、未關閉
- 若已登入，`session.userId` 必須與 token userId 相符（或其中一方為 null）
- 設定 SSE headers（`Content-Type: text/event-stream`、`X-Accel-Buffering: no`）
- `req.on('close')` 時呼叫 unsubscribe callback

### `controllers/discordController.ts`

MODAL_SUBMIT handler 寫入 SupportMessage 後加一行：
```typescript
publishSse(sessionId, { ...msgPayload });
```

---

## 關鍵決策

- **SSE 而非 WebSocket**：單向推播已足夠；SSE 可複用現有 Express HTTP server，不需額外 ws 套件。
- **sseOptionalAuth 而非 isAuthenticated**：EventSource 標準 API 無法自訂 header，若強制登入會讓匿名客服情境完全無法使用。
- **Heartbeat 25 秒**：低於大多數 proxy/nginx 的 60 秒 idle timeout，且不觸及 Render free tier 的 30 秒限制。

---

## 相關檔案

- `services/sse-broker.ts`（新增）
- `middlewares/auth.ts`（新增 `sseOptionalAuth`）
- `routes/smart-reply.ts`（新增 stream 路由）
- `controllers/smart-reply-controller.ts`（新增 `streamSession`）
- `controllers/discordController.ts`（MODAL_SUBMIT 加 publishSse）
