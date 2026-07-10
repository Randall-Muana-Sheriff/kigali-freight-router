// controllers/stopController.js
import pool from '../config/db.js';
import { io } from '../server.js';
import { appendAuditLog } from '../services/auditLogService.js';
import { ok, fail, errorMessage } from '../utils/httpResponse.js';

export const StopController = {
    // GET pending stops
    getStops: async (req, res) => {
        try {
            const result = await pool.query(
                "SELECT id, name, lat, lng, demand FROM delivery_stops WHERE status = 'PENDING' ORDER BY id DESC"
            );
            return ok(res, result.rows);
        } catch (err) {
            return fail(res, {
                status: 500,
                code: 'STOPS_FETCH_FAILED',
                message: errorMessage(err, 'Failed to fetch stops.'),
            });
        }
    },

    // POST a new stop
    createStop: async (req, res) => {
        const { name, lat, lng, demand } = req.body;
        if (!name || lat === undefined || lng === undefined) {
            return fail(res, {
                status: 400,
                code: 'STOPS_INVALID_PAYLOAD',
                message: 'Name, latitude, and longitude are required.',
            });
        }
        
        try {
            const result = await pool.query(
                `INSERT INTO delivery_stops (name, lat, lng, demand, status) VALUES ($1, $2, $3, $4, 'PENDING') RETURNING *`,
                [name, lat, lng, demand || 1]
            );
            io.emit('stopUpdated', result.rows[0]);
            await appendAuditLog({
                actionType: 'STOP_CREATED',
                description: `Created delivery stop ${result.rows[0].name}`,
                username: req.user?.username || 'System',
            });
            return ok(res, { stop: result.rows[0] }, { status: 201 });
        } catch (err) {
            return fail(res, {
                status: 500,
                code: 'STOPS_CREATE_FAILED',
                message: errorMessage(err, 'Failed to create stop.'),
            });
        }
    },

    // DELETE a stop by ID
    deleteStop: async (req, res) => {
        const { id } = req.params;
        try {
            const result = await pool.query(
                "DELETE FROM delivery_stops WHERE id = $1 RETURNING *",
                [id]
            );
            if (result.rowCount === 0) {
                return fail(res, {
                    status: 404,
                    code: 'STOPS_NOT_FOUND',
                    message: 'Stop not found in database.',
                });
            }
            io.emit('stopUpdated', { id, deleted: true });
            await appendAuditLog({
                actionType: 'STOP_DELETED',
                description: `Deleted delivery stop ${result.rows[0].name}`,
                username: req.user?.username || 'System',
            });
            return ok(res, { deleted: result.rows[0] });
        } catch (err) {
            return fail(res, {
                status: 500,
                code: 'STOPS_DELETE_FAILED',
                message: errorMessage(err, 'Failed to delete stop.'),
            });
        }
    }
};