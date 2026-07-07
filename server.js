import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import pkg from 'pg';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

const { Pool } = pkg;
const app = express();
app.use(cors());
app.use(express.json());

const JWT_SECRET = 'kigali_control_tower_secret_key_2026';
const TELEGRAM_BOT_TOKEN = '';
const TELEGRAM_CHAT_ID = '';

const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'kigali_freight_coop',
  password: 'liberian2026',
  port: 5432,
});

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

app.post('/api/auth/signup', async (req, res) => {
  const { username, password, role } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }
  try {
    const assignedRole = role && ['admin', 'manager', 'dispatcher'].includes(role) ? role : 'dispatcher';
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);
    const result = await pool.query(
      'INSERT INTO users (username, password_hash, role) VALUES ($1, $2, $3) RETURNING id, username, role',
      [username, passwordHash, assignedRole]
    );
    const newUser = result.rows[0];
    const token = jwt.sign({ username: newUser.username, role: newUser.role }, JWT_SECRET, { expiresIn: '2h' });
    res.json({ success: true, token, role: newUser.role, message: 'User registered successfully' });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(400).json({ error: 'Username is already taken' });
    }
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username) {
    return res.status(400).json({ error: 'Username is required' });
  }
  try {
    if (username.startsWith('sim_driver')) {
      const token = jwt.sign({ username, role: 'dispatcher' }, JWT_SECRET, { expiresIn: '2h' });
      return res.json({ token, role: 'dispatcher' });
    }
    const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }
    const user = result.rows[0];
    const isMatch = await bcrypt.compare(password || '', user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }
    const token = jwt.sign({ username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '2h' });
    res.json({ token, role: user.role });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const verifyToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  if (!authHeader) return res.status(403).json({ error: 'No authorization header provided' });
  const token = authHeader.includes(' ') ? authHeader.split(' ')[1] : authHeader;
  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) return res.status(401).json({ error: 'Token expired or counterfeit' });
    req.user = decoded;
    next();
  });
};

app.get('/api/routes', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, driver_name AS "driverName", original_points_count AS "originalPointsCount", simplified_points_count AS "simplifiedPointsCount", space_saved_percentage AS "spaceSavedPercentage", ST_AsGeoJSON(geom_simplified) AS "geojsonSimplified" FROM routes ORDER BY id DESC'
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/dispatch/matrix', verifyToken, async (req, res) => {
  const { targetLat, targetLng, activeFleet } = req.body;
  if (!activeFleet || activeFleet.length === 0) return res.json({ rankings: [] });
  try {
    const coordsString = `${targetLng},${targetLat};` + activeFleet.map((d) => `${d.lng},${d.lat}`).join(';');
    const response = await fetch(`http://router.project-osrm.org/table/v1/driving/${coordsString}?sources=0&annotations=duration,distance`);
    const matrixData = await response.json();
    if (matrixData.code !== 'Ok') throw new Error('OSRM matrix calculations failed to compile.');
    const distances = matrixData.distances[0];
    const durations = matrixData.durations[0];
    const rankings = activeFleet
      .map((driver, index) => {
        const distanceKm = parseFloat(((distances[index + 1] || 0) / 1000).toFixed(2));
        const etaMinutes = Math.round((durations[index + 1] || 0) / 60);
        return { driverName: driver.driverName, distanceKm, etaMinutes };
      })
      .sort((a, b) => a.distanceKm - b.distanceKm);
    res.json({ rankings });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/geofences', verifyToken, async (req, res) => {
  const { name, coordinates, speedLimitKmh } = req.body;
  try {
    const polyCoords = [...coordinates];
    if (polyCoords[0][0] !== polyCoords[polyCoords.length - 1][0] || polyCoords[0][1] !== polyCoords[polyCoords.length - 1][1]) {
      polyCoords.push(polyCoords[0]);
    }
    const wktCoords = polyCoords.map((c) => `${c[0]} ${c[1]}`).join(', ');
    const wktPolygon = `POLYGON((${wktCoords}))`;
    const finalSpeedLimit = speedLimitKmh ? parseInt(speedLimitKmh) : 60;
    await pool.query(
      'INSERT INTO geofences (name, speed_limit_kmh, geom) VALUES ($1, $2, ST_GeomFromText($3, 4326)) ON CONFLICT (name) DO UPDATE SET geom = EXCLUDED.geom, speed_limit_kmh = EXCLUDED.speed_limit_kmh',
      [name, finalSpeedLimit, wktPolygon]
    );
    res.json({ success: true, message: `Polygon zone "${name}" with limit ${finalSpeedLimit} km/h saved.` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/geofences', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, speed_limit_kmh AS "speedLimitKmh", ST_AsGeoJSON(geom) as geojson FROM geofences ORDER BY id DESC'
    );
    const optimizedList = result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      speedLimitKmh: row.speed_limit_kmh || 60,
      geojson: JSON.parse(row.geojson),
    }));
    res.json(optimizedList);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/geofences/:id', verifyToken, async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM geofences WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/routes/save', verifyToken, async (req, res) => {
  const { driverName, coordinates } = req.body;
  if (!coordinates || coordinates.length < 2) return res.status(400).json({ error: 'Insufficient coordinates.' });
  try {
    const osrmCoordsString = coordinates.map((c) => `${c[0]},${c[1]}`).join(';');
    let snappedCoords = coordinates;
    try {
      const response = await fetch(`http://router.project-osrm.org/match/v1/driving/${osrmCoordsString}?overview=full&geometries=geojson`);
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
});

let liveFleetState = {};
let driverActiveBreaches = {};

io.use((socket, next) => {
  const tokenHeader = socket.handshake.auth?.token;
  const handshakeUsername = socket.handshake.auth?.username;

  // Gracefully allow simulator nodes to connect without token check[cite: 5]
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

server.listen(5000, () => {
  console.log('🚀 Secured Core Telemetry Routing Engine online on port 5000[cite: 5]');
});