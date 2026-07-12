import { hashDelete, hashGet, hashSet, listLength, listPopBatch, listPush } from './sharedState.js';

const DEFAULT_FLUSH_INTERVAL_MS = 250;
const DEFAULT_BATCH_SIZE = 100;

// Shared-state keys. When REDIS_URL is configured these back real Redis
// structures (a list for the durable queue, hashes for live state) so any
// number of app instances/processes share the same fleet view and no
// in-flight telemetry is lost on a process restart. Without Redis, these
// fall back to in-process storage via services/sharedState.js — correct for
// local dev/tests, but only ever valid for a single running instance.
const QUEUE_KEY = 'kigali:telemetry:queue';
export const FLEET_STATE_KEY = 'kigali:fleet:live-state';
const DRIVER_BREACHES_KEY = 'kigali:fleet:driver-breaches';

export function createTelemetryQueue({ pool, io, dispatchExternalAlert }) {
    let flushTimer = null;
    let draining = false;

    async function processTelemetryItem(item) {
        const { driverName, lat, lng, timestamp, currentVelocityKmh } = item;

        await pool.query(
            `INSERT INTO driver_location_history (driver_name, lat, lng, geom, recorded_at)
             VALUES ($1, $2, $3, ST_SetSRID(ST_MakePoint($3, $2), 4326), NOW())`,
            [driverName, lat, lng]
        );

        await pool.query(
            `INSERT INTO driver_locations (driver_name, lat, lng, geom, updated_at)
             VALUES ($1, $2, $3, ST_SetSRID(ST_MakePoint($3, $2), 4326), NOW())
             ON CONFLICT (driver_name)
             DO UPDATE SET lat = EXCLUDED.lat, lng = EXCLUDED.lng, geom = EXCLUDED.geom, updated_at = NOW()`,
            [driverName, lat, lng]
        );

        const boundaryCheck = await pool.query(
            `SELECT id, name, speed_limit_kmh AS "speedLimitKmh" FROM geofences WHERE ST_Contains(geom, ST_SetSRID(ST_MakePoint($1, $2), 4326)) LIMIT 1;`,
            [lng, lat]
        );

        const activeZone = boundaryCheck.rows[0];
        const ongoingViolation = await hashGet(DRIVER_BREACHES_KEY, driverName);

        if (activeZone) {
            const speedThreshold = activeZone.speedLimitKmh;
            const isSpeeding = currentVelocityKmh > speedThreshold;
            const violationType = isSpeeding ? 'SPEED_VIOLATION' : 'BOUNDARY_BREACH';
            const description = isSpeeding
                ? `Speed limit breach inside [${activeZone.name}]. Value: ${currentVelocityKmh} km/h (Limit: ${speedThreshold} km/h)`
                : `Unauthorized Zone Entry: [${activeZone.name}]`;

            if (!ongoingViolation || ongoingViolation.zoneName !== activeZone.name || ongoingViolation.type !== violationType) {
                await hashSet(DRIVER_BREACHES_KEY, driverName, { zoneName: activeZone.name, type: violationType, description });
                await pool.query(
                    `INSERT INTO geofence_alerts (order_id, driver_name, event_type, description, distance_meters, created_at)
                     VALUES ($1, $2, $3, $4, $5, NOW())`,
                    [null, driverName, violationType, description, 0]
                );

                const incidentPayload = {
                    id: `incident-${Date.now()}`,
                    driverName,
                    zoneName: activeZone.name,
                    type: violationType,
                    description,
                    enteredAt: timestamp,
                };

                io.emit('geofence:violation', incidentPayload);
                dispatchExternalAlert(
                    `🚨 *CRITICAL SAFETY INCIDENT* 🚨\n\n*Asset:* ${driverName}\n*Incident:* ${violationType}\n*Detail:* ${description}\n*Timestamp:* ${new Date(timestamp).toLocaleTimeString()}`
                );
            }
        } else if (!activeZone && ongoingViolation) {
            await hashDelete(DRIVER_BREACHES_KEY, driverName);
            await pool.query(
                `INSERT INTO geofence_alerts (order_id, driver_name, event_type, description, distance_meters, created_at)
                 VALUES ($1, $2, $3, $4, $5, NOW())`,
                [null, driverName, 'ZONE_EXIT', `${driverName} exited ${ongoingViolation.zoneName}`, 0]
            );
            io.emit('geofence:exit', { driverName, zoneName: ongoingViolation.zoneName, exitedAt: timestamp });
            dispatchExternalAlert(`✅ *RESOLVED:* ${driverName} has safely departed the restricted perimeter.`);
        }

        const nextState = { driverName, lat, lng, velocityKmh: currentVelocityKmh, lastSeen: timestamp };
        await hashSet(FLEET_STATE_KEY, driverName, nextState);
        io.emit('driver:location-update', nextState);
    }

    async function flushQueue() {
        if (draining) return;
        draining = true;
        try {
            while ((await listLength(QUEUE_KEY)) > 0) {
                const batch = await listPopBatch(QUEUE_KEY, DEFAULT_BATCH_SIZE);
                for (const item of batch) {
                    try {
                        await processTelemetryItem(item);
                    } catch (err) {
                        console.error('❌ Telemetry item processing failed:', err.message);
                    }
                }
            }
        } finally {
            draining = false;
        }
    }

    function scheduleFlush() {
        if (flushTimer) return;
        flushTimer = setTimeout(async () => {
            flushTimer = null;
            await flushQueue();
            if ((await listLength(QUEUE_KEY)) > 0) scheduleFlush();
        }, DEFAULT_FLUSH_INTERVAL_MS);
    }

    async function enqueue(item) {
        try {
            await listPush(QUEUE_KEY, item);
        } catch (err) {
            console.error('❌ Failed to enqueue telemetry item:', err.message);
            return;
        }
        scheduleFlush();
    }

    async function shutdown() {
        if (flushTimer) {
            clearTimeout(flushTimer);
            flushTimer = null;
        }
        await flushQueue();
    }

    return {
        enqueue,
        shutdown,
        getDepth: () => listLength(QUEUE_KEY),
    };
}
