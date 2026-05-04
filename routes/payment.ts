import express, { Router } from 'express';
// import { isAuthenticated } from '../middlewares/auth.js';
import { isAuthenticated } from '../middlewares/auth.js';
import { getECpayurl, getECpayReturn } from '../controllers/payment.js';

const router: Router = express.Router();

router.post('/return',  getECpayReturn);

router.get('/:orderId', isAuthenticated, getECpayurl);

export default router; 

