-- Migration: Multi-Vendor Pricing Engine
-- Description: Vendor-specific pricing with bulk tiers and automatic price selection
-- Created: 2026-02-12

-- Create pricing tiers table
CREATE TABLE vendor_pricing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  
  -- Base pricing
  base_price DECIMAL(12, 2) NOT NULL CHECK (base_price >= 0),
  currency VARCHAR(3) DEFAULT 'NPR',
  
  -- Bulk pricing support
  has_bulk_pricing BOOLEAN DEFAULT false,
  
  -- Validity period
  valid_from TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  valid_until TIMESTAMP,
  
  -- Pricing metadata
  cost_price DECIMAL(12, 2), -- Vendor's cost (optional)
  margin_percentage DECIMAL(5, 2), -- Profit margin
  is_active BOOLEAN DEFAULT true,
  is_promotional BOOLEAN DEFAULT false,
  promotional_label VARCHAR(100),
  
  -- Constraints
  min_order_quantity INT DEFAULT 1,
  max_order_quantity INT,
  
  -- Audit fields
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  created_by UUID REFERENCES users(id),
  
  CONSTRAINT valid_date_range CHECK (valid_until IS NULL OR valid_until > valid_from),
  CONSTRAINT valid_margin CHECK (margin_percentage IS NULL OR margin_percentage >= 0)
);

-- Create bulk pricing tiers table
CREATE TABLE vendor_pricing_tiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pricing_id UUID NOT NULL REFERENCES vendor_pricing(id) ON DELETE CASCADE,
  
  -- Tier definition
  tier_name VARCHAR(50), -- e.g., "Wholesale", "Bulk", "Premium"
  minimum_quantity INT NOT NULL CHECK (minimum_quantity > 0),
  maximum_quantity INT CHECK (maximum_quantity IS NULL OR maximum_quantity >= minimum_quantity),
  
  -- Tier pricing
  tier_price DECIMAL(12, 2) NOT NULL CHECK (tier_price >= 0),
  discount_percentage DECIMAL(5, 2), -- Discount from base price
  
  -- Tier metadata
  is_active BOOLEAN DEFAULT true,
  priority INT DEFAULT 0, -- Higher priority tiers checked first
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  
  CONSTRAINT valid_quantity_range CHECK (maximum_quantity IS NULL OR maximum_quantity >= minimum_quantity)
);

-- Create price history table (immutable)
CREATE TABLE price_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE RESTRICT,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  
  -- Price snapshot
  base_price DECIMAL(12, 2) NOT NULL,
  tier_price DECIMAL(12, 2), -- If bulk tier applied
  tier_name VARCHAR(50),
  final_price DECIMAL(12, 2) NOT NULL, -- Actual price used
  
  -- Order context
  order_id UUID REFERENCES orders(id) ON DELETE RESTRICT,
  quantity INT NOT NULL,
  
  -- Pricing metadata
  pricing_id UUID REFERENCES vendor_pricing(id) ON DELETE SET NULL,
  tier_id UUID REFERENCES vendor_pricing_tiers(id) ON DELETE SET NULL,
  discount_applied DECIMAL(5, 2),
  was_promotional BOOLEAN DEFAULT false,
  
  -- Selection reason
  selection_reason TEXT, -- Why this price was selected
  competing_prices JSONB, -- Other vendor prices at time of selection
  
  -- Immutable timestamp
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Create price comparison cache (for performance)
CREATE TABLE price_comparison_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  
  -- Cached comparison data
  lowest_price DECIMAL(12, 2) NOT NULL,
  lowest_price_vendor_id UUID REFERENCES vendors(id) ON DELETE CASCADE,
  highest_price DECIMAL(12, 2) NOT NULL,
  highest_price_vendor_id UUID REFERENCES vendors(id) ON DELETE CASCADE,
  average_price DECIMAL(12, 2) NOT NULL,
  vendor_count INT NOT NULL,
  
  -- Price range
  price_range DECIMAL(12, 2), -- highest - lowest
  price_variance DECIMAL(12, 2), -- Statistical variance
  
  -- Cache metadata
  cached_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  
  CONSTRAINT valid_price_range CHECK (highest_price >= lowest_price)
);

-- Create indexes for performance
CREATE INDEX idx_vendor_pricing_vendor ON vendor_pricing(vendor_id);
CREATE INDEX idx_vendor_pricing_product ON vendor_pricing(product_id);
CREATE INDEX idx_vendor_pricing_active ON vendor_pricing(is_active, valid_from, valid_until);
CREATE INDEX idx_vendor_pricing_vendor_product ON vendor_pricing(vendor_id, product_id, is_active);
CREATE INDEX idx_vendor_pricing_promotional ON vendor_pricing(is_promotional, is_active);

