// routes/routeRoutes.js
import { Router } from 'express';
import { RouteController } from '../controllers/routeController.js';
// Note: Keep your authMiddleware matching how you register your other routes
import { authMiddleware } from '../middleware/authMiddleware.js'; // Adjust path if needed

const router = Router();

const OPERATIONAL_ROLES = ['ADMIN', 'DISPATCHER'];

// Register all endpoints mapped to the /api/routes prefix in server.js
router.get('/', authMiddleware(OPERATIONAL_ROLES), RouteController.getRoutes);
router.post('/optimize', authMiddleware(OPERATIONAL_ROLES), RouteController.optimizeRoute);
router.post('/save', authMiddleware(OPERATIONAL_ROLES), RouteController.saveRouteHistory);
router.post('/commit', authMiddleware(OPERATIONAL_ROLES), RouteController.commitRoute);

export default router;