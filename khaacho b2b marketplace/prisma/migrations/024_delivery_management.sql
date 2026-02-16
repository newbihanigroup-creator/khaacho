-- Migration: Delivery Management System
-- Description: Add delivery tracking with immutable logs and credit ledger integration
-- Created: 2026-02-12

-- Create delivery status enum
CREATE TYPE delivery_status AS ENUM (
  'ASSIGNED',
  'PICKED_UP',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'FAILED',
  'CANCELLED'
);

-- Create delivery persons table
CREATE TABLE delivery_persons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  person_code VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  phone_number VARCHAR(20) NOT NULL,
  vehicle_type VARCHAR(50),
  vehicle_number VARCHAR(50),
  license_number VARCHAR(50),
  is_active BOOLEAN DEFAULT true,
  current_location JSONB,
  total_deliveries INT DEFAULT 0,
  successful_deliveries INT DEFAULT 0,
  failed_deliveries INT DEFAULT 0,
  average_rating DECIMAL(3, 2) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP
);

-- Create deliveries table (immutable logs)
CREATE TABLE deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_number VARCHAR(50) UNIQUE NOT NULL,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  delivery_person_id UUID REFERENCES delivery_persons(id) ON DELETE RESTRICT,
  status delivery_status DEFAULT 'ASSIGNED',
  
  -- Timestamps for each status
  assigned_at TIMESTAMP,
  picked_up_at TIMESTAMP,
  out_for_delivery_at TIMESTAMP,
  delivered_at TIMESTAMP,
  failed_at TIMESTAMP,
  cancelled_at TIMESTAMP,
  
  -- Delivery details
  pickup_address TEXT,
  delivery_address TEXT NOT NULL,
  recipient_name VARCHAR(255),
  recipient_phone VARCHAR(20),
  
  -- Tracking
  estimated_delivery_time TIMESTAMP,
  actual_delivery_time TIMESTAMP,
  delivery_notes TEXT,
  failure_reason TEXT,
  cancellation_reason TEXT,
  
  -- Proof of delivery
  signature_url TEXT,
  photo_url TEXT,
  recipient_signature TEXT,
  
  -- Metadata
  distance_km DECIMAL(8, 2),
  delivery_fee DECIMAL(10, 2) DEFAULT 0,
  metadata JSONB,
  
  -- Immutable audit fields
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  created_by UUID REFERENCES users(id),
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  
  CONSTRAINT valid_timestamps CHECK (
    (picked_up_at IS NULL OR picked_up_at >= assigned_at) AND
    (out_for_delivery_at IS NULL OR out_for_delivery_at >= picked_up_at) AND
    (delivered_at IS NULL OR delivered_at >= out_for_delivery_at)
  )
);

-- Create delivery status logs (immutable history)
CREATE TABLE delivery_status_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id UUID NOT NULL REFERENCES deliveries(id) ON DELETE RESTRICT,
  from_status delivery_status,
  to_status delivery_status NOT NULL,
  changed_by UUID REFERENCES users(id),
  location JSONB,
  notes TEXT,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Create delivery ratings table
CREATE TABLE delivery_ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id UUID NOT NULL REFERENCES deliveries(id) ON DELETE RESTRICT,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  delivery_person_id UUID NOT NULL REFERENCES delivery_persons(id) ON DELETE RESTRICT,
  retailer_id UUID NOT NULL REFERENCES retailers(id) ON DELETE RESTRICT,
  rating INT NOT NULL CHECK (rating >= 1 AND rating <= 5),
  feedback TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Create indexes for performance
CREATE INDEX idx_delivery_persons_active ON delivery_persons(is_active, deleted_at);
CREATE INDEX idx_delivery_persons_code ON delivery_persons(person_code);
CREATE INDEX idx_delivery_persons_phone ON delivery_persons(phone_number);

CREATE INDEX idx_deliveries_number ON deliveries(delivery_number);
CREATE INDEX idx_deliveries_order ON deliveries(order_id);
CREATE INDEX idx_deliveries_person ON deliveries(delivery_person_id);
CREATE INDEX idx_deliveries_status ON deliveries(status);
CREATE INDEX idx_deliveries_created ON deliveries(created_at DESC);
CREATE INDEX idx_deliveries_delivered ON deliveries(delivered_at DESC);
CREATE INDEX idx_deliveries_person_status ON deliveries(delivery_person_id, status);

