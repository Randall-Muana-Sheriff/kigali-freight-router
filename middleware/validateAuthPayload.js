import { ALLOWED_ROLES } from '../utils/roles.js';

export function validateSignupPayload(req, res, next) {
    const { username, password, role } = req.body || {};
    const allowedRoles = ALLOWED_ROLES;

    if (typeof username !== 'string' || username.trim().length < 3 || username.trim().length > 50) {
        return res.status(400).json({
            success: false,
            error: {
                code: 'AUTH_INVALID_USERNAME',
                message: 'Username must be 3 to 50 characters long.',
            },
        });
    }

    if (typeof password !== 'string' || password.length < 8 || password.length > 128) {
        return res.status(400).json({
            success: false,
            error: {
                code: 'AUTH_INVALID_PASSWORD',
                message: 'Password must be at least 8 characters long.',
            },
        });
    }

    if (role !== undefined && !allowedRoles.includes(String(role).toLowerCase())) {
        return res.status(400).json({
            success: false,
            error: {
                code: 'AUTH_INVALID_ROLE',
                message: 'Role is not permitted.',
            },
        });
    }

    next();
}

export function validateLoginPayload(req, res, next) {
    const { username, password } = req.body || {};

    if (typeof username !== 'string' || username.trim().length < 3 || username.trim().length > 50) {
        return res.status(400).json({
            success: false,
            error: {
                code: 'AUTH_INVALID_USERNAME',
                message: 'Username must be 3 to 50 characters long.',
            },
        });
    }

    if (typeof password !== 'string' || password.length < 8 || password.length > 128) {
        return res.status(400).json({
            success: false,
            error: {
                code: 'AUTH_INVALID_PASSWORD',
                message: 'Password must be at least 8 characters long.',
            },
        });
    }

    next();
}
