/**
 * 聊天服務 (使用 Gemini 2.0 Flash)
 * 整合傳統客服會話與即時 AI 問答功能
 *
 * [OpenAI 原實作說明]
 * 原本使用 OpenAI Responses API（openai.responses.create / openai.responses.retrieve）。
 * 已改用 Gemini 2.0 Flash；對話歷史改由 DB 讀取最近 N 則訊息重建，
 * 不再依賴 OpenAI 伺服器端的 responseId 狀態管理。
 */

// [OpenAI] import OpenAI from 'openai';
import { GoogleGenerativeAI, Content } from '@google/generative-ai';
import { supabaseService } from './supabase-service.js';

import { AppDataSource } from '../config/database.js';
import { SupportSession, SessionStatus } from '../models/support-session.js';
import { SupportMessage, SenderType, MessageType } from '../models/support-message.js';
import * as dotenv from 'dotenv';

dotenv.config();

const GEMINI_MODEL = 'gemini-2.0-flash';

export interface ChatOptions {
  sessionId?: string;
  userId?: string;
  category?: string;
  createSession?: boolean;
  // [OpenAI] previousResponseId?: string; — Responses API 狀態管理，Gemini 改用 DB 歷史重建，此欄位已棄用
  previousResponseId?: string;
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
  // [OpenAI] responseId: string; — Responses API 回應 ID，Gemini 無此機制，回傳空字串（欄位保留供相容）
  responseId: string;
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
  // [OpenAI] private openai: OpenAI;
  private genAI!: GoogleGenerativeAI;
  private isInitialized: boolean = false;
  private systemPrompt: string;

  constructor() {
    // [OpenAI] const apiKey = process.env.OPENAI_API_KEY;
    // [OpenAI] if (!apiKey) { throw new Error('缺少 OpenAI API Key'); }
    // [OpenAI] this.openai = new OpenAI({ apiKey });

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.warn('⚠️  缺少 GEMINI_API_KEY，聊天服務將無法使用 AI 功能');
    } else {
      this.genAI = new GoogleGenerativeAI(apiKey);
      this.isInitialized = true;
    }

