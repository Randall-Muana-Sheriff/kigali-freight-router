// routes/fleetRoutes.js
import express from 'express';
import { FleetController } from '../controllers/fleetController.js';
import { authMiddleware } from '../middleware/authMiddleware.js';

const router = express.Router();

// Ensure FleetController.getLiveFleetStatus is fully defined here
router.get('/telemetry-sheet', authMiddleware(['ADMIN', 'DISPATCHER']), FleetController.getLiveFleetStatus);

//Historical Breadcrumbs Route
router.get('/history/:driverName', authMiddleware(['ADMIN', 'DISPATCHER']), FleetController.getDriverBreadcrumbs);

//Fleet Performance Report Route
router.get('/analytics/performance', authMiddleware(['ADMIN', 'DISPATCHER']), FleetController.getFleetPerformanceReport);

export default router;