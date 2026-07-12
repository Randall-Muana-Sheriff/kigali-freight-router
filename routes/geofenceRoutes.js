import { Router } from 'express';
import { GeofenceController } from '../controllers/geofenceController.js';
import { authMiddleware } from '../middleware/authMiddleware.js';

const router = Router();

const OPERATIONAL_ROLES = ['ADMIN', 'DISPATCHER'];

router.get('/', authMiddleware(OPERATIONAL_ROLES), GeofenceController.getGeofences);
router.post('/', authMiddleware(OPERATIONAL_ROLES), GeofenceController.createGeofence);
router.delete('/:id', authMiddleware(OPERATIONAL_ROLES), GeofenceController.deleteGeofence);

export default router;
