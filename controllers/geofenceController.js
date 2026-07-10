import pool from '../config/db.js';
import { io } from '../server.js';
import { appendAuditLog } from '../services/auditLogService.js';
import { ok, fail, errorMessage } from '../utils/httpResponse.js';

export const GeofenceController = {
    // GET /api/geofences
    getGeofences: async (req, res) => {
        try {
            const result = await pool.query(
                'SELECT id, name, speed_limit_kmh AS "speedLimitKmh", ST_AsGeoJSON(geom) as geojson FROM geofences ORDER BY id DESC'
            );
            const optimizedList = result.rows.map((row) => ({
                id: row.id,
                name: row.name,
                speedLimitKmh: row.speed_limit_kmh || 60,
                geojson: JSON.parse(row.geojson),
            }));
            return ok(res, optimizedList);
        } catch (err) {
            return fail(res, {
                status: 500,
                code: 'GEOFENCE_FETCH_FAILED',
                message: errorMessage(err, 'Failed to fetch geofences.'),
            });
        }
    },

    // POST /api/geofences
    createGeofence: async (req, res) => {
        const { name, coordinates, speedLimitKmh } = req.body;
        try {
            const polyCoords = [...coordinates];
            if (
                polyCoords[0][0] !== polyCoords[polyCoords.length - 1][0] ||
                polyCoords[0][1] !== polyCoords[polyCoords.length - 1][1]
            ) {
                polyCoords.push(polyCoords[0]);
            }
            const wktCoords = polyCoords.map((c) => `${c[0]} ${c[1]}`).join(', ');
            const wktPolygon = `POLYGON((${wktCoords}))`;
            const finalSpeedLimit = speedLimitKmh ? parseInt(speedLimitKmh) : 60;

            await pool.query(
                'INSERT INTO geofences (name, speed_limit_kmh, geom) VALUES ($1, $2, ST_GeomFromText($3, 4326)) ON CONFLICT (name) DO UPDATE SET geom = EXCLUDED.geom, speed_limit_kmh = EXCLUDED.speed_limit_kmh',
                [name, finalSpeedLimit, wktPolygon]
            );
            io.emit('geofenceUpdated', { name, speedLimitKmh: finalSpeedLimit });
            await appendAuditLog({
                actionType: 'GEOFENCE_SAVED',
                description: `Saved geofence ${name} with limit ${finalSpeedLimit} km/h`,
                username: req.user?.username || 'System',
            });
            return ok(res, { message: `Polygon zone "${name}" with limit ${finalSpeedLimit} km/h saved.` });
        } catch (err) {
            return fail(res, {
                status: 500,
                code: 'GEOFENCE_SAVE_FAILED',
                message: errorMessage(err, 'Failed to save geofence.'),
            });
        }
    },

    // DELETE /api/geofences/:id
    deleteGeofence: async (req, res) => {
        const { id } = req.params;
        try {
            await pool.query('DELETE FROM geofences WHERE id = $1', [id]);
            io.emit('geofenceUpdated', { id, deleted: true });
            await appendAuditLog({
                actionType: 'GEOFENCE_DELETED',
                description: `Deleted geofence ${id}`,
                username: req.user?.username || 'System',
            });
            return ok(res, { deleted: true, id });
        } catch (err) {
            return fail(res, {
                status: 500,
                code: 'GEOFENCE_DELETE_FAILED',
                message: errorMessage(err, 'Failed to delete geofence.'),
            });
        }
    },
};
