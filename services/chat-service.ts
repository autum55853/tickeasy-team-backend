/**
 * 聊天服務 (使用 OpenAI Responses API)
 * 整合傳統客服會話與即時 AI 問答功能
 */

import OpenAI from 'openai';
import { supabaseService } from './supabase-service.js';

import { AppDataSource } from '../config/database.js';
import { SupportSession, SessionStatus } from '../models/support-session.js';
import { SupportMessage, SenderType, MessageType } from '../models/support-message.js';
import * as dotenv from 'dotenv';

dotenv.config();

export interface ChatOptions {
  sessionId?: string;
  userId?: string;
  category?: string;
  createSession?: boolean; // 是否需要建立會話記錄
  previousResponseId?: string; // Responses API 的前一個回應 ID
}

export interface ChatResponse {
  message: string;
  sources: Array<{
    id: string;
    title: string;
    category?: string;
    similarity: number;
  }>;
  confidence: number;
  hasRelevantInfo: boolean;
  shouldTransfer?: boolean;
  sessionId?: string;
  responseId: string; // Responses API 的回應 ID
  processingTime: number;
  model: string;
  tokens: number;
}

interface SearchResult {
  id: string;
  type: 'knowledge_base' | 'faq';
  title: string;
  content: string;
  similarity: number;
  category?: string;
  keywords?: string[];
}

export class ChatService {
  private openai: OpenAI;
  private systemPrompt: string;

  constructor() {
    const apiKey = process.env.OPENAI_API_KEY;
    
    if (!apiKey) {
      throw new Error('缺少 OpenAI API Key');
    }

    this.openai = new OpenAI({ apiKey });
    this.systemPrompt = this.buildSystemPrompt();
    console.log('✅ 聊天服務初始化成功 (Responses API)');
  }

  /**
   * 建立系統提示詞
   */
  private buildSystemPrompt(): string {
    return `你是 Tickeasy 票務平台的專業客服助理。

你的職責：
1. 🎫 協助用戶解決票務相關問題（購票、退票、座位選擇等）
2. 🎵 提供演唱會和活動資訊
3. 💳 協助處理付款和訂單問題
4. 📧 引導用戶使用平台功能

回覆原則：
✅ 使用繁體中文回覆
✅ 保持專業但友善的語調
✅ 提供具體、實用的解決方案
✅ 如果不確定答案，誠實告知並建議聯繫人工客服
✅ 回覆長度控制在 100-200 字內

常見問題類型：
• 購票流程和付款問題
• 座位選擇和票種說明
• 退票和改票政策
• 演唱會時間地點資訊
• 帳號註冊和登入問題
• 電子票券使用方式

如果遇到複雜問題或用戶明確要求，請建議轉接人工客服。

現在請根據用戶的問題提供專業的協助。`;
  }

  /**
   * 檢查服務狀態
   */
  async checkServiceStatus(): Promise<boolean> {
    try {
      const response = await this.openai.responses.create({
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        input: '測試'
      });

      return !!response.output_text;
    } catch (error) {
      console.error('❌ OpenAI 服務檢查失敗:', error);
      return false;
    }
  }

  /**
   * 統一聊天介面 (使用 Responses API)
   */
  async chat(userMessage: string, options: ChatOptions = {}): Promise<ChatResponse> {
    const startTime = Date.now();
    
    try {
      const { 
        sessionId, 
        userId, 
        category,
        createSession = false,
        previousResponseId
      } = options;

      console.log(`🤖 處理用戶提問: "${userMessage.slice(0, 50)}${userMessage.length > 50 ? '...' : ''}"`);

      // 1. 搜尋相關知識庫內容
      const searchResults = await this.searchRelevantContent(userMessage);
      const hasRelevantInfo = searchResults.length > 0;

      // 2. 構建輸入內容（修正為符合 Responses API 規範）
      const input = this.buildInput(userMessage, searchResults, category, previousResponseId);

      // 3. 調用 OpenAI Responses API（修正參數）
      const response = await this.openai.responses.create({
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        input: input,
        previous_response_id: previousResponseId,
        max_output_tokens: 300,
        temperature: 0.7
      });

      const aiResponse = response.output_text || '抱歉，我現在無法回答您的問題。';
      const processingTime = Date.now() - startTime;

      // 4. 計算信心度和轉接判斷
      const confidence = this.calculateConfidence(searchResults, aiResponse);
      const shouldTransfer = this.shouldTransferToHuman(aiResponse, confidence);

      // 5. 如果需要建立會話記錄，則儲存到資料庫
      let finalSessionId = sessionId;
      if (createSession && userId) {
        finalSessionId = await this.saveToSession(
          userId, 
          userMessage, 
          aiResponse, 
          category,
          confidence,
          shouldTransfer,
          sessionId,
          response.id
        );
      }

      const chatResponse: ChatResponse = {
        message: aiResponse,
        sources: searchResults.map(source => ({
          id: source.id,
          title: source.title,
          category: source.category,
          similarity: source.similarity
        })),
        confidence,
        hasRelevantInfo,
        shouldTransfer,
        sessionId: finalSessionId,
        responseId: response.id,
        processingTime,
        model: response.model,
        tokens: response.usage?.total_tokens || 0
      };

      console.log(`✅ 客服回覆完成 (信心度: ${(confidence * 100).toFixed(1)}%, Response ID: ${response.id})`);
      return chatResponse;

    } catch (error) {
      console.error('❌ 聊天服務處理失敗:', error);
      
      return {
        message: '抱歉，系統暫時無法處理您的請求，請稍後再試或聯繫人工客服。',
        sources: [],
        confidence: 0,
        hasRelevantInfo: false,
        shouldTransfer: true,
        responseId: '',
        processingTime: Date.now() - startTime,
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        tokens: 0
      };
    }
  }

