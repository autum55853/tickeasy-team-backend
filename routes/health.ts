import express from 'express';
import healthController from '../controllers/health.js';

const router = express.Router();

// 保活端點（機器人呼叫用，包含自動清理功能）
router.get('/keep-alive', healthController.keepAlive);

export default router; 