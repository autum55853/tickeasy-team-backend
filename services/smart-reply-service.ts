/**
 * 智能回覆服務 (資料庫版本)
 * 使用 Knowledge Base 實現分層回覆策略：關鍵字過濾 → 圖文教學 → 常見問答 → 中性回答
 */

import { AppDataSource } from '../config/database.js';
import { SupportKnowledgeBase } from '../models/support-knowledge-base.js';
import { supabaseService } from './supabase-service.js';
import { concertSearchService } from './concert-search-service.js';
import { intentClassificationService, IntentType, IntentAnalysisResult } from './intent-classification-service.js';

export interface SmartReplyOptions {
  userId?: string;
  sessionId?: string;
  enableFallbackToAI?: boolean;
}

export interface SmartReplyResponse {
  type: 'tutorial' | 'faq' | 'neutral' | 'ai_fallback' | 'concert_search' | 'intent_conflict' | 'food_info' | 'hotel_info' | 'transport_info';
  message: string;
  tutorial?: {
    title: string;
    url: string;
    description?: string;
  };
  faq?: {
    answer: string;
    faqId?: string;
    relatedQuestions?: string[];
  };
  concertSearch?: {
    totalFound: number;
    concerts: Array<{
      concertId: string;
      title: string;
      artist?: string;
      location: string;
      dateRange: { start: Date; end: Date };
      ticketPriceRange?: { min: number; max: number };
    }>;
    summary: {
      upcomingCount: number;
      locationSummary: string[];
      priceRange?: { min: number; max: number };
    };
  };
  data?: {
    confidence?: number;
    customerServiceEmail?: string;
  };
  metadata: {
    matchedKeywords?: string[];
    processingTime: number;
    strategy: string;
    ruleId?: string;
    intentAnalysis?: IntentAnalysisResult; // 新增：意圖分析結果
  };
}

export class SmartReplyService {
  private customerServiceEmail = process.env.CUSTOMER_SERVICE_EMAIL || 'support@tickeasy.com';
  private knowledgeBaseRepo = AppDataSource.getRepository(SupportKnowledgeBase);

  constructor() {
    console.log('✅ 智能回覆服務初始化成功 (資料庫版本)');
  }

  /**
   * 獲取前端基礎 URL
   */
  private getFrontendBaseUrl(): string {
    const frontendUrl = process.env.FRONTEND_URL || '';
    // 移除可能存在的 /callback 路徑，以及結尾的斜線
    return frontendUrl.replace(/\/callback\/?$/, '').replace(/\/$/, '');
  }

  /**
   * 處理使用者訊息 - 主要入口
   */
  async processMessage(userMessage: string): Promise<SmartReplyResponse> {
    return this.getSmartReply(userMessage);
  }

  /**
   * 智能回覆主要邏輯 - 整合意圖識別架構
   */
  async getSmartReply(userMessage: string): Promise<SmartReplyResponse> {
    const startTime = Date.now();
    
    try {
      console.log(`🤖 智能回覆處理: "${userMessage.slice(0, 50)}${userMessage.length > 50 ? '...' : ''}"`);

      // 🎯 第一階段：統一意圖分析
      const intentResult = await intentClassificationService.analyzeIntent(userMessage);
      console.log(`🎯 意圖分析結果: ${intentResult.primaryIntent} (信心度: ${intentResult.confidence})`);

      // 🚨 處理意圖衝突
      if (intentResult.conflictDetected && !intentResult.shouldProceed) {
        const conflictMessage = intentClassificationService.handleIntentConflict(intentResult);
        return {
          type: 'intent_conflict',
          message: conflictMessage,
          data: { confidence: intentResult.confidence },
          metadata: {
            processingTime: Date.now() - startTime,
            strategy: 'intent_conflict_resolution',
            intentAnalysis: intentResult
          }
        };
      }

      // 🎯 第二階段：根據意圖路由到對應處理邏輯
      if (intentResult.shouldProceed) {
        const intentBasedResult = await this.processIntentBasedReply(userMessage, intentResult, startTime);
        if (intentBasedResult) {
          return intentBasedResult;
        }
      }

      // 🔄 第三階段：回退到傳統層級式處理
      console.log('⚡ 意圖信心度不足，回退到傳統處理流程');
      return await this.processTraditionalReply(userMessage, startTime, intentResult);

    } catch (error) {
      console.error('❌ 智能回覆處理失敗:', error);
      return this.getNeutralReply(userMessage, startTime);
    }
  }

