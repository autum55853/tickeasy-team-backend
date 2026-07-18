/**
 * 知識庫 Controller
 * 提供知識庫管理和語義搜尋的 API 端點
 */

import { Request, Response } from 'express';
import { knowledgeBaseService } from '../services/knowledge-base-service.js';
import { semanticSearchService } from '../services/semantic-search-service.js';
import { embeddingService } from '../services/embedding-service.js';
import { handleErrorAsync } from '../utils/handleErrorAsync.js';
import { ApiError } from '../utils/index.js';
// import { ErrorCode } from '../types/api.js'; // 暫時未使用

export class KnowledgeBaseController {

  /**
   * 創建知識庫項目
   * POST /api/v1/knowledge-base
   */
  static createKnowledgeBase = handleErrorAsync(
    async (req: Request, res: Response) => {
      const { title, content, category, tags, isActive } = req.body;

      if (!title) {
        throw ApiError.fieldRequired('標題');
      }
      if (!content) {
        throw ApiError.fieldRequired('內容');
      }

      const knowledgeBase = await knowledgeBaseService.createKnowledgeBase({
        title,
        content,
        category,
        tags,
        isActive
      });

      res.status(201).json({
        success: true,
        message: '知識庫項目創建成功',
        data: knowledgeBase
      });
    }
  );

  /**
   * 更新知識庫項目
   * PUT /api/v1/knowledge-base/:id
   */
  static updateKnowledgeBase = handleErrorAsync(
    async (req: Request, res: Response) => {
      const { id } = req.params;
      const { title, content, category, tags, isActive } = req.body;

      if (!id) {
        throw ApiError.fieldRequired('知識庫 ID');
      }

      try {
        const knowledgeBase = await knowledgeBaseService.updateKnowledgeBase(id, {
          title,
          content,
          category,
          tags,
          isActive
        });

        res.json({
          success: true,
          message: '知識庫項目更新成功',
          data: knowledgeBase
        });
      } catch (error: any) {
        if (error.message && error.message.includes('不存在')) {
          throw ApiError.notFound('知識庫項目');
        }
        throw ApiError.systemError();
      }
    }
  );

  /**
   * 刪除知識庫項目
   * DELETE /api/v1/knowledge-base/:id
   */
  static deleteKnowledgeBase = handleErrorAsync(
    async (req: Request, res: Response) => {
      const { id } = req.params;

      if (!id) {
        throw ApiError.fieldRequired('知識庫 ID');
      }

      try {
        await knowledgeBaseService.deleteKnowledgeBase(id);

        res.json({
          success: true,
          message: '知識庫項目刪除成功'
        });
      } catch (error: any) {
        if (error.message && error.message.includes('不存在')) {
          throw ApiError.notFound('知識庫項目');
        }
        throw ApiError.systemError();
      }
    }
  );

  /**
   * 獲取知識庫項目詳情
   * GET /api/v1/knowledge-base/:id
   */
  static getKnowledgeBase = handleErrorAsync(
    async (req: Request, res: Response) => {
      const { id } = req.params;

      if (!id) {
        throw ApiError.fieldRequired('知識庫 ID');
      }

      const knowledgeBase = await knowledgeBaseService.getKnowledgeBase(id);

      if (!knowledgeBase) {
        throw ApiError.notFound('知識庫項目');
      }

      res.json({
        success: true,
        data: knowledgeBase
      });
    }
  );

  /**
   * 獲取知識庫列表
   * GET /api/v1/knowledge-base
   */
  static getKnowledgeBaseList = handleErrorAsync(
    async (req: Request, res: Response) => {
      const {
        page = 1,
        limit = 20,
        category,
        search,
        includeInactive = false
      } = req.query;

      const result = await knowledgeBaseService.getKnowledgeBaseList({
        page: Number(page),
        limit: Number(limit),
        category: category as string,
        search: search as string,
        includeInactive: includeInactive === 'true'
      });

      res.json({
        success: true,
        data: result
      });
    }
  );