CREATE INDEX idx_delivery_logs_delivery ON delivery_status_logs(delivery_id, created_at DESC);
CREATE INDEX idx_delivery_logs_status ON delivery_status_logs(to_status);
CREATE INDEX idx_delivery_logs_created ON delivery_status_logs(created_at DESC);

CREATE INDEX idx_delivery_ratings_delivery ON delivery_ratings(delivery_id);
CREATE INDEX idx_delivery_ratings_person ON delivery_ratings(delivery_person_id);
CREATE INDEX idx_delivery_ratings_retailer ON delivery_ratings(retailer_id);

-- Create trigger to update delivery person stats
CREATE OR REPLACE FUNCTION update_delivery_person_stats()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'DELIVERED' AND OLD.status != 'DELIVERED' THEN
    UPDATE delivery_persons
    SET 
      total_deliveries = total_deliveries + 1,
      successful_deliveries = successful_deliveries + 1,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = NEW.delivery_person_id;
  ELSIF NEW.status = 'FAILED' AND OLD.status != 'FAILED' THEN
    UPDATE delivery_persons
    SET 
      total_deliveries = total_deliveries + 1,
      failed_deliveries = failed_deliveries + 1,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = NEW.delivery_person_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_delivery_person_stats
AFTER UPDATE ON deliveries
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION update_delivery_person_stats();

-- Create trigger to update delivery person rating
CREATE OR REPLACE FUNCTION update_delivery_person_rating()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE delivery_persons
  SET 
    average_rating = (
      SELECT AVG(rating)::DECIMAL(3, 2)
      FROM delivery_ratings
      WHERE delivery_person_id = NEW.delivery_person_id
    ),
    updated_at = CURRENT_TIMESTAMP
  WHERE id = NEW.delivery_person_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_delivery_person_rating
AFTER INSERT ON delivery_ratings
FOR EACH ROW
EXECUTE FUNCTION update_delivery_person_rating();

-- Create view for active deliveries
CREATE VIEW active_deliveries AS
SELECT 
  d.id,
  d.delivery_number,
  d.order_id,
  o.order_number,
  d.delivery_person_id,
  dp.name as delivery_person_name,
  dp.phone_number as delivery_person_phone,
  d.status,
  d.assigned_at,
  d.picked_up_at,
  d.out_for_delivery_at,
  d.estimated_delivery_time,
  d.delivery_address,
  d.recipient_name,
  d.recipient_phone,
  r.shop_name as retailer_shop_name,
  u.phone_number as retailer_phone,
  EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - d.assigned_at))/60 as minutes_since_assigned
FROM deliveries d
JOIN orders o ON d.order_id = o.id
JOIN retailers r ON o.retailer_id = r.id
JOIN users u ON r.user_id = u.id
LEFT JOIN delivery_persons dp ON d.delivery_person_id = dp.id
WHERE d.status IN ('ASSIGNED', 'PICKED_UP', 'OUT_FOR_DELIVERY');

-- Create view for delivery person performance
CREATE VIEW delivery_person_performance AS
SELECT 
  dp.id,
  dp.person_code,
  dp.name,
  dp.phone_number,
  dp.total_deliveries,
  dp.successful_deliveries,
  dp.failed_deliveries,
  dp.average_rating,
  CASE 
    WHEN dp.total_deliveries > 0 
    THEN ROUND((dp.successful_deliveries::DECIMAL / dp.total_deliveries * 100), 2)
    ELSE 0
  END as success_rate,
  COUNT(CASE WHEN d.status IN ('ASSIGNED', 'PICKED_UP', 'OUT_FOR_DELIVERY') THEN 1 END) as active_deliveries,
  AVG(CASE 
    WHEN d.delivered_at IS NOT NULL AND d.assigned_at IS NOT NULL 
    THEN EXTRACT(EPOCH FROM (d.delivered_at - d.assigned_at))/60 
  END) as avg_delivery_time_minutes
FROM delivery_persons dp
LEFT JOIN deliveries d ON dp.id = d.delivery_person_id
WHERE dp.is_active = true AND dp.deleted_at IS NULL
GROUP BY dp.id, dp.person_code, dp.name, dp.phone_number, 
         dp.total_deliveries, dp.successful_deliveries, 
         dp.failed_deliveries, dp.average_rating;

COMMENT ON TABLE deliveries IS 'Immutable delivery tracking logs with credit ledger integration';
COMMENT ON TABLE delivery_status_logs IS 'Immutable history of all delivery status changes';
COMMENT ON COLUMN deliveries.delivered_at IS 'Triggers credit ledger update when set';
