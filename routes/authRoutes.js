import { Router } from 'express';
import { AuthController } from '../controllers/authController.js';

const router = Router();

router.post('/signup', AuthController.register);
router.post('/login', AuthController.login);

export default router;