  /**
   * 基於意圖的回覆處理
   */
  private async processIntentBasedReply(
    userMessage: string, 
    intentResult: IntentAnalysisResult,
    startTime: number
  ): Promise<SmartReplyResponse | null> {
    
    switch (intentResult.primaryIntent) {
      case IntentType.CONCERT: {
        console.log('🎵 處理演唱會查詢意圖');
        const concertResult = await this.tryConcertSearch(userMessage);
        if (concertResult) {
          concertResult.metadata.intentAnalysis = intentResult;
          return concertResult;
        }
        break;
      }

      case IntentType.FOOD:
        console.log('🍽️ 處理美食查詢意圖');
        return this.handleFoodQuery(userMessage, intentResult, startTime);

      case IntentType.HOTEL:
        console.log('🏨 處理住宿查詢意圖');
        return this.handleHotelQuery(userMessage, intentResult, startTime);

      case IntentType.TRANSPORT:
        console.log('🚗 處理交通查詢意圖');
        return this.handleTransportQuery(userMessage, intentResult, startTime);

      case IntentType.GENERAL_SERVICE:
        console.log('🎧 處理一般客服意圖');
        // 繼續使用傳統流程處理一般客服問題
        break;

      default:
        console.log('❓ 未知意圖，回退到傳統流程');
        break;
    }

    return null;
  }

  /**
   * 傳統層級式回覆處理（保留原有邏輯）
   */
  private async processTraditionalReply(
    userMessage: string, 
    startTime: number,
    intentResult?: IntentAnalysisResult
  ): Promise<SmartReplyResponse> {
    
    // 1. 圖文教學匹配 (最高優先級)
    const tutorialMatch = await this.matchTutorial(userMessage);
    if (tutorialMatch) {
      await this.incrementViewCount(tutorialMatch.ruleId);
      
      const baseUrl = this.getFrontendBaseUrl();
      // 如果 tutorialMatch.url 是相對路徑 (以 / 開頭)，就組合 URL
      const fullUrl = baseUrl && tutorialMatch.url.startsWith('/')
        ? `${baseUrl}${tutorialMatch.url}`
        : tutorialMatch.url;

      return {
        type: 'tutorial',
        message: `我為您找到了相關的圖文教學：**${tutorialMatch.title}**\n\n${tutorialMatch.description}\n\n👉 [點擊查看完整教學](${fullUrl})\n\n如還有其他問題，歡迎隨時詢問！`,
        tutorial: {
          title: tutorialMatch.title,
          url: fullUrl,
          description: tutorialMatch.description
        },
        data: { confidence: tutorialMatch.confidence },
        metadata: {
          matchedKeywords: tutorialMatch.matchedKeywords,
          processingTime: Date.now() - startTime,
          strategy: 'tutorial_match',
          ruleId: tutorialMatch.ruleId,
          intentAnalysis: intentResult
        }
      };
    }

    // 2. 常見問答匹配 (中等優先級)
    const faqMatch = await this.matchFAQ(userMessage);
    if (faqMatch) {
      await this.incrementViewCount(faqMatch.ruleId);
      
      return {
        type: 'faq',
        message: faqMatch.answer + (faqMatch.relatedQuestions?.length ? 
          `\n\n**您可能也想了解：**\n${faqMatch.relatedQuestions.map(q => `• ${q}`).join('\n')}` : ''),
        faq: {
          answer: faqMatch.answer,
          faqId: faqMatch.faqId,
          relatedQuestions: faqMatch.relatedQuestions
        },
        data: { confidence: faqMatch.confidence },
        metadata: {
          matchedKeywords: faqMatch.matchedKeywords,
          processingTime: Date.now() - startTime,
          strategy: 'faq_match',
          ruleId: faqMatch.ruleId,
          intentAnalysis: intentResult
        }
      };
    }

    // 3. 演唱會搜索 (如果還沒處理過)
    if (!intentResult || intentResult.primaryIntent !== IntentType.CONCERT) {
      const concertMatch = await this.tryConcertSearch(userMessage);
      if (concertMatch) {
        concertMatch.metadata.intentAnalysis = intentResult;
        return concertMatch;
      }
    }

    // 4. 知識庫搜尋嘗試
    const knowledgeMatch = await this.tryKnowledgeBaseSearch(userMessage);
    if (knowledgeMatch) {
      knowledgeMatch.metadata.intentAnalysis = intentResult;
      return knowledgeMatch;
    }

    // 5. 中性回答 + 客服信箱 (最後手段)
    const neutralReply = this.getNeutralReply(userMessage, startTime);
    neutralReply.metadata.intentAnalysis = intentResult;
    return neutralReply;
  }

