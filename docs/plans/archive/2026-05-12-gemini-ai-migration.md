# 計畫：OpenAI → Gemini AI 遷移

**狀態**：✅ 完成（2026-05-12）  
**Commits**：`37a8863`（主要遷移）、`96b16e4`（.env.example）

---

## 背景

專案原使用 OpenAI 完成三件事：演唱會 AI 審核、語意搜尋 embedding、智慧客服對話。
目標改用 Gemini 2.0 Flash 取代全部；OpenAI 程式碼僅加 `[OpenAI]` 標記註解，不刪除，供回滾參考。

**決策事項：**
- Embedding → Gemini `text-embedding-004`（768 維，舊 1536 維）
- Chat history → 從 DB 重建（不再依賴 OpenAI Responses API `responseId`）
- 目標模型 → `gemini-2.0-flash`

---

## 異動檔案

| 檔案 | 異動類型 | 說明 |
|------|---------|------|
| `services/geminiService.ts` | 新建 | 對應 openaiService 介面，改用 Gemini SDK |
| `services/openaiService.ts` | 加棄用說明 | 整體加 `[OpenAI - 已停用]` 區塊，各呼叫加單行說明 |
| `services/embedding-service.ts` | 替換 | OpenAI embeddings → Gemini text-embedding-004（768 維） |
| `services/chat-service.ts` | 重寫 | Responses API → Gemini Chat + DB 歷史重建 |
| `services/concertReviewService.ts` | import 更新 | `openAIService` → `geminiService` |
| `services/intent-classification-service.ts` | import 更新 | `openaiService` → `geminiService` |
| `.env.example` | 新增/標棄用 | 新增 `GEMINI_API_KEY`，`OPENAI_API_KEY` 標為已棄用 |
| `package.json` | 新增依賴 | `@google/generative-ai` |

---

## 關鍵實作細節

### Gemini vs OpenAI 差異

| 項目 | OpenAI | Gemini |
|------|--------|--------|
| system role | `messages[{ role: 'system' }]` | `systemInstruction` 參數 |
| assistant role | `'assistant'` | `'model'` |
| 結構化 JSON | function calling | `responseMimeType: 'application/json'` |
| 對話狀態 | Responses API `responseId` | 無對應 → 從 DB 重建 `Content[]` |
| Embedding API | `openai.embeddings.create()` | `embeddingModel.embedContent()` |

### chat-service.ts 核心變更

- `continueChat()`：從 DB 讀最近 10 則 `SupportMessage`，映射為 Gemini `Content[]`，透過 `model.startChat({ history }).sendMessage()` 維持對話記憶
- `retrieveResponse()`：OpenAI 可用 `responseId` 取回；Gemini 無對應，改為讀 DB 最後一則 bot 訊息
- `responseId` 欄位保留（資料庫欄位不動），新訊息存 `undefined`

### Embedding 維度切換

向量以 JSONB 儲存（非 native pgvector），切換維度不需 DB migration。
**但切換後需重生現有向量**：`POST /api/v1/knowledge-base/embeddings/update`（需 Admin token）。

---

## 部署後動作

1. 在 `.env` 加入 `GEMINI_API_KEY`
2. 呼叫 `POST /api/v1/knowledge-base/embeddings/update` 重生所有知識庫向量（768 維）
