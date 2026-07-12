import { Router } from 'express';
import { NotificationController } from '../controllers/notificationController.js';
import { authMiddleware } from '../middleware/authMiddleware.js';

const router = Router();

// Any authenticated role may register a device token for itself — in
// practice this is the driver mobile app, but there's no operational harm
// in a dispatcher/admin web session registering one too.
router.post('/register-token', authMiddleware(), NotificationController.registerToken);

export default router;
