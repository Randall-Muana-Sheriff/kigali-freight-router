import 'dotenv/config';
import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import jwt from 'jsonwebtoken';

import pool from './config/db.js';
import authRoutes from './routes/authRoutes.js';
import geofenceRoutes from './routes/geofenceRoutes.js';
import dispatchRoutes from './routes/dispatchRoutes.js';
import routeRoutes from './routes/routeRoutes.js';
import stopRouter from './routes/stopRoutes.js';

const app = express();
app.use(cors());
app.use(express.json());

const JWT_SECRET = process.env.JWT_SECRET;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '';

if (!JWT_SECRET) {
  console.error('❌ JWT_SECRET is not set in .env — auth will fail. See .env.example.');
  process.exit(1);
}

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*', methods: ['GET', 'POST'] } });

async function dispatchExternalAlert(message) {
  console.log(`[INCIDENT TELEMETRY]: ${message}`);
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;
  try {
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
app.use('/api/auth', authRoutes);
app.use('/api/geofences', geofenceRoutes);
app.use('/api/dispatch', dispatchRoutes);
app.use('/api/routes', routeRoutes);
app.use('/api/stops', stopRouter);

let liveFleetState = {};
let driverActiveBreaches = {};

io.use((socket, next) => {
  const tokenHeader = socket.handshake.auth?.token;
  const handshakeUsername = socket.handshake.auth?.username;

  // Gracefully allow simulator nodes to connect without token check
  if (handshakeUsername && handshakeUsername.startsWith('sim_driver')) {
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

io.on('connection', (socket) => {
  socket.emit('fleet:snapshot', Object.values(liveFleetState));
  socket.on('driver:telemetry-push', async (data) => {
    const { driverName, lat, lng } = data;
    const timestamp = new Date().toISOString();
    const currentVelocityKmh = Math.floor(Math.random() * (85 - 40 + 1)) + 40;
    liveFleetState[driverName] = { driverName, lat, lng, velocityKmh: currentVelocityKmh, lastSeen: timestamp };
    io.emit('driver:location-update', liveFleetState[driverName]);
    try {
      const boundaryCheck = await pool.query(
        `SELECT id, name, speed_limit_kmh AS "speedLimitKmh" FROM geofences WHERE ST_Contains(geom, ST_SetSRID(ST_MakePoint($1, $2), 4326)) LIMIT 1;`,
        [lng, lat]
      );
      const activeZone = boundaryCheck.rows[0];
      const ongoingViolation = driverActiveBreaches[driverName];
      if (activeZone) {
        const speedThreshold = activeZone.speedLimitKmh;
        const isSpeeding = currentVelocityKmh > speedThreshold;
        const violationType = isSpeeding ? 'SPEED_VIOLATION' : 'BOUNDARY_BREACH';
        const description = isSpeeding
          ? `Speed limit breach inside [${activeZone.name}]. Value: ${currentVelocityKmh} km/h (Limit: ${speedThreshold} km/h)`
          : `Unauthorized Zone Entry: [${activeZone.name}]`;
        if (!ongoingViolation || ongoingViolation.zoneName !== activeZone.name || ongoingViolation.type !== violationType) {
          driverActiveBreaches[driverName] = { zoneName: activeZone.name, type: violationType, description };
          const incidentPayload = {
            id: `incident-${Date.now()}`,
            driverName,
            zoneName: activeZone.name,
            type: violationType,
            description,
            enteredAt: timestamp,
          };
          io.emit('geofence:violation', incidentPayload);
          dispatchExternalAlert(
            `🚨 *CRITICAL SAFETY INCIDENT* 🚨\n\n*Asset:* ${driverName}\n*Incident:* ${violationType}\n*Detail:* ${description}\n*Timestamp:* ${new Date(timestamp).toLocaleTimeString()}`
          );
        }
      } else if (!activeZone && ongoingViolation) {
        delete driverActiveBreaches[driverName];
        io.emit('geofence:exit', { driverName, zoneName: ongoingViolation.zoneName, exitedAt: timestamp });
        dispatchExternalAlert(`✅ *RESOLVED:* ${driverName} has safely departed the restricted perimeter.`);
      }
    } catch (dbErr) {
      console.error('❌ DATABASE ERROR:', dbErr);
    }
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 Secured Core Telemetry Routing Engine online on port ${PORT}`);
});

export { io };
