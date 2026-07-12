import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import request from 'supertest';
import { io as socketClient } from 'socket.io-client';

import pool from '../config/db.js';
import { app, server, startServer, shutdownServices } from '../server.js';

const requiredEnv = ['DB_USER', 'DB_PASSWORD', 'DB_HOST', 'DB_PORT', 'DB_DATABASE', 'JWT_SECRET'];
const hasIntegrationEnv = requiredEnv.every((key) => Boolean(process.env[key]));

const uniqueId = Date.now();
const adminUser = { username: `it_admin_${uniqueId}`, password: 'TempPass123!', role: 'admin' };
const dispatcherUser = { username: `it_dispatcher_${uniqueId}`, password: 'TempPass123!', role: 'dispatcher' };
const driverUser = { username: `it_driver_${uniqueId}`, password: 'TempPass123!', role: 'driver' };

let adminToken = '';
let dispatcherToken = '';
let driverId = null;
let vehicleId = null;
let createdOrderId = null;
let socketPort = null;

async function signupAndLogin(user) {
    await request(app).post('/api/auth/signup').send(user);
    const loginResponse = await request(app).post('/api/auth/login').send({
        username: user.username,
        password: user.password,
    });

    assert.equal(loginResponse.statusCode, 200);
    assert.equal(loginResponse.body.success, true);
    assert.ok(loginResponse.body.data?.token);

    return loginResponse.body.data.token;
}

if (!hasIntegrationEnv) {
    test('integration prerequisites', { skip: true }, () => {});
} else {
    test.before(async () => {
        await startServer(0);
        socketPort = server.address().port;

        adminToken = await signupAndLogin(adminUser);
        dispatcherToken = await signupAndLogin(dispatcherUser);
        await signupAndLogin(driverUser);

        const usersResponse = await request(app)
            .get('/api/users')
            .set('Authorization', `Bearer ${adminToken}`);

        assert.equal(usersResponse.statusCode, 200);
        const driverRecord = usersResponse.body.data.find((user) => user.username === driverUser.username);
        assert.ok(driverRecord);
        driverId = driverRecord.id;
    });

    test('auth flow returns valid token payload', async () => {
        assert.ok(adminToken);
        assert.ok(dispatcherToken);
    });

    test('health and readiness endpoints respond correctly', async () => {
        const healthResponse = await request(app).get('/health');
        assert.equal(healthResponse.statusCode, 200);
        assert.equal(healthResponse.body.success, true);
        assert.equal(healthResponse.body.data.status, 'ok');

        const readyResponse = await request(app).get('/ready');
        assert.equal(readyResponse.statusCode, 200);
        assert.equal(readyResponse.body.success, true);
        assert.equal(readyResponse.body.data.status, 'ready');

        const metricsResponse = await request(app).get('/metrics');
        assert.equal(metricsResponse.statusCode, 200);
        assert.match(metricsResponse.text, /kigali_http_requests_total/);
    });

    test('vehicles list and assignment flow', async () => {
        const listResponse = await request(app)
            .get('/api/vehicles')
            .set('Authorization', `Bearer ${adminToken}`);

        assert.equal(listResponse.statusCode, 200);
        assert.equal(listResponse.body.success, true);

        const existingVehicle = listResponse.body.data[0];
        if (existingVehicle) {
            vehicleId = existingVehicle.id;
        } else {
            const createResponse = await request(app)
                .post('/api/vehicles')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ name: `IT-${uniqueId}`, type: 'Truck' });

            assert.equal(createResponse.statusCode, 201);
            vehicleId = createResponse.body.data.vehicle.id;
        }

        const assignResponse = await request(app)
            .patch(`/api/vehicles/${vehicleId}/assign`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ driverId });

        assert.equal(assignResponse.statusCode, 200);
        assert.equal(assignResponse.body.success, true);
        assert.equal(assignResponse.body.data.vehicle.currentDriverId, driverId);
    });

    test('order create, active list, and pooling flow', async () => {
        const createResponse = await request(app)
            .post('/api/orders')
            .set('Authorization', `Bearer ${dispatcherToken}`)
            .send({
                cargo_description: 'Integration Test Cargo',
                weight_kg: 120.5,
                origin_hub_name: 'Nyabugogo',
                pickup_lng: 30.0619,
                pickup_lat: -1.9441,
                delivery_lng: 30.0891,
                delivery_lat: -1.9706,
            });

        assert.equal(createResponse.statusCode, 201);
        assert.equal(createResponse.body.success, true);
        createdOrderId = createResponse.body.data.order.id;

        const activeResponse = await request(app)
            .get('/api/orders/active')
            .set('Authorization', `Bearer ${dispatcherToken}`);

        assert.equal(activeResponse.statusCode, 200);
        assert.equal(activeResponse.body.success, true);
        assert.ok(activeResponse.body.data.some((order) => order.id === createdOrderId));

        const poolingResponse = await request(app)
            .get('/api/orders/pooling')
            .set('Authorization', `Bearer ${dispatcherToken}`);

        assert.equal(poolingResponse.statusCode, 200);
        assert.equal(poolingResponse.body.success, true);
        assert.ok(Array.isArray(poolingResponse.body.data));
    });

    test('socket telemetry persists into location tables', async () => {
        const driverName = `it_socket_driver_${uniqueId}`;
        const lat = -1.95;
        const lng = 30.08;

        const socket = socketClient(`http://127.0.0.1:${socketPort}`, {
            auth: { token: `Bearer ${dispatcherToken}` },
            transports: ['websocket'],
        });

        await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Socket connection timed out.')), 7000);
            socket.on('connect', () => {
                clearTimeout(timeout);
                resolve();
            });
            socket.on('connect_error', (err) => {
                clearTimeout(timeout);
                reject(err);
            });
        });

        const updateSeen = new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('No telemetry broadcast received.')), 7000);
            socket.on('driver:location-update', (payload) => {
                if (payload.driverName === driverName) {
                    clearTimeout(timeout);
                    resolve();
                }
            });
        });

        socket.emit('driver:telemetry-push', { driverName, lat, lng });
        await updateSeen;

        // Allow async DB writes from the socket handler to complete.
        await delay(300);

        const historyResult = await pool.query(
            'SELECT COUNT(*)::int AS count FROM driver_location_history WHERE driver_name = $1',
            [driverName]
        );
        const locationResult = await pool.query(
            'SELECT COUNT(*)::int AS count FROM driver_locations WHERE driver_name = $1',
            [driverName]
        );

        assert.ok(historyResult.rows[0].count >= 1);
        assert.ok(locationResult.rows[0].count >= 1);

        socket.disconnect();
    });

    test('telemetry queue exposes live metric counters after ingestion', async () => {
        const socket = socketClient(`http://127.0.0.1:${socketPort}`, {
            auth: { token: `Bearer ${dispatcherToken}` },
            transports: ['websocket'],
        });

        await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Socket connection timed out.')), 7000);
            socket.on('connect', () => {
                clearTimeout(timeout);
                resolve();
            });
            socket.on('connect_error', (err) => {
                clearTimeout(timeout);
                reject(err);
            });
        });

        socket.emit('driver:telemetry-push', {
            driverName: `it_queue_driver_${uniqueId}`,
            lat: -1.948,
            lng: 30.081,
        });

        await delay(600);

        const metricsResponse = await request(app).get('/metrics');
        assert.equal(metricsResponse.statusCode, 200);
        assert.match(metricsResponse.text, /kigali_socket_events_by_name_total/);

        socket.disconnect();
    });

    test.after(async () => {
        await shutdownServices();
    });
}
