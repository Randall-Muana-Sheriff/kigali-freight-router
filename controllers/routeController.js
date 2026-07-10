// controllers/routeController.js
import pool from '../config/db.js';
import { io } from '../server.js';
import { solveVRP } from '../services/vrpOptimizer.js';
import { appendAuditLog } from '../services/auditLogService.js';

function normalizeRouteCoordinates(routePath) {
    if (!routePath) return [];

    const parsedPath = typeof routePath === 'string' ? JSON.parse(routePath) : routePath;

    if (Array.isArray(parsedPath)) {
        return parsedPath
            .map((node) => {
                if (Array.isArray(node) && node.length >= 2) {
                    return [Number(node[0]), Number(node[1])];
                }

                if (node && typeof node === 'object' && node.lng !== undefined && node.lat !== undefined) {
                    return [Number(node.lng), Number(node.lat)];
                }

                return null;
            })
            .filter(Boolean);
    }

    if (parsedPath.type === 'LineString' && Array.isArray(parsedPath.coordinates)) {
        return parsedPath.coordinates.map(([lng, lat]) => [Number(lng), Number(lat)]);
    }

    if (Array.isArray(parsedPath.coordinates)) {
        return parsedPath.coordinates.map(([lng, lat]) => [Number(lng), Number(lat)]);
    }

    return [];
}

function normalizeStoredRoutePath(routePath) {
    return {
        type: 'LineString',
        coordinates: normalizeRouteCoordinates(routePath),
    };
}

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
        const { depot, vehicles, stops, vehicleCapacity } = req.body;
        try {
            const solution = solveVRP({ depot, stops: stops || [], vehicleCapacity: Number(vehicleCapacity) || 100 });
            const routes = solution.routes.map((route, index) => ({
                vehicleId: vehicles?.[index]?.id || vehicles?.[0]?.id || index + 1,
                sequence: route.sequence,
                totalDistanceKm: route.totalDistanceKm,
                totalLoad: route.totalLoad,
            }));

            res.json({
                success: true,
                data: {
                    routes,
                    summary: solution.summary,
                }
            });
        } catch (err) {
            console.error('❌ Optimization Failed:', err.message);
            res.status(500).json({ error: err.message });
        }
    },

    saveRouteHistory: async (req, res) => {
        const { driverName, coordinates } = req.body;

        try {
            const normalizedPath = normalizeStoredRoutePath(coordinates);
            const result = await pool.query(
                `INSERT INTO completed_routes (vehicle_id, driver_name, geojson_path, aggregate_distance_km, total_demand, status)
                 VALUES ($1, $2, $3, $4, $5, 'SNAPSHOT') RETURNING *`,
                [1, driverName || 'Dispatcher Snapshot', JSON.stringify(normalizedPath), 0, 0]
            );

            io.emit('routeUpdated', result.rows[0]);
            await appendAuditLog({
                actionType: 'ROUTE_SAVED',
                description: `Saved route snapshot for ${driverName || 'Dispatcher Snapshot'}`,
                username: req.user?.username || 'System',
            });
            res.json({ success: true, route: result.rows[0] });
        } catch (err) {
            console.error('❌ Route snapshot save failed:', err.message);
            res.status(500).json({ error: err.message });
        }
    },

    // Direct, robust route commit handler
    commitRoute: async (req, res) => {
        let { vehicleId, driverName, geojsonPath, aggregateDistanceKm, totalDemand } = req.body;
        
        const parsedVehicleId = parseInt(vehicleId, 10) || 1;

        try {
            const normalizedPath = normalizeStoredRoutePath(geojsonPath);
            const result = await pool.query(
                `INSERT INTO completed_routes (vehicle_id, driver_name, geojson_path, aggregate_distance_km, total_demand, status) 
                 VALUES ($1, $2, $3, $4, $5, 'COMMITTED') RETURNING *`,
                [
                    parsedVehicleId, 
                    driverName || `Driver #${parsedVehicleId}`, 
                    JSON.stringify(normalizedPath),
                    aggregateDistanceKm || 0, 
                    totalDemand || 0
                ]
            );

            io.emit('routeUpdated', result.rows[0]);
            await appendAuditLog({
                actionType: 'ROUTE_COMMITTED',
                description: `Committed route for ${driverName || `Driver #${parsedVehicleId}`}`,
                username: req.user?.username || 'System',
            });
            res.json({ success: true, route: result.rows[0] });
        } catch (err) {
            console.error('❌ DETAILED DB COMMIT ERROR:', err.message);
            res.status(500).json({ error: `Database error: ${err.message}` });
        }
    }
};