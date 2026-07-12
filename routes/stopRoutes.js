// routes/stopRoutes.js
import { Router } from 'express';
import { StopController } from '../controllers/stopController.js';
import { authMiddleware } from '../middleware/authMiddleware.js';

const router = Router();

const OPERATIONAL_ROLES = ['ADMIN', 'DISPATCHER'];

router.get('/', authMiddleware(OPERATIONAL_ROLES), StopController.getStops);
router.post('/', authMiddleware(OPERATIONAL_ROLES), StopController.createStop);
router.delete('/:id', authMiddleware(OPERATIONAL_ROLES), StopController.deleteStop); // Add this line

export default router;