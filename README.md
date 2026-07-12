# Kigali Freight Router Backend

Backend API and realtime telemetry engine for the Kigali Freight system.

## Overview

This service provides:

- JWT authentication and role-based authorization.
- REST APIs for orders, routes, geofences, fleet analytics, stops, and admin controls.
- Socket.IO realtime telemetry ingestion and broadcast.
- Durable, background telemetry queue/worker for async persistence and geofence checks.
- Postgres/PostGIS-backed spatial operations.
- Migration-based schema management with migration tracking.
- Optional Redis-backed horizontal scaling: shared rate limiting, shared live-fleet/geofence
  state, a durable telemetry queue, and a Socket.IO cross-instance adapter.
- Prometheus-compatible `/metrics`, `helmet` security headers, and container images for both
  this API and the dashboard UI. 

## Tech Stack

- Node.js (ES modules) 
- Express + helmet
- PostgreSQL + PostGIS
- Socket.IO (+ optional Redis adapter)
- JWT + bcrypt
- Redis (optional; enables horizontal scaling) with an in-process fallback for local dev/tests
- prom-client metrics

## Project Structure

- `server.js`: app bootstrap, route registration, Socket.IO telemetry flow.
- `config/appConfig.js`: validated runtime configuration.
- `config/db.js`: PostgreSQL pool.
- `config/redisClient.js`: optional Redis client/adapter wiring.
- `services/sharedState.js`: Redis-or-in-memory shared state primitives.
- `controllers/`: request handlers.
- `routes/`: API route definitions.
- `middleware/authMiddleware.js`: JWT and role checks.
- `middleware/rateLimit.js`: Redis-or-in-memory rate limiting.
- `middleware/metrics.js`: prom-client metrics registry.
- `migrations/`: SQL migrations.
- `bin/migrate.js`: migration runner with tracking table.
- `services/telemetryQueue.js`: durable telemetry queue worker.
- `tests/integration.test.js`: critical integration tests.
- `utils/httpResponse.js`: API response envelope helpers.
- `Dockerfile`: production container image.
- `../docker-compose.yml`: local Postgres+PostGIS, Redis, router, and UI stack.

## Prerequisites

- Node.js 18+
- PostgreSQL 14+
- PostGIS extension available on target DB

## Environment Variables

Copy [`.env.example`](.env.example) to `.env` and fill in your values.

```env
PORT=5000
CORS_ORIGIN=http://localhost:5173,http://127.0.0.1:5173

DB_USER=postgres
DB_PASSWORD=your_password
DB_HOST=localhost
DB_PORT=5432
DB_DATABASE=your_database_name

JWT_SECRET=replace_with_a_strong_secret

TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
ALERT_WEBHOOK_URL=

# Keep unset in shared/prod environments.
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

Integration tests cover auth, vehicle assignment, order flow, health/readiness, metrics, and telemetry persistence:

```bash
npm run test:integration
```

Load test the telemetry worker with a valid bearer token:

```bash
LOAD_TEST_TOKEN=your_bearer_token npm run load:test
```

Back up the database:

```bash
npm run backup:db -- backups
```

Verify a backup archive:

```bash
npm run backup:verify -- backups/your-backup.dump
```

Prune old backups (default retention is 14 days):

```bash
npm run backup:prune -- backups 14
```

Restore from a backup:

```bash
npm run restore:db -- backups/your-backup.dump
```

## Continuous Integration

The backend repo includes a GitHub Actions workflow at `.github/workflows/ci.yml` that runs on pull requests and pushes to `main` and `develop`.

It performs:

- `npm ci`
- `npm run test:integration` against an ephemeral Postgres+PostGIS service container (in-memory state).
- The same integration suite again against an ephemeral Redis service container (`REDIS_URL` set), validating the horizontally-scalable code paths.
- `npm audit --audit-level=high`
- `docker build` of the production image.

Operational knobs supported by the backend:

- `ALERT_WEBHOOK_URL` for generic incident webhooks.
- `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` for Telegram incident alerts.
- `LOAD_TEST_TOKEN` for the built-in telemetry load test.
- Backup workflow: `backup:db`, `backup:verify`, `backup:prune`, and `restore:db`.
- `REDIS_URL` to enable shared rate limiting, shared live-fleet/geofence state, a durable
  telemetry queue, and the Socket.IO Redis adapter (safe to run multiple instances behind a
  load balancer once set).

## Docker

Build and run just this service:

```bash
docker build -t kigali-freight-router .
docker run --env-file .env -p 5000:5000 kigali-freight-router
```

Or run the full local stack (Postgres+PostGIS, Redis, router, and UI) from the repo root:

```bash
cp .env.example .env   # fill in DB_PASSWORD / JWT_SECRET
docker compose up --build
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

Operational:

- `GET /health`
- `GET /ready`
- `GET /metrics`

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

Notifications:

- `POST /api/notifications/register-token`

## Push Notifications

Set `FIREBASE_SERVICE_ACCOUNT_PATH` to an absolute path to a Firebase Admin
SDK service account JSON file (Firebase Console > Project Settings > Service
Accounts > Generate new private key) to enable push notifications —
currently sent when a dispatcher/admin assigns an order to a driver
(`services/pushNotificationService.js`). This is entirely optional: with the
var unset, `sendPushToUser` is a no-op (logged once, never throws), so order
assignment and everything else works identically either way.

- Never commit the service account file. It's ignored by `.gitignore` under
  `config/secrets/` and excluded from the Docker build context.
- Device tokens are stored in the `push_tokens` table and registered by
  clients via `POST /api/notifications/register-token`; tokens FCM reports
  as permanently invalid are pruned automatically.
- The driver mobile app needs its own Firebase Android config
  (`google-services.json`) from the *same* Firebase project to receive
  these — see that project's README.

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
- CORS failures: set `CORS_ORIGIN` to include your frontend origin.
- Metrics look incomplete behind a load balancer: `/metrics` is per-instance (standard Prometheus model) — configure your scraper to hit every instance, or scrape through a service mesh/sidecar.
- `pg_dump` or `pg_restore` not found: install PostgreSQL client tools on the machine running the backup scripts.

