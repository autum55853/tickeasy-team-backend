# Discord 審核回退機制

**狀態**：已完成（2026-05-16）

## Context

當 Gemini API 配額耗盡（HTTP 429 / RESOURCE_EXHAUSTED）時，演唱會審核會靜默失敗，`reviewStatus` 被標為 `SKIPPED`，演唱會卡在 `reviewing` 狀態無人處理。目標：偵測到配額耗盡後，自動傳送演唱會資訊到 Discord 頻道，管理員可點擊 Approve/Reject 按鈕直接更新資料庫狀態。

---

## 架構概覽

```
Gemini 429 錯誤
  ↓
concertReviewService.triggerAIReview() 偵測 quotaExhausted
  ↓
discordService.sendConcertReviewRequest(concert)
  → Discord Webhook → 頻道訊息（Embed + 按鈕）
  → 建立 ConcertReview { manual_system, PENDING }
  → concert.reviewStatus = PENDING（conInfoStatus 維持 reviewing）

管理員點擊 Approve/Reject
  ↓
Discord POST → /api/v1/discord/interactions
  ↓
discordController.handleDiscordInteraction()
  → verifyDiscordSignature()（node:crypto subtle Ed25519）
  → 解析 custom_id: 'approve_<concertId>' / 'reject_<concertId>'
  → concertReviewService.submitManualReview()
  → concert.conInfoStatus = 'published' / 'rejected'
  → Discord 回應更新訊息（移除按鈕）
```

---

## 實作步驟

### Step 1 — 修改 `AIReviewResponse` interface

**檔案**：`services/geminiService.ts`

在 `AIReviewResponse` interface 新增 `quotaExhausted?: boolean` 欄位。

```typescript
export interface AIReviewResponse {
  // ... 現有欄位
  quotaExhausted?: boolean;  // 標示 Gemini API 429 配額耗盡
}
```

### Step 2 — 在 `reviewConcert()` catch 區塊偵測 429

**檔案**：`services/geminiService.ts`

```typescript
} catch (error: any) {
  const errorMessage = error.message || 'AI 審核服務發生未知錯誤';
  console.error(`[GeminiService reviewConcert] 錯誤。演唱會 ID: ${concert.concertId}`, error);

  // 偵測 Gemini 429 / RESOURCE_EXHAUSTED
  const isQuotaExhausted =
    error?.status === 429 ||
    error?.httpStatus === 429 ||
    (typeof errorMessage === 'string' && errorMessage.includes('RESOURCE_EXHAUSTED'));

  if (isQuotaExhausted) {
    console.warn(`[GeminiService reviewConcert] Gemini API 配額耗盡 (429)，演唱會 ID: ${concert.concertId}`);
    const fallback = this.getFallbackResponse('Gemini API 配額耗盡 (RESOURCE_EXHAUSTED)');
    fallback.quotaExhausted = true;
    return fallback;
  }

  return this.getFallbackResponse(errorMessage, error);
}
```

### Step 3 — 新建 `services/discordService.ts`

功能：
- `sendConcertReviewRequest(concert: Concert): Promise<void>` — 組裝 Embed + 按鈕，POST 到 `DISCORD_WEBHOOK_URL`
- `verifyDiscordSignature(rawBody: Buffer, signature: string, timestamp: string): Promise<boolean>` — 使用 `node:crypto` `subtle.verify` 做 Ed25519 驗證，**零新依賴**

關鍵實作：
```typescript
import { subtle } from 'node:crypto';

export async function verifyDiscordSignature(
  rawBody: Buffer,
  signature: string,
  timestamp: string,
): Promise<boolean> {
  try {
    const publicKeyHex = process.env.DISCORD_PUBLIC_KEY;
    if (!publicKeyHex) return false;
    const keyBytes = Buffer.from(publicKeyHex, 'hex');
    const key = await subtle.importKey('raw', keyBytes, 'Ed25519', false, ['verify']);
    const message = Buffer.concat([Buffer.from(timestamp), rawBody]);
    const sig = Buffer.from(signature, 'hex');
    return subtle.verify('Ed25519', key, sig, message);
  } catch {
    return false;
  }
}
```

Discord Webhook 訊息格式（`sendConcertReviewRequest`）：
- `embeds[0]`：演唱會標題、簡介（前 200 字）、日期、地點、concertId
- `components[0]`：兩個按鈕
  - Approve：`style: 3`（綠色），`custom_id: approve_<concertId>`
  - Reject：`style: 4`（紅色），`custom_id: reject_<concertId>`

### Step 4 — 修改 `services/concertReviewService.ts`

**位置**：`triggerAIReview()` 的 `geminiService.reviewConcert()` 呼叫後

```typescript
const aiResponse = await geminiService.reviewConcert(concert);

// 配額耗盡：轉送 Discord 人工審核
if (aiResponse.quotaExhausted) {
  console.warn(`[ConcertReviewService] Gemini 配額耗盡，演唱會 ${concertId} 轉送 Discord`);
  await sendConcertReviewRequest(concert);
  const pendingReview = this.concertReviewRepository.create({
    concertId,
    reviewType: 'manual_system' as ReviewType,
    reviewStatus: ReviewStatus.PENDING,
    reviewNote: 'Gemini API 配額耗盡，已傳送至 Discord 等待人工審核',
  });
  await this.concertReviewRepository.save(pendingReview);
  concert.reviewStatus = ReviewStatus.PENDING;
  concert.reviewNote = 'Gemini API 配額耗盡，等待 Discord 人工審核';
  await this.concertRepository.save(concert);
  return pendingReview;
}
```

