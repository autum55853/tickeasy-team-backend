/**
 * 中央意圖識別服務
 * 負責分析用戶查詢的真實意圖並路由到對應的處理服務
 */

import openaiService from './openaiService.js';

 
// 支援的意圖類型
export enum IntentType {
  CONCERT = 'concert',           // 演唱會相關
  FOOD = 'food',                // 美食相關  
  HOTEL = 'hotel',              // 住宿相關
  TRANSPORT = 'transport',       // 交通相關
  GENERAL_SERVICE = 'general_service', // 一般客服
  UNKNOWN = 'unknown'           // 無法識別
}
 

// 意圖分析結果
export interface IntentAnalysisResult {
  primaryIntent: IntentType;
  confidence: number;           // 信心度 0-1
  secondaryIntents: IntentType[]; // 次要意圖
  keywords: string[];           // 提取的關鍵詞
  reasoning: string;            // 判斷理由
  shouldProceed: boolean;       // 是否信心度足夠繼續
  conflictDetected: boolean;    // 是否有意圖衝突
  userQuery: string;           // 原始查詢
}

export class IntentClassificationService {
  
  // AI意圖分析開關 - 可以輕鬆關閉回退到傳統邏輯
  private static readonly AI_INTENT_ENABLED = false;
  
  // 信心度閾值設定
  private static readonly CONFIDENCE_THRESHOLDS = {
    [IntentType.CONCERT]: 0.75,        // 演唱會查詢需要較高信心度
    [IntentType.FOOD]: 0.70,           // 美食查詢
    [IntentType.HOTEL]: 0.70,          // 住宿查詢  
    [IntentType.TRANSPORT]: 0.70,      // 交通查詢
    [IntentType.GENERAL_SERVICE]: 0.60, // 一般客服最寬鬆
    [IntentType.UNKNOWN]: 0.50
  };

  /**
   * 分析用戶查詢意圖
   */
  async analyzeIntent(userQuery: string): Promise<IntentAnalysisResult> {
    console.log(`🎯 開始意圖分析: "${userQuery}"`);
    
    try {
      // 如果AI分析被關閉，回退到傳統邏輯
      if (!IntentClassificationService.AI_INTENT_ENABLED) {
        console.log('📝 AI分析已關閉，使用傳統關鍵字匹配');
        return this.fallbackKeywordMatching(userQuery);
      }

      // 使用AI進行意圖分析
      const aiResult = await this.performAIIntentAnalysis(userQuery);
      
      // 驗證結果可靠性
      const validatedResult = this.validateIntentResult(aiResult, userQuery);
      
      console.log(`✅ 意圖分析完成: ${validatedResult.primaryIntent} (信心度: ${validatedResult.confidence})`);
      return validatedResult;
      
    } catch (error) {
      console.error('❌ AI意圖分析失敗，回退到傳統邏輯:', error);
      return this.fallbackKeywordMatching(userQuery);
    }
  }

  /**
   * 使用OpenAI進行意圖分析
   */
  private async performAIIntentAnalysis(userQuery: string): Promise<IntentAnalysisResult> {
    const prompt = `你是一個智能客服意圖分析專家。請分析用戶查詢的真實意圖。

用戶查詢: "${userQuery}"

請仔細分析並回傳JSON格式（不要用markdown格式）:
{
  "primary_intent": "concert|food|hotel|transport|general_service|unknown",
  "confidence": 0.0到1.0之間的數字,
  "secondary_intents": ["次要意圖陣列"],
  "keywords": ["提取的關鍵詞"],
  "reasoning": "判斷理由說明",
  "conflict_detected": true或false
}

意圖分類標準:
- concert: 詢問演唱會、表演、演出、活動、場地演出資訊
- food: 詢問美食、餐廳、好吃的、用餐地點
- hotel: 詢問住宿、飯店、旅館、民宿
- transport: 詢問交通、停車、搭車方式、路線
- general_service: 一般客服問題、購票、退票、帳戶問題
- unknown: 無法明確分類的查詢

特別注意:
- 如果查詢包含場地名稱但詢問非演出相關內容(如美食、住宿)，不應歸類為concert
- 要考慮整個句子的語境，不只是關鍵詞匹配
- 信心度要保守估計，不確定時降低信心度`;

    const aiResponse = await openaiService.getChatCompletion([
      {
        role: 'user',
        content: prompt
      }
    ], {
      model: 'gpt-4',
      temperature: 0.3,  // 降低隨機性，提高一致性
    });

    // 解析AI回應
    let parsedResult;
    try {
      parsedResult = JSON.parse(aiResponse);
    } catch (e) {
      console.error('❌ AI回應解析失敗:', aiResponse, e);
      throw new Error('AI回應格式錯誤');
    }

    // 轉換為標準格式
    return {
      primaryIntent: this.mapStringToIntentType(parsedResult.primary_intent),
      confidence: Math.max(0, Math.min(1, parsedResult.confidence || 0)),
      secondaryIntents: (parsedResult.secondary_intents || []).map((intent: string) => 
        this.mapStringToIntentType(intent)
      ),
      keywords: parsedResult.keywords || [],
      reasoning: parsedResult.reasoning || '',
      shouldProceed: true, // 將在驗證階段決定
      conflictDetected: parsedResult.conflict_detected || false,
      userQuery: userQuery
    };
  }

