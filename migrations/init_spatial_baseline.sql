-- Production-safe baseline migration.
-- This file replaces destructive bootstrap behavior from init_spatial.sql.

CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS hubs (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    code VARCHAR(10) NOT NULL UNIQUE,
    coordinates GEOMETRY(Point, 4326),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_hubs_coordinates ON hubs USING GIST(coordinates);

CREATE TABLE IF NOT EXISTS orders (
    id SERIAL PRIMARY KEY,
    cargo_description TEXT NOT NULL,
    status VARCHAR(50) DEFAULT 'PENDING',
    weight_kg NUMERIC(10, 2) NOT NULL,
    origin_hub_id INT REFERENCES hubs(id) ON DELETE RESTRICT,
    pickup_coordinates GEOMETRY(Point, 4326) NOT NULL,
    delivery_coordinates GEOMETRY(Point, 4326) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_orders_pickup ON orders USING GIST(pickup_coordinates);
CREATE INDEX IF NOT EXISTS idx_orders_delivery ON orders USING GIST(delivery_coordinates);
