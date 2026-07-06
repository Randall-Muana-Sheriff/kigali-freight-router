import { Router } from 'express';
import { OrderController } from '../controllers/orderController.js';
import { authMiddleware } from '../middleware/authMiddleware.js';

const router = Router();

// Manifest & Tracking Routes
router.post('/', authMiddleware(['DISPATCHER', 'MERCHANT']), OrderController.createOrder);
router.get('/active', authMiddleware(['DISPATCHER']), OrderController.getActiveOrders);
router.get('/pooling', authMiddleware(['DISPATCHER']), OrderController.getBatchedOrders);

// Dispatch Routing & Driver Assignment Trigger
router.post('/assign', authMiddleware(['DISPATCHER']), OrderController.assignOrderBundle);

// Delivery Lifecycle Milestone Route
router.patch('/:id/status', authMiddleware(['DRIVER', 'DISPATCHER']), OrderController.updateOrderStatus);

// Historical tracking route
router.get('/:id/history', authMiddleware(['DISPATCHER', 'MERCHANT']), OrderController.getOrderHistory);

// Smart Spatial Matching View
router.get('/:id/nearest-drivers', authMiddleware(['DISPATCHER']), OrderController.getNearestDrivers);

export default router;