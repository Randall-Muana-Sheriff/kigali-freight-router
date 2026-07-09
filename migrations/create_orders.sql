-- migrations/create_orders.sql

-- Enable PostGIS extension for spatial distance calculations
CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS orders (
    id SERIAL PRIMARY KEY,
    cargo_description TEXT NOT NULL,
    status VARCHAR(20) DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'ASSIGNED', 'PICKED_UP', 'DELIVERED')),
    weight_kg NUMERIC(10, 2) NOT NULL,
    origin_hub_name VARCHAR(255) NOT NULL,
    pickup_lng DOUBLE PRECISION NOT NULL,
    pickup_lat DOUBLE PRECISION NOT NULL,
    delivery_lng DOUBLE PRECISION NOT NULL,
    delivery_lat DOUBLE PRECISION NOT NULL,
    assigned_to VARCHAR(255) DEFAULT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);