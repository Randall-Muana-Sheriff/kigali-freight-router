import { setTimeout as delay } from 'timers/promises';
import { io as socketClient } from 'socket.io-client';
import { appConfig } from '../config/appConfig.js';

const baseUrl = process.env.API_BASE || `http://localhost:${appConfig.port}`;
const token = process.env.LOAD_TEST_TOKEN;
const telemetryCount = Number.parseInt(process.env.LOAD_TEST_COUNT || '100', 10);
const driverNamePrefix = process.env.LOAD_TEST_DRIVER_PREFIX || 'loadtest';

if (!token) {
  console.error('LOAD_TEST_TOKEN is required. Use a valid bearer token for a dispatcher/admin user.');
  process.exit(1);
}

const socket = socketClient(baseUrl, {
  auth: { token: `Bearer ${token}` },
  transports: ['websocket'],
});

await new Promise((resolve, reject) => {
  const timeout = setTimeout(() => reject(new Error('Socket connection timed out.')), 10000);
  socket.on('connect', () => {
    clearTimeout(timeout);
    resolve();
  });
  socket.on('connect_error', (err) => {
    clearTimeout(timeout);
    reject(err);
  });
});

const startedAt = Date.now();
for (let index = 0; index < telemetryCount; index += 1) {
  socket.emit('driver:telemetry-push', {
    driverName: `${driverNamePrefix}-${index}`,
    lat: -1.95 + index * 0.0001,
    lng: 30.08 + index * 0.0001,
  });
}

await delay(1000);

const elapsedMs = Date.now() - startedAt;
console.log(JSON.stringify({
  baseUrl,
  telemetryCount,
  elapsedMs,
  throughputPerSecond: Number((telemetryCount / (elapsedMs / 1000)).toFixed(2)),
}));

socket.disconnect();
