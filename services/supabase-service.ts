/**
 * Supabase 客戶端服務
 * 直接連接 Supabase，替代 MCP
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

export class SupabaseService {
  private client: SupabaseClient;

  constructor() {
    const supabaseUrl = process.env.DB_URL!;
    const supabaseKey = process.env.DB_ANON_KEY!;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('缺少 Supabase 環境變數: DB_URL 或 DB_ANON_KEY');
    }

    this.client = createClient(supabaseUrl, supabaseKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
    console.log('✅ Supabase 客戶端初始化成功');
  }

  /**
   * 獲取 Supabase 客戶端
   */
  getClient(): SupabaseClient {
    return this.client;
  }

  /**
   * 測試連接
   */
  async testConnection(): Promise<boolean> {
    try {
      const { error } = await this.client
        .from('supportKnowledgeBase')
        .select('count')
        .limit(1);

      if (error) {
        console.error('❌ Supabase 連接測試失敗:', error.message);
        return false;
      }

      console.log('✅ Supabase 連接測試成功');
      return true;
    } catch (error) {
      console.error('❌ Supabase 連接測試失敗:', error);
      return false;
    }
  }

  /**
   * 搜尋知識庫（關鍵字搜尋）
   */
  async searchKnowledgeBase(
    query: string,
    options: {
      limit?: number;
      categories?: string[];
    } = {}
  ) {
    try {
      const { limit = 5, categories } = options;
      
      let queryBuilder = this.client
        .from('supportKnowledgeBase')
        .select('*')
        .eq('isActive', true);

      // 關鍵字搜尋：標題、內容、標籤
      const keywords = query.toLowerCase().split(' ').filter(word => word.length > 1);
      
      if (keywords.length > 0) {
        // 使用 PostgreSQL 的 ilike 進行模糊搜尋
        const searchConditions = keywords.map(keyword => 
          `title.ilike.%${keyword}%,content.ilike.%${keyword}%`
        ).join(',');
        
        queryBuilder = queryBuilder.or(searchConditions);
      }

      // 分類篩選
      if (categories && categories.length > 0) {
        queryBuilder = queryBuilder.in('category', categories);
      }

      const { data, error } = await queryBuilder
        .limit(limit)
        .order('updatedAt', { ascending: false });

      if (error) {
        console.error('❌ 知識庫搜尋失敗:', error);
        return [];
      }

      // 計算相似度分數
      const results = (data || []).map(item => {
        let score = 0;
        // const searchText = `${item.title} ${item.content}`.toLowerCase();
        
        keywords.forEach(keyword => {
          if (item.title.toLowerCase().includes(keyword)) score += 3;
          if (item.content.toLowerCase().includes(keyword)) score += 2;
          if (item.tags && item.tags.some((tag: string) => tag.toLowerCase().includes(keyword))) {
            score += 2;
          }
        });

        const maxScore = keywords.length * 7;
        const similarity = score > 0 ? Math.max(score / maxScore, 0.1) : 0;

        return {
          id: item.supportKBId,
          title: item.title,
          content: item.content,
          category: item.category,
          tags: item.tags || [],
          similarity,
          createdAt: item.createdAt,
          updatedAt: item.updatedAt
        };
      }).filter(item => item.similarity > 0)
        .sort((a, b) => b.similarity - a.similarity);

      console.log(`🔍 知識庫搜尋完成: "${query}" 找到 ${results.length} 個結果`);
      return results;

    } catch (error) {
      console.error('❌ 知識庫搜尋異常:', error);
      return [];
    }
  }

  /**
   * 獲取知識庫統計
   */
  async getKnowledgeBaseStats() {
    try {
      // 總數和活躍數
      const { count: totalCount } = await this.client
        .from('supportKnowledgeBase')
        .select('*', { count: 'exact', head: true });

      const { count: activeCount } = await this.client
        .from('supportKnowledgeBase')
        .select('*', { count: 'exact', head: true })
        .eq('isActive', true);

      // 分類統計
      const { data: categoryData } = await this.client
        .from('supportKnowledgeBase')
        .select('category')
        .eq('isActive', true);

      const categories = (categoryData || []).reduce((acc: Record<string, number>, item) => {
        const category = item.category || '未分類';
        acc[category] = (acc[category] || 0) + 1;
        return acc;
      }, {});

      return {
        total: totalCount || 0,
        active: activeCount || 0,
        categories: Object.entries(categories).map(([name, count]) => ({ name, count }))
      };
    } catch (error) {
      console.error('❌ 獲取統計失敗:', error);
      return {
        total: 0,
        active: 0,
        categories: []
      };
    }
  }

  /**
   * 獲取查詢建議
   */
  async getQuerySuggestions(partialQuery: string, limit: number = 5) {
    try {
      const { data, error } = await this.client
        .from('supportKnowledgeBase')
        .select('title')
        .eq('isActive', true)
        .ilike('title', `%${partialQuery}%`)
        .limit(limit);

      if (error) {
        console.error('❌ 獲取查詢建議失敗:', error);
        return [];
      }

      return (data || []).map(item => item.title);
    } catch (error) {
      console.error('❌ 獲取查詢建議異常:', error);
      return [];
    }
  }
}

// 創建單例
export const supabaseService = new SupabaseService();
