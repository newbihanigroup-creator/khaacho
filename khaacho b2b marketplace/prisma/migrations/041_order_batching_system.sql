-- Migration: Order Batching System
-- Description: Combine orders from nearby buyers to reduce delivery costs

-- ============================================================================
-- ORDER BATCHES
-- ============================================================================

CREATE TABLE IF NOT EXISTS order_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Batch identification
  batch_number VARCHAR(50) NOT NULL UNIQUE,
  
  -- Vendor and location
  vendor_id UUID NOT NULL REFERENCES vendors(id),
  delivery_zone VARCHAR(100), -- Geographic zone for delivery
  delivery_latitude DECIMAL(10, 8),
  delivery_longitude DECIMAL(11, 8),
  delivery_radius_km DECIMAL(5,2), -- Radius covered by this batch
  
  -- Batch status
  status VARCHAR(50) NOT NULL DEFAULT 'PENDING', -- PENDING, CONFIRMED, DISPATCHED, DELIVERED, CANCELLED
  
  -- Order details
  total_orders INTEGER NOT NULL DEFAULT 0,
  total_items INTEGER NOT NULL DEFAULT 0,
  total_value DECIMAL(12,2) NOT NULL DEFAULT 0,
  
  -- Delivery optimization
  estimated_delivery_cost DECIMAL(10,2),
  actual_delivery_cost DECIMAL(10,2),
  individual_delivery_cost DECIMAL(10,2), -- Cost if delivered separately
  cost_savings DECIMAL(10,2), -- Savings from batching
  savings_percentage DECIMAL(5,2),
  
  -- Timing
  batch_window_start TIMESTAMP NOT NULL,
  batch_window_end TIMESTAMP NOT NULL,
  confirmed_at TIMESTAMP,
  dispatched_at TIMESTAMP,
  delivered_at TIMESTAMP,
  
  -- Delivery details
  delivery_vehicle_type VARCHAR(50),
  delivery_driver_id UUID,
  delivery_route_optimization JSONB, -- Optimized route data
  
  -- Metadata
  batching_criteria JSONB, -- Criteria used for batching
  notes TEXT,
  
  -- Timestamps
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX idx_order_batches_batch_number ON order_batches(batch_number);
CREATE INDEX idx_order_batches_vendor_id ON order_batches(vendor_id);
CREATE INDEX idx_order_batches_status ON order_batches(status);
CREATE INDEX idx_order_batches_delivery_zone ON order_batches(delivery_zone);
CREATE INDEX idx_order_batches_batch_window ON order_batches(batch_window_start, batch_window_end);
CREATE INDEX idx_order_batches_created_at ON order_batches(created_at DESC);

-- ============================================================================
-- BATCH ORDER ITEMS (Orders in a batch)
-- ============================================================================

CREATE TABLE IF NOT EXISTS batch_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Batch and order reference
  batch_id UUID NOT NULL REFERENCES order_batches(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  
  -- Retailer location
  retailer_id UUID NOT NULL REFERENCES retailers(id),
  delivery_address TEXT,
  delivery_latitude DECIMAL(10, 8),
  delivery_longitude DECIMAL(11, 8),
  
  -- Distance from batch center
  distance_from_center_km DECIMAL(5,2),
  delivery_sequence INTEGER, -- Order in delivery route
  
  -- Order details
  order_value DECIMAL(10,2),
  item_count INTEGER,
  
  -- Delivery status
  delivered BOOLEAN DEFAULT FALSE,
  delivered_at TIMESTAMP,
  
  -- Timestamps
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  UNIQUE(batch_id, order_id)
);

-- Indexes
CREATE INDEX idx_batch_order_items_batch_id ON batch_order_items(batch_id);
CREATE INDEX idx_batch_order_items_order_id ON batch_order_items(order_id);
CREATE INDEX idx_batch_order_items_retailer_id ON batch_order_items(retailer_id);
CREATE INDEX idx_batch_order_items_delivery_sequence ON batch_order_items(batch_id, delivery_sequence);

