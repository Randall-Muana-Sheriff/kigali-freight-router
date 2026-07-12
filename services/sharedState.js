import { getRedisClient, isRedisEnabled } from '../config/redisClient.js';

// Generic shared-state primitives used across the app (rate limiting, live
// fleet state, geofence breach tracking, the telemetry queue). When
// REDIS_URL is configured, these are backed by Redis so any number of app
// instances can share the same state. When it isn't, they fall back to an
// in-process Map/array so local dev and the test suite keep working without
// requiring a Redis instance — with the caveat that in-memory state is only
// ever correct for a single running instance.

const memoryHashes = new Map();
const memoryLists = new Map();

async function redis() {
    if (!isRedisEnabled()) return null;
    return getRedisClient();
}

export async function hashSet(hashName, field, value) {
    const client = await redis();
    if (client) {
        await client.hSet(hashName, field, JSON.stringify(value));
        return;
    }
    if (!memoryHashes.has(hashName)) memoryHashes.set(hashName, new Map());
    memoryHashes.get(hashName).set(field, value);
}

export async function hashGet(hashName, field) {
    const client = await redis();
    if (client) {
        const raw = await client.hGet(hashName, field);
        return raw === undefined || raw === null ? undefined : JSON.parse(raw);
    }
    return memoryHashes.get(hashName)?.get(field);
}

export async function hashDelete(hashName, field) {
    const client = await redis();
    if (client) {
        await client.hDel(hashName, field);
        return;
    }
    memoryHashes.get(hashName)?.delete(field);
}

export async function hashGetAll(hashName) {
    const client = await redis();
    if (client) {
        const raw = await client.hGetAll(hashName);
        return Object.fromEntries(Object.entries(raw).map(([key, value]) => [key, JSON.parse(value)]));
    }
    const map = memoryHashes.get(hashName);
    return map ? Object.fromEntries(map) : {};
}

// Durable FIFO list operations, used for the telemetry queue.
export async function listPush(listName, item) {
    const client = await redis();
    if (client) {
        await client.rPush(listName, JSON.stringify(item));
        return;
    }
    if (!memoryLists.has(listName)) memoryLists.set(listName, []);
    memoryLists.get(listName).push(item);
}

export async function listPopBatch(listName, maxItems) {
    const client = await redis();
    if (client) {
        const items = [];
        for (let i = 0; i < maxItems; i += 1) {
            const raw = await client.lPop(listName);
            if (raw === null) break;
            items.push(JSON.parse(raw));
        }
        return items;
    }
    const list = memoryLists.get(listName) || [];
    return list.splice(0, maxItems);
}

export async function listLength(listName) {
    const client = await redis();
    if (client) return client.lLen(listName);
    return (memoryLists.get(listName) || []).length;
}