  /**
   * 匹配圖文教學 (從資料庫)
   */
  private async matchTutorial(userMessage: string): Promise<{ 
    title: string; 
    url: string; 
    description: string; 
    confidence: number; 
    matchedKeywords: string[];
    ruleId: string;
  } | null> {
    try {
      // 從資料庫獲取所有圖文教學規則
      const tutorialRules = await this.knowledgeBaseRepo.find({
        where: { 
          replyType: 'tutorial', 
          isActive: true 
        },
        order: { priority: 'ASC' } // 優先級排序
      });

      if (tutorialRules.length === 0) {
        console.log('⚠️ 沒有找到圖文教學規則');
        return null;
      }

      console.log(`🔍 找到 ${tutorialRules.length} 個圖文教學規則`);
      console.log(`🔍 用戶輸入: "${userMessage}"`);
      
      // 調試：檢查第一個規則
      if (tutorialRules[0]) {
        const firstRule = tutorialRules[0];
        console.log(`🔍 第一個規則 - ID: ${firstRule.ruleId}, 關鍵字: [${firstRule.keywords.join(', ')}]`);
      }

      let bestMatch: any = null;
      let bestScore = 0;

      for (const rule of tutorialRules) {
        const score = rule.calculateKeywordScore(userMessage);
        console.log(`🔍 規則 ${rule.ruleId} 分數: ${score.toFixed(4)}`);
        
        if (score > bestScore) {
          bestScore = score;
          const matchedKeywords = rule.keywords.filter(keyword => 
            userMessage.toLowerCase().includes(keyword.toLowerCase())
          );
          
          bestMatch = {
            title: rule.title,
            url: rule.tutorialUrl!,
            description: rule.tutorialDescription || rule.content,
            confidence: Math.min(score, 0.95),
            matchedKeywords,
            ruleId: rule.ruleId!
          };
        }
      }

      console.log(`🔍 最佳分數: ${bestScore.toFixed(4)}, 閾值: 0.2`);
      console.log(`🔍 是否達到閾值: ${bestScore >= 0.2 ? '✅ 是' : '❌ 否'}`);
      
      return bestScore >= 0.2 ? bestMatch : null; // 降低閾值，提高匹配率

    } catch (error) {
      console.error('❌ 圖文教學匹配失敗:', error);
      return null;
    }
  }

