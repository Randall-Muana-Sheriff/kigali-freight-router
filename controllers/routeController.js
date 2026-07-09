import pool from '../config/db.js';

export const RouteController = {
    // GET /api/routes
    getRoutes: async (req, res) => {
        try {
            const result = await pool.query(
                'SELECT id, driver_name AS "driverName", original_points_count AS "originalPointsCount", simplified_points_count AS "simplifiedPointsCount", space_saved_percentage AS "spaceSavedPercentage", ST_AsGeoJSON(geom_simplified) AS "geojsonSimplified" FROM routes ORDER BY id DESC'
            );
            res.json(result.rows);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    },

    // POST /api/routes/save
    saveRoute: async (req, res) => {
        const { driverName, coordinates } = req.body;
        if (!coordinates || coordinates.length < 2) {
            return res.status(400).json({ error: 'Insufficient coordinates.' });
        }
        try {
            const osrmCoordsString = coordinates.map((c) => `${c[0]},${c[1]}`).join(';');
            let snappedCoords = coordinates;
            try {
                const response = await fetch(
                    `http://router.project-osrm.org/match/v1/driving/${osrmCoordsString}?overview=full&geometries=geojson`
                );
                const osrmData = await response.json();
                if (osrmData.code === 'Ok' && osrmData.matchings && osrmData.matchings[0]) {
                    snappedCoords = osrmData.matchings[0].geometry.coordinates;
                }
            } catch (osrmErr) {
                console.warn('⚠️ OSRM unreachable, saving linear vector nodes.');
            }

            const rawLineWKT = `LINESTRING(${coordinates.map((c) => `${c[0]} ${c[1]}`).join(', ')})`;
            const snappedLineWKT = `LINESTRING(${snappedCoords.map((c) => `${c[0]} ${c[1]}`).join(', ')})`;
            const insertQuery = `WITH raw_data AS (SELECT $1::varchar AS d_name, ST_GeomFromText($2, 4326) AS g_orig, ST_SimplifyPreserveTopology(ST_GeomFromText($3, 4326), 0.0001) AS g_simp) INSERT INTO routes (driver_name, original_points_count, simplified_points_count, space_saved_percentage, geom_original, geom_simplified) SELECT d_name, ST_NPoints(g_orig), ST_NPoints(g_simp), CONCAT(ROUND((1.0 - (ST_NPoints(g_simp)::float / ST_NPoints(g_orig)::float)) * 100), '%'), g_orig, g_simp FROM raw_data RETURNING original_points_count, simplified_points_count, space_saved_percentage;`;
            const dbResult = await pool.query(insertQuery, [driverName, rawLineWKT, snappedLineWKT]);
            const metrics = dbResult.rows[0];

            res.json({
                success: true,
                metrics: {
                    originalPoints: metrics.original_points_count,
                    simplifiedPoints: metrics.simplified_points_count,
                    spaceSavedPercentage: metrics.space_saved_percentage,
                },
            });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    },
};
