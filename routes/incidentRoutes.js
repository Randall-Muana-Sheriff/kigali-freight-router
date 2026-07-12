import { Router } from 'express';
import { IncidentController } from '../controllers/incidentController.js';
import { authMiddleware } from '../middleware/authMiddleware.js';

const router = Router();

router.post('/', authMiddleware(['ADMIN', 'DRIVER', 'DISPATCHER']), IncidentController.createIncident);

export default router;