  /**
   * 匹配常見問答 (從資料庫)
   */
  private async matchFAQ(userMessage: string): Promise<{
    answer: string;
    faqId?: string;
    confidence: number;
    matchedKeywords: string[];
    relatedQuestions?: string[];
    ruleId: string;
  } | null> {
    try {
      // 從資料庫獲取所有 FAQ 規則
      const faqRules = await this.knowledgeBaseRepo.find({
        where: { 
          replyType: 'faq', 
          isActive: true 
        },
        order: { priority: 'ASC' } // 優先級排序
      });

      if (faqRules.length === 0) {
        console.log('⚠️ 沒有找到 FAQ 規則');
        return null;
      }

      let bestMatch: any = null;
      let bestScore = 0;

      for (const rule of faqRules) {
        const score = rule.calculateKeywordScore(userMessage);
        
        if (score > bestScore) {
          bestScore = score;
          const matchedKeywords = rule.keywords.filter(keyword => 
            userMessage.toLowerCase().includes(keyword.toLowerCase())
          );
          
          bestMatch = {
            answer: rule.faqAnswer || rule.content,
            faqId: rule.ruleId!,
            confidence: Math.min(score, 0.95),
            matchedKeywords,
            relatedQuestions: rule.relatedQuestions,
            ruleId: rule.ruleId!
          };
        }
      }

      return bestScore >= 0.2 ? bestMatch : null;

    } catch (error) {
      console.error('❌ FAQ 匹配失敗:', error);
      return null;
    }
  }

  /**
   * 處理美食查詢意圖
   */
  private handleFoodQuery(
    userMessage: string, 
    intentResult: IntentAnalysisResult, 
    startTime: number
  ): SmartReplyResponse {
    const message = `很抱歉，我目前無法提供美食相關的資訊服務。

不過我可以協助您：
🎵 查詢演唱會和表演活動
🎧 處理購票和客服問題
📋 提供平台使用說明

如果您需要其他協助，請隨時告訴我！

客服信箱：${this.customerServiceEmail}`;

    return {
      type: 'food_info',
      message,
      data: { 
        confidence: intentResult.confidence,
        customerServiceEmail: this.customerServiceEmail 
      },
      metadata: {
        matchedKeywords: intentResult.keywords,
        processingTime: Date.now() - startTime,
        strategy: 'food_intent_not_supported',
        intentAnalysis: intentResult
      }
    };
  }

  /**
   * 處理住宿查詢意圖
   */
  private handleHotelQuery(
    userMessage: string, 
    intentResult: IntentAnalysisResult, 
    startTime: number
  ): SmartReplyResponse {
    const message = `很抱歉，我目前無法提供住宿相關的資訊服務。

不過我可以協助您：
🎵 查詢演唱會和表演活動
🎧 處理購票和客服問題  
📋 提供平台使用說明

如果您需要其他協助，請隨時告訴我！

客服信箱：${this.customerServiceEmail}`;

    return {
      type: 'hotel_info',
      message,
      data: { 
        confidence: intentResult.confidence,
        customerServiceEmail: this.customerServiceEmail 
      },
      metadata: {
        matchedKeywords: intentResult.keywords,
        processingTime: Date.now() - startTime,
        strategy: 'hotel_intent_not_supported',
        intentAnalysis: intentResult
      }
    };
  }

  /**
   * 處理交通查詢意圖
   */
  private handleTransportQuery(
    userMessage: string, 
    intentResult: IntentAnalysisResult, 
    startTime: number
  ): SmartReplyResponse {
    const message = `很抱歉，我目前無法提供交通相關的資訊服務。

不過我可以協助您：
🎵 查詢演唱會和表演活動
🎧 處理購票和客服問題
📋 提供平台使用說明

如果您需要其他協助，請隨時告訴我！

客服信箱：${this.customerServiceEmail}`;

    return {
      type: 'transport_info',
      message,
      data: { 
        confidence: intentResult.confidence,
        customerServiceEmail: this.customerServiceEmail 
      },
      metadata: {
        matchedKeywords: intentResult.keywords,
        processingTime: Date.now() - startTime,
        strategy: 'transport_intent_not_supported',
        intentAnalysis: intentResult
      }
    };
  }

