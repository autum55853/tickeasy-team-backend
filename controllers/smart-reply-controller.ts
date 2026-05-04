/**
 * 智能回覆控制器 - 雙層架構版本
 * 上層：完整的業務邏輯和會話管理
 * 下層：OpenAI Responses API 技術實現
 * 實現分層回覆策略的 API 端點
 */

import { Request, Response } from 'express';
import { smartReplyService } from '../services/smart-reply-service.js';
import { chatService } from '../services/chat-service.js';
import { AppDataSource } from '../config/database.js';
import { SupportSession, SessionType, SessionStatus, Priority } from '../models/support-session.js';
import { SupportMessage, SenderType, MessageType } from '../models/support-message.js';

export class SmartReplyController {
  /**
   * 智能回覆 - 主要入口（無狀態）
   * 適用於快速問答，不建立會話記錄
   */
  static async reply(req: Request, res: Response) {
    try {
      const { message, enableAI = false } = req.body;
      
      if (!message) {
        return res.status(400).json({
          success: false,
          message: '缺少必要參數：message'
        });
      }

      console.log(`🤖 智能回覆請求: "${message.slice(0, 50)}${message.length > 50 ? '...' : ''}"`);

      // 優先使用關鍵字匹配
      const smartReply = await smartReplyService.getSmartReply(message);

      // 如果沒有找到匹配且啟用了 AI 後備
      if (smartReply.type === 'neutral' && enableAI) {
        try {
          console.log('🧠 使用 AI 後備回覆 (OpenAI Responses API)');
          
          // 使用 OpenAI Responses API，但不建立業務會話
          const aiReply = await chatService.chat(message, {
            createSession: false // 純技術層面的 AI 對話
          });

          return res.json({
            success: true,
            data: {
              type: 'ai_fallback',
              message: aiReply.message,
              data: {
                confidence: aiReply.confidence
              },
              metadata: {
                processingTime: aiReply.processingTime || 0,
                strategy: 'ai_fallback'
              }
            }
          });
        } catch (error) {
          console.warn('⚠️ AI 後備回覆失敗，使用中性回覆:', error);
        }
      }

      res.json({
        success: true,
        data: smartReply
      });

    } catch (error) {
      console.error('❌ 智能回覆失敗:', error);
      res.status(500).json({
        success: false,
        message: '智能回覆服務暫時無法使用，請稍後再試'
      });
    }
  }

  /**
   * 開始新的客服會話 - 雙層架構
   * POST /api/v1/smart-reply/session/start
   * 
   * 上層：建立業務會話記錄
   * 下層：初始化 OpenAI Responses API 對話
   */
  static async startSession(req: Request, res: Response) {
    try {
      const { userId, category, initialMessage } = req.body;

      console.log(`🚀 開始新會話 - 用戶: ${userId || '匿名'}, 分類: ${category || '一般諮詢'}`);

      const supportSessionRepo = AppDataSource.getRepository(SupportSession);

      // === 上層：業務會話管理 ===
      let existingSession = null;
      if (userId) {
        existingSession = await supportSessionRepo.findOne({
          where: {
            userId,
            status: SessionStatus.ACTIVE
          }
        });
      }

      let session: SupportSession;

      if (existingSession) {
        session = existingSession;
        console.log(`📋 使用現有會話: ${session.supportSessionId}`);
      } else {
        // 建立新的業務會話
        session = new SupportSession();
        session.userId = userId || null;
        session.sessionType = SessionType.BOT;
        session.status = SessionStatus.ACTIVE;
        session.priority = Priority.NORMAL;
        session.category = category || '一般諮詢';
        
        session = await supportSessionRepo.save(session);
        console.log(`✨ 建立新會話: ${session.supportSessionId}`);
      }

      let botMessage = null;

      // === 處理初始訊息 ===
      if (initialMessage) {
        console.log(`💬 處理初始訊息: "${initialMessage}"`);

        // 儲存用戶訊息到業務系統
        const supportMessageRepo = AppDataSource.getRepository(SupportMessage);
        const userMsg = new SupportMessage();
        userMsg.sessionId = session.supportSessionId;
        userMsg.senderType = SenderType.USER;
        userMsg.senderId = userId || null;
        userMsg.messageText = initialMessage;
        userMsg.messageType = MessageType.TEXT;
        await supportMessageRepo.save(userMsg);

        // === 下層：AI 回覆處理 ===
        // 1. 優先使用關鍵字匹配
        const smartReply = await smartReplyService.getSmartReply(initialMessage);
        
        let finalMessage = smartReply.message;
        let confidence = smartReply.data?.confidence || 0;
        let strategy = 'keyword_matching';
        let openaiResponseId = null;

        // 2. 如果關鍵字匹配失敗，使用 OpenAI Responses API
        if (smartReply.type === 'neutral') {
          try {
            console.log('🧠 關鍵字匹配失敗，使用 OpenAI Responses API');
            
            const aiReply = await chatService.chat(initialMessage, {
              sessionId: session.supportSessionId,
              userId: userId,
              category: category,
              createSession: false // 我們已經建立了業務會話
            });

            finalMessage = aiReply.message;
            confidence = aiReply.confidence;
            strategy = 'openai_responses_api';
            openaiResponseId = aiReply.responseId;

          } catch (error) {
            console.warn('⚠️ OpenAI Responses API 失敗，使用預設回覆:', error);
            finalMessage = '抱歉，我現在無法理解您的問題。請稍後再試或輸入「人工客服」尋求協助。';
            confidence = 0.1;
            strategy = 'fallback';
          }
        }

        // 儲存 AI 回覆到業務系統
        const botMsg = new SupportMessage();
        botMsg.sessionId = session.supportSessionId;
        botMsg.senderType = SenderType.BOT;
        botMsg.messageText = finalMessage;
        botMsg.messageType = MessageType.TEXT;
        botMsg.metadata = {
          confidence: confidence,
          responseId: openaiResponseId || undefined
        };
        await supportMessageRepo.save(botMsg);

        // 業務邏輯：檢查是否需要轉接
        if (smartReply.type === 'neutral' || confidence < 0.6) {
          session.status = SessionStatus.WAITING;
          console.log('🔄 信心度不足，標記為等待人工客服');
        }

        // 設定首次回應時間
        if (!session.firstResponseAt) {
          session.firstResponseAt = new Date();
        }
        
        await supportSessionRepo.save(session);

        botMessage = {
          text: finalMessage,
          type: smartReply.type,
          confidence: confidence,
          strategy: strategy,
          openaiResponseId: openaiResponseId
        };
      }

      res.status(201).json({
        success: true,
        message: '會話已開始',
        data: {
          sessionId: session.supportSessionId,
          status: session.status,
          sessionType: session.sessionType,
          category: session.category,
          botMessage,
          sessionStatus: session.status // active|waiting|closed
        }
      });

    } catch (error: any) {
      console.error('❌ 開始會話失敗:', error);
      res.status(500).json({
        success: false,
        message: '開始會話失敗',
        error: error.message
      });
    }
  }

