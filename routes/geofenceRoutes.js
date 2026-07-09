import { Router } from 'express';
import { GeofenceController } from '../controllers/geofenceController.js';
import { authMiddleware } from '../middleware/authMiddleware.js';

const router = Router();

router.get('/', GeofenceController.getGeofences);
router.post('/', authMiddleware(), GeofenceController.createGeofence);
router.delete('/:id', authMiddleware(), GeofenceController.deleteGeofence);

export default router;
