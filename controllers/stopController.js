// controllers/stopController.js
import pool from '../config/db.js';

export const StopController = {
    // GET pending stops
    getStops: async (req, res) => {
        try {
            const result = await pool.query(
                "SELECT id, name, lat, lng, demand FROM delivery_stops WHERE status = 'PENDING' ORDER BY id DESC"
            );
            res.json(result.rows);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    },

    // POST a new stop
    createStop: async (req, res) => {
        const { name, lat, lng, demand } = req.body;
        if (!name || lat === undefined || lng === undefined) {
            return res.status(400).json({ error: 'Name, latitude, and longitude are required.' });
        }
        
        try {
            const result = await pool.query(
                `INSERT INTO delivery_stops (name, lat, lng, demand, status) VALUES ($1, $2, $3, $4, 'PENDING') RETURNING *`,
                [name, lat, lng, demand || 1]
            );
            res.json({ success: true, stop: result.rows[0] });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    },

    // DELETE a stop by ID
    deleteStop: async (req, res) => {
        const { id } = req.params;
        try {
            const result = await pool.query(
                "DELETE FROM delivery_stops WHERE id = $1 RETURNING *",
                [id]
            );
            if (result.rowCount === 0) {
                return res.status(404).json({ error: 'Stop not found in database.' });
            }
            res.json({ success: true, deleted: result.rows[0] });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    }
};