    this.systemPrompt = this.buildSystemPrompt();
    console.log('✅ 聊天服務初始化成功 (Gemini 2.0 Flash)');
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
    if (!this.isInitialized) return false;
    try {
      // [OpenAI] const response = await this.openai.responses.create({ model: process.env.OPENAI_MODEL || 'gpt-4o-mini', input: '測試' });
      // [OpenAI] return !!response.output_text;
      const model = this.genAI.getGenerativeModel({ model: GEMINI_MODEL });
      const result = await model.generateContent('測試');
      return !!result.response.text();
    } catch (error) {
      console.error('❌ Gemini 服務檢查失敗:', error);
      return false;
    }
  }

  /**
   * 統一聊天介面（初次對話，無歷史記錄）
   */
  async chat(userMessage: string, options: ChatOptions = {}): Promise<ChatResponse> {
    const startTime = Date.now();

    if (!this.isInitialized) {
      return this.buildErrorResponse(startTime);
    }

    try {
      const { sessionId, userId, category, createSession = false } = options;

      console.log(`🤖 處理用戶提問: "${userMessage.slice(0, 50)}${userMessage.length > 50 ? '...' : ''}"`);

      // 1. 搜尋相關知識庫內容
      const searchResults = await this.searchRelevantContent(userMessage);
      const hasRelevantInfo = searchResults.length > 0;

      // 2. 構建 prompt（純文字，systemInstruction 由 getGenerativeModel 傳入）
      // [OpenAI] const input = this.buildInput(userMessage, searchResults, category, previousResponseId);
      const prompt = this.buildPrompt(userMessage, searchResults, category);

      // 3. 調用 Gemini API
      // [OpenAI] const response = await this.openai.responses.create({ model: ..., input, previous_response_id: previousResponseId, ... });
      // [OpenAI] const aiResponse = response.output_text || '...';
      const model = this.genAI.getGenerativeModel({
        model: GEMINI_MODEL,
        systemInstruction: this.systemPrompt,
        generationConfig: { maxOutputTokens: 300, temperature: 0.7 }
      });
      const result = await model.generateContent(prompt);
      const aiResponse = result.response.text() || '抱歉，我現在無法回答您的問題。';
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
          undefined // [OpenAI] response.id — Gemini 無 responseId，存 undefined
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
        responseId: '', // [OpenAI] response.id — Gemini 無此機制，返回空字串
        processingTime,
        model: GEMINI_MODEL,
        tokens: result.response.usageMetadata?.totalTokenCount || 0
      };

      console.log(`✅ 客服回覆完成 (信心度: ${(confidence * 100).toFixed(1)}%)`);
      return chatResponse;

    } catch (error) {
      console.error('❌ 聊天服務處理失敗:', error);
      return this.buildErrorResponse(startTime);
    }
  }

  /**
   * 構建 Gemini prompt（純文字，system 由 systemInstruction 傳入）
   *
   * [OpenAI] buildInput() 原回傳 Responses API messages array：
   * [OpenAI] [{ role: 'system', content: systemPrompt }, { role: 'user', content: userMessage + contextInfo }]
   */
  private buildPrompt(userMessage: string, sources: SearchResult[], category?: string): string {
    let contextInfo = '';

    if (sources.length > 0) {
      contextInfo = `\n\n相關知識庫內容：\n${sources.map((source, index) =>
        `${index + 1}. ${source.title} (${source.type})\n內容：${source.content}`
      ).join('\n\n')}`;
    }

    if (category) {
      contextInfo += `\n\n問題分類：${category}`;
    }

    return userMessage + contextInfo;
  }

  /**
   * 搜尋相關知識庫內容
   */
  private async searchRelevantContent(userMessage: string, limit = 5): Promise<SearchResult[]> {
    try {
      const results: SearchResult[] = [];

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

    const avgSimilarity = sources.reduce((sum, source) => sum + source.similarity, 0) / sources.length;

    let responseConfidence = 0.7;

    const uncertainWords = ['不確定', '可能', '也許', '或許', '建議', '人工客服'];
    const uncertainCount = uncertainWords.filter(word => response.includes(word)).length;
    responseConfidence -= uncertainCount * 0.1;

    if (response.length < 20) {
      responseConfidence -= 0.2;
    }

    const finalConfidence = (avgSimilarity * 0.6 + responseConfidence * 0.4);

    return Math.max(0, Math.min(1, finalConfidence));
  }

  /**
   * 判斷是否應該轉接人工客服
   */
  private shouldTransferToHuman(response: string, confidence: number): boolean {
    if (confidence < 0.6) return true;

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

      let session: SupportSession | null = null;

      if (existingSessionId) {
        session = await supportSessionRepo.findOne({
          where: { supportSessionId: existingSessionId, userId }
        });

        if (!session) {
          throw new Error('會話不存在或無權限');
        }
      } else {
        session = await supportSessionRepo.findOne({
          where: { userId, status: SessionStatus.ACTIVE }
        });

        if (!session) {
          session = new SupportSession();
          session.userId = userId;
          session.category = category || '一般諮詢';
          session = await supportSessionRepo.save(session);
        }
      }

      const userMsg = new SupportMessage();
      userMsg.sessionId = session.supportSessionId;
      userMsg.senderType = SenderType.USER;
      userMsg.senderId = userId;
      userMsg.messageText = userMessage;
      userMsg.messageType = MessageType.TEXT;
      await supportMessageRepo.save(userMsg);

      const botMsg = new SupportMessage();
      botMsg.sessionId = session.supportSessionId;
      botMsg.senderType = SenderType.BOT;
      botMsg.messageText = aiResponse;
      botMsg.messageType = MessageType.TEXT;
      botMsg.metadata = {
        confidence,
        model: GEMINI_MODEL, // [OpenAI] model: process.env.OPENAI_MODEL || 'gpt-4o-mini'
        responseId           // [OpenAI] responseId: response.id — Gemini 為 undefined
      };
      await supportMessageRepo.save(botMsg);

      if (shouldTransfer && session.status === SessionStatus.ACTIVE) {
        session.status = SessionStatus.WAITING;
        await supportSessionRepo.save(session);
      }

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
    if (!this.isInitialized) {
      return { intent: '其他', category: '一般', urgency: '中', sentiment: '中性', keywords: [] };
    }
    try {
      // [OpenAI] const response = await this.openai.responses.create({ model: ..., input: [system, user], max_output_tokens: 200, temperature: 0.3 });
      // [OpenAI] const content = response.output_text;
      const model = this.genAI.getGenerativeModel({
        model: GEMINI_MODEL,
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.3,
          maxOutputTokens: 200
        }
      });
      const prompt = `分析用戶訊息的意圖，返回 JSON 格式：
{
  "intent": "購票|退票|查詢|投訴|其他",
  "category": "票務|技術|帳號|活動|付款",
  "urgency": "低|中|高",
  "sentiment": "正面|中性|負面",
  "keywords": ["關鍵字1", "關鍵字2"]
}

用戶訊息：${userMessage}`;
      const result = await model.generateContent(prompt);
      const content = result.response.text();
      if (!content) throw new Error('Gemini 回應為空');
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
   * 延續對話（從 DB 重建歷史後使用 Gemini startChat）
   *
   * [OpenAI] 原本利用 previousResponseId 讓 OpenAI Responses API 在伺服器端維護對話狀態。
   * [OpenAI] const response = await this.openai.responses.create({ previous_response_id: previousResponseId, ... });
   * 改為從 DB 讀取最近 10 則訊息重建 Gemini history。
   */
  async continueChat(
    userMessage: string,
    previousResponseId: string, // [OpenAI] 已棄用，保留參數簽名供相容
    options: Omit<ChatOptions, 'previousResponseId'> = {}
  ): Promise<ChatResponse> {
    const startTime = Date.now();

    if (!this.isInitialized) {
      return this.buildErrorResponse(startTime);
    }

    try {
      const { sessionId, userId, category, createSession = false } = options;

      console.log(`🤖 延續對話: "${userMessage.slice(0, 50)}${userMessage.length > 50 ? '...' : ''}"`);

      const searchResults = await this.searchRelevantContent(userMessage);
      const hasRelevantInfo = searchResults.length > 0;

      // 從 DB 讀取最近 10 則訊息重建 Gemini 對話歷史
      let history: Content[] = [];
      if (sessionId) {
        const supportMessageRepo = AppDataSource.getRepository(SupportMessage);
        const recentMessages = await supportMessageRepo.find({
          where: { sessionId },
          order: { createdAt: 'ASC' },
          take: 10
        });
        history = recentMessages.map(msg => ({
          role: msg.senderType === SenderType.USER ? 'user' : 'model',
          parts: [{ text: msg.messageText }]
        }));
      }

      const prompt = this.buildPrompt(userMessage, searchResults, category);

      const model = this.genAI.getGenerativeModel({
        model: GEMINI_MODEL,
        systemInstruction: this.systemPrompt,
        generationConfig: { maxOutputTokens: 300, temperature: 0.7 }
      });
      const chat = model.startChat({ history });
      const result = await chat.sendMessage(prompt);
      const aiResponse = result.response.text() || '抱歉，我現在無法回答您的問題。';
      const processingTime = Date.now() - startTime;

      const confidence = this.calculateConfidence(searchResults, aiResponse);
      const shouldTransfer = this.shouldTransferToHuman(aiResponse, confidence);

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
          undefined
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
        responseId: '',
        processingTime,
        model: GEMINI_MODEL,
        tokens: result.response.usageMetadata?.totalTokenCount || 0
      };

      console.log(`✅ 延續對話回覆完成 (信心度: ${(confidence * 100).toFixed(1)}%)`);
      return chatResponse;

    } catch (error) {
      console.error('❌ 延續對話處理失敗:', error);
      return this.buildErrorResponse(startTime);
    }
  }

  /**
   * 檢索之前的回應
   *
   * [OpenAI] const response = await this.openai.responses.retrieve(responseId);
   * [OpenAI] OpenAI Responses API 可透過 responseId 取回完整回應物件。
   * Gemini 無對應 API，改為從 DB 讀取 session 最後一則 bot 訊息。
   */
  async retrieveResponse(responseId: string): Promise<any> {
    try {
      const supportMessageRepo = AppDataSource.getRepository(SupportMessage);
      const lastBotMessage = await supportMessageRepo.findOne({
        where: { sessionId: responseId, senderType: SenderType.BOT },
        order: { createdAt: 'DESC' }
      });
      return lastBotMessage;
    } catch (error) {
      console.error('❌ 讀取回應失敗:', error);
      throw error;
    }
  }

  private buildErrorResponse(startTime: number): ChatResponse {
    return {
      message: '抱歉，系統暫時無法處理您的請求，請稍後再試或聯繫人工客服。',
      sources: [],
      confidence: 0,
      hasRelevantInfo: false,
      shouldTransfer: true,
      responseId: '',
      processingTime: Date.now() - startTime,
      model: GEMINI_MODEL,
      tokens: 0
    };
  }
}

export const chatService = new ChatService();
