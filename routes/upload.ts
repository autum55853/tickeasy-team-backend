import express from 'express';
import uploadController from '../controllers/upload.js';
import { isAuthenticated } from '../middlewares/auth.js';
import { uploadMiddleware, handleMulterError } from '../middlewares/index.js';

const router = express.Router();

// 上傳圖片 (支援暫存模式，設置 isTemp=true 不需要 targetId)
router.post('/image', isAuthenticated, uploadMiddleware, handleMulterError, uploadController.uploadImage);

// 刪除圖片
router.delete('/image', isAuthenticated, uploadController.deleteImage);

export default router;