### Step 5 — 新建 `controllers/discordController.ts`

`handleDiscordInteraction(req, res)` 處理：

1. 從 `req.headers` 取 `x-signature-ed25519`、`x-signature-timestamp`
2. `rawBody` 來自 `req.body`（因為路由使用 `express.raw()`，body 是 Buffer）
3. 呼叫 `verifyDiscordSignature()` → 失敗回 `401`
4. `interaction.type === 1`（PING）→ 回 `{ type: 1 }`
5. `interaction.type === 3`（MESSAGE_COMPONENT）：
   - 解析 `interaction.data.custom_id`：`'approve_<uuid>'` 或 `'reject_<uuid>'`
   - 呼叫 `concertReviewService.submitManualReview(concertId, 'discord:<userId>', reviewStatus, note, 'manual_system')`
   - 回傳 Discord Interaction type 7（UPDATE_MESSAGE，移除按鈕）
   - 錯誤時回傳 type 4 ephemeral 訊息

### Step 6 — 新建 `routes/discord.ts`

```typescript
import { Router } from 'express';
import express from 'express';
import { handleDiscordInteraction } from '../controllers/discordController.js';

const router = Router();

// 必須用 express.raw() 取得 Buffer，供 Ed25519 簽名驗證使用
router.post('/interactions', express.raw({ type: 'application/json' }), handleDiscordInteraction);

export default router;
```

### Step 7 — 修改 `app.ts`

**重要**：Discord 路由必須掛載在全域 `express.json()` 之前，確保 raw body 不被消費。

```typescript
import discordRouter from './routes/discord.js';

// 在 app.use(express.json()) 之前插入：
app.use('/api/v1/discord', discordRouter);

app.use(express.json());  // 這行維持原位
```

### Step 8 — 更新 `.env.example`

```env
# Discord 審核回退
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/xxx/yyy
DISCORD_PUBLIC_KEY=your_discord_application_public_key_hex
```

---

## 環境變數

| 變數 | 用途 | 取得位置 |
|------|------|---------|
| `DISCORD_WEBHOOK_URL` | 傳送審核訊息的 Webhook URL | Discord Server → 頻道設定 → 整合 → Webhooks |
| `DISCORD_PUBLIC_KEY` | Ed25519 公鑰，驗證 Interaction 簽名 | Discord Developer Portal → Application → General Information |

---

## Discord Application 設定（使用者操作）

1. 前往 https://discord.com/developers/applications → 建立新 Application
2. **General Information** → 複製 **Public Key** → 填入 `DISCORD_PUBLIC_KEY`
3. **General Information** → **Interactions Endpoint URL** → 填入 `https://<your-domain>/api/v1/discord/interactions`
   - Discord 會立即發 PING（type=1）驗證，後端須正確回應 `{"type":1}`
4. 在目標 Discord Server 頻道建立 Webhook → 複製 URL → 填入 `DISCORD_WEBHOOK_URL`

---

## 依賴

**無需新增 npm 套件**。

- 簽名驗證：`node:crypto`（`subtle.verify` with Ed25519，Node.js 18+ built-in）
- HTTP 請求：`axios`（已在 `dependencies`）

---

## 關鍵檔案一覽

| 檔案 | 動作 |
|------|------|
| `services/geminiService.ts` | 修改（新增 quotaExhausted 欄位 + catch 區塊 429 偵測） |
| `services/concertReviewService.ts` | 修改（triggerAIReview 新增 Discord fallback 分支） |
| `services/discordService.ts` | 新建 |
| `controllers/discordController.ts` | 新建 |
| `routes/discord.ts` | 新建 |
| `app.ts` | 修改（掛載 Discord 路由，位於 express.json() 之前） |
| `.env.example` | 修改（新增 2 個環境變數） |

---

## 驗證方式

1. **本地模擬 429**：在 `geminiService.reviewConcert()` 的 try 區塊首行暫時加 `throw Object.assign(new Error('RESOURCE_EXHAUSTED'), { status: 429 })`，提交演唱會審核，觀察 Discord 頻道是否收到 Embed 訊息，DB 查詢確認 `reviewStatus = 'pending'`、`conInfoStatus = 'reviewing'`。

2. **Discord 按鈕點擊**：用 ngrok 曝露本地 port → Discord App 設定 Interaction URL → 點擊按鈕 → 確認 `conInfoStatus` 更新為 `published`/`rejected`。

3. **PING 驗證**：在 Discord Developer Portal 填入 Interaction URL 時，若顯示「Saved」表示 PING/簽名驗證正常。

4. **無效簽名測試**：
   ```bash
   curl -X POST https://<domain>/api/v1/discord/interactions \
     -H "Content-Type: application/json" \
     -H "X-Signature-Ed25519: invalid" \
     -H "X-Signature-Timestamp: 1234567890" \
     -d '{"type":1}'
   # 期望：HTTP 401
   ```
