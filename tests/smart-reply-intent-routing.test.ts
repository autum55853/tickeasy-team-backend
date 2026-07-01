import { jest } from '@jest/globals';
import { SupportKnowledgeBase } from '../models/support-knowledge-base.js';

// ── Module mocks（必須在 import smart-reply-service 之前）──────────────────────
// 目的：完全隔離 DB 與外部搜尋，只驗證 getSmartReply 的「意圖 → 路由」純邏輯。

// config/database：knowledgeBaseRepo.find 預設回空（無 tutorial / FAQ 命中）；
// 個別測試可透過 mockKbFind.mockResolvedValueOnce(...) 覆寫單次行為。
const mockKbFind = jest.fn<() => Promise<unknown[]>>().mockResolvedValue([]);
jest.unstable_mockModule('../config/database.js', () => ({
  AppDataSource: {
    getRepository: () => ({
      find: mockKbFind,
      update: jest.fn<() => Promise<unknown>>().mockResolvedValue({}),
    }),
  },
}));

// concert-search-service：搜尋一律回空（模擬查無演唱會）
const mockSearchConcerts = jest.fn<() => Promise<unknown[]>>().mockResolvedValue([]);
jest.unstable_mockModule('../services/concert-search-service.js', () => ({
  concertSearchService: {
    searchConcerts: mockSearchConcerts,
    formatConcertReply: jest.fn(),
  },
}));

// supabase-service：知識庫向量搜尋一律回空
jest.unstable_mockModule('../services/supabase-service.js', () => ({
  supabaseService: {
    searchKnowledgeBase: jest.fn<() => Promise<unknown[]>>().mockResolvedValue([]),
  },
}));

// intentClassificationService 維持真實（AI 關閉，走純關鍵字匹配）

const { smartReplyService } = await import('../services/smart-reply-service.js');

// ════════════════════════════════════════════════════════════════════════════
// getSmartReply 意圖路由
// ════════════════════════════════════════════════════════════════════════════

describe('smartReplyService.getSmartReply 意圖路由', () => {
  it('退票規定屬一般客服，不應被演唱會搜尋攔截', async () => {
    const result = await smartReplyService.getSmartReply('我想詢問退票規定');

    // 修正前會回 concert_search（截圖的「🎵 演唱會搜尋結果」）
    expect(result.type).not.toBe('concert_search');
    expect(result.message).not.toContain('演唱會搜尋結果');
  });

  it('明確演唱會查詢仍正常進入演唱會搜尋流程', async () => {
    const result = await smartReplyService.getSmartReply('最近有什麼演唱會');

    // 查無結果時回 concert_search（no_results），代表路由正確
    expect(result.type).toBe('concert_search');
    expect(mockSearchConcerts).toHaveBeenCalled();
  });

  it('FAQ 命中時最優先回覆並附上專屬導向連結', async () => {
    // 建立真實 entity 讓 calculateKeywordScore 可運算
    const faqRule = new SupportKnowledgeBase();
    faqRule.ruleId = 'faq-refund';
    faqRule.replyType = 'faq';
    faqRule.priority = 1;
    faqRule.keywords = ['退票'];
    faqRule.faqAnswer = '退票需於演出前 7 天申請。';
    faqRule.faqUrl = '/faq/refund';
    faqRule.relatedQuestions = [];

    // 頂層 matchFAQ 是第一個 find 呼叫，覆寫單次回傳該規則
    mockKbFind.mockResolvedValueOnce([faqRule]);
    mockSearchConcerts.mockClear(); // 清除前面測試的呼叫紀錄

    const result = await smartReplyService.getSmartReply('我想詢問退票規定');

    expect(result.type).toBe('faq');
    expect(result.faq?.url).toContain('/faq/refund');
    expect(result.message).toContain('[查看詳細說明]');
    // FAQ 最優先，不應觸發演唱會搜尋
    expect(mockSearchConcerts).not.toHaveBeenCalled();
  });
});
