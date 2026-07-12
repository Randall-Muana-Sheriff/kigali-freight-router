import { Router } from 'express';
import pool from '../config/db.js';
import { buildMetricsText, register } from '../middleware/metrics.js';

const router = Router();

router.get('/health', (req, res) => {
    res.json({
        success: true,
        data: {
            status: 'ok',
            service: 'kigali-freight-router',
            uptimeSeconds: Math.round(process.uptime()),
        },
    });
});

router.get('/ready', async (req, res) => {
    try {
        await pool.query('SELECT 1');
        res.json({
            success: true,
            data: {
                status: 'ready',
                database: 'ok',
            },
        });
    } catch (error) {
        res.status(503).json({
            success: false,
            error: {
                code: 'READINESS_CHECK_FAILED',
                message: 'Database readiness check failed.',
            },
        });
    }
});

router.get('/metrics', async (req, res) => {
    res.setHeader('Content-Type', register.contentType);
    res.send(await buildMetricsText());
});

export default router;
