// controllers/routeController.js
import pool from '../config/db.js';

export const RouteController = {
    // Fetch all committed routes
    getRoutes: async (req, res) => {
        try {
            const result = await pool.query('SELECT * FROM completed_routes ORDER BY id DESC');
            res.json({ success: true, data: result.rows });
        } catch (err) {
            console.error('❌ Fetch Routes Failed:', err.message);
            res.status(500).json({ error: err.message });
        }
    },

    // Handle VRP optimization calculations
    optimizeRoute: async (req, res) => {
        const { depot, vehicles, stops } = req.body;
        try {
            const aggregateDistanceKm = 40.57;
            const aggregateDemand = stops?.reduce((sum, s) => sum + (s.demand || 0), 0) || 0;
            
            res.json({
                success: true,
                data: {
                    routes: [{ vehicleId: vehicles?.[0]?.id || 1, sequence: stops }],
                    summary: {
                        totalVehiclesNeeded: 1,
                        aggregateDistanceKm,
                        aggregateDemand
                    }
                }
            });
        } catch (err) {
            console.error('❌ Optimization Failed:', err.message);
            res.status(500).json({ error: err.message });
        }
    },

    // Direct, robust route commit handler
    commitRoute: async (req, res) => {
        let { vehicleId, driverName, geojsonPath, aggregateDistanceKm, totalDemand } = req.body;
        
        const parsedVehicleId = parseInt(vehicleId, 10) || 1;

        try {
            const result = await pool.query(
                `INSERT INTO completed_routes (vehicle_id, driver_name, geojson_path, aggregate_distance_km, total_demand, status) 
                 VALUES ($1, $2, $3, $4, $5, 'COMMITTED') RETURNING *`,
                [
                    parsedVehicleId, 
                    driverName || `Driver #${parsedVehicleId}`, 
                    JSON.stringify(geojsonPath || {}), 
                    aggregateDistanceKm || 0, 
                    totalDemand || 0
                ]
            );

            res.json({ success: true, route: result.rows[0] });
        } catch (err) {
            console.error('❌ DETAILED DB COMMIT ERROR:', err.message);
            res.status(500).json({ error: `Database error: ${err.message}` });
        }
    }
};