  /**
   * 構建輸入內容（修正為符合 Responses API 規範）
   */
  private buildInput(userMessage: string, sources: SearchResult[], category?: string, previousResponseId?: string): any {
    // 如果有前一個回應 ID，則使用簡單的輸入格式
    if (previousResponseId) {
      return userMessage;
    }

    // 構建增強的輸入內容
    let contextInfo = '';
    
    if (sources.length > 0) {
      contextInfo = `\n\n相關知識庫內容：\n${sources.map((source, index) => 
        `${index + 1}. ${source.title} (${source.type})\n內容：${source.content}`
      ).join('\n\n')}`;
    }

    if (category) {
      contextInfo += `\n\n問題分類：${category}`;
    }

    // 根據 Responses API 文檔，input 可以是字符串或消息陣列
    return [
      { role: 'system', content: this.systemPrompt },
      { role: 'user', content: userMessage + contextInfo }
    ];
  }

  /**
   * 搜尋相關知識庫內容
   */
  private async searchRelevantContent(userMessage: string, limit = 5): Promise<SearchResult[]> {
    try {
      const results: SearchResult[] = [];

      // 使用 Supabase 搜尋知識庫
      const knowledgeResults = await supabaseService.searchKnowledgeBase(userMessage, { limit });
      
              for (const item of knowledgeResults) {
          results.push({
            id: item.id,
            type: 'knowledge_base',
            title: item.title,
            content: item.content,
            similarity: item.similarity,
            category: item.category,
            keywords: item.tags || []
          });
        }

      return results;
    } catch (error) {
      console.error('❌ 搜尋知識庫失敗:', error);
      return [];
    }
  }

  /**
   * 計算信心度
   */
  private calculateConfidence(sources: SearchResult[], response: string): number {
    if (sources.length === 0) return 0.3;

    // 基於搜尋結果的相似度計算信心度
    const avgSimilarity = sources.reduce((sum, source) => sum + source.similarity, 0) / sources.length;
    
    // 基於回應內容的信心度指標
    let responseConfidence = 0.7;
    
    // 檢查回應是否包含不確定的詞語
    const uncertainWords = ['不確定', '可能', '也許', '或許', '建議', '人工客服'];
    const uncertainCount = uncertainWords.filter(word => response.includes(word)).length;
    responseConfidence -= uncertainCount * 0.1;

    // 檢查回應長度（太短可能不完整）
    if (response.length < 20) {
      responseConfidence -= 0.2;
    }

    // 綜合計算最終信心度
    const finalConfidence = (avgSimilarity * 0.6 + responseConfidence * 0.4);
    
    return Math.max(0, Math.min(1, finalConfidence));
  }

  /**
   * 判斷是否應該轉接人工客服
   */
  private shouldTransferToHuman(response: string, confidence: number): boolean {
    // 信心度低於 0.6 建議轉接
    if (confidence < 0.6) return true;

    // 包含特定關鍵字建議轉接
    const transferKeywords = [
      '人工客服', '轉接', '複雜問題', '特殊情況',
      '投訴', '退款', '法律', '緊急'
    ];

    return transferKeywords.some(keyword => response.includes(keyword));
  }