-- ============================================================================
-- BATCH PRODUCT GROUPS (Products grouped in batch)
-- ============================================================================

CREATE TABLE IF NOT EXISTS batch_product_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Batch and product reference
  batch_id UUID NOT NULL REFERENCES order_batches(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id),
  
  -- Aggregated quantities
  total_quantity INTEGER NOT NULL,
  total_orders INTEGER NOT NULL, -- Number of orders containing this product
  
  -- Pricing
  unit_price DECIMAL(10,2),
  total_value DECIMAL(12,2),
  
  -- Bulk discount
  bulk_discount_percentage DECIMAL(5,2) DEFAULT 0,
  bulk_discount_amount DECIMAL(10,2) DEFAULT 0,
  
  -- Timestamps
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  UNIQUE(batch_id, product_id)
);

-- Indexes
CREATE INDEX idx_batch_product_groups_batch_id ON batch_product_groups(batch_id);
CREATE INDEX idx_batch_product_groups_product_id ON batch_product_groups(product_id);

-- ============================================================================
-- BATCHING CONFIGURATION
-- ============================================================================

CREATE TABLE IF NOT EXISTS batching_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Geographic batching
  max_distance_km DECIMAL(5,2) NOT NULL DEFAULT 5.00, -- Max distance between orders
  min_orders_per_batch INTEGER NOT NULL DEFAULT 3,
  max_orders_per_batch INTEGER NOT NULL DEFAULT 20,
  
  -- Time window
  batch_window_minutes INTEGER NOT NULL DEFAULT 60, -- Time to collect orders
  max_wait_time_minutes INTEGER NOT NULL DEFAULT 120, -- Max time order can wait
  
  -- Product grouping
  enable_product_grouping BOOLEAN NOT NULL DEFAULT TRUE,
  min_same_product_orders INTEGER NOT NULL DEFAULT 2,
  
  -- Cost optimization
  base_delivery_cost DECIMAL(10,2) NOT NULL DEFAULT 50.00,
  cost_per_km DECIMAL(10,2) NOT NULL DEFAULT 5.00,
  cost_per_stop DECIMAL(10,2) NOT NULL DEFAULT 10.00,
  bulk_discount_threshold INTEGER NOT NULL DEFAULT 5, -- Orders needed for discount
  bulk_discount_percentage DECIMAL(5,2) NOT NULL DEFAULT 5.00,
  
  -- Delivery zones
  enable_zone_batching BOOLEAN NOT NULL DEFAULT TRUE,
  predefined_zones JSONB, -- Array of zone definitions
  
  -- Active configuration
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  
  -- Timestamps
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Insert default configuration
INSERT INTO batching_config (is_active) VALUES (TRUE)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- BATCH SAVINGS TRACKING
-- ============================================================================

CREATE TABLE IF NOT EXISTS batch_savings_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Batch reference
  batch_id UUID NOT NULL REFERENCES order_batches(id) ON DELETE CASCADE,
  
  -- Savings breakdown
  delivery_cost_savings DECIMAL(10,2) NOT NULL DEFAULT 0,
  bulk_discount_savings DECIMAL(10,2) NOT NULL DEFAULT 0,
  route_optimization_savings DECIMAL(10,2) NOT NULL DEFAULT 0,
  total_savings DECIMAL(10,2) NOT NULL DEFAULT 0,
  
  -- Cost comparison
  individual_delivery_cost DECIMAL(10,2) NOT NULL,
  batched_delivery_cost DECIMAL(10,2) NOT NULL,
  
  -- Efficiency metrics
  orders_per_km DECIMAL(5,2),
  cost_per_order DECIMAL(10,2),
  savings_per_order DECIMAL(10,2),
  
  -- Environmental impact
  co2_saved_kg DECIMAL(10,2), -- Estimated CO2 savings
  
  -- Timestamps
  recorded_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX idx_batch_savings_tracking_batch_id ON batch_savings_tracking(batch_id);
