import { Router } from 'express';
import { OrderController } from '../controllers/orderController.js';
import { authMiddleware } from '../middleware/authMiddleware.js';

const router = Router();

// Manifest & Tracking Routes
router.post('/', authMiddleware(['ADMIN', 'DISPATCHER']), OrderController.createOrder);
router.get('/active', authMiddleware(['ADMIN', 'DISPATCHER']), OrderController.getActiveOrders);
router.get('/driver/assignments', authMiddleware(['ADMIN', 'DRIVER', 'DISPATCHER']), OrderController.getDriverAssignments);
router.get('/pooling', authMiddleware(['ADMIN', 'DISPATCHER']), OrderController.getBatchedOrders);

// Dispatch Routing & Driver Assignment Trigger
router.post('/assign', authMiddleware(['ADMIN', 'DISPATCHER']), OrderController.assignOrderBundle);

// Delivery Lifecycle Milestone Route
router.patch('/:id/status', authMiddleware(['ADMIN', 'DRIVER', 'DISPATCHER']), OrderController.updateOrderStatus);

// Historical tracking route
router.get('/:id/history', authMiddleware(['ADMIN', 'DISPATCHER']), OrderController.getOrderHistory);

// Smart Spatial Matching View
router.get('/:id/nearest-drivers', authMiddleware(['ADMIN', 'DISPATCHER']), OrderController.getNearestDrivers);

export default router;