  /**
   * 嘗試演唱會搜索 (新增功能)
   */
  private async tryConcertSearch(userMessage: string): Promise<SmartReplyResponse | null> {
    try {
      // 檢測是否為演唱會相關查詢
      if (!this.isConcertRelatedQuery(userMessage)) {
        return null;
      }

      console.log('🎵 檢測到演唱會相關查詢，開始搜索...');

      const searchResults = await concertSearchService.searchConcerts({
        query: userMessage,
        limit: 5,
        includeUpcoming: true
      });

      if (searchResults.length === 0) {
        // 沒找到演唱會，但已經檢測到演唱會意圖，給出明確回覆
        const noResultMessage = this.generateNoResultMessage(userMessage);
        return {
          type: 'concert_search',
          message: noResultMessage,
          concertSearch: {
            totalFound: 0,
            concerts: [],
            summary: {
              upcomingCount: 0,
              locationSummary: [],
            }
          },
          data: {
            confidence: 0.6 // 確定是演唱會查詢，但沒找到結果
          },
          metadata: {
            processingTime: Date.now() - Date.now(),
            strategy: 'concert_search_no_results'
          }
        };
      }

      const formattedReply = await concertSearchService.formatConcertReply(searchResults, userMessage);

      return {
        type: 'concert_search',
        message: formattedReply.message,
        concertSearch: {
          totalFound: formattedReply.summary.totalFound,
          concerts: searchResults.slice(0, 3).map(concert => ({
            concertId: concert.concertId,
            title: concert.title,
            artist: concert.artist,
            location: concert.location,
            dateRange: concert.dateRange,
            ticketPriceRange: concert.sessions.length > 0 ? concert.sessions[0].ticketPriceRange : undefined
          })),
          summary: formattedReply.summary
        },
        data: {
          confidence: searchResults.length > 0 ? 0.8 : 0.3
        },
        metadata: {
          processingTime: Date.now() - Date.now(),
          strategy: 'concert_search'
        }
      };

    } catch (error) {
      console.error('❌ 演唱會搜索失敗:', error);
      return null;
    }
  }

