-- PostgreSQL Partitioning Script for Orders Table
-- This script creates monthly partitions for the orders table

-- Enable pg_partman extension (if available)
-- CREATE EXTENSION IF NOT EXISTS pg_partman;

-- Create partitioned orders table
CREATE TABLE IF NOT EXISTS orders_partitioned (
    id UUID NOT NULL,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL,
    status VARCHAR(50) NOT NULL,
    retailer_id UUID NOT NULL,
    vendor_id UUID,
    total_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
    payment_status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
    delivery_status VARCHAR(50),
    notes TEXT,
    metadata JSONB,
    PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

-- Create indexes on partitioned table
CREATE INDEX IF NOT EXISTS idx_orders_part_retailer ON orders_partitioned(retailer_id, created_at);
CREATE INDEX IF NOT EXISTS idx_orders_part_vendor ON orders_partitioned(vendor_id, created_at);
CREATE INDEX IF NOT EXISTS idx_orders_part_status ON orders_partitioned(status, created_at);
CREATE INDEX IF NOT EXISTS idx_orders_part_created ON orders_partitioned(created_at);

-- Create partitions for 2024
CREATE TABLE IF NOT EXISTS orders_2024_01 PARTITION OF orders_partitioned
    FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');

CREATE TABLE IF NOT EXISTS orders_2024_02 PARTITION OF orders_partitioned
    FOR VALUES FROM ('2024-02-01') TO ('2024-03-01');

CREATE TABLE IF NOT EXISTS orders_2024_03 PARTITION OF orders_partitioned
    FOR VALUES FROM ('2024-03-01') TO ('2024-04-01');

CREATE TABLE IF NOT EXISTS orders_2024_04 PARTITION OF orders_partitioned
    FOR VALUES FROM ('2024-04-01') TO ('2024-05-01');

CREATE TABLE IF NOT EXISTS orders_2024_05 PARTITION OF orders_partitioned
    FOR VALUES FROM ('2024-05-01') TO ('2024-06-01');

CREATE TABLE IF NOT EXISTS orders_2024_06 PARTITION OF orders_partitioned
    FOR VALUES FROM ('2024-06-01') TO ('2024-07-01');

CREATE TABLE IF NOT EXISTS orders_2024_07 PARTITION OF orders_partitioned
    FOR VALUES FROM ('2024-07-01') TO ('2024-08-01');

CREATE TABLE IF NOT EXISTS orders_2024_08 PARTITION OF orders_partitioned
    FOR VALUES FROM ('2024-08-01') TO ('2024-09-01');

CREATE TABLE IF NOT EXISTS orders_2024_09 PARTITION OF orders_partitioned
    FOR VALUES FROM ('2024-09-01') TO ('2024-10-01');

CREATE TABLE IF NOT EXISTS orders_2024_10 PARTITION OF orders_partitioned
    FOR VALUES FROM ('2024-10-01') TO ('2024-11-01');

CREATE TABLE IF NOT EXISTS orders_2024_11 PARTITION OF orders_partitioned
    FOR VALUES FROM ('2024-11-01') TO ('2024-12-01');

CREATE TABLE IF NOT EXISTS orders_2024_12 PARTITION OF orders_partitioned
    FOR VALUES FROM ('2024-12-01') TO ('2025-01-01');

-- Create partitions for 2025
CREATE TABLE IF NOT EXISTS orders_2025_01 PARTITION OF orders_partitioned
    FOR VALUES FROM ('2025-01-01') TO ('2025-02-01');

CREATE TABLE IF NOT EXISTS orders_2025_02 PARTITION OF orders_partitioned
    FOR VALUES FROM ('2025-02-01') TO ('2025-03-01');

CREATE TABLE IF NOT EXISTS orders_2025_03 PARTITION OF orders_partitioned
    FOR VALUES FROM ('2025-03-01') TO ('2025-04-01');

-- Function to create next month's partition automatically
CREATE OR REPLACE FUNCTION create_next_partition()
RETURNS void AS $$
DECLARE
    next_month DATE;
    partition_name TEXT;
    start_date TEXT;
    end_date TEXT;
BEGIN
    next_month := date_trunc('month', CURRENT_DATE + interval '2 months');
    partition_name := 'orders_' || to_char(next_month, 'YYYY_MM');
    start_date := to_char(next_month, 'YYYY-MM-DD');
    end_date := to_char(next_month + interval '1 month', 'YYYY-MM-DD');
    
    EXECUTE format(
        'CREATE TABLE IF NOT EXISTS %I PARTITION OF orders_partitioned FOR VALUES FROM (%L) TO (%L)',
        partition_name, start_date, end_date
    );
    
    RAISE NOTICE 'Created partition: %', partition_name;
END;
$$ LANGUAGE plpgsql;

-- Create a cron job to run monthly (requires pg_cron extension)
-- SELECT cron.schedule('create-partition', '0 0 1 * *', 'SELECT create_next_partition()');

-- Migration: Copy data from existing orders table (if exists)
-- INSERT INTO orders_partitioned SELECT * FROM orders WHERE created_at >= '2024-01-01';

-- Performance tips:
-- 1. Always include created_at in WHERE clauses for partition pruning
-- 2. Use EXPLAIN ANALYZE to verify partition pruning is working
-- 3. Monitor partition sizes and create new partitions proactively
-- 4. Consider archiving old partitions to separate tablespace

COMMENT ON TABLE orders_partitioned IS 'Partitioned orders table by month for improved query performance';