  /**
   * 驗證意圖分析結果
   */
  private validateIntentResult(result: IntentAnalysisResult, userQuery: string): IntentAnalysisResult {
    const threshold = IntentClassificationService.CONFIDENCE_THRESHOLDS[result.primaryIntent];
    const shouldProceed = result.confidence >= threshold;
    
    // 如果信心度不足，記錄並考慮回退
    if (!shouldProceed) {
      console.log(`⚠️ 信心度不足 ${result.confidence} < ${threshold}，可能需要回退`);
    }

    // 檢查是否有明顯的關鍵詞衝突
    const conflictDetected = this.detectKeywordConflicts(userQuery, result);
    
    return {
      ...result,
      shouldProceed,
      conflictDetected: conflictDetected || result.conflictDetected
    };
  }

  /**
   * 檢測關鍵詞衝突
   */
  private detectKeywordConflicts(userQuery: string, result: IntentAnalysisResult): boolean {
    const lowerQuery = userQuery.toLowerCase();
    
    // 演唱會意圖但包含明顯的非演出關鍵詞
    if (result.primaryIntent === IntentType.CONCERT) {
      const nonConcertKeywords = [
        '好吃', '美食', '餐廳', '吃什麼', '用餐',
        '住宿', '飯店', '旅館', '過夜',
        '停車', '搭車', '怎麼去', '交通'
      ];
      
      const hasConflict = nonConcertKeywords.some(keyword => 
        lowerQuery.includes(keyword)
      );
      
      if (hasConflict) {
        console.log('⚠️ 檢測到關鍵詞衝突: 演唱會意圖但包含非演出關鍵詞');
        return true;
      }
    }
    
    return false;
  }

