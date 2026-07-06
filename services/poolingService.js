import pool from '../config/db.js';

export const PoolingService = {
    /**
     * Clusters pending orders together if they are within a specified radius (in meters)
     * of each other, groupable by their closest hub.
     */
    generateOptimizedBatches: async (radiusMeters = 2500) => {
        const query = `
            WITH spatial_clusters AS (
                SELECT 
                    o.id AS order_id,
                    o.cargo_description,
                    o.weight_kg,
                    o.origin_hub_id,
                    h.name AS hub_name,
                    -- Use PostGIS window function to group orders by spatial proximity
                    ST_ClusterDBSCAN(o.pickup_coordinates, eps := $1 / 111000.0, minpoints := 1) 
                        OVER(PARTITION BY o.origin_hub_id) AS cluster_id
                FROM orders o
                JOIN hubs h ON o.origin_hub_id = h.id
                WHERE o.status = 'PENDING'
            )
            SELECT 
                hub_name,
                cluster_id,
                COUNT(order_id) AS total_orders,
                SUM(weight_kg) AS total_weight_kg,
                json_agg(json_build_object(
                    'id', order_id,
                    'cargo', cargo_description,
                    'weight', weight_kg
                )) AS aggregated_manifest
            FROM spatial_clusters
            GROUP BY hub_name, cluster_id
            ORDER BY total_orders DESC;
        `;

        // Note: eps is roughly calculated in degrees for SRID 4326 (111,000 meters per degree near equator)
        const result = await pool.query(query, [radiusMeters]);
        return result.rows;
    }
};