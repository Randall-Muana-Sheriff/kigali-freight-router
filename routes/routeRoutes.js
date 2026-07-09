// routes/routeRoutes.js
import { Router } from 'express';
import { RouteController } from '../controllers/routeController.js';
// Note: Keep your authMiddleware matching how you register your other routes
import { authMiddleware } from '../middleware/authMiddleware.js'; // Adjust path if needed

const router = Router();

// Register all endpoints mapped to the /api/routes prefix in server.js
router.get('/', authMiddleware(), RouteController.getRoutes);
router.post('/optimize', authMiddleware(), RouteController.optimizeRoute);
router.post('/commit', authMiddleware(), RouteController.commitRoute);

export default router;