  /**
   * 傳統關鍵字匹配回退邏輯
   */
  private fallbackKeywordMatching(userQuery: string): IntentAnalysisResult {
    const lowerQuery = userQuery.toLowerCase();
    
    // 🎯 客服指導詞彙（最高優先級） - 系統性完善版
    const instructionKeywords = [
      // 基本疑問詞
      '如何', '怎麼', '怎樣', '方法', '流程', '步驟', '教學', '說明',
      '要怎麼', '該怎麼', '可以怎麼', '怎麼辦', '怎麼做', '指導',
      '申請', '設定', '操作', '使用方式',
      
      // 購票相關核心詞彙
      '購票', '買票', '訂票', '購買', '下單', '購買門票', '買門票', 
      '線上購票', '網路購票', '購票流程', '想買票', '不會買票', '買票方法',
      
      // 退票相關核心詞彙
      '退票', '退款', '退費', '退錢', '取消訂單', '申請退款', 
      '退票流程', '退票申請', '想退票', '可以退嗎', '退款流程',
      
      // 會員管理核心詞彙
      '註冊', '登入', '登錄', '開戶', '加入會員', '建立帳號', '申請帳號',
      '註冊流程', '登入流程', '想要註冊', '沒有帳號', '無法登入', '登入問題',
      
      // 密碼相關核心詞彙
      '修改密碼', '更改密碼', '改密碼', '換密碼', '忘記密碼', '重設密碼',
      '找回密碼', '密碼忘了', '密碼重設', '密碼錯誤', '密碼無效',
      
      // 票券管理核心詞彙
      '取票', '領票', '拿票', '我的票券', '票券查看', '票券管理', 
      '電子票', 'QR碼', '二維碼', '入場', '驗票', '檢票', '掃碼',
      
      // 付款相關核心詞彙
      '付款方式', '支付方法', '信用卡', '轉帳', '超商', 'ATM', '現金',
      
      // 客服相關核心詞彙
      '客服時間', '服務時間', '營業時間', '上班時間', '客服電話', 
      '客服信箱', '線上客服',
      
      // 個人資料核心詞彙
      '編輯資料', '更新資料', '個人設定', '修改姓名', '更改電話', 
      '改地址', '修改信箱', '會員資料', '帳號資訊',
      
      // 主辦功能核心詞彙
      '舉辦', '主辦', '辦理', '籌辦', '策劃', '承辦', '辦演唱會', 
      '主辦申請', '活動主辦', '演出主辦',
      
      // 活動查詢核心詞彙
      '活動列表', '活動詳情', '活動介紹', '演出詳情', '報名流程', '活動報名'
    ];
    
    // 美食相關關鍵詞
    const foodKeywords = ['好吃', '美食', '餐廳', '吃什麼', '用餐', '食物'];
    // 住宿相關關鍵詞  
    const hotelKeywords = ['住宿', '飯店', '旅館', '過夜', '民宿'];
    // 交通相關關鍵詞
    const transportKeywords = ['停車', '搭車', '怎麼去', '交通', '路線', '捷運', '公車'];
    // 演唱會相關關鍵詞
    const concertKeywords = ['演唱會', '演出', '表演', '活動', '音樂會', '演奏會'];
    
    // 🎯 優先檢查：如果包含客服指導詞彙，優先歸類為一般客服
    const instructionMatches = instructionKeywords.filter(keyword => 
      lowerQuery.includes(keyword)
    );
    
    if (instructionMatches.length > 0) {
      console.log(`🎯 檢測到客服指導詞彙: [${instructionMatches.join(', ')}]`);
      console.log('🎯 優先歸類為一般客服，即使包含領域關鍵詞');
      
      return {
        primaryIntent: IntentType.GENERAL_SERVICE,
        confidence: 0.85,
        secondaryIntents: [],
        keywords: instructionMatches,
        reasoning: `傳統關鍵字匹配：檢測到客服指導詞彙 (${instructionMatches.join(', ')})，優先歸類為一般客服`,
        shouldProceed: true,
        conflictDetected: false,
        userQuery
      };
    }
    
    // 按優先順序檢查領域關鍵詞
    if (foodKeywords.some(keyword => lowerQuery.includes(keyword))) {
      return {
        primaryIntent: IntentType.FOOD,
        confidence: 0.8,
        secondaryIntents: [],
        keywords: foodKeywords.filter(k => lowerQuery.includes(k)),
        reasoning: '傳統關鍵字匹配：檢測到美食相關關鍵詞',
        shouldProceed: true,
        conflictDetected: false,
        userQuery
      };
    }
    
    if (hotelKeywords.some(keyword => lowerQuery.includes(keyword))) {
      return {
        primaryIntent: IntentType.HOTEL,
        confidence: 0.8,
        secondaryIntents: [],
        keywords: hotelKeywords.filter(k => lowerQuery.includes(k)),
        reasoning: '傳統關鍵字匹配：檢測到住宿相關關鍵詞',
        shouldProceed: true,
        conflictDetected: false,
        userQuery
      };
    }
    
    if (transportKeywords.some(keyword => lowerQuery.includes(keyword))) {
      return {
        primaryIntent: IntentType.TRANSPORT,
        confidence: 0.8,
        secondaryIntents: [],
        keywords: transportKeywords.filter(k => lowerQuery.includes(k)),
        reasoning: '傳統關鍵字匹配：檢測到交通相關關鍵詞',
        shouldProceed: true,
        conflictDetected: false,
        userQuery
      };
    }
    
    if (concertKeywords.some(keyword => lowerQuery.includes(keyword))) {
      return {
        primaryIntent: IntentType.CONCERT,
        confidence: 0.8,
        secondaryIntents: [],
        keywords: concertKeywords.filter(k => lowerQuery.includes(k)),
        reasoning: '傳統關鍵字匹配：檢測到演出相關關鍵詞',
        shouldProceed: true,
        conflictDetected: false,
        userQuery
      };
    }
    
    // 預設為一般客服
    return {
      primaryIntent: IntentType.GENERAL_SERVICE,
      confidence: 0.6,
      secondaryIntents: [],
      keywords: [],
      reasoning: '傳統關鍵字匹配：未檢測到特定領域關鍵詞，歸類為一般客服',
      shouldProceed: true,
      conflictDetected: false,
      userQuery
    };
  }

  /**
   * 字串轉意圖類型
   */
  private mapStringToIntentType(intentStr: string): IntentType {
    switch (intentStr) {
      case 'concert': return IntentType.CONCERT;
      case 'food': return IntentType.FOOD;
      case 'hotel': return IntentType.HOTEL;
      case 'transport': return IntentType.TRANSPORT;
      case 'general_service': return IntentType.GENERAL_SERVICE;
      default: return IntentType.UNKNOWN;
    }
  }

  /**
   * 處理意圖衝突情況
   */
  handleIntentConflict(result: IntentAnalysisResult): string {
    if (!result.conflictDetected) return '';
    
    return `我發現您的問題可能涉及多個方面。請問您主要想了解：
1. 演唱會和活動資訊
2. 美食和餐廳推薦  
3. 住宿和飯店資訊
4. 交通和停車資訊
5. 其他客服問題

請告訴我您最需要哪方面的幫助？`;
  }
}

// 創建單例實例
export const intentClassificationService = new IntentClassificationService(); 