# Kigali Freight Control Tower - Backend

The core intelligence and connectivity layer for the Kigali Freight Control Tower. This server handles real-time asset telemetry, routing calculations, and geospatial boundary enforcement.

## 🧠 System Architecture
The backend is an event-driven engine that processes high-frequency location pings and integrates with OSRM (Open Source Routing Machine) to provide optimized logistics routing.

## 🚀 Core Features
- **Real-Time Telemetry:** Socket.io server to handle persistent connections from asset simulators.
- **Geospatial Optimization:** Integration with OSRM for distance/duration matrices and route geometry.
- **Incident Engine:** Automated detection of speed limit and geofence violations.
- **Security:** JWT-based authentication for dispatchers and managers.

## ⚙️ Tech Stack
- **Environment:** Node.js, Express
- **Real-Time:** Socket.io
- **Routing API:** OSRM (Open Source Routing Machine)
- **Authentication:** JSON Web Tokens (JWT), Bcrypt

## 🚀 Setup & Installation

### 1. Prerequisites
- Node.js (v18+)
- OSRM Backend (Local or API access)

### 2. Installation
1. Clone the repository.
2. Install dependencies:
   ```bash
   npm install

Set up environment variables (create a .env file):

Code snippet:

      PORT=5000
      JWT_SECRET=your_super_secret_key
      
 Run the server:
 
    node Server.js

   📡 API Endpoints
   
POST /api/auth/login - Authenticate dispatcher.

POST /api/dispatch/matrix - Request nearest assets and optimal routes.

GET /api/incidents - Retrieve historical log of violations.

Powered by Node.js & Geospatial Intelligence.

