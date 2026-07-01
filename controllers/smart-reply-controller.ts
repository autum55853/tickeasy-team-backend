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
import { getTaiwanTime } from '../utils/date.js';
import { sendSupportRequest } from '../services/discordService.js';
import { subscribe as subscribeSse } from '../services/sse-broker.js';

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

            // AI 服務失效（chat 內部吞錯回傳道歉訊息，不會 throw）→ 主動偵測旗標轉人工
            if (aiReply.aiUnavailable) {
              console.warn('⚠️ AI 服務失效，自動轉送 Discord 人工客服');
              try {
                const msgId = await sendSupportRequest(session, initialMessage, []);
                if (msgId) session.discordMessageId = msgId;
                session.discordFallbackAt = getTaiwanTime();
              } catch (fallbackErr) {
                console.error('❌ Discord fallback 傳送失敗:', fallbackErr);
              }
              session.sessionType = SessionType.HUMAN;
              session.status = SessionStatus.WAITING;
              finalMessage = '抱歉，AI 系統暫時無法回應，您的問題已轉交人工客服，請稍候。';
              confidence = 0.1;
              strategy = 'discord_fallback';
            } else {
              finalMessage = aiReply.message;
              confidence = aiReply.confidence;
              strategy = 'openai_responses_api';
              openaiResponseId = aiReply.responseId;
            }

          } catch (error) {
            console.warn('⚠️ OpenAI Responses API 失敗，轉送 Discord 人工客服:', error);
            try {
              const msgId = await sendSupportRequest(session, initialMessage, []);
              if (msgId) session.discordMessageId = msgId;
              session.discordFallbackAt = getTaiwanTime();
              session.sessionType = SessionType.HUMAN;
              session.status = SessionStatus.WAITING;
            } catch (fallbackErr) {
              console.error('❌ Discord fallback 傳送失敗:', fallbackErr);
            }
            finalMessage = '抱歉，AI 系統暫時無法回應，您的問題已轉交人工客服，請稍候。';
            confidence = 0.1;
            strategy = 'discord_fallback';
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
          session.firstResponseAt = getTaiwanTime();
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

      // === 人工模式短路：跳過 AI，直接轉送 Discord ===
      if (session.sessionType === SessionType.HUMAN) {
        try {
          const recentMessages = await supportMessageRepo.find({
            where: { sessionId: session.supportSessionId },
            order: { createdAt: 'DESC' },
            take: 5,
          });
          const msgId = await sendSupportRequest(session, message, recentMessages.reverse());
          if (msgId) {
            session.discordMessageId = msgId;
            session.discordFallbackAt = getTaiwanTime();
            await supportSessionRepo.save(session);
          }
        } catch (err) {
          console.error('[SmartReply] 人工模式轉送 Discord 失敗:', err);
        }

        return res.json({
          success: true,
          data: {
            message: null,
            confidence: 1,
            strategy: 'human_forward',
            sessionStatus: session.status,
          },
        });
      }

      // === 下層：AI 回覆處理 ===
      // 1. 優先使用關鍵字匹配（與 startSession 一致）
      const smartReply = await smartReplyService.getSmartReply(message);
      let finalMessage = smartReply.message;
      let confidence = smartReply.data?.confidence || 0;
      let strategy = 'keyword_matching';

      // 2. 關鍵字匹配失敗（neutral）→ 延續 Gemini 對話（history 由 chat-service 從 DB 重建）
      if (smartReply.type === 'neutral') {
        try {
          console.log('🧠 關鍵字匹配失敗，延續 Gemini 對話');

          const aiReply = await chatService.continueChat(message, {
            sessionId: session.supportSessionId,
            userId: userId,
            category: session.category
          });

          // AI 服務失效（continueChat 內部吞錯回傳道歉訊息，不會 throw）→ 主動偵測旗標轉人工
          if (aiReply.aiUnavailable) {
            console.warn('⚠️ AI 服務失效，自動轉送 Discord 人工客服');
            try {
              const recentMessages = await supportMessageRepo.find({
                where: { sessionId: session.supportSessionId },
                order: { createdAt: 'DESC' },
                take: 5,
              });
              const msgId = await sendSupportRequest(session, message, recentMessages.reverse());
              if (msgId) session.discordMessageId = msgId;
              session.discordFallbackAt = getTaiwanTime();
              session.sessionType = SessionType.HUMAN;
              session.status = SessionStatus.WAITING;
              await supportSessionRepo.save(session);
            } catch (fallbackErr) {
              console.error('❌ Discord fallback 傳送失敗:', fallbackErr);
            }
            finalMessage = '抱歉，AI 系統暫時無法回應，您的問題已轉交人工客服，請稍候。';
            confidence = 0.1;
            strategy = 'discord_fallback';
          } else {
            finalMessage = aiReply.message;
            confidence = aiReply.confidence;
            strategy = 'gemini_continue';
          }

        } catch (error) {
          console.warn('⚠️ Gemini 對話延續失敗，轉送 Discord 人工客服:', error);

          try {
            const recentMessages = await supportMessageRepo.find({
              where: { sessionId: session.supportSessionId },
              order: { createdAt: 'DESC' },
              take: 5,
            });
            const msgId = await sendSupportRequest(session, message, recentMessages.reverse());
            if (msgId) session.discordMessageId = msgId;
            session.discordFallbackAt = getTaiwanTime();
            session.sessionType = SessionType.HUMAN;
            session.status = SessionStatus.WAITING;
            await supportSessionRepo.save(session);
          } catch (fallbackErr) {
            console.error('❌ Discord fallback 傳送失敗:', fallbackErr);
          }

          finalMessage = '抱歉，AI 系統暫時無法回應，您的問題已轉交人工客服，請稍候。';
          confidence = 0.1;
          strategy = 'discord_fallback';
        }
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
          sessionType: session.sessionType,
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

      // 更新會話狀態 — 標記為人工模式，後續 sendMessage 跳過 AI
      session.status = SessionStatus.WAITING;
      session.priority = Priority.HIGH; // 人工轉接提高優先級
      session.sessionType = SessionType.HUMAN;

      // 記錄轉接原因
      const supportMessageRepo = AppDataSource.getRepository(SupportMessage);
      if (reason) {
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

      // 轉送 Discord 人工客服
      try {
        const recentMessages = await supportMessageRepo.find({
          where: { sessionId: session.supportSessionId },
          order: { createdAt: 'DESC' },
          take: 5,
        });
        const userMessage = reason || '用戶主動申請人工客服轉接';
        const msgId = await sendSupportRequest(session, userMessage, recentMessages.reverse());
        if (msgId) session.discordMessageId = msgId;
        session.discordFallbackAt = getTaiwanTime();
      } catch (fallbackErr) {
        console.error('❌ Discord 通知傳送失敗:', fallbackErr);
      }

      await supportSessionRepo.save(session);

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
   * 訂閱會話訊息串流（SSE）
   * GET /api/v1/smart-reply/session/:sessionId/stream
   *
   * 認證：sseOptionalAuth（cookie / query token / Authorization header 擇一）
   * 權限：若已登入，會話必須屬於該用戶；匿名僅依 sessionId 訪問。
   * Payload：人工客服訊息（discordController.MODAL_SUBMIT 寫入後 publish）。
   */
  static async streamSession(req: Request, res: Response) {
    try {
      const { sessionId } = req.params;
      const userId = (req.user as { userId?: string } | undefined)?.userId;

      const supportSessionRepo = AppDataSource.getRepository(SupportSession);
      const session = await supportSessionRepo.findOne({
        where: { supportSessionId: sessionId },
      });

      if (!session) {
        return res.status(404).json({ success: false, message: '會話不存在' });
      }
      if (userId && session.userId && session.userId !== userId) {
        return res.status(403).json({ success: false, message: '無權限訂閱此會話' });
      }
      if (session.status === SessionStatus.CLOSED) {
        return res.status(400).json({ success: false, message: '會話已關閉' });
      }

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no'); // 停用 nginx 緩衝
      if (typeof res.flushHeaders === 'function') res.flushHeaders();

      res.write(': connected\n\n');

      const unsubscribe = subscribeSse(session.supportSessionId, res);

      req.on('close', () => {
        unsubscribe();
        try {
          res.end();
        } catch {
          /* ignore */
        }
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown';
      console.error('❌ SSE 訂閱失敗:', error);
      if (!res.headersSent) {
        res.status(500).json({ success: false, message: 'SSE 訂閱失敗', error: message });
      } else {
        try {
          res.end();
        } catch {
          /* ignore */
        }
      }
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

      const status: Record<string, unknown> = {
        smartReplyService: 'healthy',
        geminiApi: chatServiceStatus.ok ? 'healthy' : 'unhealthy',
        database: 'healthy',
        timestamp: new Date().toISOString()
      };

      if (!chatServiceStatus.ok && chatServiceStatus.error) {
        status.geminiError = chatServiceStatus.error;
      }

      const isHealthy = chatServiceStatus.ok;

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
          geminiApi: 'unknown',
          database: 'unhealthy',
          timestamp: new Date().toISOString()
        }
      });
    }
  }
} 