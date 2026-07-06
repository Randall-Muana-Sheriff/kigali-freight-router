import { io } from 'socket.io-client';

// Establish connection to local Core Telemetry Routing Service
const socket = io('http://localhost:5000', {
  auth: {
    token: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6InVzcl9kaXNwYXRjaF8wMDEiLCJyb2xlIjoiZGlzcGF0Y2hlciIsIm5hbWUiOiJNdWFuYSIsImlhdCI6MTc4MzI1Mjk1NywiZXhwIjoxNzgzMzM5MzU3fQ.rUOaWTQNNaGxV0OpPnSbrxsz4sWiN08VxBL_MkPkG0I'
  },
  transports: ['websocket']
});

// Seed initial coordinates for the fleet
const drivers = [
  { driverName: 'Jean Bosco (Maniac Trucking)', lat: -1.9420, lng: 30.0510, dLat: -0.0004, dLng: 0.0009 },
  { driverName: 'Aline Mutoni (Express Rwanda)', lat: -1.9562, lng: 30.0615, dLat: 0.0006, dLng: 0.0004 },
  { driverName: 'Faustin Karangwa (Nyabugogo Cargo)', lat: -1.9351, lng: 30.0412, dLat: -0.0003, dLng: 0.0007 }
];

socket.on('connect', () => {
  console.log('✅ Telemetry Simulator linked to secure pipeline gateway.');

  // Fire a transmission heartbeat tick every 2 seconds
  setInterval(() => {
    console.clear();
    console.log(`[2-SECOND TICK TRANSMITTED AT ${new Date().toISOString()}]`);
    console.log('---------------------------------------------------------------------------');
    console.table(drivers.map(d => ({ driverName: d.driverName, lat: d.lat, lng: d.lng })));

    drivers.forEach(driver => {
      
      // Stream current location data packet downstream
socket.emit('driver:share-gps', {
  driverName: driver.driverName,
  lat: parseFloat(driver.lat.toFixed(6)),
  lng: parseFloat(driver.lng.toFixed(6))
});

      // Advance the positions linearly to simulate real-world vehicle progress
      driver.lat += driver.dLat;
      driver.lng += driver.dLng;

      // Simple turn-around boundary bounce if they wander too far outside the viewport
      if (Math.abs(driver.lat - (-1.9450)) > 0.05) driver.dLat *= -1;
      if (Math.abs(driver.lng - 30.0600) > 0.05) driver.dLng *= -1;
    });

  }, 2000);
});

socket.on('connect_error', (err) => {
  console.error('❌ Telemetry handshake rejected:', err.message);
});