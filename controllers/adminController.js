import pool from '../config/db.js';
import { appendAuditLog } from '../services/auditLogService.js';

let adminSchemaReady = false;

async function ensureAdminSchema() {
    if (adminSchemaReady) return;

    await pool.query(`
        CREATE TABLE IF NOT EXISTS fleet_vehicles (
            id SERIAL PRIMARY KEY,
            plate_number TEXT NOT NULL,
            vehicle_type TEXT NOT NULL,
            current_driver_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
            status TEXT NOT NULL DEFAULT 'ACTIVE',
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS system_audit_logs (
            id SERIAL PRIMARY KEY,
            action_type TEXT NOT NULL,
            description TEXT NOT NULL,
            username TEXT NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
    `);

    adminSchemaReady = true;
}

export const AdminController = {
    getUsers: async (req, res) => {
        try {
            const result = await pool.query('SELECT id, username, role FROM users ORDER BY id DESC');
            res.json(result.rows);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    updateUserRole: async (req, res) => {
        const { id } = req.params;
        const { role } = req.body;

        if (!role) {
            return res.status(400).json({ error: 'Role is required.' });
        }

        try {
            const result = await pool.query(
                'UPDATE users SET role = $1 WHERE id = $2 RETURNING id, username, role',
                [String(role).toLowerCase(), id]
            );

            if (result.rowCount === 0) {
                return res.status(404).json({ error: 'User not found.' });
            }

            await appendAuditLog({
                actionType: 'USER_ROLE_UPDATED',
                description: `Updated role for ${result.rows[0].username} to ${result.rows[0].role}`,
                username: req.user?.username || 'System',
            });

            res.json({ success: true, user: result.rows[0] });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    getVehicles: async (req, res) => {
        try {
            await ensureAdminSchema();
            const result = await pool.query(
                `SELECT
                    id,
                    plate_number AS "plateNumber",
                    vehicle_type AS "vehicleType",
                    current_driver_id AS "currentDriverId",
                    status
                 FROM fleet_vehicles
                 ORDER BY id DESC`
            );
            res.json(result.rows);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    createVehicle: async (req, res) => {
        const { name, type } = req.body;
        if (!name || !type) {
            return res.status(400).json({ error: 'Vehicle name and type are required.' });
        }

        try {
            await ensureAdminSchema();
            const result = await pool.query(
                `INSERT INTO fleet_vehicles (plate_number, vehicle_type)
                 VALUES ($1, $2)
                 RETURNING id, plate_number AS "plateNumber", vehicle_type AS "vehicleType", current_driver_id AS "currentDriverId", status`,
                [name, type]
            );

            await appendAuditLog({
                actionType: 'VEHICLE_REGISTERED',
                description: `Registered vehicle ${name}`,
                username: req.user?.username || 'System',
            });

            res.status(201).json({ success: true, vehicle: result.rows[0] });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    assignVehicle: async (req, res) => {
        const { id } = req.params;
        const { driverId } = req.body;

        if (!driverId) {
            return res.status(400).json({ error: 'Driver ID is required.' });
        }

        try {
            await ensureAdminSchema();
            const result = await pool.query(
                `UPDATE fleet_vehicles
                 SET current_driver_id = $1
                 WHERE id = $2
                 RETURNING id, plate_number AS "plateNumber", vehicle_type AS "vehicleType", current_driver_id AS "currentDriverId", status`,
                [driverId, id]
            );

            if (result.rowCount === 0) {
                return res.status(404).json({ error: 'Vehicle not found.' });
            }

            await appendAuditLog({
                actionType: 'VEHICLE_ASSIGNED',
                description: `Assigned driver ${driverId} to vehicle ${result.rows[0].plateNumber}`,
                username: req.user?.username || 'System',
            });

            res.json({ success: true, vehicle: result.rows[0] });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    getAuditLogs: async (req, res) => {
        try {
            await ensureAdminSchema();
            const result = await pool.query(
                `SELECT id, action_type AS "actionType", description, username, created_at AS "timestamp"
                 FROM system_audit_logs
                 ORDER BY created_at DESC
                 LIMIT 100`
            );
            res.json(result.rows);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },
};
