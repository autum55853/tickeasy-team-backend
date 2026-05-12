/**
 * 向量嵌入服務
 * 使用 Gemini text-embedding-004 將文本轉換為向量（768 維）
 *
 * [OpenAI 原實作說明]
 * 原本使用 OpenAI text-embedding-3-small（1536 維）。
 * 已改用 Gemini text-embedding-004（768 維）。
 * 向量以 JSONB 儲存，不需 DB schema migration，
 * 但切換後需執行 updateKnowledgeBaseEmbeddings() 重生所有現有向量。
 */

// [OpenAI] import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { AppDataSource } from '../config/database.js';
import { SupportKnowledgeBase } from '../models/support-knowledge-base.js';

export class EmbeddingService {
  // [OpenAI] private openai: OpenAI;
  private genAI: GoogleGenerativeAI;

  // [OpenAI] private readonly EMBEDDING_MODEL = 'text-embedding-3-small'; // 1536 維
  // [OpenAI] private readonly EMBEDDING_DIMENSIONS = 1536;
  private readonly EMBEDDING_MODEL = 'text-embedding-004'; // Gemini embedding 模型
  private readonly EMBEDDING_DIMENSIONS = 768;             // Gemini text-embedding-004 最大維度

  constructor() {
    // [OpenAI] this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
  }

  /**
   * 生成文本的向量嵌入
   */
  async generateEmbedding(text: string): Promise<number[]> {
    try {
      const cleanText = this.preprocessText(text);

      if (!cleanText || cleanText.length < 5) {
        throw new Error('文本太短，無法生成有意義的嵌入');
      }

      // [OpenAI] const response = await this.openai.embeddings.create({
      // [OpenAI]   model: this.EMBEDDING_MODEL,
      // [OpenAI]   input: cleanText,
      // [OpenAI]   dimensions: this.EMBEDDING_DIMENSIONS
      // [OpenAI] });
      // [OpenAI] const embedding = response.data[0].embedding;

      const embeddingModel = this.genAI.getGenerativeModel({ model: this.EMBEDDING_MODEL });
      const result = await embeddingModel.embedContent(cleanText);
      const embedding = result.embedding.values;

      if (!embedding || embedding.length === 0) {
        throw new Error('Gemini 返回空的嵌入向量');
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

      // [OpenAI] const response = await this.openai.embeddings.create({
      // [OpenAI]   model: this.EMBEDDING_MODEL,
      // [OpenAI]   input: cleanTexts,
      // [OpenAI]   dimensions: this.EMBEDDING_DIMENSIONS
      // [OpenAI] });
      // [OpenAI] return response.data.map(item => item.embedding);

      const embeddingModel = this.genAI.getGenerativeModel({ model: this.EMBEDDING_MODEL });
      const batchResult = await embeddingModel.batchEmbedContents({
        requests: cleanTexts.map(text => ({
          content: { role: 'user', parts: [{ text }] }
        }))
      });
      return batchResult.embeddings.map(e => e.values);
    } catch (error: any) {
      console.error('❌ 批量生成嵌入向量失敗:', error);
      throw new Error(`批量嵌入生成失敗: ${error.message}`);
    }
  }

  /**
   * 計算兩個向量的餘弦相似度（純數學運算，不依賴 AI API）
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
      .replace(/\\s+/g, ' ')
      .replace(/[\\n\\r\\t]/g, ' ')
      .substring(0, 8000);
  }

  /**
   * 為知識庫項目生成嵌入
   */
  async generateKnowledgeBaseEmbedding(knowledgeBase: SupportKnowledgeBase): Promise<number[]> {
    const combinedText = [
      knowledgeBase.title,
      knowledgeBase.content,
      knowledgeBase.tags.join(' ')
    ].join(' ');

    return await this.generateEmbedding(combinedText);
  }

  /**
   * 批量更新知識庫的嵌入向量
   * 注意：切換 AI 供應商後（維度從 1536 → 768），需執行此方法重生所有向量。
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
          embeddingVector: 'NOT NULL' as any
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
    // [OpenAI] return Boolean(process.env.OPENAI_API_KEY);
    return Boolean(process.env.GEMINI_API_KEY);
  }

  /**
   * 檢查服務是否可用
   */
  async isServiceAvailable(): Promise<boolean> {
    try {
      // [OpenAI] if (!process.env.OPENAI_API_KEY) { ... }
      if (!process.env.GEMINI_API_KEY) {
        console.warn('⚠️  Gemini API Key 未設定');
        return false;
      }

      const testEmbedding = await this.generateEmbedding('測試文本');
      return testEmbedding.length > 0;
    } catch (error: any) {
      console.error('❌ 嵌入服務不可用:', error.message);
      return false;
    }
  }
}

export const embeddingService = new EmbeddingService();
