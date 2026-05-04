/**
 * 知識庫管理服務
 * 提供知識庫的 CRUD 操作和嵌入向量管理
 */

import { AppDataSource } from '../config/database.js';
import { SupportKnowledgeBase } from '../models/support-knowledge-base.js';
import { embeddingService } from './embedding-service.js';
import { semanticSearchService } from './semantic-search-service.js';

export interface CreateKnowledgeBaseRequest {
  title: string;
  content: string;
  category?: string;
  tags?: string[];
  isActive?: boolean;
}

export interface UpdateKnowledgeBaseRequest {
  title?: string;
  content?: string;
  category?: string;
  tags?: string[];
  isActive?: boolean;
}

export interface KnowledgeBaseWithSimilarity {
  id: string;
  title: string;
  content: string;
  category?: string;
  tags: string[];
  isActive: boolean;
  hasEmbedding: boolean;
  similarity?: number;
  createdAt: Date;
  updatedAt: Date;
}

export class KnowledgeBaseService {

  /**
   * 創建新的知識庫項目
   */
  async createKnowledgeBase(data: CreateKnowledgeBaseRequest): Promise<KnowledgeBaseWithSimilarity> {
    try {
      console.log(`📝 創建新知識庫項目: "${data.title}"`);
      
      const knowledgeBaseRepo = AppDataSource.getRepository(SupportKnowledgeBase);
      
      // 創建知識庫項目
      const knowledgeBase = new SupportKnowledgeBase();
      knowledgeBase.title = data.title;
      knowledgeBase.content = data.content;
      knowledgeBase.category = data.category || '';
      knowledgeBase.tags = data.tags || [];
      knowledgeBase.isActive = data.isActive !== false; // 預設為 true

      // 儲存到資料庫
      const savedKnowledgeBase = await knowledgeBaseRepo.save(knowledgeBase);
      
      // 生成嵌入向量
      try {
        console.log('🧠 為新知識庫項目生成嵌入向量...');
        const embedding = await embeddingService.generateKnowledgeBaseEmbedding(savedKnowledgeBase);
        savedKnowledgeBase.setEmbedding(embedding);
        await knowledgeBaseRepo.save(savedKnowledgeBase);
        console.log('✅ 嵌入向量生成成功');
      } catch (embeddingError) {
        console.warn('⚠️ 嵌入向量生成失敗，將在後台重試:', embeddingError);
      }

      return this.transformToKnowledgeBaseWithSimilarity(savedKnowledgeBase);
    } catch (error: any) {
      console.error('❌ 創建知識庫項目失敗:', error);
      throw new Error(`創建知識庫項目失敗: ${error.message}`);
    }
  }

  /**
   * 更新知識庫項目
   */
  async updateKnowledgeBase(
    id: string, 
    data: UpdateKnowledgeBaseRequest
  ): Promise<KnowledgeBaseWithSimilarity> {
    try {
      console.log(`📝 更新知識庫項目: ${id}`);
      
      const knowledgeBaseRepo = AppDataSource.getRepository(SupportKnowledgeBase);
      const knowledgeBase = await knowledgeBaseRepo.findOne({
        where: { supportKBId: id }
      });

      if (!knowledgeBase) {
        throw new Error('知識庫項目不存在');
      }

      // 檢查是否有內容變更（需要重新生成嵌入向量）
      const contentChanged = data.title || data.content || data.tags;
      
      // 更新欄位
      if (data.title !== undefined) knowledgeBase.title = data.title;
      if (data.content !== undefined) knowledgeBase.content = data.content;
      if (data.category !== undefined) knowledgeBase.category = data.category;
      if (data.tags !== undefined) knowledgeBase.tags = data.tags;
      if (data.isActive !== undefined) knowledgeBase.isActive = data.isActive;

      // 儲存更新
      const updatedKnowledgeBase = await knowledgeBaseRepo.save(knowledgeBase);
      
      // 如果內容有變更，重新生成嵌入向量
      if (contentChanged) {
        try {
          console.log('🧠 內容已變更，重新生成嵌入向量...');
          const embedding = await embeddingService.generateKnowledgeBaseEmbedding(updatedKnowledgeBase);
          updatedKnowledgeBase.setEmbedding(embedding);
          await knowledgeBaseRepo.save(updatedKnowledgeBase);
          console.log('✅ 嵌入向量更新成功');
        } catch (embeddingError) {
          console.warn('⚠️ 嵌入向量更新失敗:', embeddingError);
        }
      }

      return this.transformToKnowledgeBaseWithSimilarity(updatedKnowledgeBase);
    } catch (error: any) {
      console.error('❌ 更新知識庫項目失敗:', error);
      throw new Error(`更新知識庫項目失敗: ${error.message}`);
    }
  }

