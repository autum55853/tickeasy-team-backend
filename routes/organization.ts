import express from 'express';
import * as organizationController from '../controllers/organization.js';
import { isAuthenticated } from '../middlewares/auth.js';
import { requireVerifiedEmail } from '../middlewares/auth.js';
// import { authenticateToken } from '../middleware/auth'; // 之後會用到

const router = express.Router();

// 獲取當前用戶擁有的所有組織 (需要登入)
router.get('/', isAuthenticated, organizationController.getAllOrganizations);

// 獲取單個組織 (需要登入和權限)
router.get('/:organizationId', isAuthenticated, organizationController.getOrganizationById);

// 取得特定組織的音樂會列表（含分頁、篩選、排序）
router.get('/:organizationId/concerts', isAuthenticated, organizationController.getConcertsByOrganization);

// 創建組織 (需要登入)
router.post('/', isAuthenticated, requireVerifiedEmail, /* authenticateToken?, */ organizationController.createOrganization);

// 更新組織 (需要登入和權限)
// TODO: 加入權限檢查 (isOwner or isAdmin)
router.put('/:organizationId', isAuthenticated, /* authenticateToken?, checkPermission?, */ organizationController.updateOrganization);

// 刪除組織 (需要登入和權限)
// TODO: 加入權限檢查 (isOwner or isAdmin)
router.delete('/:organizationId', isAuthenticated, /* authenticateToken?, checkPermission?, */ organizationController.deleteOrganization);

export default router; 