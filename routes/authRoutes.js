import { Router } from 'express';
import { AuthController } from '../controllers/authController.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { validateLoginPayload, validateSignupPayload } from '../middleware/validateAuthPayload.js';

const router = Router();

const authRateLimit = rateLimit({
	windowMs: 15 * 60 * 1000,
	max: 10,
	keyPrefix: 'auth',
});

router.post('/signup', authRateLimit, validateSignupPayload, AuthController.register);
router.post('/login', authRateLimit, validateLoginPayload, AuthController.login);

export default router;