import pool from '../config/db.js';
import { appendAuditLog } from '../services/auditLogService.js';
import { ok, fail, errorMessage } from '../utils/httpResponse.js';
import { ALLOWED_ROLES } from '../utils/roles.js';

export const AdminController = {
    getUsers: async (req, res) => {
        try {
            const result = await pool.query('SELECT id, username, role FROM users ORDER BY id DESC');
            return ok(res, result.rows);
        } catch (error) {
            return fail(res, {
                status: 500,
                code: 'ADMIN_USERS_FETCH_FAILED',
                message: errorMessage(error, 'Failed to fetch users.'),
            });
        }
    },

    updateUserRole: async (req, res) => {
        const { id } = req.params;
        const { role } = req.body;

        if (!role) {
            return fail(res, {
                status: 400,
                code: 'ADMIN_ROLE_REQUIRED',
                message: 'Role is required.',
            });
        }

        if (!ALLOWED_ROLES.includes(String(role).toLowerCase())) {
            return fail(res, {
                status: 400,
                code: 'ADMIN_ROLE_INVALID',
                message: `Role must be one of: ${ALLOWED_ROLES.join(', ')}.`,
            });
        }

        try {
            const result = await pool.query(
                'UPDATE users SET role = $1 WHERE id = $2 RETURNING id, username, role',
                [String(role).toLowerCase(), id]
            );

            if (result.rowCount === 0) {
                return fail(res, {
                    status: 404,
                    code: 'ADMIN_USER_NOT_FOUND',
                    message: 'User not found.',
                });
            }

            await appendAuditLog({
                actionType: 'USER_ROLE_UPDATED',
                description: `Updated role for ${result.rows[0].username} to ${result.rows[0].role}`,
                username: req.user?.username || 'System',
            });

            return ok(res, { user: result.rows[0] });
        } catch (error) {
            return fail(res, {
                status: 500,
                code: 'ADMIN_ROLE_UPDATE_FAILED',
                message: errorMessage(error, 'Failed to update user role.'),
            });
        }
    },

    getVehicles: async (req, res) => {
        try {
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
            return ok(res, result.rows);
        } catch (error) {
            return fail(res, {
                status: 500,
                code: 'ADMIN_VEHICLES_FETCH_FAILED',
                message: errorMessage(error, 'Failed to fetch vehicles.'),
            });
        }
    },

    createVehicle: async (req, res) => {
        const { name, type } = req.body;
        if (!name || !type) {
            return fail(res, {
                status: 400,
                code: 'ADMIN_VEHICLE_INVALID_PAYLOAD',
                message: 'Vehicle name and type are required.',
            });
        }

        try {
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

            return ok(res, { vehicle: result.rows[0] }, { status: 201 });
        } catch (error) {
            return fail(res, {
                status: 500,
                code: 'ADMIN_VEHICLE_CREATE_FAILED',
                message: errorMessage(error, 'Failed to create vehicle.'),
            });
        }
    },

    assignVehicle: async (req, res) => {
        const { id } = req.params;
        const { driverId } = req.body;

        if (!driverId) {
            return fail(res, {
                status: 400,
                code: 'ADMIN_DRIVER_REQUIRED',
                message: 'Driver ID is required.',
            });
        }

        try {
            const result = await pool.query(
                `UPDATE fleet_vehicles
                 SET current_driver_id = $1
                 WHERE id = $2
                 RETURNING id, plate_number AS "plateNumber", vehicle_type AS "vehicleType", current_driver_id AS "currentDriverId", status`,
                [driverId, id]
            );

            if (result.rowCount === 0) {
                return fail(res, {
                    status: 404,
                    code: 'ADMIN_VEHICLE_NOT_FOUND',
                    message: 'Vehicle not found.',
                });
            }

            await appendAuditLog({
                actionType: 'VEHICLE_ASSIGNED',
                description: `Assigned driver ${driverId} to vehicle ${result.rows[0].plateNumber}`,
                username: req.user?.username || 'System',
            });

            return ok(res, { vehicle: result.rows[0] });
        } catch (error) {
            return fail(res, {
                status: 500,
                code: 'ADMIN_VEHICLE_ASSIGN_FAILED',
                message: errorMessage(error, 'Failed to assign vehicle.'),
            });
        }
    },

    getAuditLogs: async (req, res) => {
        try {
            const result = await pool.query(
                `SELECT id, action_type AS "actionType", description, username, created_at AS "timestamp"
                 FROM system_audit_logs
                 ORDER BY created_at DESC
                 LIMIT 100`
            );
            return ok(res, result.rows);
        } catch (error) {
            return fail(res, {
                status: 500,
                code: 'ADMIN_AUDIT_FETCH_FAILED',
                message: errorMessage(error, 'Failed to fetch audit logs.'),
            });
        }
    },
};
