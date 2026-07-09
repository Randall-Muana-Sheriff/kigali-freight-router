// test-geofence.js
import { io } from 'socket.io-client';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

// Load the exact same .env variables your server uses
dotenv.config();

// 1. Generate a valid testing credential signed with the system's secret
const JWT_SECRET = process.env.JWT_SECRET || "fallback_dev_secret";
const mockDriverToken = jwt.sign({ id: 999, role: 'DRIVER', username: 'jean_bosco' }, JWT_SECRET, { expiresIn: '15m' });

// 2. Pass the credential into the auth object during handshake initialization
const socket = io("http://localhost:5000", {
    auth: {
        token: `Bearer ${mockDriverToken}`
    }
});

socket.on('connect', () => {
    console.log("🟢 Connected to gateway simulation pipeline...");

    // Phase 1: Driver is far away (Remera area - 1.5km out)
    console.log("🚚 Step 1: Emitting GPS payload far away from Kimironko...");
    socket.emit('driver:share-gps', {
        driverName: 'Jean Bosco (Maniac Trucking)',
        lat: -1.948,
        lng: 30.105
    });

    // Wait 3 seconds, then warp the truck right into the market drop point (within 50 meters)
    setTimeout(() => {
        console.log("💥 Step 2: Emitting GPS payload inside the 200-meter Geofence circle...");
        socket.emit('driver:share-gps', {
            driverName: 'Jean Bosco (Maniac Trucking)',
            lat: -1.9362, // Tiny variance from target -1.936
            lng: 30.1131  // Tiny variance from target 30.113
        });
    }, 3000);
});

// Listen for the automated platform reaction
socket.on('dispatcher:geofence-alert', (alert) => {
    console.log("\n🚨 [GATEWAY ALARM RECEIVED] 🚨");
    console.log(JSON.stringify(alert, null, 2));
    
    // Disconnect so the script finishes cleanly
    socket.disconnect();
    process.exit(0);
});

// Handle connection rejection so we don't fail silently
socket.on('connect_error', (err) => {
    console.error(`❌ Connection failed: ${err.message}`);
    process.exit(1);
});