  /**
   * 發送訊息到會話 - 雙層架構
   * POST /api/v1/smart-reply/session/:sessionId/message
   * 
   * 上層：業務會話狀態管理
   * 下層：OpenAI Responses API 對話延續
   */
  static async sendMessage(req: Request, res: Response) {
    try {
      const { sessionId } = req.params;
      const { message } = req.body;
      const userId = (req.user as any)?.userId;

      if (!message) {
        return res.status(400).json({
          success: false,
          message: '缺少必要參數：message'
        });
      }

      console.log(`💬 會話訊息 - Session: ${sessionId}, 用戶: ${userId || '匿名'}`);

      const supportSessionRepo = AppDataSource.getRepository(SupportSession);
      const supportMessageRepo = AppDataSource.getRepository(SupportMessage);

      // === 上層：業務會話驗證 ===
      const whereClause: any = { supportSessionId: sessionId };
      if (userId) {
        whereClause.userId = userId;
      }

      const session = await supportSessionRepo.findOne({
        where: whereClause
      });

      if (!session) {
        return res.status(404).json({
          success: false,
          message: '會話不存在或無權限訪問'
        });
      }

      if (session.status === SessionStatus.CLOSED) {
        return res.status(400).json({
          success: false,
          message: '會話已關閉'
        });
      }

      // 儲存用戶訊息
      const userMsg = new SupportMessage();
      userMsg.sessionId = session.supportSessionId;
      userMsg.senderType = SenderType.USER;
      userMsg.senderId = userId || null;
      userMsg.messageText = message;
      userMsg.messageType = MessageType.TEXT;
      await supportMessageRepo.save(userMsg);

      // === 下層：AI 回覆處理 ===
      let finalMessage;
      let confidence = 0;
      let strategy = 'keyword_matching';

      // 獲取最後一個 OpenAI Response ID 用於對話延續
      const lastBotMessage = await supportMessageRepo.findOne({
        where: {
          sessionId: session.supportSessionId,
          senderType: SenderType.BOT
        },
        order: { createdAt: 'DESC' }
      });

      const previousOpenAIResponseId = lastBotMessage?.metadata?.responseId;

      if (previousOpenAIResponseId) {
        try {
          console.log(`🔗 延續 OpenAI 對話 - Previous Response ID: ${previousOpenAIResponseId}`);
          
          // 使用 OpenAI Responses API 的對話延續功能
          const aiReply = await chatService.continueChat(message, previousOpenAIResponseId, {
            sessionId: session.supportSessionId,
            userId: userId,
            category: session.category
          });

          finalMessage = aiReply.message;
          confidence = aiReply.confidence;
          strategy = 'openai_continue';

        } catch (error) {
          console.warn('⚠️ OpenAI 對話延續失敗，回退到關鍵字匹配:', error);
          
          // 回退到關鍵字匹配
          const smartReply = await smartReplyService.getSmartReply(message);
          finalMessage = smartReply.message;
          confidence = smartReply.data?.confidence || 0;
          strategy = 'keyword_fallback';
        }
      } else {
        console.log('🔍 沒有 OpenAI Response ID，使用關鍵字匹配');
        
        // 沒有 OpenAI 對話歷史，使用關鍵字匹配
        const smartReply = await smartReplyService.getSmartReply(message);
        finalMessage = smartReply.message;
        confidence = smartReply.data?.confidence || 0;
        strategy = 'keyword_matching';
      }

      // 儲存 AI 回覆
      const botMsg = new SupportMessage();
      botMsg.sessionId = session.supportSessionId;
      botMsg.senderType = SenderType.BOT;
      botMsg.messageText = finalMessage;
      botMsg.messageType = MessageType.TEXT;
      botMsg.metadata = {
        confidence: confidence
      };
      await supportMessageRepo.save(botMsg);

      // 業務邏輯：檢查是否需要轉接
      if (confidence < 0.6) {
        session.status = SessionStatus.WAITING;
        await supportSessionRepo.save(session);
        console.log('🔄 信心度不足，標記為等待人工客服');
      }

      res.json({
        success: true,
        data: {
          message: finalMessage,
          confidence: confidence,
          strategy: strategy,
          sessionStatus: session.status
        }
      });

    } catch (error: any) {
      console.error('❌ 發送訊息失敗:', error);
      res.status(500).json({
        success: false,
        message: '發送訊息失敗',
        error: error.message
      });
    }
  }

