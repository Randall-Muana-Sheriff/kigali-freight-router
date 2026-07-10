import pool from '../config/db.js';

let auditSchemaReady = false;

async function ensureAuditLogSchema() {
    if (auditSchemaReady) return;

    await pool.query(`
        CREATE TABLE IF NOT EXISTS system_audit_logs (
            id SERIAL PRIMARY KEY,
            action_type TEXT NOT NULL,
            description TEXT NOT NULL,
            username TEXT NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
    `);

    auditSchemaReady = true;
}

export async function appendAuditLog({ actionType, description, username = 'System' }) {
    try {
        await ensureAuditLogSchema();
        await pool.query(
            `INSERT INTO system_audit_logs (action_type, description, username)
             VALUES ($1, $2, $3)`,
            [actionType, description, username]
        );
    } catch (error) {
        console.error('❌ Audit log write failed:', error.message);
    }
}
