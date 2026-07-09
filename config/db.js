import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

const pool = new Pool({
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_DATABASE,
});

pool.on('connect', () => {
    console.log('🐘 PostgreSQL Co-op Database connected successfully.');
});

pool.on('error', (err) => {
    console.error('❌ Unexpected database pool connection error:', err);
});

export default pool;