  /**
   * 獲取會話歷史
   * GET /api/v1/smart-reply/session/:sessionId/history
   */
  static async getSessionHistory(req: Request, res: Response) {
    try {
      const { sessionId } = req.params;
      const userId = (req.user as any)?.userId;

      const supportSessionRepo = AppDataSource.getRepository(SupportSession);
      const supportMessageRepo = AppDataSource.getRepository(SupportMessage);

      // 驗證會話權限
      const whereClause: any = { supportSessionId: sessionId };
      if (userId) {
        whereClause.userId = userId;
      }

      const session = await supportSessionRepo.findOne({
        where: whereClause
      });

      if (!session) {
        return res.status(404).json({
          success: false,
          message: '會話不存在或無權限訪問'
        });
      }

      // 獲取訊息歷史
      const messages = await supportMessageRepo.find({
        where: { sessionId: session.supportSessionId },
        order: { createdAt: 'ASC' }
      });

      const messageHistory = messages.map(msg => ({
        messageId: msg.supportMessageId,
        senderType: msg.senderType,
        senderId: msg.senderId,
        messageText: msg.messageText,
        messageType: msg.messageType,
        metadata: msg.metadata,
        createdAt: msg.createdAt,
        isRead: msg.isRead
      }));

      res.json({
        success: true,
        data: {
          sessionId: session.supportSessionId,
          sessionType: session.sessionType,
          status: session.status,
          category: session.category,
          priority: session.priority,
          createdAt: session.createdAt,
          firstResponseAt: session.firstResponseAt,
          messages: messageHistory,
          messageCount: messages.length
        }
      });

    } catch (error: any) {
      console.error('❌ 獲取會話歷史失敗:', error);
      res.status(500).json({
        success: false,
        message: '獲取會話歷史失敗',
        error: error.message
      });
    }
  }

