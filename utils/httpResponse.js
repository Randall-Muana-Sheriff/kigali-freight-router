export function ok(res, data, options = {}) {
    const { status = 200, meta } = options;
    const payload = { success: true, data };
    if (meta !== undefined) payload.meta = meta;
    return res.status(status).json(payload);
}

export function fail(res, options = {}) {
    const {
        status = 500,
        message = 'Internal server error.',
        code = 'INTERNAL_ERROR',
        details,
    } = options;

    const payload = {
        success: false,
        error: {
            code,
            message,
        },
    };

    if (details !== undefined) payload.error.details = details;
    return res.status(status).json(payload);
}

export function errorMessage(error, fallback) {
    if (!error) return fallback;
    return error.message || fallback;
}