CREATE INDEX idx_batch_savings_tracking_recorded_at ON batch_savings_tracking(recorded_at DESC);

-- ============================================================================
-- DELIVERY ZONES
-- ============================================================================

CREATE TABLE IF NOT EXISTS delivery_zones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Zone identification
  zone_name VARCHAR(100) NOT NULL UNIQUE,
  zone_code VARCHAR(20) NOT NULL UNIQUE,
  
  -- Geographic boundaries
  center_latitude DECIMAL(10, 8) NOT NULL,
  center_longitude DECIMAL(11, 8) NOT NULL,
  radius_km DECIMAL(5,2) NOT NULL,
  boundary_polygon JSONB, -- GeoJSON polygon for complex shapes
  
  -- Zone characteristics
  population_density VARCHAR(20), -- HIGH, MEDIUM, LOW
  delivery_difficulty VARCHAR(20), -- EASY, MODERATE, DIFFICULT
  
  -- Delivery costs
  base_delivery_cost DECIMAL(10,2),
  cost_per_km DECIMAL(10,2),
  
  -- Active status
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  
  -- Timestamps
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX idx_delivery_zones_zone_code ON delivery_zones(zone_code);
CREATE INDEX idx_delivery_zones_active ON delivery_zones(is_active) WHERE is_active = TRUE;

-- ============================================================================
-- VIEWS FOR MONITORING
-- ============================================================================

-- Active batches summary
CREATE OR REPLACE VIEW active_batches_summary AS
SELECT
  ob.id as batch_id,
  ob.batch_number,
  v.id as vendor_id,
  u.business_name as vendor_name,
  ob.delivery_zone,
  ob.status,
  ob.total_orders,
  ob.total_items,
  ob.total_value,
  ob.cost_savings,
  ob.savings_percentage,
  ob.batch_window_start,
  ob.batch_window_end,
  EXTRACT(EPOCH FROM (ob.batch_window_end - NOW())) / 60 as minutes_remaining,
  COUNT(boi.id) as orders_added
FROM order_batches ob
JOIN vendors v ON ob.vendor_id = v.id
JOIN users u ON v.user_id = u.id
LEFT JOIN batch_order_items boi ON ob.id = boi.batch_id
WHERE ob.status IN ('PENDING', 'CONFIRMED')
GROUP BY ob.id, v.id, u.business_name
ORDER BY ob.batch_window_end ASC;

-- Batch savings summary
CREATE OR REPLACE VIEW batch_savings_summary AS
SELECT
  DATE_TRUNC('day', recorded_at) as date,
  COUNT(DISTINCT batch_id) as total_batches,
  SUM(total_savings) as total_savings,
  AVG(total_savings) as avg_savings_per_batch,
  SUM(delivery_cost_savings) as total_delivery_savings,
  SUM(bulk_discount_savings) as total_bulk_savings,
  SUM(route_optimization_savings) as total_route_savings,
  AVG(savings_per_order) as avg_savings_per_order,
  SUM(co2_saved_kg) as total_co2_saved
FROM batch_savings_tracking
WHERE recorded_at >= NOW() - INTERVAL '30 days'
GROUP BY DATE_TRUNC('day', recorded_at)
ORDER BY date DESC;

-- Product batching efficiency
CREATE OR REPLACE VIEW product_batching_efficiency AS
SELECT
  p.id as product_id,
  p.name as product_name,
  COUNT(DISTINCT bpg.batch_id) as times_batched,
  SUM(bpg.total_quantity) as total_quantity_batched,
  AVG(bpg.total_orders) as avg_orders_per_batch,
  SUM(bpg.bulk_discount_amount) as total_bulk_discounts,
  AVG(bpg.bulk_discount_percentage) as avg_bulk_discount_pct
