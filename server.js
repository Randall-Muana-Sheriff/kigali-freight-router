import 'dotenv/config';
import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import jwt from 'jsonwebtoken';
import { fileURLToPath } from 'url';
import { appConfig } from './config/appConfig.js';
import { isRedisEnabled, createRedisDuplicate, closeRedisClients } from './config/redisClient.js';
import systemRoutes from './routes/systemRoutes.js';
import { requestContext } from './middleware/requestContext.js';
import { metricsMiddleware, observeSocketEvent } from './middleware/metrics.js';
import { createTelemetryQueue, FLEET_STATE_KEY } from './services/telemetryQueue.js';
import { hashGetAll } from './services/sharedState.js';

import pool from './config/db.js';
import authRoutes from './routes/authRoutes.js';
import geofenceRoutes from './routes/geofenceRoutes.js';
import dispatchRoutes from './routes/dispatchRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import orderRoutes from './routes/orderRoutes.js';
import fleetRoutes from './routes/fleetRoutes.js';
import routeRoutes from './routes/routeRoutes.js';
import stopRouter from './routes/stopRoutes.js';
import incidentRoutes from './routes/incidentRoutes.js';
import notificationRoutes from './routes/notificationRoutes.js';

const app = express();
const allowedOrigins = appConfig.corsOrigins;

// This is a JSON API (not an HTML-serving app), so disable helmet's CSP —
// it has no effect on API responses and only complicates configuring the
// separate frontend's own CSP.
app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(
  cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error('CORS origin not allowed'));
    },
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
  })
);
app.use(requestContext);
app.use(metricsMiddleware);
app.use(express.json({ limit: '1mb' }));

app.use((req, res, next) => {
  res.on('finish', () => {
    console.log(
      JSON.stringify({
        level: 'info',
        requestId: req.requestId,
        method: req.method,
        path: req.originalUrl,
        statusCode: res.statusCode,
        durationMs: res.locals.requestDurationMs || undefined,
      })
    );
  });
  next();
});

const JWT_SECRET = appConfig.jwtSecret;
const TELEGRAM_BOT_TOKEN = appConfig.telegramBotToken;
const TELEGRAM_CHAT_ID = appConfig.telegramChatId;
const ALERT_WEBHOOK_URL = appConfig.alertWebhookUrl;
const __filename = fileURLToPath(import.meta.url);
const isMainModule = process.argv[1] === __filename;

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: allowedOrigins, methods: ['GET', 'POST'] } });

// Tracked so shutdownServices() can close them; the adapter doesn't own
// these connections, so nothing else closes them for us.
let redisAdapterClients = [];

// In a multi-instance deployment (REDIS_URL set), attach the Redis adapter so
// io.emit() fans out to sockets connected to *any* instance, not just this
// process. Without Redis, Socket.IO falls back to its default in-memory
// adapter, which only works correctly for a single instance.
if (isRedisEnabled()) {
  const [pubClient, subClient] = await Promise.all([createRedisDuplicate(), createRedisDuplicate()]);
  if (pubClient && subClient) {
    redisAdapterClients = [pubClient, subClient];
    const { createAdapter } = await import('@socket.io/redis-adapter');
    io.adapter(createAdapter(pubClient, subClient));
    console.log('🔗 Socket.IO Redis adapter attached — safe to run multiple instances.');
  }
}

async function dispatchExternalAlert(message) {
  console.log(`[INCIDENT TELEMETRY]: ${message}`);
  try {
    if (ALERT_WEBHOOK_URL) {
      await fetch(ALERT_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: 'kigali-freight-router', message }),
      });
      return;
    }

    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;

    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: message, parse_mode: 'Markdown' }),
    });
  } catch (err) {
    console.error('❌ Notification dispatch failed:', err.message);
  }
}

