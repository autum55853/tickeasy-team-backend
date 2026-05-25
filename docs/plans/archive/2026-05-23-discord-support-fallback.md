# 客服機器人 Discord 人工回覆 Fallback

**狀態**：規劃中（2026-05-23）

## Context

當使用者透過客服機器人提問，但 Gemini/OpenAI AI API 失效（quota / exception）時，後端目前僅回傳靜態中性訊息。目標：偵測 AI 失效 → 自動推送問題到 Discord 支援頻道 → 管理員在 Discord 透過 Modal 介面回覆 → 回覆存入 DB → 使用者透過 session history API 取得答案。

設計延伸現有 concert-review discord fallback（同一 `/api/v1/discord/interactions` endpoint、`verifyDiscordSignature()`、`patchInteractionResponse()`，零新 npm 依賴）。

參考：`docs/plans/archive/2026-05-16-discord-review-fallback.md`

---

## 現有程式碼狀態（已確認）

| 檔案 | 已有內容 |
|------|----------|
| `services/discordService.ts` | `verifyDiscordSignature()`、`sendConcertReviewRequest()`、`patchInteractionResponse()` |
| `controllers/discordController.ts` | type=1 PING、type=3 MESSAGE_COMPONENT（concert approve/reject），用 type:6 defer 再 patch |
| `routes/discord.ts` | `POST /interactions` with `express.raw()` |
| `.env` | `DISCORD_WEBHOOK_URL`、`DISCORD_PUBLIC_KEY`、`DISCORD_BOT_TOKEN` 已設定 |
| `.env.example` | 缺少 `DISCORD_PUBLIC_KEY`、`DISCORD_WEBHOOK_URL`（需補齊） |

**AI 失效觸發點**（`controllers/smart-reply-controller.ts`，共三處）：
- `reply()` L38–64：無 session，無法對應回覆，**不加 Discord fallback**
- `startSession()` L150–171 catch：**加 Discord fallback**
- `sendMessage()` L305–328 catch：**加 Discord fallback**

---

## 資料流

```
startSession() / sendMessage() → chatService.chat() / continueChat() 拋出例外
  ↓
catch block
  ↓
discordService.sendSupportRequest(session, userMessage, recentMessages[])
  → POST DISCORD_SUPPORT_WEBHOOK_URL?wait=true（取得 message id）
  → Embed：用戶問題、近 5 則對話記錄、sessionId
  → 按鈕「回覆用戶」custom_id = support_reply_<sessionId>
  → 儲存 Discord messageId → session.discordMessageId
  → session.status = WAITING、session.discordFallbackAt = now
  → 儲存 bot SupportMessage：「已轉人工，請稍候回覆」

管理員點「回覆用戶」按鈕
  ↓
Discord POST → /api/v1/discord/interactions（已存在）
  ↓
handleDiscordInteraction()
  → 驗證簽名（已存在）
  → type=3, custom_id = 'support_reply_<sessionId>'
  → 立即回應 type=9（Modal，不可 defer）
    - Modal custom_id = support_modal_<sessionId>
    - 文字輸入 custom_id = reply_text（max 1000 字）

管理員填入回覆 → 提交
  ↓
Discord POST → /api/v1/discord/interactions（同一 endpoint）
  ↓
handleDiscordInteraction()
  → type=5 (MODAL_SUBMIT), custom_id = 'support_modal_<sessionId>'
  → 立即回應 type=4 ephemeral「✅ 已回覆用戶」（快速操作，不需 defer）
  → async：
    1. 建立 SupportMessage { senderType: AGENT, senderId 存 metadata, messageText }
    2. session.status = ACTIVE
    3. patchInteractionResponse() 更新 Discord 原訊息（移除按鈕、加「已由 <username> 回覆」）

用戶 GET /api/v1/smart-reply/session/:id/history → 取得 AGENT 訊息
```

---

## DB 變更

### Entity 修改：`models/support-session.ts`

新增 2 欄位：

| 欄位 | TypeORM 型別 | Nullable | 說明 |
|------|-------------|----------|------|
| `discordMessageId` | `varchar(30)` | YES | Discord 訊息 ID，用於後續 patch |
| `discordFallbackAt` | `timestamp` | YES | Discord fallback 觸發時間 |

```typescript
@Column({ type: 'varchar', length: 30, nullable: true })
discordMessageId: string | null;

@Column({ type: 'timestamp', nullable: true })
discordFallbackAt: Date | null;
```

Migration 指令：
```bash
npm run typeorm migration:generate -- -d config/database.ts -n AddDiscordFallbackToSupportSession
npm run migrate
```

---

## Backend 修改清單

### 1. `models/support-session.ts` ✏️
加 `discordMessageId`、`discordFallbackAt` 兩個 column。

---

### 2. `services/discordService.ts` ✏️

新增函式：
```typescript
export async function sendSupportRequest(
  session: SupportSession,
  userMessage: string,
  recentMessages: SupportMessage[],
): Promise<string | null>   // 回傳 Discord messageId，失敗回 null
```

實作重點：
- POST `DISCORD_SUPPORT_WEBHOOK_URL?wait=true`（`?wait=true` 讓 Discord 回傳完整 message body，含 id）
- 若 `DISCORD_SUPPORT_WEBHOOK_URL` 未設定 → 記錄 warn、回傳 null（不拋出，避免中斷 session）
- Embed 包含：sessionId、用戶問題、近 5 則對話快照
- 按鈕：style=1（藍），`custom_id = support_reply_<sessionId>`

---

### 3. `controllers/discordController.ts` ✏️

