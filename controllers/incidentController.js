import pool from '../config/db.js';
import { ok, fail } from '../utils/httpResponse.js';

export const IncidentController = {
    // POST /api/incidents
    createIncident: async (req, res) => {
        try {
            const { orderId = null, title, description } = req.body || {};
            const driverName = req.user?.username;

            if (!driverName) {
                return fail(res, {
                    status: 400,
                    code: 'INCIDENT_DRIVER_MISSING',
                    message: 'Driver identity is missing in session token.',
                });
            }

            if (!title || !description) {
                return fail(res, {
                    status: 400,
                    code: 'INCIDENT_INVALID_PAYLOAD',
                    message: 'Both title and description are required.',
                });
            }

            const query = `
                INSERT INTO geofence_alerts (order_id, driver_name, event_type, distance_meters, description)
                VALUES ($1, $2, 'MANUAL_INCIDENT', 0, $3)
                RETURNING id, order_id, driver_name, event_type, description, created_at;
            `;

            const payload = `${title.trim()}\n\n${description.trim()}`;
            const result = await pool.query(query, [orderId, driverName, payload]);

            return ok(res, result.rows[0], { status: 201 });
        } catch (error) {
            console.error('Database Error:', error.message);
            return fail(res, {
                status: 500,
                code: 'INCIDENT_CREATE_FAILED',
                message: 'Failed to store incident report.',
            });
        }
    },
};
