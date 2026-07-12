import { Router } from 'express';
import { AdminController } from '../controllers/adminController.js';
import { authMiddleware } from '../middleware/authMiddleware.js';

const router = Router();

router.get('/users', authMiddleware(['admin', 'dispatcher']), AdminController.getUsers);
router.patch('/users/:id/role', authMiddleware(['admin']), AdminController.updateUserRole);
router.get('/vehicles', authMiddleware(['admin', 'dispatcher']), AdminController.getVehicles);
router.post('/vehicles', authMiddleware(['admin', 'dispatcher']), AdminController.createVehicle);
router.patch('/vehicles/:id/assign', authMiddleware(['admin', 'dispatcher']), AdminController.assignVehicle);
router.get('/audit-logs', authMiddleware(['admin']), AdminController.getAuditLogs);

export default router;
