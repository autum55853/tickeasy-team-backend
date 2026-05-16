import { Router } from 'express';
import express from 'express';
import { handleDiscordInteraction } from '../controllers/discordController.js';

const router = Router();

// express.raw() 取得原始 Buffer，供 Ed25519 簽名驗證使用
router.post('/interactions', express.raw({ type: 'application/json' }), handleDiscordInteraction);

export default router;
