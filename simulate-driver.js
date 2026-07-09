import { io } from 'socket.io-client';

// Connect to your local API gateway
const socket = io('http://localhost:5000');

const driverName = "Jean Bosco (Maniac Trucking)";

// A simulated driving route through Kigali (Nyabugogo -> Muhima -> Downtown -> Remera)
const kigaliRouteCoordinates = [
    { lat: -1.940, lng: 30.044 },  // Starting at Nyabugogo Hub
    { lat: -1.942, lng: 30.055 },  // Approaching Muhima
    { lat: -1.945, lng: 30.070 },  // Passing near downtown sector
    { lat: -1.950, lng: 30.095 },  // Moving past Gikondo junction area
    { lat: -1.946, lng: 30.120 }   // Arrived at destination cluster (Remera)
];

socket.on('connect', () => {
    console.log("⚡ Connected to the Kigali Freight Router Gateway!");
    
    // Register driver to the network
    socket.emit('driver:register-active', {
        driverName: driverName,
        vehicleType: "4-Ton Fuso Flatbed"
    });

    let routeStep = 0;

    // Start streaming GPS coordinates every 2.5 seconds
    const gpsInterval = setInterval(() => {
        if (routeStep < kigaliRouteCoordinates.length) {
            const currentPosition = kigaliRouteCoordinates[routeStep];
            
            socket.emit('driver:share-gps', {
                driverName: driverName,
                lat: currentPosition.lat,
                lng: currentPosition.lng
            });
            
            routeStep++;
        } else {
            console.log("🏁 Delivery route finished. Turning off GPS stream.");
            clearInterval(gpsInterval);
            socket.disconnect();
        }
    }, 2500);
});