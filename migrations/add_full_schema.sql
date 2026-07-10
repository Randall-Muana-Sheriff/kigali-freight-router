CREATE EXTENSION IF NOT EXISTS postgis;

ALTER TABLE orders
    ADD COLUMN IF NOT EXISTS pickup_geom geometry(Point, 4326),
    ADD COLUMN IF NOT EXISTS delivery_geom geometry(Point, 4326),
    ADD COLUMN IF NOT EXISTS assigned_to VARCHAR(255),
        ADD COLUMN IF NOT EXISTS origin_hub_name VARCHAR(255),
        ADD COLUMN IF NOT EXISTS pickup_lng DOUBLE PRECISION,
        ADD COLUMN IF NOT EXISTS pickup_lat DOUBLE PRECISION,
        ADD COLUMN IF NOT EXISTS delivery_lng DOUBLE PRECISION,
        ADD COLUMN IF NOT EXISTS delivery_lat DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

UPDATE orders o
SET origin_hub_name = COALESCE(o.origin_hub_name, h.name)
FROM hubs h
WHERE o.origin_hub_id = h.id
    AND o.origin_hub_name IS NULL;

UPDATE orders
SET pickup_lng = ST_X(pickup_coordinates),
        pickup_lat = ST_Y(pickup_coordinates)
WHERE pickup_coordinates IS NOT NULL
    AND pickup_lng IS NULL
    AND pickup_lat IS NULL;

UPDATE orders
SET delivery_lng = ST_X(delivery_coordinates),
        delivery_lat = ST_Y(delivery_coordinates)
WHERE delivery_coordinates IS NOT NULL
    AND delivery_lng IS NULL
    AND delivery_lat IS NULL;

UPDATE orders
SET pickup_geom = COALESCE(pickup_geom, pickup_coordinates),
        delivery_geom = COALESCE(delivery_geom, delivery_coordinates);

CREATE TABLE IF NOT EXISTS completed_routes (
    id SERIAL PRIMARY KEY,
    vehicle_id INTEGER NOT NULL,
    driver_name TEXT NOT NULL,
    geojson_path JSONB NOT NULL DEFAULT '[]'::jsonb,
    aggregate_distance_km NUMERIC(10, 2) NOT NULL DEFAULT 0,
    total_demand INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'COMMITTED',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS order_status_logs (
    id SERIAL PRIMARY KEY,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    previous_status TEXT NOT NULL,
    new_status TEXT NOT NULL,
    changed_by TEXT NOT NULL,
    changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS driver_locations (
    id SERIAL PRIMARY KEY,
    driver_name TEXT NOT NULL UNIQUE,
    lat DOUBLE PRECISION NOT NULL,
    lng DOUBLE PRECISION NOT NULL,
    geom geometry(Point, 4326) NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_driver_locations_geom ON driver_locations USING GIST (geom);

ALTER TABLE driver_locations
    ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS lng DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS geom geometry(Point, 4326),
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

UPDATE driver_locations
SET
    lat = COALESCE(lat, ST_Y(geom)),
    lng = COALESCE(lng, ST_X(geom)),
    updated_at = COALESCE(updated_at, NOW())
WHERE geom IS NOT NULL;

ALTER TABLE driver_locations
    ALTER COLUMN updated_at SET DEFAULT NOW();

CREATE TABLE IF NOT EXISTS driver_location_history (
    id SERIAL PRIMARY KEY,
    driver_name TEXT NOT NULL,
    lat DOUBLE PRECISION NOT NULL,
    lng DOUBLE PRECISION NOT NULL,
    geom geometry(Point, 4326) NOT NULL,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_driver_location_history_driver_time ON driver_location_history (driver_name, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_driver_location_history_geom ON driver_location_history USING GIST (geom);

ALTER TABLE driver_location_history
    ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS lng DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS geom geometry(Point, 4326),
    ADD COLUMN IF NOT EXISTS recorded_at TIMESTAMPTZ;

UPDATE driver_location_history
SET
    lat = COALESCE(lat, ST_Y(geom)),
    lng = COALESCE(lng, ST_X(geom)),
    recorded_at = COALESCE(recorded_at, NOW())
WHERE geom IS NOT NULL;

ALTER TABLE driver_location_history
    ALTER COLUMN recorded_at SET DEFAULT NOW();

CREATE TABLE IF NOT EXISTS geofence_alerts (
    id SERIAL PRIMARY KEY,
    order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL,
    driver_name TEXT NOT NULL,
    event_type TEXT NOT NULL,
    description TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_geofence_alerts_order_id ON geofence_alerts (order_id);
CREATE INDEX IF NOT EXISTS idx_geofence_alerts_event_type ON geofence_alerts (event_type);

ALTER TABLE geofence_alerts
    ADD COLUMN IF NOT EXISTS description TEXT,
    ADD COLUMN IF NOT EXISTS distance_meters NUMERIC;

ALTER TABLE geofence_alerts
    ALTER COLUMN order_id DROP NOT NULL;

UPDATE geofence_alerts
SET description = COALESCE(description, event_type)
WHERE description IS NULL;

ALTER TABLE geofence_alerts
    ALTER COLUMN description SET NOT NULL,
    ALTER COLUMN distance_meters SET DEFAULT 0;

CREATE TABLE IF NOT EXISTS fleet_vehicles (
    id SERIAL PRIMARY KEY,
    plate_number TEXT NOT NULL,
    vehicle_type TEXT NOT NULL,
    current_driver_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE fleet_vehicles
    ADD COLUMN IF NOT EXISTS plate_number TEXT,
    ADD COLUMN IF NOT EXISTS vehicle_type TEXT,
    ADD COLUMN IF NOT EXISTS status TEXT,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ;

UPDATE fleet_vehicles
SET status = COALESCE(status, 'ACTIVE');

ALTER TABLE fleet_vehicles
    ALTER COLUMN status SET DEFAULT 'ACTIVE';

CREATE TABLE IF NOT EXISTS delivery_stops (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    lat DOUBLE PRECISION NOT NULL,
    lng DOUBLE PRECISION NOT NULL,
    demand INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'PENDING',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_delivery_stops_status ON delivery_stops (status);

CREATE TABLE IF NOT EXISTS system_audit_logs (
    id SERIAL PRIMARY KEY,
    action_type TEXT NOT NULL,
    description TEXT NOT NULL,
    username TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_system_audit_logs_created_at ON system_audit_logs (created_at DESC);
