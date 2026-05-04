/**
 * 知識庫系統路由
 * /api/v1/knowledge-base/*
 */

import { Router } from 'express';
import { KnowledgeBaseController } from '../controllers/knowledge-base-controller.js';
import { isAuthenticated, adminAuth } from '../middlewares/auth.js';
import { body, param, query, validationResult } from 'express-validator';

const router = Router();

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
 * 公開 API（不需要認證）
 */

// 健康檢查 - 必須放在最前面
router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: '知識庫系統運行正常',
    timestamp: new Date().toISOString(),
    features: {
      semanticSearch: 'enabled',
      embeddingModel: 'text-embedding-3-small',
      hybridSearch: 'enabled',
      vectorDimensions: 1536
    }
  });
});

// 語義搜尋知識庫
router.get('/search',
  [
    query('q').isString().isLength({ min: 1, max: 500 }).withMessage('搜尋查詢必須在 1-500 字之間'),
    query('limit').optional().isInt({ min: 1, max: 50 }).withMessage('限制數量必須在 1-50 之間'),
    query('threshold').optional().isFloat({ min: 0, max: 1 }).withMessage('相似度閾值必須在 0-1 之間'),
    query('categories').optional().isString().withMessage('分類參數格式不正確'),
    handleValidationErrors
  ],
  KnowledgeBaseController.searchKnowledgeBase
);

// 獲取查詢建議
router.get('/suggestions',
  [
    query('q').isString().isLength({ min: 1, max: 100 }).withMessage('查詢參數必須在 1-100 字之間'),
    query('limit').optional().isInt({ min: 1, max: 10 }).withMessage('限制數量必須在 1-10 之間'),
    handleValidationErrors
  ],
  KnowledgeBaseController.getQuerySuggestions
);

// 獲取知識庫統計（公開基本統計）
router.get('/stats',
  KnowledgeBaseController.getKnowledgeBaseStats
);

// 檢查嵌入服務狀態
router.get('/embedding-status',
  KnowledgeBaseController.checkEmbeddingStatus
);

// 測試語義搜尋功能
router.post('/test-search',
  [
    body('query1').isString().isLength({ min: 1, max: 200 }).withMessage('查詢1必須在 1-200 字之間'),
    body('query2').isString().isLength({ min: 1, max: 200 }).withMessage('查詢2必須在 1-200 字之間'),
    handleValidationErrors
  ],
  KnowledgeBaseController.testSemanticSearch
);

/**
 * 需要認證的 API
 */

// 獲取知識庫列表
router.get('/',
  isAuthenticated,
  [
    query('page').optional().isInt({ min: 1 }).withMessage('頁碼必須大於 0'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('限制數量必須在 1-100 之間'),
    query('category').optional().isString().withMessage('分類參數格式不正確'),
    query('search').optional().isString().withMessage('搜尋參數格式不正確'),
    query('includeInactive').optional().isBoolean().withMessage('includeInactive 必須是布林值'),
    handleValidationErrors
  ],
  KnowledgeBaseController.getKnowledgeBaseList
);

// 獲取知識庫項目詳情
router.get('/:id',
  isAuthenticated,
  [
    param('id').isUUID().withMessage('知識庫 ID 格式不正確'),
    handleValidationErrors
  ],
  KnowledgeBaseController.getKnowledgeBase
);

// 尋找相似內容
router.get('/:id/similar',
  isAuthenticated,
  [
    param('id').isUUID().withMessage('知識庫 ID 格式不正確'),
    query('limit').optional().isInt({ min: 1, max: 20 }).withMessage('限制數量必須在 1-20 之間'),
    handleValidationErrors
  ],
  KnowledgeBaseController.findSimilarContent
);

/**
 * 需要管理員權限的 API
 */

// 創建知識庫項目
router.post('/',
  adminAuth,
  [
    body('title').isString().isLength({ min: 1, max: 200 }).withMessage('標題必須在 1-200 字之間'),
    body('content').isString().isLength({ min: 1, max: 10000 }).withMessage('內容必須在 1-10000 字之間'),
    body('category').optional().isString().isLength({ max: 50 }).withMessage('分類名稱不能超過 50 字'),
    body('tags').optional().isArray().withMessage('標籤必須是陣列'),
    body('tags.*').optional().isString().isLength({ min: 1, max: 30 }).withMessage('每個標籤必須在 1-30 字之間'),
    body('isActive').optional().isBoolean().withMessage('isActive 必須是布林值'),
    handleValidationErrors
  ],
  KnowledgeBaseController.createKnowledgeBase
);

// 更新知識庫項目
router.put('/:id',
  adminAuth,
  [
    param('id').isUUID().withMessage('知識庫 ID 格式不正確'),
    body('title').optional().isString().isLength({ min: 1, max: 200 }).withMessage('標題必須在 1-200 字之間'),
    body('content').optional().isString().isLength({ min: 1, max: 10000 }).withMessage('內容必須在 1-10000 字之間'),
    body('category').optional().isString().isLength({ max: 50 }).withMessage('分類名稱不能超過 50 字'),
    body('tags').optional().isArray().withMessage('標籤必須是陣列'),
    body('tags.*').optional().isString().isLength({ min: 1, max: 30 }).withMessage('每個標籤必須在 1-30 字之間'),
    body('isActive').optional().isBoolean().withMessage('isActive 必須是布林值'),
    handleValidationErrors
  ],
  KnowledgeBaseController.updateKnowledgeBase
);

// 刪除知識庫項目
router.delete('/:id',
  adminAuth,
  [
    param('id').isUUID().withMessage('知識庫 ID 格式不正確'),
    handleValidationErrors
  ],
  KnowledgeBaseController.deleteKnowledgeBase
);

// 批量更新嵌入向量
router.post('/embeddings/update',
  adminAuth,
  KnowledgeBaseController.updateEmbeddings
);



export default router;