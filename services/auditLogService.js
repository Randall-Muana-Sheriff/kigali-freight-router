import pool from '../config/db.js';

export async function appendAuditLog({ actionType, description, username = 'System' }) {
    try {
        await pool.query(
            `INSERT INTO system_audit_logs (action_type, description, username)
             VALUES ($1, $2, $3)`,
            [actionType, description, username]
        );
    } catch (error) {
        console.error('❌ Audit log write failed (run migrations):', error.message);
    }
}