  /**
   * 檢測是否為演唱會相關查詢
   */
  private isConcertRelatedQuery(userMessage: string): boolean {
    const lowerMessage = userMessage.toLowerCase();
    console.log(`🎵 檢測演唱會意圖: "${userMessage}"`);
    
    // 演唱會核心關鍵字
    const concertKeywords = [
      '演唱會', '音樂會', '演出', '演奏會', '音樂節', '表演', '現場演出',
      '票', '購票', '買票', '訂票', '票價', '售票', '門票',
      '演唱', '唱歌', '歌手', '藝人', '歌星', '明星', '偶像',
      '場地', '體育場', '巨蛋', '小巨蛋', '演藝廳', '音樂廳', '場館',
      '座位', '位子', 'vip', '搖滾區', '看台',
      '時間', '日期', '場次', '幾點', '什麼時候', '哪天',
      // 實際場地名稱
      '森林音樂城', '流行音樂中心', '天空演藝中心', '光譜音樂會場', '城市體育館',
      '河岸留言', '西門紅樓', '夢想體育場', '銀河演奏廳', '星光大劇院', '陽光音樂廣場',
      '風之大舞台', '極光展演中心', '曙光體育館', '黎明演奏館', '藍海演唱會場地',
      '海岸音樂祭', '星辰展演空間', '城市音樂公園', '彩虹文化中心', '台北小巨蛋',
      '夏日音樂舞台', '光之音樂廳', 'Legacy', '華山1914'
    ];

    // 地區關鍵字
    const locationKeywords = [
      // 直轄市/縣市
      '台北', '新北', '桃園', '新竹', '苗栗', '台中', '彰化', '南投',
      '雲林', '嘉義', '台南', '高雄', '屏東', '宜蘭', '花蓮', '台東', '澎湖',
      // 區/市/鄉鎮 (根據實際場地資料)
      '板橋', '豐原', '新營', '橫山', '蘆竹', '北港', '古坑', '關山', '馬公',
      '松山', '萬華', '中正', '光明', '劍南', '光華', '石牌', '和平', '景美',
      '萬隆', '勝利', '中山', '文昌', '大坪', '五福', '育英', '民富', '劍潭',
      // 大區域
      '北部', '中部', '南部', '東部', '北台灣', '南台灣', '離島'
    ];

    // 音樂類型關鍵字
    const musicKeywords = [
      '流行', '搖滾', '爵士', '古典', '電音', '嘻哈', '民謠', '獨立',
      '流行音樂', '搖滾樂', '古典音樂'
    ];

    // 檢查是否包含相關關鍵字
    const matchedConcertKeywords = concertKeywords.filter(keyword => lowerMessage.includes(keyword));
    const matchedLocationKeywords = locationKeywords.filter(keyword => lowerMessage.includes(keyword));
    const matchedMusicKeywords = musicKeywords.filter(keyword => lowerMessage.includes(keyword));

    const hasConcertKeyword = matchedConcertKeywords.length > 0;
    const hasLocationKeyword = matchedLocationKeywords.length > 0;
    const hasMusicKeyword = matchedMusicKeywords.length > 0;

    console.log(`  - 演唱會關鍵字: ${hasConcertKeyword ? matchedConcertKeywords.join(', ') : '無'}`);
    console.log(`  - 地區關鍵字: ${hasLocationKeyword ? matchedLocationKeywords.join(', ') : '無'}`);
    console.log(`  - 音樂類型關鍵字: ${hasMusicKeyword ? matchedMusicKeywords.join(', ') : '無'}`);

    // 組合判斷邏輯
    if (hasConcertKeyword) {
      console.log(`  ✅ 匹配原因: 包含演唱會關鍵字 (${matchedConcertKeywords.join(', ')})`);
      return true; // 直接包含演唱會關鍵字
    }

    if (hasLocationKeyword && hasMusicKeyword) {
      console.log(`  ✅ 匹配原因: 地區 + 音樂類型 (${matchedLocationKeywords.join(', ')} + ${matchedMusicKeywords.join(', ')})`);
      return true; // 地區 + 音樂類型 (如：台北流行音樂演出)
    }

    // 檢查是否為藝人名查詢
    const artistIndicators = ['的演唱會', '演唱會', '的演出', '的音樂會', '的票'];
    const matchedArtistIndicators = artistIndicators.filter(indicator => lowerMessage.includes(indicator));
    const hasArtistIndicator = matchedArtistIndicators.length > 0;
    
    if (hasArtistIndicator) {
      console.log(`  ✅ 匹配原因: 藝人指示詞 (${matchedArtistIndicators.join(', ')})`);
      return true;
    }

    // 問句模式檢測
    const questionPatterns = [
      '有什麼演', '有哪些演', '推薦演', '最近有', '這個月有', '下個月有',
      '想看演', '想去演', '要去演', '想買票', '哪裡有演',
      '查演唱會', '查音樂會', '搜尋演', '找演唱會'
    ];

    const matchedQuestionPatterns = questionPatterns.filter(pattern => lowerMessage.includes(pattern));
    const hasQuestionPattern = matchedQuestionPatterns.length > 0;

    if (hasQuestionPattern) {
      console.log(`  ✅ 匹配原因: 問句模式 (${matchedQuestionPatterns.join(', ')})`);
      return true;
    }

    console.log('  ❌ 未匹配演唱會意圖');
    return false;
  }

