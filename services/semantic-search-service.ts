/**
 * 語義搜尋服務
 * 使用向量嵌入進行語義搜尋和相似度匹配
 */

import { AppDataSource } from '../config/database.js';
import { SupportKnowledgeBase } from '../models/support-knowledge-base.js';
// import { FAQ } from '../models/faq.js'; // 暫時未使用
import { embeddingService } from './embedding-service.js';

export interface SearchResult {
  id: string;
  title: string;
  content: string;
  similarity: number;
  type: 'knowledge_base' | 'faq';
  category?: string;
  keywords?: string[];
}

export interface SearchOptions {
  limit?: number;
  threshold?: number; // 最低相似度閾值
  categories?: string[];
  includeInactive?: boolean;
}

export class SemanticSearchService {
  private readonly DEFAULT_LIMIT = 5;
  private readonly DEFAULT_THRESHOLD = 0.7; // 70% 相似度閾值

  /**
   * 語義搜尋知識庫
   */
  async searchKnowledgeBase(
    query: string, 
    options: SearchOptions = {}
  ): Promise<SearchResult[]> {
    try {
      console.log(`🔍 開始語義搜尋知識庫: "${query}"`);
      
      // 生成查詢向量
      const queryEmbedding = await embeddingService.generateEmbedding(query);
      
      // 獲取所有有嵌入向量的知識庫項目
      const knowledgeBaseRepo = AppDataSource.getRepository(SupportKnowledgeBase);
      const whereConditions: any = {
        isActive: options.includeInactive ? undefined : true,
        embeddingVector: 'NOT NULL' as any
      };

      if (options.categories && options.categories.length > 0) {
        whereConditions.category = 'IN' as any; // 需要在實際查詢中處理
      }

      const knowledgeBases = await knowledgeBaseRepo.find({
        where: whereConditions
      });

      console.log(`📚 找到 ${knowledgeBases.length} 個知識庫項目進行比較`);

      // 計算相似度並排序
      const results: SearchResult[] = [];
      
      for (const kb of knowledgeBases) {
        if (!kb.embeddingVector || kb.embeddingVector.length === 0) {
          continue;
        }

        const similarity = embeddingService.calculateCosineSimilarity(
          queryEmbedding,
          kb.embeddingVector
        );

        // 只包含高於閾值的結果
        if (similarity >= (options.threshold || this.DEFAULT_THRESHOLD)) {
          results.push({
            id: kb.supportKBId,
            title: kb.title,
            content: kb.content,
            similarity,
            type: 'knowledge_base',
            category: kb.category,
            keywords: kb.tags
          });
        }
      }

      // 按相似度排序並限制結果數量
      const sortedResults = results
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, options.limit || this.DEFAULT_LIMIT);

      console.log(`✅ 語義搜尋完成，找到 ${sortedResults.length} 個相關結果`);
      
      return sortedResults;
    } catch (error) {
      console.error('❌ 語義搜尋失敗:', error);
      return [];
    }
  }

  /**
   * 混合搜尋：結合關鍵字和語義搜尋
   */
  async hybridSearch(
    query: string,
    options: SearchOptions = {}
  ): Promise<SearchResult[]> {
    try {
      console.log(`🔀 開始混合搜尋: "${query}"`);

      // 檢查嵌入服務是否可用（先檢查 API Key）
      const hasApiKey = embeddingService.hasApiKey();
      
      let semanticResults: SearchResult[] = [];
      let keywordResults: SearchResult[] = [];

      if (hasApiKey) {
        try {
          // 嘗試執行語義搜尋
          [semanticResults, keywordResults] = await Promise.all([
            this.searchKnowledgeBase(query, { ...options, limit: options.limit || 10 }),
            this.keywordSearch(query, { ...options, limit: options.limit || 10 })
          ]);
        } catch (error: any) {
          // 如果語義搜尋失敗，只使用關鍵字搜尋
          console.warn('⚠️  語義搜尋失敗，降級到關鍵字搜尋:', error.message);
          keywordResults = await this.keywordSearch(query, { ...options, limit: options.limit || 10 });
        }
      } else {
        // 沒有 API Key，只執行關鍵字搜尋
        console.log('⚠️  沒有 OpenAI API Key，使用關鍵字搜尋');
        keywordResults = await this.keywordSearch(query, { ...options, limit: options.limit || 10 });
      }

      // 合併和去重結果
      const combinedResults = this.mergeSearchResults(semanticResults, keywordResults);

      // 重新排序：語義搜尋結果權重較高
      const finalResults = combinedResults
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, options.limit || this.DEFAULT_LIMIT);

      console.log(`✅ 混合搜尋完成，最終結果 ${finalResults.length} 個`);
      
      return finalResults;
    } catch (error) {
      console.error('❌ 混合搜尋失敗:', error);
      // 降級到只使用關鍵字搜尋
      try {
        console.log('🔄 降級到關鍵字搜尋...');
        return await this.keywordSearch(query, options);
      } catch (fallbackError) {
        console.error('❌ 關鍵字搜尋也失敗:', fallbackError);
        return [];
      }
    }
  }

  /**
   * 關鍵字搜尋（作為語義搜尋的補充）
   */
  async keywordSearch(
    query: string,
    options: SearchOptions = {}
  ): Promise<SearchResult[]> {
    try {
      const knowledgeBaseRepo = AppDataSource.getRepository(SupportKnowledgeBase);
      const keywords = query.toLowerCase().split(' ').filter(word => word.length > 1);
      
      if (keywords.length === 0) {
        return [];
      }

      // 構建查詢條件
      const queryBuilder = knowledgeBaseRepo.createQueryBuilder('kb')
        .where('kb.isActive = :isActive', { isActive: !options.includeInactive });

      // 添加關鍵字搜尋條件
      const keywordConditions = keywords.map((keyword, index) => {
        const paramName = `keyword${index}`;
        queryBuilder.setParameter(paramName, `%${keyword}%`);
        return `(LOWER(kb.title) LIKE :${paramName} OR LOWER(kb.content) LIKE :${paramName} OR EXISTS (SELECT 1 FROM unnest(kb.tags) AS tag WHERE LOWER(tag) LIKE :${paramName}))`;
      });

      queryBuilder.andWhere(`(${keywordConditions.join(' OR ')})`);

      if (options.categories && options.categories.length > 0) {
        queryBuilder.andWhere('kb.category IN (:...categories)', { categories: options.categories });
      }

      const knowledgeBases = await queryBuilder
        .limit(options.limit || this.DEFAULT_LIMIT)
        .getMany();

      // 計算簡單的關鍵字匹配分數
      return knowledgeBases.map(kb => {
        let score = 0;
        // const searchText = `${kb.title} ${kb.content} ${kb.tags.join(' ')}`.toLowerCase();
        
        keywords.forEach(keyword => {
          // 標題匹配權重更高
          if (kb.title.toLowerCase().includes(keyword)) {
            score += 3;
          }
          // 內容匹配
          if (kb.content.toLowerCase().includes(keyword)) {
            score += 2;
          }
          // 標籤匹配
          if (kb.tags.some(tag => tag.toLowerCase().includes(keyword))) {
            score += 2;
          }
        });

        // 將分數轉換為 0-1 之間的相似度，但設定更寬鬆的閨值
        const maxPossibleScore = keywords.length * 7; // 3+2+2
        const similarity = Math.min(score / maxPossibleScore, 1);
        // 確保有匹配的項目至少有 0.1 的相似度
        const finalSimilarity = score > 0 ? Math.max(similarity, 0.1) : 0;

        return {
          id: kb.supportKBId,
          title: kb.title,
          content: kb.content,
          similarity: finalSimilarity,
          type: 'knowledge_base' as const,
          category: kb.category,
          keywords: kb.tags
        };
      }).filter(result => result.similarity > 0); // 只返回有匹配的結果
    } catch (error) {
      console.error('❌ 關鍵字搜尋失敗:', error);
      return [];
    }
  }

  /**
   * 合併搜尋結果並去重
   */
  private mergeSearchResults(
    semanticResults: SearchResult[],
    keywordResults: SearchResult[]
  ): SearchResult[] {
    const resultMap = new Map<string, SearchResult>();

    // 添加語義搜尋結果（優先級較高）
    semanticResults.forEach(result => {
      resultMap.set(result.id, {
        ...result,
        similarity: result.similarity * 1.2 // 給語義搜尋結果加權
      });
    });

    // 添加關鍵字搜尋結果
    keywordResults.forEach(result => {
      const existing = resultMap.get(result.id);
      if (existing) {
        // 如果已存在，取較高的相似度分數
        existing.similarity = Math.max(existing.similarity, result.similarity);
      } else {
        resultMap.set(result.id, result);
      }
    });

    return Array.from(resultMap.values());
  }

  /**
   * 相似內容推薦
   */
  async findSimilarContent(
    contentId: string,
    contentType: 'knowledge_base' | 'faq',
    limit: number = 5
  ): Promise<SearchResult[]> {
    try {
      console.log(`🔗 尋找相似內容: ${contentType}/${contentId}`);

      let sourceEmbedding: number[];
      let sourceTitle: string;

      if (contentType === 'knowledge_base') {
        const knowledgeBaseRepo = AppDataSource.getRepository(SupportKnowledgeBase);
        const kb = await knowledgeBaseRepo.findOne({
          where: { supportKBId: contentId }
        });

        if (!kb || !kb.embeddingVector) {
          return [];
        }

        sourceEmbedding = kb.embeddingVector;
        sourceTitle = kb.title;
      } else {
        // FAQ 相似內容功能暫時不實作，因為 FAQ 沒有嵌入向量
        return [];
      }

      // 找到所有其他知識庫項目
      const knowledgeBaseRepo = AppDataSource.getRepository(SupportKnowledgeBase);
      const allKnowledgeBases = await knowledgeBaseRepo.find({
        where: {
          isActive: true,
          supportKBId: 'NOT' as any // 排除自己
        }
      });

      const results: SearchResult[] = [];

      for (const kb of allKnowledgeBases) {
        if (kb.supportKBId === contentId || !kb.embeddingVector) {
          continue;
        }

        const similarity = embeddingService.calculateCosineSimilarity(
          sourceEmbedding,
          kb.embeddingVector
        );

        if (similarity > 0.5) { // 50% 以上相似度
          results.push({
            id: kb.supportKBId,
            title: kb.title,
            content: kb.content,
            similarity,
            type: 'knowledge_base',
            category: kb.category,
            keywords: kb.tags
          });
        }
      }

      const sortedResults = results
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, limit);

      console.log(`✅ 找到 ${sortedResults.length} 個與 "${sourceTitle}" 相似的內容`);
      
      return sortedResults;
    } catch (error) {
      console.error('❌ 尋找相似內容失敗:', error);
      return [];
    }
  }

  /**
   * 獲取搜尋統計
   */
  async getSearchStats(): Promise<{
    totalKnowledgeBase: number;
    knowledgeBaseWithEmbeddings: number;
    averageEmbeddingQuality: number;
  }> {
    try {
      const knowledgeBaseRepo = AppDataSource.getRepository(SupportKnowledgeBase);
      
      const totalKnowledgeBase = await knowledgeBaseRepo.count({
        where: { isActive: true }
      });

      const knowledgeBaseWithEmbeddings = await knowledgeBaseRepo.count({
        where: {
          isActive: true,
          embeddingVector: 'NOT NULL' as any
        }
      });

      // 簡單的嵌入品質評估（暫時返回估計值）
      const averageEmbeddingQuality = knowledgeBaseWithEmbeddings > 0 ? 0.85 : 0;

      return {
        totalKnowledgeBase,
        knowledgeBaseWithEmbeddings,
        averageEmbeddingQuality
      };
    } catch (error) {
      console.error('❌ 獲取搜尋統計失敗:', error);
      return {
        totalKnowledgeBase: 0,
        knowledgeBaseWithEmbeddings: 0,
        averageEmbeddingQuality: 0
      };
    }
  }

  /**
   * 智能查詢建議
   */
  async getQuerySuggestions(
    partialQuery: string,
    limit: number = 5
  ): Promise<string[]> {
    try {
      // 基於知識庫標題和常見查詢生成建議
      const knowledgeBaseRepo = AppDataSource.getRepository(SupportKnowledgeBase);
      const queryBuilder = knowledgeBaseRepo.createQueryBuilder('kb')
        .select('kb.title')
        .where('kb.isActive = true')
        .andWhere('LOWER(kb.title) LIKE :query', { 
          query: `%${partialQuery.toLowerCase()}%` 
        })
        .limit(limit);

      const results = await queryBuilder.getMany();
      
      return results.map(kb => kb.title);
    } catch (error) {
      console.error('❌ 獲取查詢建議失敗:', error);
      return [];
    }
  }
}

// 創建單例實例
export const semanticSearchService = new SemanticSearchService();