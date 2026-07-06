-- Create custom enumeration for strictly enforced application roles
CREATE TYPE user_role AS ENUM ('DISPATCHER', 'DRIVER', 'MERCHANT');

-- Create Users table
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role user_role NOT NULL DEFAULT 'MERCHANT',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Modify fleet_vehicles to map directly to our users table for drivers
ALTER TABLE fleet_vehicles 
ADD CONSTRAINT fk_fleet_driver 
FOREIGN KEY (current_driver_id) REFERENCES users(id) ON DELETE SET NULL;