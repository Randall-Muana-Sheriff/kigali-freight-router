import pg from 'pg';
import { appConfig } from './appConfig.js';

const { Pool } = pg;

const pool = new Pool({
    user: appConfig.db.user,
    password: appConfig.db.password,
    host: appConfig.db.host,
    port: appConfig.db.port,
    database: appConfig.db.database,
});

let hasLoggedConnection = false;
pool.on('connect', () => {
    if (hasLoggedConnection) return;
    hasLoggedConnection = true;
    console.log('🐘 PostgreSQL Co-op Database connected successfully.');
});

pool.on('error', (err) => {
    console.error('❌ Unexpected database pool connection error:', err);
});

export default pool;