CREATE INDEX idx_pricing_tiers_pricing ON vendor_pricing_tiers(pricing_id);
CREATE INDEX idx_pricing_tiers_quantity ON vendor_pricing_tiers(minimum_quantity, maximum_quantity);
CREATE INDEX idx_pricing_tiers_active ON vendor_pricing_tiers(is_active, priority DESC);

CREATE INDEX idx_price_history_vendor ON price_history(vendor_id, created_at DESC);
CREATE INDEX idx_price_history_product ON price_history(product_id, created_at DESC);
CREATE INDEX idx_price_history_order ON price_history(order_id);
CREATE INDEX idx_price_history_created ON price_history(created_at DESC);

CREATE INDEX idx_price_cache_product ON price_comparison_cache(product_id);
CREATE INDEX idx_price_cache_expires ON price_comparison_cache(expires_at);

-- Create unique constraint for active pricing
CREATE UNIQUE INDEX idx_vendor_pricing_unique_active 
ON vendor_pricing(vendor_id, product_id, is_active) 
WHERE is_active = true AND (valid_until IS NULL OR valid_until > CURRENT_TIMESTAMP);

-- Create trigger to update vendor_pricing updated_at
CREATE OR REPLACE FUNCTION update_vendor_pricing_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_vendor_pricing_timestamp
BEFORE UPDATE ON vendor_pricing
FOR EACH ROW
EXECUTE FUNCTION update_vendor_pricing_timestamp();