  /**
   * 刪除知識庫項目（軟刪除）
   */
  async deleteKnowledgeBase(id: string): Promise<boolean> {
    try {
      console.log(`🗑️ 刪除知識庫項目: ${id}`);
      
      const knowledgeBaseRepo = AppDataSource.getRepository(SupportKnowledgeBase);
      const knowledgeBase = await knowledgeBaseRepo.findOne({
        where: { supportKBId: id }
      });

      if (!knowledgeBase) {
        throw new Error('知識庫項目不存在');
      }

      // 軟刪除：設置為不活躍
      knowledgeBase.isActive = false;
      await knowledgeBaseRepo.save(knowledgeBase);
      
      console.log('✅ 知識庫項目已刪除（軟刪除）');
      return true;
    } catch (error: any) {
      console.error('❌ 刪除知識庫項目失敗:', error);
      throw new Error(`刪除知識庫項目失敗: ${error.message}`);
    }
  }

  /**
   * 獲取單個知識庫項目
   */
  async getKnowledgeBase(id: string): Promise<KnowledgeBaseWithSimilarity | null> {
    try {
      const knowledgeBaseRepo = AppDataSource.getRepository(SupportKnowledgeBase);
      const knowledgeBase = await knowledgeBaseRepo.findOne({
        where: { supportKBId: id }
      });

      if (!knowledgeBase) {
        return null;
      }

      return this.transformToKnowledgeBaseWithSimilarity(knowledgeBase);
    } catch (error) {
      console.error('❌ 獲取知識庫項目失敗:', error);
      return null;
    }
  }

  /**
   * 獲取知識庫列表
   */
  async getKnowledgeBaseList(options: {
    page?: number;
    limit?: number;
    category?: string;
    search?: string;
    includeInactive?: boolean;
  } = {}): Promise<{
    items: KnowledgeBaseWithSimilarity[];
    total: number;
    page: number;
    limit: number;
  }> {
    try {
      const {
        page = 1,
        limit = 20,
        category,
        search,
        includeInactive = false
      } = options;

      const knowledgeBaseRepo = AppDataSource.getRepository(SupportKnowledgeBase);
      const queryBuilder = knowledgeBaseRepo.createQueryBuilder('kb');

      // 基本條件
      if (!includeInactive) {
        queryBuilder.where('kb.isActive = :isActive', { isActive: true });
      }

      // 分類過濾
      if (category) {
        queryBuilder.andWhere('kb.category = :category', { category });
      }

      // 搜尋過濾
      if (search) {
        queryBuilder.andWhere(
          '(LOWER(kb.title) LIKE :search OR LOWER(kb.content) LIKE :search)',
          { search: `%${search.toLowerCase()}%` }
        );
      }

      // 計算總數
      const total = await queryBuilder.getCount();

      // 獲取分頁資料
      const knowledgeBases = await queryBuilder
        .orderBy('kb.updatedAt', 'DESC')
        .skip((page - 1) * limit)
        .take(limit)
        .getMany();

      const items = knowledgeBases.map(kb => 
        this.transformToKnowledgeBaseWithSimilarity(kb)
      );

      return {
        items,
        total,
        page,
        limit
      };
    } catch (error) {
      console.error('❌ 獲取知識庫列表失敗:', error);
      return {
        items: [],
        total: 0,
        page: 1,
        limit: 20
      };
    }
  }

  /**
   * 搜尋知識庫（語義搜尋）
   */
  async searchKnowledgeBase(
    query: string,
    options: {
      limit?: number;
      threshold?: number;
      categories?: string[];
    } = {}
  ): Promise<KnowledgeBaseWithSimilarity[]> {
    try {
      const searchResults = await semanticSearchService.hybridSearch(query, options);
      
      // 獲取完整的知識庫資料
      const knowledgeBaseRepo = AppDataSource.getRepository(SupportKnowledgeBase);
      const results: KnowledgeBaseWithSimilarity[] = [];

      for (const result of searchResults) {
        if (result.type === 'knowledge_base') {
          const kb = await knowledgeBaseRepo.findOne({
            where: { supportKBId: result.id }
          });
          
          if (kb) {
            const transformed = this.transformToKnowledgeBaseWithSimilarity(kb);
            transformed.similarity = result.similarity;
            results.push(transformed);
          }
        }
      }

      return results;
    } catch (error) {
      console.error('❌ 搜尋知識庫失敗:', error);
      return [];
    }
  }

