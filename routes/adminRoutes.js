import { Router } from 'express';
import { AdminController } from '../controllers/adminController.js';
import { authMiddleware } from '../middleware/authMiddleware.js';

const router = Router();

router.get('/users', authMiddleware(['admin', 'manager']), AdminController.getUsers);
router.patch('/users/:id/role', authMiddleware(['admin']), AdminController.updateUserRole);
router.get('/vehicles', authMiddleware(['admin', 'manager']), AdminController.getVehicles);
router.post('/vehicles', authMiddleware(['admin', 'manager']), AdminController.createVehicle);
router.patch('/vehicles/:id/assign', authMiddleware(['admin', 'manager']), AdminController.assignVehicle);
router.get('/audit-logs', authMiddleware(['admin', 'manager']), AdminController.getAuditLogs);

export default router;
