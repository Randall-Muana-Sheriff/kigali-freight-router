# Kigali Freight Router Backend

Backend API and realtime telemetry engine for the Kigali Freight system.

## Overview
This service provides:

- JWT authentication and role-based authorization.
- REST APIs for orders, routes, geofences, fleet analytics, stops, and admin controls.
- Socket.IO realtime telemetry ingestion and broadcast.
- Postgres/PostGIS-backed spatial operations.
- Migration-based schema management with migration tracking.

## Tech Stack

- Node.js (ES modules)
- Express
- PostgreSQL + PostGIS
- Socket.IO
- JWT + bcrypt

## Project Structure

- `server.js`: app bootstrap, route registration, Socket.IO telemetry flow.
- `controllers/`: request handlers.
- `routes/`: API route definitions.
- `middleware/authMiddleware.js`: JWT and role checks.
- `migrations/`: SQL migrations.
- `bin/migrate.js`: migration runner with tracking table.
- `tests/integration.test.js`: critical integration tests.
- `utils/httpResponse.js`: API response envelope helpers.

## Prerequisites

- Node.js 18+
- PostgreSQL 14+
- PostGIS extension available on target DB

## Environment Variables

Create `.env` in the backend root.

```env
PORT=5000

DB_USER=postgres
DB_PASSWORD=your_password
DB_HOST=localhost
DB_PORT=5432
DB_DATABASE=your_database_name

REDIS_URL=

JWT_SECRET=replace_with_a_strong_secret

# Optional: incident notifications
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=

# Optional: legacy destructive baseline (DANGEROUS)
# Keep unset for normal environments.
ALLOW_DESTRUCTIVE_BASELINE=0
```

## Install

```bash
npm install
```

## Migration Workflow

Run migrations before starting the server:

```bash
npm run migrate
```

### Migration Safety Model

- Primary baseline is non-destructive: `migrations/init_spatial_baseline.sql`.
- Additive schema updates run via tracked migrations in `schema_migrations`.
- Legacy destructive baseline `migrations/init_spatial.sql` is opt-in only via `ALLOW_DESTRUCTIVE_BASELINE=1`.

## Run

Production mode:

```bash
npm start
```

Development mode:

```bash
npm run dev
```

## Test

Integration tests (auth, vehicle assignment, order flow, telemetry persistence):

```bash
npm run test:integration
```

## API Response Contract

Success:

```json
{
   "success": true,
   "data": {}
}
```

Error:

```json
{
   "success": false,
   "error": {
      "code": "SOME_ERROR_CODE",
      "message": "Human readable message"
   }
}
```

## REST Endpoints

Base URL: `http://localhost:5000`

Auth:

- `POST /api/auth/signup`
- `POST /api/auth/login`

Dispatch:

- `POST /api/dispatch/matrix`

Geofences:

- `GET /api/geofences`
- `POST /api/geofences`
- `DELETE /api/geofences/:id`

Orders:

- `POST /api/orders`
- `GET /api/orders/active`
- `GET /api/orders/pooling`
- `POST /api/orders/assign`
- `PATCH /api/orders/:id/status`
- `GET /api/orders/:id/history`
- `GET /api/orders/:id/nearest-drivers`

Routes:

- `GET /api/routes`
- `POST /api/routes/optimize`
- `POST /api/routes/save`
- `POST /api/routes/commit`

Stops:

- `GET /api/stops`
- `POST /api/stops`
- `DELETE /api/stops/:id`

Fleet:

- `GET /api/fleet/telemetry-sheet`
- `GET /api/fleet/history/:driverName`
- `GET /api/fleet/analytics/performance`

Admin:

- `GET /api/users`
- `PATCH /api/users/:id/role`
- `GET /api/vehicles`
- `POST /api/vehicles`
- `PATCH /api/vehicles/:id/assign`
- `GET /api/audit-logs`

## Socket.IO Events

Client emit:

- `driver:telemetry-push` payload: `{ driverName, lat, lng }`

Server emit:

- `fleet:snapshot`
- `driver:location-update`
- `geofence:violation`
- `geofence:exit`
- `routeUpdated`
- `stopUpdated`

## Common Issues

- Port in use (`EADDRINUSE`): free port 5000 or change `PORT`.
- PostGIS errors: verify `CREATE EXTENSION postgis` is permitted and migration ran.
- 401/403 responses: confirm JWT token and role authorization.
- Empty data after startup: run `npm run migrate` and verify DB credentials.