  /**
   * 生成沒找到演唱會時的訊息
   */
  private generateNoResultMessage(userMessage: string): string {
    // 檢測是否詢問範圍外的場地
    const unsupportedVenues = [
      '台北巨蛋', '高雄巨蛋', '桃園巨蛋', '台南巨蛋',
      '洲際棒球場', '台中洲際', '新竹棒球場', 
      '國家體育場', '小港機場', '松山機場',
      '世運主場館', '高雄世運', '澄清湖棒球場',
      '花蓮棒球場', '斗六棒球場', '嘉義棒球場',
      '中華電信會議中心', '君悅酒店', '圓山飯店',
      '展覽館', '世貿', '南港展覽館', '信義威秀',
      '夢時代', '統一夢時代', '義大世界', '劍湖山',
      '六福村', '遊樂園'
    ];

    const lowerMessage = userMessage.toLowerCase();
    const foundUnsupportedVenue = unsupportedVenues.find(venue => 
      lowerMessage.includes(venue.toLowerCase())
    );

    if (foundUnsupportedVenue) {
      return `🎵 **演唱會搜尋結果**

很抱歉，我們目前沒有在「${foundUnsupportedVenue}」舉辦的演唱會活動。

**🏟️ 我們合作的場地包括：**
• 🎭 **台北地區**：台北小巨蛋、Legacy Taipei、河岸留言西門紅樓
• 🎪 **新北地區**：星辰展演空間、海岸音樂祭場地
• 🎨 **台中地區**：光之音樂廳、藍海演唱會場地
• 🎵 **其他地區**：流行音樂中心、天空演藝中心等

**💡 建議您可以：**
• 🔍 **搜尋合作場地**：查詢上述場地的演出
• 📱 **聯繫客服**：了解更多場地合作資訊
• 🔄 **關注最新公告**：我們持續擴展合作場地！`;
    }

    return `🎵 **演唱會搜尋結果**

很抱歉，目前沒有找到符合您查詢條件的演唱會。

**💡 建議您可以：**
• 🎤 **嘗試其他藝人**：搜尋不同的歌手或樂團
• 📍 **擴大地區範圍**：查看鄰近城市的演出
• 📅 **調整時間範圍**：查詢其他月份的演唱會
• 🔄 **演出資訊會持續更新，建議您稍後再試或關注我們的最新公告！**`;
  }

  /**
   * 嘗試知識庫搜尋 (一般知識庫內容)
   */
  private async tryKnowledgeBaseSearch(userMessage: string): Promise<SmartReplyResponse | null> {
    try {
      // 搜尋一般知識庫內容 (非智能回覆規則)
      const knowledgeResults = await supabaseService.searchKnowledgeBase(userMessage, {
        limit: 3
      });

      if (knowledgeResults.length > 0 && knowledgeResults[0].similarity > 0.7) {
        const bestResult = knowledgeResults[0];
        
        return {
          type: 'faq',
          message: `根據知識庫搜尋結果：\n\n**${bestResult.title}**\n\n${bestResult.content}\n\n如需更多協助，請聯繫客服：${this.customerServiceEmail}`,
          faq: {
            answer: bestResult.content,
            faqId: bestResult.id
          },
          data: {
            confidence: bestResult.similarity,
            customerServiceEmail: this.customerServiceEmail
          },
          metadata: {
            processingTime: Date.now() - Date.now(),
            strategy: 'knowledge_base_search'
          }
        };
      }

      return null;
    } catch (error) {
      console.error('❌ 知識庫搜尋失敗:', error);
      return null;
    }
  }

  /**
   * 中性回答
   */
  private getNeutralReply(userMessage: string, startTime: number): SmartReplyResponse {
    const neutralMessages = [
      '感謝您的詢問！您的問題我們已經收到。',
      '很抱歉，我目前無法完全理解您的問題。',
      '謝謝您聯繫我們！'
    ];

    const randomMessage = neutralMessages[Math.floor(Math.random() * neutralMessages.length)];
    
    return {
      type: 'neutral',
      message: `${randomMessage}\n\n為了提供您更準確的協助，建議您：\n\n📧 **聯繫客服信箱**：${this.customerServiceEmail}\n📞 **客服專線**：02-1234-5678\n⏰ **服務時間**：週一至週五 09:00-18:00\n\n我們的客服團隊將竭誠為您服務！`,
      data: {
        customerServiceEmail: this.customerServiceEmail,
        confidence: 0.1
      },
      metadata: {
        processingTime: Date.now() - startTime,
        strategy: 'neutral_fallback'
      }
    };
  }

