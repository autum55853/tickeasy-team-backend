import express, { Router } from 'express';
import { isAuthenticated } from '../middlewares/auth.js';
import { getCheckInUsedRecords } from '../controllers/session-checkin.js';

const router: Router = express.Router();

// GET /api/v1/sessions/:sessionId/check-inused
router.get('/:sessionId/check-inused', isAuthenticated, getCheckInUsedRecords);

export default router; 