**type=3 分支新增**（support_reply）：
```typescript
if (customId.startsWith('support_reply_')) {
  const sessionId = customId.replace('support_reply_', '');
  return res.json({
    type: 9,   // MODAL
    data: {
      title: '回覆用戶問題',
      custom_id: `support_modal_${sessionId}`,
      components: [{
        type: 1,
        components: [{
          type: 4,
          custom_id: 'reply_text',
          label: '回覆內容',
          style: 2,
          min_length: 1,
          max_length: 1000,
          required: true,
        }]
      }]
    }
  });
}
```

**新增 type=5 (MODAL_SUBMIT) 分支**：
```typescript
if (interaction.type === 5) {
  const customId = interaction.data?.custom_id ?? '';
  if (customId.startsWith('support_modal_')) {
    const sessionId = customId.replace('support_modal_', '');
    const replyText = interaction.data.components[0].components[0].value;
    const discordUserId = interaction.member?.user?.id ?? 'unknown';
    const discordUsername = interaction.member?.user?.username ?? '管理員';

    // 立即回應（必須在 3 秒內）
    res.json({ type: 4, data: { content: '✅ 已回覆用戶', flags: 64 } });

    // 非同步處理
    (async () => {
      const session = await sessionRepo.findOne({ where: { supportSessionId: sessionId } });
      if (!session) return;

      const msg = new SupportMessage();
      msg.sessionId = sessionId;
      msg.senderType = SenderType.AGENT;
      msg.senderId = null;   // Discord agent 非平台用戶，senderId 留空
      msg.messageText = replyText;
      msg.messageType = MessageType.TEXT;
      msg.metadata = { discordUserId, discordUsername };   // 存於 metadata JSONB
      await messageRepo.save(msg);

      session.status = SessionStatus.ACTIVE;
      await sessionRepo.save(session);

      await patchInteractionResponse(interaction.token, {
        content: `✅ 已由 **${discordUsername}** 回覆`,
        components: [],   // 移除按鈕
      });
    })().catch(e => console.error('[Discord] support modal error:', e));
  }
}
```

---

### 4. `controllers/smart-reply-controller.ts` ✏️

**觸發點 A：`startSession()` L150–171 catch**
```typescript
} catch (error) {
  console.warn('⚠️ AI 失效，轉送 Discord:', error);
  const msgId = await sendSupportRequest(session, initialMessage, []);
  if (msgId) session.discordMessageId = msgId;
  session.discordFallbackAt = new Date();
  session.status = SessionStatus.WAITING;
  await sessionRepo.save(session);
  finalMessage = '抱歉，AI 系統暫時無法回應，您的問題已轉交人工客服，請稍候。';
  confidence = 0.1;
  strategy = 'discord_fallback';
}
```

**觸發點 B：`sendMessage()` L305–328 catch**（同邏輯，recentMessages 從 DB 最新 5 則取得）

---

### 5. `.env.example` ✏️

補齊缺漏 + 新增：
```env
# Discord（演唱會審核 + 客服人工回覆，共用同一 Application）
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/xxx/yyy          # 演唱會審核頻道
DISCORD_SUPPORT_WEBHOOK_URL=https://discord.com/api/webhooks/xxx/yyy  # 客服支援頻道（新增）
DISCORD_PUBLIC_KEY=your_discord_application_public_key_hex
DISCORD_BOT_TOKEN=your_discord_bot_token
DISCORD_CHANNEL_ID=target_channel_id
DISCORD_APPLICATION_ID=your_discord_application_id
```

---

## 環境變數總覽

| 變數 | 狀態 | 說明 |
|------|------|------|
| `DISCORD_PUBLIC_KEY` | 已設定（.env），.env.example 缺漏 → 補齊 | Ed25519 簽名驗證 |
| `DISCORD_WEBHOOK_URL` | 已設定 | 演唱會審核頻道 |
| `DISCORD_SUPPORT_WEBHOOK_URL` | **新增** | 客服支援頻道 |

---

## 關鍵檔案一覽

| 檔案 | 動作 |
|------|------|
| `models/support-session.ts` | 修改（新增 2 欄位） |
| `services/discordService.ts` | 修改（新增 `sendSupportRequest`） |
| `controllers/discordController.ts` | 修改（type=3 support_reply + type=5 modal_submit） |
| `controllers/smart-reply-controller.ts` | 修改（startSession + sendMessage catch block） |
| `.env.example` | 修改（補 DISCORD_PUBLIC_KEY、DISCORD_WEBHOOK_URL、新增 DISCORD_SUPPORT_WEBHOOK_URL） |
| Migration（新建） | AddDiscordFallbackToSupportSession |

---

## 注意事項

- `SupportMessage.senderId` 是 UUID 型別，Discord userId 為數字字串，不可直接存入。改用 `metadata.discordUserId` + `metadata.discordUsername` 儲存管理員身份，`senderId` 設 null。
- `patchInteractionResponse()` 需要 interaction token（有效期 15 分鐘），modal submit handler 必須在收到 type=5 後立即回應，然後快速完成 async patch。

---

## 驗證方式

1. **模擬 AI 失效**：`chatService.chat()` 開頭加 `throw new Error('TEST_FAIL')`，呼叫 `POST /session/start`，確認 Discord 收到 Embed + 按鈕、DB `session.status = 'waiting'`、`discord_fallback_at` 有值。
2. **按鈕點擊**：ngrok 曝露本地 → Discord App Interaction URL → 點「回覆用戶」→ Modal 彈出正確。
3. **Modal 提交**：填入文字 → DB 查 `support_message.sender_type = 'agent'`、`GET /session/:id/history` 回傳 AGENT 訊息。
4. **Discord 訊息更新**：原按鈕消失、出現「已由 <username> 回覆」。
5. **無效簽名**：curl 送無效 signature → HTTP 401。
6. **環境變數缺漏**：`DISCORD_SUPPORT_WEBHOOK_URL` 未設定 → warn log、session 正常繼續（不 crash）。