  /**
   * 增加查看計數
   */
  private async incrementViewCount(ruleId: string): Promise<void> {
    try {
      await this.knowledgeBaseRepo.update(
        { ruleId },
        { viewCount: () => '"viewCount" + 1' }
      );
    } catch (error) {
      console.error('❌ 更新查看計數失敗:', error);
    }
  }

  /**
   * 記錄有用/無用反饋
   */
  async recordFeedback(ruleId: string, isHelpful: boolean): Promise<void> {
    try {
      const updateField = isHelpful ? 'helpfulCount' : 'notHelpfulCount';
      await this.knowledgeBaseRepo.update(
        { ruleId },
        { [updateField]: () => `"${updateField}" + 1` }
      );
      console.log(`✅ 記錄反饋成功: ${ruleId} - ${isHelpful ? '有用' : '無用'}`);
    } catch (error) {
      console.error('❌ 記錄反饋失敗:', error);
    }
  }

  /**
   * 獲取規則統計
   */
  async getRulesStats(): Promise<{ 
    tutorials: number; 
    faqs: number; 
    total: number;
    byPriority: Record<string, number>;
    topPerforming: any[];
  }> {
    try {
      const [tutorials, faqs, total] = await Promise.all([
        this.knowledgeBaseRepo.count({ where: { replyType: 'tutorial', isActive: true } }),
        this.knowledgeBaseRepo.count({ where: { replyType: 'faq', isActive: true } }),
        this.knowledgeBaseRepo.count({ where: { isActive: true } })
      ]);

      // 按優先級統計
      const priorityStats = await this.knowledgeBaseRepo
        .createQueryBuilder('kb')
        .select('kb.priority', 'priority')
        .addSelect('COUNT(*)', 'count')
        .where('kb.isActive = :active', { active: true })
        .andWhere('kb.ruleId IS NOT NULL')
        .groupBy('kb.priority')
        .getRawMany();

      const byPriority = priorityStats.reduce((acc, stat) => {
        acc[`priority${stat.priority}`] = parseInt(stat.count);
        return acc;
      }, {} as Record<string, number>);

      // 最受歡迎的規則
      const topPerforming = await this.knowledgeBaseRepo.find({
        where: { isActive: true, ruleId: { $ne: null } as any },
        order: { viewCount: 'DESC' },
        take: 5,
        select: ['ruleId', 'title', 'viewCount', 'helpfulCount', 'notHelpfulCount']
      });

      return {
        tutorials,
        faqs,
        total,
        byPriority,
        topPerforming
      };
    } catch (error) {
      console.error('❌ 獲取統計失敗:', error);
      return { tutorials: 0, faqs: 0, total: 0, byPriority: {}, topPerforming: [] };
    }
  }

  /**
   * 動態新增規則 (直接寫入資料庫)
   */
  async addRule(ruleData: {
    ruleId: string;
    title: string;
    content: string;
    category: string;
    replyType: 'tutorial' | 'faq';
    keywords: string[];
    priority: number;
    tutorialUrl?: string;
    tutorialDescription?: string;
    faqAnswer?: string;
    relatedQuestions?: string[];
  }): Promise<boolean> {
    try {
      const rule = this.knowledgeBaseRepo.create({
        ...ruleData,
        isActive: true
      });

      await this.knowledgeBaseRepo.save(rule);
      console.log(`✅ 新增規則成功: ${ruleData.ruleId}`);
      return true;
    } catch (error) {
      console.error('❌ 新增規則失敗:', error);
      return false;
    }
  }
}

// 創建單例實例
export const smartReplyService = new SmartReplyService(); 