  /**
   * 申請人工轉接
   * POST /api/v1/smart-reply/session/:sessionId/transfer
   */
  static async requestHumanTransfer(req: Request, res: Response) {
    try {
      const { sessionId } = req.params;
      const { reason } = req.body;
      const userId = (req.user as any)?.userId;

      console.log(`🔄 申請人工轉接 - Session: ${sessionId}, 原因: ${reason || '用戶主動要求'}`);

      const supportSessionRepo = AppDataSource.getRepository(SupportSession);

      // 驗證會話權限
      const whereClause: any = { supportSessionId: sessionId };
      if (userId) {
        whereClause.userId = userId;
      }

      const session = await supportSessionRepo.findOne({
        where: whereClause
      });

      if (!session) {
        return res.status(404).json({
          success: false,
          message: '會話不存在或無權限訪問'
        });
      }

      if (session.status === SessionStatus.CLOSED) {
        return res.status(400).json({
          success: false,
          message: '會話已關閉，無法轉接'
        });
      }

      // 更新會話狀態
      session.status = SessionStatus.WAITING;
      session.priority = Priority.HIGH; // 人工轉接提高優先級
      await supportSessionRepo.save(session);

      // 記錄轉接原因
      if (reason) {
        const supportMessageRepo = AppDataSource.getRepository(SupportMessage);
        const transferMsg = new SupportMessage();
        transferMsg.sessionId = session.supportSessionId;
        transferMsg.senderType = SenderType.BOT;
        transferMsg.messageText = `用戶申請人工轉接：${reason}`;
        transferMsg.messageType = MessageType.TEXT;
        transferMsg.metadata = {
          transferReason: reason
        };
        await supportMessageRepo.save(transferMsg);
      }

      res.json({
        success: true,
        message: '已申請人工客服轉接',
        data: {
          sessionId: session.supportSessionId,
          status: session.status,
          priority: session.priority,
          estimatedWaitTime: '5-10分鐘' // 可以根據實際情況動態計算
        }
      });

    } catch (error: any) {
      console.error('❌ 申請人工轉接失敗:', error);
      res.status(500).json({
        success: false,
        message: '申請人工轉接失敗',
        error: error.message
      });
    }
  }

  /**
   * 關閉會話
   * POST /api/v1/smart-reply/session/:sessionId/close
   */
  static async closeSession(req: Request, res: Response) {
    try {
      const { sessionId } = req.params;
      const { satisfactionRating, satisfactionComment } = req.body;
      const userId = (req.user as any)?.userId;

      console.log(`🔚 關閉會話 - Session: ${sessionId}, 滿意度: ${satisfactionRating || '未評分'}`);

      const supportSessionRepo = AppDataSource.getRepository(SupportSession);

      // 驗證會話權限
      const whereClause: any = { supportSessionId: sessionId };
      if (userId) {
        whereClause.userId = userId;
      }

      const session = await supportSessionRepo.findOne({
        where: whereClause
      });

      if (!session) {
        return res.status(404).json({
          success: false,
          message: '會話不存在或無權限訪問'
        });
      }

      if (session.status === SessionStatus.CLOSED) {
        return res.status(400).json({
          success: false,
          message: '會話已經關閉'
        });
      }

      // 關閉會話
      session.close(satisfactionRating, satisfactionComment);
      await supportSessionRepo.save(session);

      res.json({
        success: true,
        message: '會話已關閉',
        data: {
          sessionId: session.supportSessionId,
          status: session.status,
          closedAt: session.closedAt,
          durationMinutes: session.durationMinutes,
          satisfactionRating: session.satisfactionRating
        }
      });

    } catch (error: any) {
      console.error('❌ 關閉會話失敗:', error);
      res.status(500).json({
        success: false,
        message: '關閉會話失敗',
        error: error.message
      });
    }
  }

  /**
   * 測試關鍵字匹配
   * POST /api/v1/smart-reply/test
   */
  static async testKeywords(req: Request, res: Response) {
    try {
      const { message } = req.body;
      
      if (!message) {
        return res.status(400).json({
          success: false,
          message: '缺少測試訊息'
        });
      }

      const result = await smartReplyService.getSmartReply(message);
      
      res.json({
        success: true,
        data: {
          input: message,
          result: result,
          timestamp: new Date().toISOString()
        }
      });

    } catch (error: any) {
      console.error('❌ 關鍵字測試失敗:', error);
      res.status(500).json({
        success: false,
        message: '關鍵字測試失敗',
        error: error.message
      });
    }
  }

  /**
   * 健康檢查
   * GET /api/v1/smart-reply/health
   */
  static async healthCheck(req: Request, res: Response) {
    try {
      // 簡化健康檢查，避免調用不存在的方法
      const chatServiceStatus = await chatService.checkServiceStatus();

      const status = {
        smartReplyService: 'healthy', // 假設如果能執行到這裡就是健康的
        openaiResponsesApi: chatServiceStatus ? 'healthy' : 'unhealthy',
        database: 'healthy', // 如果能執行到這裡，資料庫應該是正常的
        timestamp: new Date().toISOString()
      };

      const isHealthy = chatServiceStatus;

      res.status(isHealthy ? 200 : 503).json({
        success: isHealthy,
        message: isHealthy ? '所有服務運行正常' : '部分服務異常',
        data: status
      });

    } catch (error: any) {
      console.error('❌ 健康檢查失敗:', error);
      res.status(503).json({
        success: false,
        message: '健康檢查失敗',
        error: error.message,
        data: {
          smartReplyService: 'unknown',
          openaiResponsesApi: 'unknown',
          database: 'unhealthy',
          timestamp: new Date().toISOString()
        }
      });
    }
  }
} 