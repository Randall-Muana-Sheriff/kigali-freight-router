import { Router } from 'express';
import { RouteController } from '../controllers/routeController.js';
import { authMiddleware } from '../middleware/authMiddleware.js';

const router = Router();

router.get('/', RouteController.getRoutes);
router.post('/save', authMiddleware(), RouteController.saveRoute);

export default router;
