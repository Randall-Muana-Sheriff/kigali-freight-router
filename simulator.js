import { io } from 'socket.io-client';

const BACKEND_URL = 'http://localhost:5000';
const SIMULATED_TRUCKS_COUNT = 45; 

console.log(`⚡ Launching High-Density Fleet Stress Load Simulator Engine...`);

const kigaliBaseLat = -1.9450;
const kigaliBaseLng = 30.0600;

async function spawnVirtualAsset(truckIndex) {
  const driverName = `Simulated Hauler #${String(truckIndex).padStart(3, '0')}`;
  
  try {
    const authRes = await fetch(`${BACKEND_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: `sim_driver_${truckIndex}`, password: 'loop_bypass' })
    });
    const authData = await authRes.json();
    
    if (!authData.token) {
      console.error(`❌ Simulator Auth Rejected for ${driverName}`);
      return;
    }

    const socket = io(BACKEND_URL, {
      auth: { token: `Bearer ${authData.token}` },
      transports: ['websocket']
    });

    let angle = Math.random() * Math.PI * 2;
    let radius = 0.005 + (Math.random() * 0.02); 
    let speedModifier = 0.0002 + (Math.random() * 0.0003);

    let currentLat = kigaliBaseLat + (Math.sin(angle) * radius);
    let currentLng = kigaliBaseLng + (Math.cos(angle) * radius);

    socket.on('connect', () => {
      setInterval(() => {
        angle += (Math.random() - 0.5) * 0.5;
        currentLat += Math.sin(angle) * speedModifier;
        currentLng += Math.cos(angle) * speedModifier;

        socket.emit('driver:telemetry-push', {
          driverName: driverName,
          lat: parseFloat(currentLat.toFixed(6)),
          lng: parseFloat(currentLng.toFixed(6))
        });
      }, 2500 + (Math.random() * 500)); 
    });

  } catch (err) {
    console.error(`Simulator generation failure on node initialization:`, err.message);
  }
}

for (let i = 1; i <= SIMULATED_TRUCKS_COUNT; i++) {
  setTimeout(() => spawnVirtualAsset(i), i * 150);
}

console.log(`🏁 Spawn operations complete. ${SIMULATED_TRUCKS_COUNT} virtual nodes streaming live spatial records to server.`);