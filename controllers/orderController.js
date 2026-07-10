// Order lifecycle routes are now backed by the full freight schema.
// The migration bundle creates the missing geometry, assignment, and audit
// tables that these controllers query.
import pool from '../config/db.js';
import { io } from '../server.js';
import { ok, fail } from '../utils/httpResponse.js';

export const OrderController = {
    // 1. GET /api/v1/orders/active - Fetch pending orders
    getActiveOrders: async (req, res) => {
        try {
            const query = `
                SELECT
                    id,
                    cargo_description,
                    status,
                    weight_kg,
                    origin_hub_name,
                    pickup_lng,
                    pickup_lat,
                    delivery_lng,
                    delivery_lat
                FROM orders
                WHERE status = 'PENDING'
                ORDER BY id DESC;
            `;
            const result = await pool.query(query);
            return ok(res, result.rows);
        } catch (error) {
            console.error("Database Error:", error.message);
            return fail(res, {
                status: 500,
                code: 'ORDERS_ACTIVE_FETCH_FAILED',
                message: 'Failed to read freight records.',
            });
        }
    },

    // 2. POST /api/v1/orders - Insert order and calculate native spatial geometry
    createOrder: async (req, res) => {
        try {
            const { 
                cargo_description, weight_kg, origin_hub_name, 
                pickup_lng, pickup_lat, delivery_lng, delivery_lat 
            } = req.body;
            
            const query = `
                INSERT INTO orders (
                    cargo_description,
                    weight_kg,
                    origin_hub_name,
                    pickup_lng,
                    pickup_lat,
                    delivery_lng,
                    delivery_lat,
                    pickup_coordinates,
                    delivery_coordinates,
                    pickup_geom,
                    delivery_geom
                )
                VALUES (
                    $1,
                    $2,
                    $3,
                    $4,
                    $5,
                    $6,
                    $7,
                    ST_SetSRID(ST_MakePoint($4, $5), 4326),
                    ST_SetSRID(ST_MakePoint($6, $7), 4326),
                    ST_SetSRID(ST_MakePoint($4, $5), 4326),
                    ST_SetSRID(ST_MakePoint($6, $7), 4326)
                )
                RETURNING id, cargo_description, status, weight_kg, origin_hub_name, pickup_lng, pickup_lat, delivery_lng, delivery_lat;
            `;
            
            const result = await pool.query(query, [
                cargo_description, weight_kg, origin_hub_name, 
                pickup_lng, pickup_lat, delivery_lng, delivery_lat
            ]);

            const newOrder = result.rows[0];
            io.emit('order:created', newOrder);

            return ok(res, { message: "Order logged successfully.", order: newOrder }, { status: 201 });
        } catch (error) {
            console.error("Database Error:", error.message);
            return fail(res, {
                status: 500,
                code: 'ORDERS_CREATE_FAILED',
                message: 'Failed to process freight manifest entry.',
            });
        }
    },

    // 3. POST /api/v1/orders/assign - Transaction-Safe Driver Assignment Block
    assignOrderBundle: async (req, res) => {
        // Acquire a dedicated database client thread for isolation operations
        const client = await pool.connect();
        try {
            const { orderIds, driverName } = req.body;
            const dispatcherEmail = req.user?.email || "SYSTEM_DISPATCH";

            if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
                return fail(res, {
                    status: 400,
                    code: 'ORDERS_ASSIGN_INVALID_PAYLOAD',
                    message: 'Invalid manifest payload.',
                });
            }

            // Fire up ACID-compliant transaction locks
            await client.query('BEGIN');

            // Select matching pending orders using a FOR UPDATE lock to freeze rows until transaction completes
            const verificationQuery = `SELECT id FROM orders WHERE id = ANY($1) AND status = 'PENDING' FOR UPDATE;`;
            const verificationResult = await client.query(verificationQuery, [orderIds]);

            if (verificationResult.rows.length !== orderIds.length) {
                await client.query('ROLLBACK');
                return fail(res, {
                    status: 409,
                    code: 'ORDERS_ASSIGN_CONFLICT',
                    message: 'Assignment conflict. One or more orders were altered by another session.',
                });
            }

            // Commit the state update
            const updateQuery = `
                UPDATE orders 
                SET status = 'ASSIGNED', assigned_to = $1, updated_at = NOW()
                WHERE id = ANY($2)
                RETURNING id, cargo_description, status;
            `;
            const updateResult = await client.query(updateQuery, [driverName, orderIds]);

            // Append entries to our historical audit tracking engine
            const logQuery = `
                INSERT INTO order_status_logs (order_id, previous_status, new_status, changed_by)
                SELECT unnest($1::int[]), 'PENDING', 'ASSIGNED', $2;
            `;
            await client.query(logQuery, [orderIds, dispatcherEmail]);

            // Save changes permanently to the core engine
            await client.query('COMMIT');

            io.emit('order:dispatched', {
                driverName,
                assignedManifest: updateResult.rows,
                timestamp: new Date().toISOString()
            });

            return ok(res, {
                message: `Dispatched bundle to ${driverName}.`,
                dispatchedCount: updateResult.rows.length,
            });
        } catch (error) {
            await client.query('ROLLBACK');
            console.error("Transaction Aborted! Safe Rollback Executed:", error.message);
            return fail(res, {
                status: 500,
                code: 'ORDERS_ASSIGN_FAILED',
                message: 'Failed to execute transaction assignment safely.',
            });
        } finally {
            client.release(); // Return client back to connection pool
        }
    },

    // 4. PATCH /api/v1/orders/:id/status - Update milestones with audit logging
    updateOrderStatus: async (req, res) => {
        const client = await pool.connect();
        try {
            const { id } = req.params;
            const { status } = req.body;
            const userEmail = req.user?.email || "SYSTEM_DRIVER";

            await client.query('BEGIN');

            // Fetch the current state to populate previous status columns
            const currentQuery = `SELECT status FROM orders WHERE id = $1 FOR UPDATE;`;
            const currentResult = await client.query(currentQuery, [id]);

            if (currentResult.rows.length === 0) {
                await client.query('ROLLBACK');
                return fail(res, {
                    status: 404,
                    code: 'ORDERS_NOT_FOUND',
                    message: 'Order record not found.',
                });
            }

            const previousStatus = currentResult.rows[0].status;

            // Commit state shift
            const updateQuery = `UPDATE orders SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING id, cargo_description, status;`;
            const result = await client.query(updateQuery, [status, id]);
            const updatedOrder = result.rows[0];

            // Log changes
            const logQuery = `INSERT INTO order_status_logs (order_id, previous_status, new_status, changed_by) VALUES ($1, $2, $3, $4);`;
            await client.query(logQuery, [id, previousStatus, status, userEmail]);

            await client.query('COMMIT');

            io.emit('order:status-updated', {
                orderId: updatedOrder.id,
                status: updatedOrder.status,
                cargo_description: updatedOrder.cargo_description,
                timestamp: new Date().toISOString()
            });

            return ok(res, { message: `Milestone updated to [${status}].`, order: updatedOrder });
        } catch (error) {
            await client.query('ROLLBACK');
            console.error("Database Error:", error.message);
            return fail(res, {
                status: 500,
                code: 'ORDERS_STATUS_UPDATE_FAILED',
                message: 'Failed to update progress milestone safely.',
            });
        } finally {
            client.release();
        }
    },

    // 5. GET /api/v1/orders/pooling - Index-Driven PostGIS Spatial Cluster Matching
    getBatchedOrders: async (req, res) => {
        try {
            const selectQuery = `
                SELECT
                    id,
                    cargo_description,
                    weight_kg,
                    origin_hub_name,
                    pickup_lng,
                    pickup_lat,
                    delivery_lng,
                    delivery_lat
                FROM orders
                WHERE status = 'PENDING';
            `;
            const result = await pool.query(selectQuery);
            const pending = result.rows;

            if (pending.length === 0) return ok(res, []);

            const spatialMatrixQuery = `
                SELECT o1.id AS order_a_id, o2.id AS order_b_id
                FROM orders o1
                JOIN orders o2 ON o1.id < o2.id
                WHERE o1.status = 'PENDING' AND o2.status = 'PENDING'
                AND ST_DWithin(COALESCE(o1.pickup_geom, o1.pickup_coordinates)::GEOGRAPHY, COALESCE(o2.pickup_geom, o2.pickup_coordinates)::GEOGRAPHY, 1500)
                AND ST_DWithin(COALESCE(o1.delivery_geom, o1.delivery_coordinates)::GEOGRAPHY, COALESCE(o2.delivery_geom, o2.delivery_coordinates)::GEOGRAPHY, 3500);
            `;
            
            const matrixResult = await pool.query(spatialMatrixQuery);
            const spatialPairs = matrixResult.rows;

            const batches = [];
            const visited = new Set();

            for (let i = 0; i < pending.length; i++) {
                const currentOrder = pending[i];
                if (visited.has(currentOrder.id)) continue;

                let currentBatch = [currentOrder];
                visited.add(currentOrder.id);

                spatialPairs.forEach(pair => {
                    if (pair.order_a_id === currentOrder.id && !visited.has(pair.order_b_id)) {
                        const companion = pending.find(o => o.id === pair.order_b_id);
                        if (companion) {
                            currentBatch.push(companion);
                            visited.add(pair.order_b_id);
                        }
                    }
                });

                batches.push({
                    batch_id: `BATCH-${Math.floor(1000 + Math.random() * 9000)}`,
                    origin_cluster: currentBatch[0].origin_hub_name,
                    total_weight_kg: currentBatch.reduce((sum, o) => sum + parseFloat(o.weight_kg), 0).toFixed(2),
                    shipments: currentBatch
                });
            }

            return ok(res, batches);
        } catch (error) {
            console.error("Optimized PostGIS Index Error:", error.message);
            return fail(res, {
                status: 500,
                code: 'ORDERS_POOLING_FAILED',
                message: 'Spatial matching pipeline calculation error.',
            });
        }
    },

    // 6. GET /api/v1/orders/:id/history - Pull immutable tracking timeline
    getOrderHistory: async (req, res) => {
        try {
            const { id } = req.params;
            const query = `
                SELECT previous_status, new_status, changed_by, changed_at 
                FROM order_status_logs 
                WHERE order_id = $1 
                ORDER BY changed_at ASC;
            `;
            const result = await pool.query(query, [id]);
            return ok(res, result.rows);
        } catch (error) {
            console.error("Database Error:", error.message);
            return fail(res, {
                status: 500,
                code: 'ORDERS_HISTORY_FAILED',
                message: 'Failed to read history logs.',
            });
        }
    },

    getNearestDrivers: async (req, res) => {
        try {
            const { id } = req.params;

            // 1. Fetch the order's pickup geometry
            const orderCheck = await pool.query(
                `SELECT
                    id,
                    cargo_description,
                    COALESCE(pickup_geom, pickup_coordinates) AS pickup_geom,
                    status
                 FROM orders
                 WHERE id = $1;`,
                [id]
            );

            if (orderCheck.rows.length === 0) {
                return fail(res, {
                    status: 404,
                    code: 'ORDERS_NOT_FOUND',
                    message: 'Order not found.',
                });
            }

            const order = orderCheck.rows[0];

            // 2. Query active driver locations sorted by proximity to the pickup point
            const spatialMatchQuery = `
                SELECT 
                    dl.driver_name,
                    dl.lat AS current_lat,
                    dl.lng AS current_lng,
                    ST_DistanceSphere(dl.geom, $1) AS distance_meters,
                    EXTRACT(EPOCH FROM (NOW() - dl.updated_at)) AS cache_age_seconds
                FROM driver_locations dl
                -- Optional: filter out drivers currently on an active run if your schema tracks it
                ORDER BY dl.geom <-> $1 -- Knn index-assisted spatial sorting operator
                LIMIT 3;
            `;

            const driversResult = await pool.query(spatialMatchQuery, [order.pickup_geom]);

            const recommendations = driversResult.rows.map(driver => {
                const distanceKm = (parseFloat(driver.distance_meters) / 1000).toFixed(2);
                return {
                    driverName: driver.driver_name,
                    distanceFromPickupKm: parseFloat(distanceKm),
                    telemetryAgeSeconds: Math.round(driver.cache_age_seconds),
                    coordinates: { lat: driver.current_lat, lng: driver.current_lng }
                };
            });

            return ok(res, {
                orderId: order.id,
                cargo: order.cargo_description,
                status: order.status,
                recommendedDrivers: recommendations
            });
        } catch (error) {
            console.error("🚨 Spatial Dispatch Matcher Failure:", error.message);
            return fail(res, {
                status: 500,
                code: 'ORDERS_NEAREST_DRIVERS_FAILED',
                message: 'Failed to run spatial dispatch matching algorithms.',
            });
        }
    }
};