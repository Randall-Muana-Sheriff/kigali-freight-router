import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pool from '../config/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ALLOW_DESTRUCTIVE_BASELINE = process.env.ALLOW_DESTRUCTIVE_BASELINE === '1';

const MIGRATIONS = [
    { id: 'init_spatial_baseline.sql', destructive: false },
    { id: 'add_full_schema.sql', destructive: false },
    { id: 'add_geofence_speed_limit.sql', destructive: false },
];

const LEGACY_DESTRUCTIVE_MIGRATION = 'init_spatial.sql';

async function ensureMigrationTable(client) {
    await client.query(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
            id TEXT PRIMARY KEY,
            applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
    `);
}

async function tableExists(client, tableName) {
    const result = await client.query(
        `SELECT EXISTS (
            SELECT 1
            FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = $1
        ) AS exists`,
        [tableName]
    );
    return result.rows[0]?.exists === true;
}

async function bootstrapIfNeeded(client) {
    const countResult = await client.query('SELECT COUNT(*)::int AS count FROM schema_migrations');
    const appliedCount = countResult.rows[0]?.count || 0;
    if (appliedCount > 0) return;

    // Existing deployments predate migration tracking. If baseline tables exist,
    // mark only the destructive baseline migration as applied and keep additive
    // migrations runnable.
    const hasOrders = await tableExists(client, 'orders');
    const hasHubs = await tableExists(client, 'hubs');
    if (hasOrders && hasHubs) {
        await client.query(
            `INSERT INTO schema_migrations (id)
             VALUES ($1), ($2)
             ON CONFLICT (id) DO NOTHING`,
            ['init_spatial_baseline.sql', 'init_spatial.sql']
        );
        console.log('ℹ️ Existing schema detected; baseline migration marked as applied.');
    }
}

async function getAppliedMigrations(client) {
    const result = await client.query('SELECT id FROM schema_migrations');
    return new Set(result.rows.map((row) => row.id));
}

async function applyMigration(client, migrationId) {
    const migrationPath = path.join(__dirname, '../migrations', migrationId);
    const migrationSql = fs.readFileSync(migrationPath, 'utf8');

    await client.query('BEGIN');
    try {
        await client.query(migrationSql);
        await client.query(
            `INSERT INTO schema_migrations (id)
             VALUES ($1)
             ON CONFLICT (id) DO NOTHING`,
            [migrationId]
        );
        await client.query('COMMIT');
        console.log(`✅ Applied migration: ${migrationId}`);
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    }
}

async function seedHubs(client) {
    const hasHubs = await tableExists(client, 'hubs');
    if (!hasHubs) return;

    console.log('🌱 Seeding Kigali distribution hubs...');
    await client.query(`
        INSERT INTO hubs (name, code, coordinates)
        VALUES
        (
            'Nyabugogo Central Bus & Logistics Hub',
            'KGL-NYB',
            ST_SetSRID(ST_MakePoint(30.0435, -1.9398), 4326)
        ),
        (
            'Kimironko Commercial Market Hub',
            'KGL-KMR',
            ST_SetSRID(ST_MakePoint(30.1256, -1.9448), 4326)
        ),
        (
            'Gikondo Industrial Warehousing Hub',
            'KGL-GKD',
            ST_SetSRID(ST_MakePoint(30.0840, -1.9788), 4326)
        )
        ON CONFLICT (name) DO NOTHING;
    `);
    console.log('🚀 Hub seeding successful: Nyabugogo, Kimironko, and Gikondo online.');
}

async function runMigration() {
    console.log('🔄 Running database migrations...');
    
    const client = await pool.connect();
    try {
        await ensureMigrationTable(client);
        await bootstrapIfNeeded(client);
        const appliedMigrations = await getAppliedMigrations(client);

        for (const migration of MIGRATIONS) {
            if (appliedMigrations.has(migration.id)) continue;
            await applyMigration(client, migration.id);
        }

        if (ALLOW_DESTRUCTIVE_BASELINE && !appliedMigrations.has(LEGACY_DESTRUCTIVE_MIGRATION)) {
            await applyMigration(client, LEGACY_DESTRUCTIVE_MIGRATION);
            console.log('⚠️ Applied legacy destructive baseline migration by explicit opt-in.');
        }

        await seedHubs(client);
        console.log('✅ Migration run completed.');
        
    } catch (error) {
        console.error('❌ Migration failed:', error);
        process.exitCode = 1;
    } finally {
        client.release();
        await pool.end();
    }
}

runMigration();