  /**
   * 語義搜尋知識庫
   * GET /api/v1/knowledge-base/search
   */
  static searchKnowledgeBase = handleErrorAsync(
    async (req: Request, res: Response) => {
      const {
        q: query,
        limit = 10,
        threshold = 0.7,
        categories
      } = req.query;

      if (!query || typeof query !== 'string') {
        throw ApiError.fieldRequired('搜尋查詢參數');
      }

      const categoryArray = categories 
        ? (typeof categories === 'string' ? [categories] : categories as string[])
        : undefined;

      const results = await knowledgeBaseService.searchKnowledgeBase(query, {
        limit: Number(limit),
        threshold: Number(threshold),
        categories: categoryArray
      });

      res.json({
        success: true,
        data: {
          query,
          results,
          total: results.length
        }
      });
    }
  );

  /**
   * 尋找相似內容
   * GET /api/v1/knowledge-base/:id/similar
   */
  static findSimilarContent = handleErrorAsync(
    async (req: Request, res: Response) => {
      const { id } = req.params;
      const { limit = 5 } = req.query;

      if (!id) {
        throw ApiError.fieldRequired('知識庫 ID');
      }

      const similarContent = await semanticSearchService.findSimilarContent(
        id,
        'knowledge_base',
        Number(limit)
      );

      res.json({
        success: true,
        data: {
          similar: similarContent
        }
      });
    }
  );

  /**
   * 獲取查詢建議
   * GET /api/v1/knowledge-base/suggestions
   */
  static getQuerySuggestions = handleErrorAsync(
    async (req: Request, res: Response) => {
      const { q: partialQuery, limit = 5 } = req.query;

      if (!partialQuery || typeof partialQuery !== 'string') {
        throw ApiError.fieldRequired('查詢參數');
      }

      const suggestions = await semanticSearchService.getQuerySuggestions(
        partialQuery,
        Number(limit)
      );

      res.json({
        success: true,
        data: {
          suggestions
        }
      });
    }
  );

  /**
   * 批量更新嵌入向量
   * POST /api/v1/knowledge-base/embeddings/update
   */
  static updateEmbeddings = handleErrorAsync(
    async (req: Request, res: Response) => {
      const result = await knowledgeBaseService.batchUpdateEmbeddings();

      res.json({
        success: true,
        message: result.message,
        data: {
          updated: result.updated,
          failed: result.failed
        }
      });
    }
  );

  /**
   * 獲取知識庫統計
   * GET /api/v1/knowledge-base/stats
   */
  static getKnowledgeBaseStats = handleErrorAsync(
    async (req: Request, res: Response) => {
      const stats = await knowledgeBaseService.getKnowledgeBaseStats();
      const embeddingStats = await embeddingService.getEmbeddingStats();
      const searchStats = await semanticSearchService.getSearchStats();

      res.json({
        success: true,
        data: {
          knowledgeBase: stats,
          embeddings: embeddingStats,
          search: searchStats
        }
      });
    }
  );

  /**
   * 測試語義搜尋功能
   * POST /api/v1/knowledge-base/test-search
   */
  static testSemanticSearch = handleErrorAsync(
    async (req: Request, res: Response) => {
      const { query1, query2 } = req.body;

      if (!query1 || !query2) {
        throw ApiError.fieldRequired('請提供兩個查詢文本進行相似度測試');
      }

      // 生成兩個查詢的嵌入向量
      const [embedding1, embedding2] = await Promise.all([
        embeddingService.generateEmbedding(query1),
        embeddingService.generateEmbedding(query2)
      ]);

      // 計算相似度
      const similarity = embeddingService.calculateCosineSimilarity(embedding1, embedding2);

      // 測試搜尋功能
      const searchResults = await semanticSearchService.searchKnowledgeBase(query1, {
        limit: 3,
        threshold: 0.5
      });

      res.json({
        success: true,
        data: {
          query1,
          query2,
          similarity,
          interpretation: similarity > 0.8 ? '非常相似' : 
                         similarity > 0.6 ? '相似' : 
                         similarity > 0.4 ? '部分相似' : '不太相似',
          searchResults
        }
      });
    }
  );

  /**
   * 檢查嵌入服務狀態
   * GET /api/v1/knowledge-base/embedding-status
   */
  static checkEmbeddingStatus = handleErrorAsync(
    async (req: Request, res: Response) => {
      const isAvailable = await embeddingService.isServiceAvailable();
      const stats = await embeddingService.getEmbeddingStats();

      res.json({
        success: true,
        data: {
          serviceAvailable: isAvailable,
          stats,
          model: 'text-embedding-3-small',
          dimensions: 1536
        }
      });
    }
  );
}