// Route modules — replaces what used to be duplicated inline in this file.
// See controllers/ and routes/ for the actual handler logic.
app.use('/', systemRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/geofences', geofenceRoutes);
app.use('/api/dispatch', dispatchRoutes);
app.use('/api', adminRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/fleet', fleetRoutes);
app.use('/api/routes', routeRoutes);
app.use('/api/stops', stopRouter);
app.use('/api/incidents', incidentRoutes);
app.use('/api/notifications', notificationRoutes);

const telemetryQueue = createTelemetryQueue({
  pool,
  io,
  dispatchExternalAlert,
});

io.use((socket, next) => {
  const tokenHeader = socket.handshake.auth?.token;
  const handshakeUsername = socket.handshake.auth?.username;
  const simulatorSecret = socket.handshake.auth?.simulatorSecret;

  // Simulator nodes may skip JWT auth only when a shared secret is configured
  // and the caller presents it. Disabled by default (no SIMULATOR_SHARED_SECRET set).
  if (
    appConfig.simulatorSharedSecret &&
    handshakeUsername &&
    handshakeUsername.startsWith('sim_driver') &&
    simulatorSecret === appConfig.simulatorSharedSecret
  ) {
    socket.user = { username: handshakeUsername, role: 'dispatcher' };
    return next();
  }

  if (!tokenHeader) return next(new Error('Telemetry token missing.'));
  const token = tokenHeader.includes(' ') ? tokenHeader.split(' ')[1] : tokenHeader;
  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) return next(new Error('Signature invalid.'));
    socket.user = decoded;
    next();
  });
});

io.on('connection', async (socket) => {
  observeSocketEvent('connection');
  const fleetSnapshot = await hashGetAll(FLEET_STATE_KEY);
  socket.emit('fleet:snapshot', Object.values(fleetSnapshot));
  socket.on('driver:telemetry-push', async (data) => {
    observeSocketEvent('driver:telemetry-push');
    if (!data || typeof data.driverName !== 'string' || !data.driverName.trim() || typeof data.lat !== 'number' || typeof data.lng !== 'number' || !Number.isFinite(data.lat) || !Number.isFinite(data.lng)) {
      return;
    }
    const { driverName, lat, lng } = data;
    const timestamp = new Date().toISOString();
    const currentVelocityKmh = Math.floor(Math.random() * (85 - 40 + 1)) + 40;
    try {
      await telemetryQueue.enqueue({ driverName, lat, lng, timestamp, currentVelocityKmh });
    } catch (dbErr) {
      console.error('❌ DATABASE ERROR:', dbErr);
    }
  });
  socket.on('disconnect', () => {
    observeSocketEvent('disconnect');
  });
});

function startServer(port = appConfig.port) {
  return new Promise((resolve, reject) => {
    if (server.listening) {
      resolve(server);
      return;
    }

    server.once('error', reject);
    server.listen(port, () => {
      server.off('error', reject);
      console.log(`🚀 Secured Core Telemetry Routing Engine online on port ${port}`);
      resolve(server);
    });
  });
}

if (isMainModule) {
  startServer().catch((error) => {
    console.error('❌ Failed to start server:', error.message);
    process.exit(1);
  });

  // Graceful shutdown: stop accepting new work, flush the telemetry queue,
  // close Redis connections and the DB pool, then exit. Container
  // orchestrators (Kubernetes, ECS, etc.) send SIGTERM on scale-down/deploy;
  // without this, in-flight telemetry could be dropped and connections
  // would be left dangling.
  const handleShutdownSignal = (signal) => {
    console.log(`🛡️ Received ${signal}, shutting down gracefully...`);
    shutdownServices()
      .then(() => process.exit(0))
      .catch((error) => {
        console.error('❌ Error during graceful shutdown:', error.message);
        process.exit(1);
      });
  };
  process.on('SIGTERM', () => handleShutdownSignal('SIGTERM'));
  process.on('SIGINT', () => handleShutdownSignal('SIGINT'));
}

async function shutdownServices() {
  await telemetryQueue.shutdown();
  if (server.listening) {
    await new Promise((resolve) => server.close(resolve));
  }
  await Promise.all(redisAdapterClients.map((client) => client.quit().catch(() => {})));
  await closeRedisClients();
  await pool.end();
}

export { app, server, io, startServer, shutdownServices };
