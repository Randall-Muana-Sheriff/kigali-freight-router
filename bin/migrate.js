import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pool from '../config/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runMigration() {
    console.log('🔄 Initializing spatial database schema orchestration...');
    
    try {
        // Read the SQL migration file
        const sqlFilePath = path.join(__dirname, '../migrations/init_spatial.sql');
        const schemaSql = fs.readFileSync(sqlFilePath, 'utf8');
        
        // Execute schema initialization
        await pool.query(schemaSql);
        console.log('✅ PostGIS spatial schema initialized perfectly.');

        // Seed Kigali Hubs with real spatial coordinates (Longitude, Latitude)
        console.log('🌱 Seeding Kigali distribution hubs...');
        
        const seedQuery = `
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
        `;
        
        await pool.query(seedQuery);
        console.log('🚀 Hub seeding successful: Nyabugogo, Kimironko, and Gikondo online.');
        
    } catch (error) {
        console.error('❌ Migration failed catastrophically:', error);
    } finally {
        // Terminate process safely
        await pool.end();
        process.exit(0);
    }
}

runMigration();