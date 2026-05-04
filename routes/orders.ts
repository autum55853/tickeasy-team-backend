import express, { Router } from 'express';
import { isAuthenticated } from '../middlewares/auth.js';
import { createOrder, refundOrder,getOrderInfo } from '../controllers/orders.js';

const router: Router = express.Router();

router.post('/', isAuthenticated, createOrder);

router.post('/:orderId/refund', isAuthenticated, refundOrder);

router.get('/:orderId', isAuthenticated, getOrderInfo);
// router.get('/profile/regions', getRegionOptions);

// router.get('/profile/event-types', getEventTypeOptions);

export default router; 