import { getRedisClient, isRedisEnabled } from '../config/redisClient.js';

// Single-instance fallback store, used only when REDIS_URL isn't configured
// (local dev / tests). In multi-instance production deployments this map
// would only ever see a slice of traffic, which is why Redis is preferred.
const memoryBuckets = new Map();

async function incrementCounter(key, windowMs) {
    if (isRedisEnabled()) {
        try {
            const client = await getRedisClient();
            if (client) {
                const count = await client.incr(key);
                if (count === 1) {
                    await client.pExpire(key, windowMs);
                }
                const ttlMs = await client.pTTL(key);
                return { count, ttlMs: ttlMs > 0 ? ttlMs : windowMs };
            }
        } catch (err) {
            console.error('❌ Rate limiter Redis error, falling back to in-memory:', err.message);
        }
    }

    const now = Date.now();
    const bucket = memoryBuckets.get(key) || { count: 0, resetAt: now + windowMs };
    if (now > bucket.resetAt) {
        bucket.count = 0;
        bucket.resetAt = now + windowMs;
    }
    bucket.count += 1;
    memoryBuckets.set(key, bucket);
    return { count: bucket.count, ttlMs: bucket.resetAt - now };
}

export function rateLimit({
    windowMs = 15 * 60 * 1000,
    max = 20,
    keyPrefix = 'global',
    skip,
} = {}) {
    return async (req, res, next) => {
        if (typeof skip === 'function' && skip(req)) {
            return next();
        }

        const key = `ratelimit:${keyPrefix}:${req.ip || req.socket?.remoteAddress || 'unknown'}`;

        try {
            const { count, ttlMs } = await incrementCounter(key, windowMs);

            if (count > max) {
                res.setHeader('Retry-After', Math.ceil(ttlMs / 1000));
                return res.status(429).json({
                    success: false,
                    error: {
                        code: 'RATE_LIMIT_EXCEEDED',
                        message: 'Too many requests. Please try again later.',
                    },
                });
            }
        } catch (err) {
            // Fail open: a broken rate limiter should never take down auth.
            console.error('❌ Rate limiter failure (failing open):', err.message);
        }

        next();
    };
}