FROM batch_product_groups bpg
JOIN products p ON bpg.product_id = p.id
JOIN order_batches ob ON bpg.batch_id = ob.id
WHERE ob.created_at >= NOW() - INTERVAL '30 days'
GROUP BY p.id, p.name
ORDER BY times_batched DESC;

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Calculate distance between two points (Haversine formula)
CREATE OR REPLACE FUNCTION calculate_distance_km(
  lat1 DECIMAL,
  lon1 DECIMAL,
  lat2 DECIMAL,
  lon2 DECIMAL
) RETURNS DECIMAL AS $$
DECLARE
  earth_radius DECIMAL := 6371; -- Earth radius in km
  dlat DECIMAL;
  dlon DECIMAL;
  a DECIMAL;
  c DECIMAL;
BEGIN
  dlat := RADIANS(lat2 - lat1);
  dlon := RADIANS(lon2 - lon1);
  
  a := SIN(dlat/2) * SIN(dlat/2) + 
       COS(RADIANS(lat1)) * COS(RADIANS(lat2)) * 
       SIN(dlon/2) * SIN(dlon/2);
  
  c := 2 * ATAN2(SQRT(a), SQRT(1-a));
  
  RETURN earth_radius * c;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Find nearby orders for batching
CREATE OR REPLACE FUNCTION find_nearby_orders(
  p_vendor_id UUID,
  p_center_lat DECIMAL,
  p_center_lon DECIMAL,
  p_max_distance_km DECIMAL,
  p_time_window_start TIMESTAMP,
  p_time_window_end TIMESTAMP
) RETURNS TABLE(
  order_id UUID,
  retailer_id UUID,
  delivery_latitude DECIMAL,
  delivery_longitude DECIMAL,
  distance_km DECIMAL,
  order_value DECIMAL,
  item_count INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    o.id,
    o.retailer_id,
    r.delivery_latitude,
    r.delivery_longitude,
    calculate_distance_km(
      p_center_lat,
      p_center_lon,
      r.delivery_latitude,
      r.delivery_longitude
    ) as distance_km,
    o.total,
    (SELECT COUNT(*) FROM order_items WHERE order_id = o.id)::INTEGER as item_count
  FROM orders o
  JOIN retailers r ON o.retailer_id = r.id
  WHERE o.vendor_id = p_vendor_id
    AND o.status = 'PENDING'
    AND o.created_at BETWEEN p_time_window_start AND p_time_window_end
    AND r.delivery_latitude IS NOT NULL
    AND r.delivery_longitude IS NOT NULL
    AND calculate_distance_km(
      p_center_lat,
      p_center_lon,
      r.delivery_latitude,
      r.delivery_longitude
    ) <= p_max_distance_km
  ORDER BY distance_km ASC;
END;
$$ LANGUAGE plpgsql;

-- Calculate batch delivery cost
CREATE OR REPLACE FUNCTION calculate_batch_delivery_cost(
  p_batch_id UUID
) RETURNS DECIMAL AS $$
DECLARE
  v_config RECORD;
  v_total_distance DECIMAL;
  v_total_stops INTEGER;
  v_delivery_cost DECIMAL;
BEGIN
  -- Get configuration
  SELECT * INTO v_config
  FROM batching_config
  WHERE is_active = TRUE
  ORDER BY created_at DESC
  LIMIT 1;
  
  -- Get batch details
  SELECT
    COUNT(*) as stops,
    SUM(distance_from_center_km) as total_distance
  INTO v_total_stops, v_total_distance
  FROM batch_order_items
  WHERE batch_id = p_batch_id;
  
  -- Calculate cost
  v_delivery_cost := v_config.base_delivery_cost +
                     (v_total_distance * v_config.cost_per_km) +
                     (v_total_stops * v_config.cost_per_stop);
  
  RETURN v_delivery_cost;
END;
$$ LANGUAGE plpgsql;

-- Calculate individual delivery costs
CREATE OR REPLACE FUNCTION calculate_individual_delivery_costs(
  p_batch_id UUID
) RETURNS DECIMAL AS $$
DECLARE
  v_config RECORD;
  v_total_cost DECIMAL := 0;
  v_order RECORD;
BEGIN
  -- Get configuration
  SELECT * INTO v_config
  FROM batching_config
  WHERE is_active = TRUE
  ORDER BY created_at DESC
  LIMIT 1;
  
  -- Calculate cost for each order individually
  FOR v_order IN
    SELECT distance_from_center_km
    FROM batch_order_items
    WHERE batch_id = p_batch_id
  LOOP
    v_total_cost := v_total_cost + 
                    v_config.base_delivery_cost +
                    (v_order.distance_from_center_km * 2 * v_config.cost_per_km);
  END LOOP;
  
  RETURN v_total_cost;
END;
$$ LANGUAGE plpgsql;

-- Record batch savings
CREATE OR REPLACE FUNCTION record_batch_savings(
  p_batch_id UUID
) RETURNS VOID AS $$
DECLARE
  v_batched_cost DECIMAL;
  v_individual_cost DECIMAL;
  v_delivery_savings DECIMAL;
  v_bulk_savings DECIMAL;
  v_total_savings DECIMAL;
  v_order_count INTEGER;
BEGIN
  -- Calculate costs
  v_batched_cost := calculate_batch_delivery_cost(p_batch_id);
  v_individual_cost := calculate_individual_delivery_costs(p_batch_id);
  v_delivery_savings := v_individual_cost - v_batched_cost;
  
  -- Get bulk discount savings
  SELECT COALESCE(SUM(bulk_discount_amount), 0)
  INTO v_bulk_savings
  FROM batch_product_groups
  WHERE batch_id = p_batch_id;
  
  v_total_savings := v_delivery_savings + v_bulk_savings;
  
  -- Get order count
  SELECT COUNT(*) INTO v_order_count
  FROM batch_order_items
  WHERE batch_id = p_batch_id;
  
  -- Record savings
  INSERT INTO batch_savings_tracking (
    batch_id,
    delivery_cost_savings,
    bulk_discount_savings,
    total_savings,
    individual_delivery_cost,
    batched_delivery_cost,
    cost_per_order,
    savings_per_order,
    co2_saved_kg
  ) VALUES (
    p_batch_id,
    v_delivery_savings,
    v_bulk_savings,
    v_total_savings,
    v_individual_cost,
    v_batched_cost,
    v_batched_cost / NULLIF(v_order_count, 0),
    v_total_savings / NULLIF(v_order_count, 0),
    (v_individual_cost - v_batched_cost) * 0.2 -- Rough CO2 estimate
  );
  
  -- Update batch with savings
  UPDATE order_batches
  SET
    estimated_delivery_cost = v_batched_cost,
    individual_delivery_cost = v_individual_cost,
    cost_savings = v_total_savings,
    savings_percentage = (v_total_savings / NULLIF(v_individual_cost, 0) * 100),
    updated_at = NOW()
  WHERE id = p_batch_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE order_batches IS 'Batched orders for optimized delivery';
COMMENT ON TABLE batch_order_items IS 'Orders included in a batch';
COMMENT ON TABLE batch_product_groups IS 'Products grouped in batch for bulk ordering';
COMMENT ON TABLE batching_config IS 'Configuration for order batching';
COMMENT ON TABLE batch_savings_tracking IS 'Savings achieved through batching';
COMMENT ON TABLE delivery_zones IS 'Geographic zones for delivery optimization';

COMMENT ON FUNCTION calculate_distance_km IS 'Calculate distance between two coordinates';
COMMENT ON FUNCTION find_nearby_orders IS 'Find orders near a location for batching';
COMMENT ON FUNCTION calculate_batch_delivery_cost IS 'Calculate delivery cost for batch';
COMMENT ON FUNCTION calculate_individual_delivery_costs IS 'Calculate cost if delivered separately';
COMMENT ON FUNCTION record_batch_savings IS 'Record savings achieved by batch';
