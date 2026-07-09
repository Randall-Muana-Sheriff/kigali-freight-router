import pool from '../config/db.js';

export const SpatialService = {
    /**
     * Finds the closest logistics hub to any given GPS coordinate in Kigali
     */
    findClosestHub: async (longitude, latitude) => {
        const query = `
            SELECT id, name, code, 
                   ST_X(coordinates::geometry) as longitude, 
                   ST_Y(coordinates::geometry) as latitude,
                   ST_DistanceSphere(coordinates, ST_SetSRID(ST_MakePoint($1, $2), 4326)) as distance_meters
            FROM hubs
            ORDER BY coordinates <-> ST_SetSRID(ST_MakePoint($1, $2), 4326)
            LIMIT 1;
        `;
        const result = await pool.query(query, [longitude, latitude]);
        return result.rows[0];
    },

    /**
     * Calculates the exact straight-line distance between two GPS coordinates
     */
    calculateDistance: async (lon1, lat1, lon2, lat2) => {
        const query = `
            SELECT ST_DistanceSphere(
                ST_SetSRID(ST_MakePoint($1, $2), 4326),
                ST_SetSRID(ST_MakePoint($3, $4), 4326)
            ) as distance_meters;
        `;
        const result = await pool.query(query, [lon1, lat1, lon2, lat2]);
        return parseFloat(result.rows[0].distance_meters);
    }
};