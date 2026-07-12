import { registerPushToken } from '../services/pushNotificationService.js';
import { ok, fail } from '../utils/httpResponse.js';

export const NotificationController = {
    registerToken: async (req, res) => {
        const { token, platform } = req.body || {};
        const username = req.user?.username;

        if (!username) {
            return fail(res, {
                status: 400,
                code: 'PUSH_USERNAME_MISSING',
                message: 'User identity is missing in session token.',
            });
        }

        if (typeof token !== 'string' || !token.trim()) {
            return fail(res, {
                status: 400,
                code: 'PUSH_TOKEN_REQUIRED',
                message: 'A push token is required.',
            });
        }

        try {
            await registerPushToken(username, token.trim(), typeof platform === 'string' ? platform : 'unknown');
            return ok(res, { registered: true });
        } catch (error) {
            console.error('Database Error:', error.message);
            return fail(res, {
                status: 500,
                code: 'PUSH_TOKEN_REGISTER_FAILED',
                message: 'Failed to register push token.',
            });
        }
    },
};
