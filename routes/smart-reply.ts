/**
 * 智能回覆路由
 * 實現分層回覆策略的路由端點
 * 整合會話管理功能
 */

import express from 'express';
import { SmartReplyController } from '../controllers/smart-reply-controller.js';
import { body, param, validationResult } from 'express-validator';
import { optionalAuth, checkSessionAccess } from '../middlewares/auth.js';

const router = express.Router();

// 驗證中介軟體
const handleValidationErrors = (req: any, res: any, next: any) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: '驗證失敗',
      errors: errors.array()
    });
  }
  next();
};

/**
 * @route POST /api/smart-reply/reply
 * @desc 智能回覆主要端點
 * @body { message: string, enableAI?: boolean }
 */
router.post('/reply', SmartReplyController.reply);

/**
 * @route POST /api/smart-reply/test
 * @desc 測試關鍵字匹配
 * @body { message: string }
 */
router.post('/test', SmartReplyController.testKeywords);

/**
 * @route GET /api/smart-reply/health
 * @desc 系統健康檢查
 */
router.get('/health', SmartReplyController.healthCheck);

/**
 * 新增的會話管理功能
 */

/**
 * @route POST /api/smart-reply/session/start
 * @desc 開始新的客服會話（支援匿名用戶）
 * @body { userId?: string, category?: string, initialMessage?: string }
 */
router.post('/session/start',
  optionalAuth,
  [
    body('userId').optional().isUUID().withMessage('用戶 ID 格式不正確'),
    body('category').optional().isString().withMessage('分類必須是字串'),
    body('initialMessage').optional().isString().isLength({ min: 1, max: 1000 }).withMessage('初始訊息長度必須在 1-1000 字之間'),
    handleValidationErrors
  ],
  SmartReplyController.startSession
);

/**
 * @route POST /api/smart-reply/session/:sessionId/message
 * @desc 發送訊息到會話（支援匿名用戶）
 * @params { sessionId: string }
 * @body { message: string }
 */
router.post('/session/:sessionId/message',
  optionalAuth,
  checkSessionAccess,
  [
    param('sessionId').isUUID().withMessage('會話 ID 格式不正確'),
    body('message').isString().isLength({ min: 1, max: 1000 }).withMessage('訊息長度必須在 1-1000 字之間'),
    handleValidationErrors
  ],
  SmartReplyController.sendMessage
);

/**
 * @route GET /api/smart-reply/session/:sessionId/history
 * @desc 獲取會話歷史（支援匿名用戶）
 * @params { sessionId: string }
 */
router.get('/session/:sessionId/history',
  optionalAuth,
  checkSessionAccess,
  [
    param('sessionId').isUUID().withMessage('會話 ID 格式不正確'),
    handleValidationErrors
  ],
  SmartReplyController.getSessionHistory
);

/**
 * @route POST /api/smart-reply/session/:sessionId/transfer
 * @desc 申請人工客服轉接（支援匿名用戶）
 * @params { sessionId: string }
 * @body { reason?: string }
 */
router.post('/session/:sessionId/transfer',
  optionalAuth,
  checkSessionAccess,
  [
    param('sessionId').isUUID().withMessage('會話 ID 格式不正確'),
    body('reason').optional().isString().isLength({ max: 200 }).withMessage('轉接原因不能超過 200 字'),
    handleValidationErrors
  ],
  SmartReplyController.requestHumanTransfer
);

/**
 * @route POST /api/smart-reply/session/:sessionId/close
 * @desc 關閉會話（支援匿名用戶）
 * @params { sessionId: string }
 */
router.post('/session/:sessionId/close',
  optionalAuth,
  checkSessionAccess,
  [
    param('sessionId').isUUID().withMessage('會話 ID 格式不正確'),
    handleValidationErrors
  ],
  SmartReplyController.closeSession
);

export default router; 