# FAQ 全域最優先查詢 + 專屬連結導向

## Context

智慧客服目前：使用者提問先做意圖分析，再走傳統層級 `tutorial → FAQ → 演唱會搜尋 → 知識庫 → 中性`。兩個缺口：

1. FAQ 匹配夾在意圖路由與 tutorial 之後，不是「任何提問最優先」。
2. FAQ 回覆只有純文字（`faqAnswer` + `relatedQuestions`），**沒有連結導向**；只有 tutorial 有 `tutorialUrl`。

使用者要求：任何提問**先查 FAQ**，命中即回，並附上該 FAQ 的**專屬導向連結**。經確認採「所有問題最優先查 FAQ」+「新增 FAQ 專屬連結欄位」。

## Changes

### 1. Entity 新增 `faqUrl` 欄位
`models/support-knowledge-base.ts`
- FAQ 相關欄位區塊（`faqAnswer` 下方）新增：
  ```ts
  @Column({ type: 'varchar', length: 500, nullable: true })
  faqUrl: string;
  ```
- 擴充 `getReplyUrl()`：FAQ 型別且有 `faqUrl` 時回傳 `faqUrl`（目前只處理 tutorial）。

### 2. Migration（手寫，mirror `AddVenueSoftDelete`）
`migrations/<Date.now()>-AddFaqUrlToSupportKB.ts`
- table 名為 `supportKnowledgeBase`（見 `@Entity`）。
- up：`ALTER TABLE "supportKnowledgeBase" ADD "faqUrl" character varying(500)`
- down：`ALTER TABLE "supportKnowledgeBase" DROP COLUMN "faqUrl"`
- 手寫原因：`migration:generate` 需連線 DB 比對；此欄位單純，照現有最小 migration 樣式即可。
- 執行 `npm run migrate`（需 Supabase 連線）。

### 3. Service：FAQ 全域最優先 + 連結
`services/smart-reply-service.ts`
- `SmartReplyResponse.faq` 介面新增 `url?: string`（約 line 28-30）。
- `matchFAQ` 回傳物件新增 `faqUrl: rule.faqUrl`（line 373-380）。
- 抽出共用 helper `buildFaqReply(faqMatch, startTime, intentResult?)`：
  - 沿用現有 FAQ 回覆組裝（line 219-236）。
  - message 末尾若有 `faqUrl`，仿 tutorial（line 189-197）用 `getFrontendBaseUrl()` 組完整 URL（相對路徑才拼接），追加 markdown 連結：`\n\n👉 [查看詳細說明](${fullUrl})`。
  - `faq.url = fullUrl`。
- `getSmartReply` 於**意圖分析之前**（line 94 前）先跑 FAQ：
  ```ts
  const faqMatch = await this.matchFAQ(userMessage);
  if (faqMatch) {
    await this.incrementViewCount(faqMatch.ruleId);
    return this.buildFaqReply(faqMatch, startTime);
  }
  ```
- `processTraditionalReply` 移除原 FAQ 區塊（line 214-237），改為 tutorial → 演唱會 → 知識庫 → 中性。理由：FAQ 已在頂層以相同 `matchFAQ` 邏輯處理，傳統流程再跑必為 miss，移除避免重複 DB 查詢。tutorial／演唱會守門／退票排除等既有邏輯**不動**。

> 影響：FAQ 優先權由「低於 tutorial」提升為「全域最高」，符合使用者選擇。演唱會等提問也會先比對 FAQ，未命中（score < 0.2）才續行，行為與現有 FAQ 門檻一致。

### 4. 測試
`tests/smart-reply-intent-routing.test.ts`
- 既有 mock `getRepository().find → []`：FAQ 於頂層跑 `find` 回空 → 不命中 → 續行，**兩個既有測試仍成立**。
- mock 需補 `update: jest.fn()`（`incrementViewCount` 會呼叫），避免新測試 FAQ 命中路徑崩潰。
- 新增測試「FAQ 命中並回傳連結」：
  - `import { SupportKnowledgeBase }`，建立真實 instance（`replyType='faq'`、`keywords=['退票']`、`faqAnswer`、`faqUrl='/faq/refund'`、`priority=1`），讓 `find` 回傳 `[rule]`（`calculateKeywordScore` 為真實 method 才能算分）。
  - 斷言 `result.type === 'faq'`、`result.faq.url` 含 `/faq/refund`、`result.message` 含 markdown 連結。
- 執行：`rtk proxy npm run test -- tests/smart-reply-intent-routing.test.ts`

### 5. 不需變更
- `.env.example`：無新增環境變數（`FRONTEND_URL` 已存在）。
- controller/SSE：`smart-reply-controller.ts` 直接回傳整個 `smartReply` 物件（line 68-71），連結已內嵌 `message` 字串，前端 markdown 渲染即可，無需改動。
- `types/`：無重複的 FAQ 介面定義。

## 待辦（超出本次範圍，需另議）
- 正式 DB 需由管理者 seed 帶 `faqUrl` 的「退票退款」FAQ 規則，本次僅開通欄位與程式路徑；不含資料 seed。

## Verification
1. `npx tsc --noEmit` 無錯、`npm run lint` 乾淨。
2. `rtk proxy npm run test -- tests/smart-reply-intent-routing.test.ts` 全綠（2 既有 + 1 新）。
3. `npm run migrate` 成功新增 `faqUrl` 欄位（需 DB 連線）。
4. 手測（DB 已 seed 對應 FAQ 時）：`POST /api/v1/smart-reply/reply { "message": "退票規定" }` → 回 `type: 'faq'`、`message` 含導向連結、`faq.url` 有值。
