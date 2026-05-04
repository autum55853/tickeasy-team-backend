/**
 * 向量嵌入服務
 * 使用 OpenAI Embeddings API 將文本轉換為向量
 */

import OpenAI from 'openai';
import { AppDataSource } from '../config/database.js';
import { SupportKnowledgeBase } from '../models/support-knowledge-base.js';

export class EmbeddingService {
  private openai: OpenAI;
  private readonly EMBEDDING_MODEL = 'text-embedding-3-small'; // 經濟高效的模型
  private readonly EMBEDDING_DIMENSIONS = 1536; // 向量維度

  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
  }

  /**
   * 生成文本的向量嵌入
   */
  async generateEmbedding(text: string): Promise<number[]> {
    try {
      // 清理和準備文本
      const cleanText = this.preprocessText(text);
      
      if (!cleanText || cleanText.length < 5) {
        throw new Error('文本太短，無法生成有意義的嵌入');
      }

      const response = await this.openai.embeddings.create({
        model: this.EMBEDDING_MODEL,
        input: cleanText,
        dimensions: this.EMBEDDING_DIMENSIONS
      });

      const embedding = response.data[0].embedding;
      
      if (!embedding || embedding.length === 0) {
        throw new Error('OpenAI 返回空的嵌入向量');
      }

      return embedding;
    } catch (error: any) {
      console.error('❌ 生成嵌入向量失敗:', error);
      throw new Error(`嵌入生成失敗: ${error.message}`);
    }
  }

  /**
   * 批量生成嵌入向量
   */
  async generateBatchEmbeddings(texts: string[]): Promise<number[][]> {
    try {
      const cleanTexts = texts.map(text => this.preprocessText(text)).filter(text => text.length >= 5);
      
      if (cleanTexts.length === 0) {
        return [];
      }

      const response = await this.openai.embeddings.create({
        model: this.EMBEDDING_MODEL,
        input: cleanTexts,
        dimensions: this.EMBEDDING_DIMENSIONS
      });

      return response.data.map(item => item.embedding);
    } catch (error: any) {
      console.error('❌ 批量生成嵌入向量失敗:', error);
      throw new Error(`批量嵌入生成失敗: ${error.message}`);
    }
  }

  /**
   * 計算兩個向量的餘弦相似度
   */
  calculateCosineSimilarity(vecA: number[], vecB: number[]): number {
    if (vecA.length !== vecB.length) {
      throw new Error('向量維度不匹配');
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }

    normA = Math.sqrt(normA);
    normB = Math.sqrt(normB);

    if (normA === 0 || normB === 0) {
      return 0;
    }

    return dotProduct / (normA * normB);
  }

  /**
   * 預處理文本
   */
  private preprocessText(text: string): string {
    return text
      .trim()
      .replace(/\\s+/g, ' ') // 合併多個空格
      .replace(/[\\n\\r\\t]/g, ' ') // 移除換行符和制表符
      .substring(0, 8000); // 限制長度避免 API 限制
  }

  /**
   * 為知識庫項目生成嵌入
   */
  async generateKnowledgeBaseEmbedding(knowledgeBase: SupportKnowledgeBase): Promise<number[]> {
    // 結合標題、內容和標籤生成綜合嵌入
    const combinedText = [
      knowledgeBase.title,
      knowledgeBase.content,
      knowledgeBase.tags.join(' ')
    ].join(' ');

    return await this.generateEmbedding(combinedText);
  }



  /**
   * 批量更新知識庫的嵌入向量
   */
  async updateKnowledgeBaseEmbeddings(): Promise<{ updated: number; failed: number }> {
    console.log('🔄 開始批量更新知識庫嵌入向量...');
    
    const knowledgeBaseRepo = AppDataSource.getRepository(SupportKnowledgeBase);
    const knowledgeBases = await knowledgeBaseRepo.find({
      where: { isActive: true }
    });

    let updated = 0;
    let failed = 0;

    for (const kb of knowledgeBases) {
      try {
        const embedding = await this.generateKnowledgeBaseEmbedding(kb);
        kb.setEmbedding(embedding);
        await knowledgeBaseRepo.save(kb);
        updated++;
        console.log(`✅ 知識庫 "${kb.title}" 嵌入向量已更新`);
      } catch (error) {
        console.error(`❌ 知識庫 "${kb.title}" 嵌入向量更新失敗:`, error);
        failed++;
      }

      // 避免 API 速率限制
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    console.log(`🎉 知識庫嵌入向量更新完成: ${updated} 成功, ${failed} 失敗`);
    return { updated, failed };
  }



  /**
   * 獲取嵌入向量的統計信息
   */
  async getEmbeddingStats(): Promise<{
    knowledgeBaseWithEmbeddings: number;
    knowledgeBaseTotal: number;
  }> {
    const knowledgeBaseRepo = AppDataSource.getRepository(SupportKnowledgeBase);

    const [knowledgeBaseTotal, knowledgeBaseWithEmbeddings] = await Promise.all([
      knowledgeBaseRepo.count({ where: { isActive: true } }),
      knowledgeBaseRepo.count({ 
        where: { 
          isActive: true,
          embeddingVector: 'NOT NULL' as any // TypeORM 查詢 NOT NULL
        } 
      })
    ]);

    return {
      knowledgeBaseWithEmbeddings,
      knowledgeBaseTotal
    };
  }

  /**
   * 快速檢查 API Key 是否存在（不進行實際 API 調用）
   */
  hasApiKey(): boolean {
    return Boolean(process.env.OPENAI_API_KEY);
  }

  /**
   * 檢查服務是否可用
   */
  async isServiceAvailable(): Promise<boolean> {
    try {
      // 先檢查 API Key 是否存在
      if (!process.env.OPENAI_API_KEY) {
        console.warn('⚠️  OpenAI API Key 未設定');
        return false;
      }

      // 簡單測試嵌入服務
      const testEmbedding = await this.generateEmbedding('測試文本');
      return testEmbedding.length > 0;
    } catch (error: any) {
      console.error('❌ 嵌入服務不可用:', error.message);
      return false;
    }
  }
}

// 創建單例實例
export const embeddingService = new EmbeddingService();