-- Create trigger to invalidate price cache on pricing changes
CREATE OR REPLACE FUNCTION invalidate_price_cache()
RETURNS TRIGGER AS $$
BEGIN
  DELETE FROM price_comparison_cache 
  WHERE product_id = COALESCE(NEW.product_id, OLD.product_id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_invalidate_cache_on_pricing_change
AFTER INSERT OR UPDATE OR DELETE ON vendor_pricing
FOR EACH ROW
EXECUTE FUNCTION invalidate_price_cache();

-- Create view for active pricing with tiers
CREATE VIEW active_vendor_pricing AS
SELECT 
  vp.id as pricing_id,
  vp.vendor_id,
  v.vendor_code,
  u.business_name as vendor_name,
  vp.product_id,
  p.name as product_name,
  p.product_code,
  vp.base_price,
  vp.has_bulk_pricing,
  vp.is_promotional,
  vp.promotional_label,
  vp.min_order_quantity,
  vp.max_order_quantity,
  vp.valid_from,
  vp.valid_until,
  COUNT(vpt.id) as tier_count,
  MIN(vpt.tier_price) as lowest_tier_price,
  CASE 
    WHEN COUNT(vpt.id) > 0 THEN MIN(vpt.tier_price)
    ELSE vp.base_price
  END as effective_lowest_price
FROM vendor_pricing vp
JOIN vendors v ON vp.vendor_id = v.id
JOIN users u ON v.user_id = u.id
JOIN products p ON vp.product_id = p.id
LEFT JOIN vendor_pricing_tiers vpt ON vp.id = vpt.pricing_id AND vpt.is_active = true
WHERE vp.is_active = true
  AND (vp.valid_until IS NULL OR vp.valid_until > CURRENT_TIMESTAMP)
  AND v.is_approved = true
  AND v.deleted_at IS NULL
GROUP BY vp.id, vp.vendor_id, v.vendor_code, u.business_name, 
         vp.product_id, p.name, p.product_code, vp.base_price,
         vp.has_bulk_pricing, vp.is_promotional, vp.promotional_label,
         vp.min_order_quantity, vp.max_order_quantity, 
         vp.valid_from, vp.valid_until;

-- Create view for price comparison
CREATE VIEW product_price_comparison AS
SELECT 
  p.id as product_id,
  p.name as product_name,
  p.product_code,
  COUNT(DISTINCT vp.vendor_id) as vendor_count,
  MIN(vp.base_price) as lowest_base_price,
  MAX(vp.base_price) as highest_base_price,
  AVG(vp.base_price)::DECIMAL(12, 2) as average_base_price,
  MAX(vp.base_price) - MIN(vp.base_price) as price_range,
  STDDEV(vp.base_price)::DECIMAL(12, 2) as price_std_dev,
  MIN(CASE WHEN vpt.tier_price IS NOT NULL THEN vpt.tier_price ELSE vp.base_price END) as absolute_lowest_price,
  COUNT(CASE WHEN vp.is_promotional = true THEN 1 END) as promotional_count
FROM products p
JOIN vendor_pricing vp ON p.id = vp.product_id
LEFT JOIN vendor_pricing_tiers vpt ON vp.id = vpt.pricing_id AND vpt.is_active = true
WHERE vp.is_active = true
  AND (vp.valid_until IS NULL OR vp.valid_until > CURRENT_TIMESTAMP)
GROUP BY p.id, p.name, p.product_code;

-- Create function to get best price for quantity
CREATE OR REPLACE FUNCTION get_best_price_for_quantity(
  p_product_id UUID,
  p_quantity INT,
  p_vendor_id UUID DEFAULT NULL
)
RETURNS TABLE (
  vendor_id UUID,
  vendor_name TEXT,
  pricing_id UUID,
  tier_id UUID,
  base_price DECIMAL(12, 2),
  tier_price DECIMAL(12, 2),
  final_price DECIMAL(12, 2),
  tier_name VARCHAR(50),
  discount_percentage DECIMAL(5, 2),
  is_promotional BOOLEAN,
  selection_reason TEXT
) AS $$
BEGIN
  RETURN QUERY
  WITH vendor_prices AS (
    SELECT 
      vp.vendor_id,
      u.business_name as vendor_name,
      vp.id as pricing_id,
      vp.base_price,
      vp.is_promotional,
      vp.min_order_quantity,
      vp.max_order_quantity,
      -- Find applicable tier
      (
        SELECT vpt.id
        FROM vendor_pricing_tiers vpt
        WHERE vpt.pricing_id = vp.id
          AND vpt.is_active = true
          AND vpt.minimum_quantity <= p_quantity
          AND (vpt.maximum_quantity IS NULL OR vpt.maximum_quantity >= p_quantity)
        ORDER BY vpt.priority DESC, vpt.tier_price ASC
        LIMIT 1
      ) as applicable_tier_id,
      (
        SELECT vpt.tier_price
        FROM vendor_pricing_tiers vpt
        WHERE vpt.pricing_id = vp.id
          AND vpt.is_active = true
          AND vpt.minimum_quantity <= p_quantity
          AND (vpt.maximum_quantity IS NULL OR vpt.maximum_quantity >= p_quantity)
        ORDER BY vpt.priority DESC, vpt.tier_price ASC
        LIMIT 1
      ) as applicable_tier_price,
      (
        SELECT vpt.tier_name
        FROM vendor_pricing_tiers vpt
        WHERE vpt.pricing_id = vp.id
          AND vpt.is_active = true
          AND vpt.minimum_quantity <= p_quantity
          AND (vpt.maximum_quantity IS NULL OR vpt.maximum_quantity >= p_quantity)
        ORDER BY vpt.priority DESC, vpt.tier_price ASC
        LIMIT 1
      ) as applicable_tier_name,
      (
        SELECT vpt.discount_percentage
        FROM vendor_pricing_tiers vpt
        WHERE vpt.pricing_id = vp.id
          AND vpt.is_active = true
          AND vpt.minimum_quantity <= p_quantity
          AND (vpt.maximum_quantity IS NULL OR vpt.maximum_quantity >= p_quantity)
        ORDER BY vpt.priority DESC, vpt.tier_price ASC
        LIMIT 1
      ) as applicable_discount
    FROM vendor_pricing vp
    JOIN vendors v ON vp.vendor_id = v.id
    JOIN users u ON v.user_id = u.id
    WHERE vp.product_id = p_product_id
      AND vp.is_active = true
      AND (vp.valid_until IS NULL OR vp.valid_until > CURRENT_TIMESTAMP)
      AND v.is_approved = true
      AND v.deleted_at IS NULL
      AND (p_vendor_id IS NULL OR vp.vendor_id = p_vendor_id)
      AND (vp.min_order_quantity IS NULL OR vp.min_order_quantity <= p_quantity)
      AND (vp.max_order_quantity IS NULL OR vp.max_order_quantity >= p_quantity)
  )
  SELECT 
    vp.vendor_id,
    vp.vendor_name,
    vp.pricing_id,
    vp.applicable_tier_id as tier_id,
    vp.base_price,
    vp.applicable_tier_price as tier_price,
    COALESCE(vp.applicable_tier_price, vp.base_price) as final_price,
    vp.applicable_tier_name as tier_name,
    vp.applicable_discount as discount_percentage,
    vp.is_promotional,
    CASE 
      WHEN vp.applicable_tier_price IS NOT NULL THEN 
        'Bulk tier applied: ' || vp.applicable_tier_name || ' (qty >= ' || 
        (SELECT minimum_quantity FROM vendor_pricing_tiers WHERE id = vp.applicable_tier_id) || ')'
      WHEN vp.is_promotional THEN 'Promotional base price'
      ELSE 'Standard base price'
    END as selection_reason
  FROM vendor_prices vp
  ORDER BY 
    COALESCE(vp.applicable_tier_price, vp.base_price) ASC,
    vp.is_promotional DESC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql;

COMMENT ON TABLE vendor_pricing IS 'Vendor-specific product pricing with bulk tier support';
COMMENT ON TABLE vendor_pricing_tiers IS 'Bulk pricing tiers for quantity-based discounts';
COMMENT ON TABLE price_history IS 'Immutable history of all price selections and applications';
COMMENT ON TABLE price_comparison_cache IS 'Performance cache for price comparisons';
COMMENT ON FUNCTION get_best_price_for_quantity IS 'Returns the best available price for a given quantity, considering all tiers';
