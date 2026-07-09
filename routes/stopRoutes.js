// routes/stopRoutes.js
import { Router } from 'express';
import { StopController } from '../controllers/stopController.js';
import { authMiddleware } from '../middleware/authMiddleware.js';

const router = Router();

router.get('/', authMiddleware(), StopController.getStops);
router.post('/', authMiddleware(), StopController.createStop);
router.delete('/:id', authMiddleware(), StopController.deleteStop); // Add this line

export default router;