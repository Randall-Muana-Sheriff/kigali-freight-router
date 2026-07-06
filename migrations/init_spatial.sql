-- 1. Enable the PostGIS extension for spatial index and geographic query optimization
CREATE EXTENSION IF NOT EXISTS postgis;

-- 2. Drop existing tables if they exist to prevent deployment overlap
DROP TABLE IF EXISTS orders CASCADE;
DROP TABLE IF EXISTS hubs CASCADE;

-- 3. Create Hubs Table (Static dispatch/collection nodes)
CREATE TABLE hubs (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    code VARCHAR(10) NOT NULL UNIQUE,
    coordinates GEOMETRY(Point, 4326), -- SRID 4326 denotes WGS 84 GPS coordinates
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 4. Create Spatial Index for highly performant geometric lookups on Hubs
CREATE INDEX idx_hubs_coordinates ON hubs USING GIST(coordinates);

-- 5. Create Orders Table (Dynamic freight tracking system)
CREATE TABLE orders (
    id SERIAL PRIMARY KEY,
    cargo_description TEXT NOT NULL,
    status VARCHAR(50) DEFAULT 'PENDING', -- PENDING, ASSIGNED, TRANSIT, DELIVERED
    weight_kg NUMERIC(10, 2) NOT NULL,
    origin_hub_id INT REFERENCES hubs(id) ON DELETE RESTRICT,
    pickup_coordinates GEOMETRY(Point, 4326) NOT NULL,
    delivery_coordinates GEOMETRY(Point, 4326) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 6. Create Spatial Indices for origin and destination routing lookups
CREATE INDEX idx_orders_pickup ON orders USING GIST(pickup_coordinates);
CREATE INDEX idx_orders_delivery ON orders USING GIST(delivery_coordinates);