  /**
   * 儲存到會話記錄
   */
  private async saveToSession(
    userId: string,
    userMessage: string,
    aiResponse: string,
    category?: string,
    confidence?: number,
    shouldTransfer?: boolean,
    existingSessionId?: string,
    responseId?: string
  ): Promise<string> {
    try {
      const supportSessionRepo = AppDataSource.getRepository(SupportSession);
      const supportMessageRepo = AppDataSource.getRepository(SupportMessage);

      // 查找或建立會話
      let session: SupportSession | null = null;
      
      if (existingSessionId) {
        session = await supportSessionRepo.findOne({
          where: { supportSessionId: existingSessionId, userId }
        });
        
        if (!session) {
          throw new Error('會話不存在或無權限');
        }
      } else {
        // 檢查是否已有活躍會話
        session = await supportSessionRepo.findOne({
          where: { userId, status: SessionStatus.ACTIVE }
        });

        if (!session) {
          // 建立新會話
          session = new SupportSession();
          session.userId = userId;
          session.category = category || '一般諮詢';
          session = await supportSessionRepo.save(session);
        }
      }

      // 儲存用戶訊息
      const userMsg = new SupportMessage();
      userMsg.sessionId = session.supportSessionId;
      userMsg.senderType = SenderType.USER;
      userMsg.senderId = userId;
      userMsg.messageText = userMessage;
      userMsg.messageType = MessageType.TEXT;
      await supportMessageRepo.save(userMsg);

      // 儲存 AI 回覆
      const botMsg = new SupportMessage();
      botMsg.sessionId = session.supportSessionId;
      botMsg.senderType = SenderType.BOT;
      botMsg.messageText = aiResponse;
      botMsg.messageType = MessageType.TEXT;
      botMsg.metadata = {
        confidence,
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        responseId
      };
      await supportMessageRepo.save(botMsg);

      // 更新會話狀態
      if (shouldTransfer && session.status === SessionStatus.ACTIVE) {
        session.status = SessionStatus.WAITING;
        await supportSessionRepo.save(session);
      }

      // 設定首次回應時間
      if (!session.firstResponseAt) {
        session.firstResponseAt = new Date();
        await supportSessionRepo.save(session);
      }

      return session.supportSessionId;

    } catch (error) {
      console.error('❌ 儲存會話記錄失敗:', error);
      throw error;
    }
  }

  /**
   * 獲取常見問題
   */
  async getCommonQuestions(): Promise<string[]> {
    try {
      const suggestions = await supabaseService.getQuerySuggestions('', 10);
      
      const commonQuestions = [
        '如何購買門票？',
        '可以退票嗎？',
        '支援哪些付款方式？',
        '電子票券怎麼使用？',
        ...suggestions.slice(0, 6)
      ];

      return Array.from(new Set(commonQuestions));
    } catch (error) {
      console.error('❌ 獲取常見問題失敗:', error);
      return [
        '如何購買門票？',
        '可以退票嗎？',
        '支援哪些付款方式？',
        '電子票券怎麼使用？'
      ];
    }
  }

  /**
   * 分析用戶意圖
   */
  async analyzeIntent(userMessage: string): Promise<any> {
    try {
      const response = await this.openai.responses.create({
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        input: [
          {
            role: 'system',
            content: `分析用戶訊息的意圖，返回 JSON 格式：
{
  "intent": "購票|退票|查詢|投訴|其他",
  "category": "票務|技術|帳號|活動|付款",
  "urgency": "低|中|高",
  "sentiment": "正面|中性|負面",
  "keywords": ["關鍵字1", "關鍵字2"]
}`
          },
          {
            role: 'user',
            content: userMessage
          }
        ],
        max_output_tokens: 200,
        temperature: 0.3
      });

      const content = response.output_text;
      if (!content) {
        throw new Error('OpenAI 回應為空');
      }

      return JSON.parse(content);
    } catch (error) {
      console.error('❌ 意圖分析失敗:', error);
      return {
        intent: '其他',
        category: '一般',
        urgency: '中',
        sentiment: '中性',
        keywords: []
      };
    }
  }

  /**
   * 延續對話（利用 Responses API 的狀態管理）
   */
  async continueChat(userMessage: string, previousResponseId: string, options: Omit<ChatOptions, 'previousResponseId'> = {}): Promise<ChatResponse> {
    return this.chat(userMessage, {
      ...options,
      previousResponseId
    });
  }

  /**
   * 檢索之前的回應
   */
  async retrieveResponse(responseId: string): Promise<any> {
    try {
      const response = await this.openai.responses.retrieve(responseId);
      return response;
    } catch (error) {
      console.error('❌ 檢索回應失敗:', error);
      throw error;
    }
  }
}

// 創建單例實例
export const chatService = new ChatService(); 