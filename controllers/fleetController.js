// controllers/fleetController.js
//
// ⚠️ NOT CURRENTLY WIRED UP. This targets a future schema (driver_locations,
// driver_location_history, geofence_alerts tables) that does not exist yet in
// the live database — only `users`, `orders` (basic), `routes`, and `geofences`
// are currently migrated. Do not mount these routes until that schema exists.
import pool from '../config/db.js';

export const FleetController = {
    getLiveFleetStatus: async (req, res) => {
        try {
            const spatialQuery = `
                SELECT 
                    o.id AS order_id,
                    o.cargo_description,
                    o.assigned_to AS driver_name,
                    dl.lat AS current_driver_lat,
                    dl.lng AS current_driver_lng,
                    o.delivery_lat AS target_delivery_lat,
                    o.delivery_lng AS target_delivery_lng,
                    -- Compute exact distance remaining using native PostGIS spatial matching
                    ST_DistanceSphere(dl.geom, o.delivery_geom) AS distance_meters,
                    -- Check telemetry freshness
                    EXTRACT(EPOCH FROM (NOW() - dl.updated_at)) AS telemetry_age_seconds
                FROM orders o
                INNER JOIN driver_locations dl ON o.assigned_to = dl.driver_name
                WHERE o.status = 'ASSIGNED'
                ORDER BY distance_meters ASC;
            `;

            const result = await pool.query(spatialQuery);

            const liveFleetReport = result.rows.map(row => {
                const distanceKm = (parseFloat(row.distance_meters) / 1000).toFixed(2);
                const averageSpeedKmH = 35; 
                const hoursRemaining = distanceKm / averageSpeedKmH;
                const minutesRemaining = Math.ceil(hoursRemaining * 60);

                return {
                    orderId: row.order_id,
                    cargo: row.cargo_description,
                    driver: row.driver_name,
                    currentLocation: { lat: row.current_driver_lat, lng: row.current_driver_lng },
                    destinationLocation: { lat: row.target_delivery_lat, lng: row.target_delivery_lng },
                    distanceRemainingKm: parseFloat(distanceKm),
                    estimatedMinutesArrival: minutesRemaining <= 0 ? 1 : minutesRemaining,
                    telemetryStatus: row.telemetry_age_seconds > 60 ? "STALE_SIGNAL" : "LIVE"
                };
            });

            res.status(200).json({
                systemTime: new Date().toISOString(),
                activeFleetCount: liveFleetReport.length,
                fleetReport: liveFleetReport
            });
        } catch (error) {
            console.error("🚨 Spatial Analytics Pipeline Error:", error.message);
            res.status(500).json({ error: "Failed to compile fleet telemetry matrix data." });
        }
    },

    getDriverBreadcrumbs: async (req, res) => {
        try {
            const { driverName } = req.params;
            const hours = parseInt(req.query.hours) || 4;
            
            // Expert Edge Case: Default RDP tolerance to 0.0001 degrees (~11 meters in Kigali)
            const tolerance = parseFloat(req.query.tolerance) || 0.0001;

            const compressionQuery = `
                WITH spatial_collection AS (
                    -- Step 1: Aggregate individual pings into a chronological path
                    SELECT ST_MakeLine(geom ORDER BY recorded_at) AS raw_trajectory
                    FROM driver_location_history
                    WHERE driver_name = $1 
                      AND recorded_at >= NOW() - (INTERVAL '1 hour' * $2::int)
                ),
                rdp_compression AS (
                    -- Step 2: Apply Ramer-Douglas-Peucker simplification
                    SELECT ST_Simplify(raw_trajectory, $3::float) AS simplified_trajectory
                    FROM spatial_collection
                )
                -- Step 3: Extract the surviving key vertices back to point structures
                SELECT 
                    ST_Y(dumped.geom) AS lat,
                    ST_X(dumped.geom) AS lng
                FROM rdp_compression,
                LATERAL ST_DumpPoints(simplified_trajectory) AS dumped;
            `;

            const result = await pool.query(compressionQuery, [driverName, hours, tolerance]);

            const dynamicTrail = result.rows.map(row => [
                parseFloat(row.lat),
                parseFloat(row.lng)
            ]);

            res.status(200).json({
                driverName,
                algorithm: "Ramer-Douglas-Peucker (PostGIS ST_Simplify)",
                inputToleranceDegrees: tolerance,
                survivingPointsCount: dynamicTrail.length,
                trail: dynamicTrail
            });
        } catch (error) {
            console.error("🚨 Downsampling engine crash:", error.message);
            res.status(500).json({ error: "Failed to compress tracking trajectory." });
        }
    },

    // Add this method to your existing FleetController object
getFleetPerformanceReport: async (req, res) => {
    try {
        const analyticsQuery = `
            SELECT 
                o.assigned_to AS driver_name,
                COUNT(o.id) AS total_completed_orders,
                
                -- 1. Average time spent waiting at the loading dock (Dwell Time)
                ROUND(AVG(EXTRACT(EPOCH FROM (o.updated_at - ga.created_at)) / 60)::numeric, 1) AS avg_dwell_minutes,
                
                -- 2. Max bottleneck duration recorded at a loading dock
                ROUND(MAX(EXTRACT(EPOCH FROM (o.updated_at - ga.created_at)) / 60)::numeric, 1) AS max_dwell_minutes
            FROM orders o
            JOIN geofence_alerts ga ON o.id = ga.order_id
            WHERE o.status = 'DELIVERED' 
              AND ga.event_type = 'ARRIVED_AT_DESTINATION'
            GROUP BY o.assigned_to
            ORDER BY avg_dwell_minutes DESC;
        `;

        const result = await pool.query(analyticsQuery);

        res.status(200).json({
            generatedAt: new Date().toISOString(),
            metricScope: "Completed Orders Turnaround Analysis",
            fleetMetrics: result.rows.map(row => ({
                driverName: row.driver_name,
                completedDeliveriesCount: parseInt(row.total_completed_orders),
                averageUnloadingDwellTimeMinutes: parseFloat(row.avg_dwell_minutes),
                worstCaseDwellTimeMinutes: parseFloat(row.max_dwell_minutes)
            }))
        });
    } catch (error) {
        console.error("🚨 Analytics Engine Failure:", error.message);
        res.status(500).json({ error: "Failed to compile fleet operational analytics reports." });
    }
    }
};