  /**
   * 批量更新嵌入向量
   */
  async batchUpdateEmbeddings(): Promise<{
    updated: number;
    failed: number;
    message: string;
  }> {
    try {
      console.log('🔄 開始批量更新知識庫嵌入向量...');
      const result = await embeddingService.updateKnowledgeBaseEmbeddings();
      
      return {
        ...result,
        message: `批量更新完成: ${result.updated} 成功, ${result.failed} 失敗`
      };
    } catch (error: any) {
      console.error('❌ 批量更新嵌入向量失敗:', error);
      return {
        updated: 0,
        failed: 1,
        message: `批量更新失敗: ${error.message}`
      };
    }
  }

  /**
   * 獲取知識庫統計
   */
  async getKnowledgeBaseStats(): Promise<{
    total: number;
    active: number;
    withEmbeddings: number;
    categories: { name: string; count: number }[];
    recentlyUpdated: number; // 最近7天更新的數量
  }> {
    try {
      const knowledgeBaseRepo = AppDataSource.getRepository(SupportKnowledgeBase);

      const [total, active] = await Promise.all([
        knowledgeBaseRepo.count(),
        knowledgeBaseRepo.count({ where: { isActive: true } })
      ]);

      // 獲取有嵌入向量的項目數量（避免復雜的查詢）
      let withEmbeddings = 0;
      try {
        withEmbeddings = await knowledgeBaseRepo
          .createQueryBuilder('kb')
          .where('kb.isActive = true')
          .andWhere('kb.embeddingVector IS NOT NULL')
          .getCount();
      } catch (error: any) {
        console.warn('⚠️  無法獲取嵌入向量統計:', error.message);
      }

      // 獲取分類統計
      let categories: { name: string; count: number }[] = [];
      try {
        const categoryStats = await knowledgeBaseRepo
          .createQueryBuilder('kb')
          .select('kb.category', 'category')
          .addSelect('COUNT(*)', 'count')
          .where('kb.isActive = true')
          .andWhere('kb.category IS NOT NULL')
          .groupBy('kb.category')
          .getRawMany();

        categories = categoryStats.map(stat => ({
          name: stat.category || '未分類',
          count: parseInt(stat.count)
        }));
      } catch (error: any) {
        console.warn('⚠️  無法獲取分類統計:', error.message);
      }

      // 最近7天更新的項目（簡化版本）
      let recentlyUpdated = 0;
      try {
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        
        recentlyUpdated = await knowledgeBaseRepo
          .createQueryBuilder('kb')
          .where('kb.isActive = true')
          .andWhere('kb.updatedAt > :date', { date: sevenDaysAgo })
          .getCount();
      } catch (error: any) {
        console.warn('⚠️  無法獲取最近更新統計:', error.message);
      }

      return {
        total,
        active,
        withEmbeddings,
        categories,
        recentlyUpdated
      };
    } catch (error) {
      console.error('❌ 獲取知識庫統計失敗:', error);
      return {
        total: 0,
        active: 0,
        withEmbeddings: 0,
        categories: [],
        recentlyUpdated: 0
      };
    }
  }

  /**
   * 轉換模型為返回格式
   */
  private transformToKnowledgeBaseWithSimilarity(
    kb: SupportKnowledgeBase
  ): KnowledgeBaseWithSimilarity {
    return {
      id: kb.supportKBId,
      title: kb.title,
      content: kb.content,
      category: kb.category,
      tags: kb.tags,
      isActive: kb.isActive,
      hasEmbedding: kb.hasEmbedding,
      createdAt: kb.createdAt,
      updatedAt: kb.updatedAt
    };
  }

  /**
   * 驗證知識庫資料
   */
  private validateKnowledgeBaseData(data: CreateKnowledgeBaseRequest | UpdateKnowledgeBaseRequest): string[] {
    const errors: string[] = [];

    if ('title' in data && data.title !== undefined) {
      if (!data.title || data.title.trim().length === 0) {
        errors.push('標題不能為空');
      } else if (data.title.length > 200) {
        errors.push('標題長度不能超過200字元');
      }
    }

    if ('content' in data && data.content !== undefined) {
      if (!data.content || data.content.trim().length === 0) {
        errors.push('內容不能為空');
      } else if (data.content.length > 10000) {
        errors.push('內容長度不能超過10000字元');
      }
    }

    if ('category' in data && data.category !== undefined) {
      if (data.category && data.category.length > 50) {
        errors.push('分類名稱不能超過50字元');
      }
    }

    if ('tags' in data && data.tags !== undefined) {
      if (data.tags && data.tags.length > 20) {
        errors.push('標籤數量不能超過20個');
      }
    }

    return errors;
  }
}

// 創建單例實例
export const knowledgeBaseService = new KnowledgeBaseService();