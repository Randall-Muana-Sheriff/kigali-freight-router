import { createClient } from 'redis';
import { appConfig } from './appConfig.js';

// Redis is optional. When REDIS_URL is unset (local dev, integration tests),
// every module that depends on this falls back to safe in-process,
// single-instance behavior. Setting REDIS_URL enables horizontal scaling:
// shared rate-limit counters, shared live-fleet/geofence state, a durable
// telemetry queue, and the Socket.IO cross-instance adapter.
export function isRedisEnabled() {
    return Boolean(appConfig.redisUrl);
}

let clientPromise = null;

// Returns a connected, shared `redis` v4 client, or null if Redis is
// disabled or the connection failed (callers should treat null as "fall
// back to in-memory").
export function getRedisClient() {
    if (!isRedisEnabled()) return Promise.resolve(null);

    if (!clientPromise) {
        const client = createClient({ url: appConfig.redisUrl });
        let hasLoggedConnection = false;
        client.on('error', (err) => {
            console.error('❌ Redis client error:', err.message);
        });
        client.on('connect', () => {
            if (hasLoggedConnection) return;
            hasLoggedConnection = true;
            console.log('🧠 Redis connected — running in horizontally-scalable mode.');
        });

        clientPromise = client
            .connect()
            .then(() => client)
            .catch((err) => {
                console.error('❌ Redis connection failed, falling back to in-process state:', err.message);
                clientPromise = null;
                return null;
            });
    }

    return clientPromise;
}

// Creates a fresh, independently-connected duplicate of the shared client.
// Socket.IO's Redis adapter requires two dedicated connections (pub/sub)
// that are never used for regular commands.
export async function createRedisDuplicate() {
    const base = await getRedisClient();
    if (!base) return null;
    const duplicate = base.duplicate();
    duplicate.on('error', (err) => console.error('❌ Redis duplicate client error:', err.message));
    await duplicate.connect();
    return duplicate;
}

export async function closeRedisClients() {
    if (!clientPromise) return;
    const client = await clientPromise;
    clientPromise = null;
    if (client?.isOpen) {
        await client.quit();
    }
}
