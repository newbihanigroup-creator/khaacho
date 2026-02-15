-- Vendor Load Balancing System
-- Tracks load balancing decisions and vendor capacity

-- Add working hours columns to vendors table
ALTER TABLE vendors 
ADD COLUMN IF NOT EXISTS working_hours_start INT DEFAULT 9 CHECK (working_hours_start >= 0 AND working_hours_start <= 23),
ADD COLUMN IF NOT EXISTS working_hours_end INT DEFAULT 18 CHECK (working_hours_end >= 0 AND working_hours_end <= 23),
ADD COLUMN IF NOT EXISTS timezone VARCHAR(50) DEFAULT 'Asia/Kathmandu';

-- Create vendor_load_balancing_log table
CREATE TABLE IF NOT EXISTS vendor_load_balancing_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- References
    order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    selected_vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
    
    -- Candidate vendors (JSONB)
    candidate_vendors JSONB NOT NULL DEFAULT '{}',
    
    -- Strategy and reason
    strategy VARCHAR(50) NOT NULL CHECK (strategy IN ('round-robin', 'least-loaded', 'manual')),
    reason TEXT,
    
    -- Configuration snapshot
    config_snapshot JSONB,
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX idx_vendor_load_balancing_log_order_id ON vendor_load_balancing_log(order_id);
CREATE INDEX idx_vendor_load_balancing_log_product_id ON vendor_load_balancing_log(product_id);
CREATE INDEX idx_vendor_load_balancing_log_vendor_id ON vendor_load_balancing_log(selected_vendor_id);
CREATE INDEX idx_vendor_load_balancing_log_strategy ON vendor_load_balancing_log(strategy);
CREATE INDEX idx_vendor_load_balancing_log_created_at ON vendor_load_balancing_log(created_at DESC);

-- GIN index for JSONB search
CREATE INDEX idx_vendor_load_balancing_log_candidates ON vendor_load_balancing_log USING GIN (candidate_vendors);

-- Create view for vendor capacity monitoring
CREATE OR REPLACE VIEW vendor_capacity_status AS
SELECT 
    v.id as vendor_id,
    v.vendor_code,
    u.business_name,
    u.city,
    u.state,
    
    -- Active orders count
    COALESCE(
        (SELECT COUNT(*) FROM orders o 
         WHERE o.vendor_id = v.id 
         AND o.status IN ('CONFIRMED', 'ACCEPTED', 'DISPATCHED')),
        0
    ) as active_orders_count,
    
    -- Pending orders count
    COALESCE(
        (SELECT COUNT(*) FROM orders o 
         WHERE o.vendor_id = v.id 
         AND o.status = 'CONFIRMED'),
        0
    ) as pending_orders_count,
    
    -- Working hours
    v.working_hours_start,
    v.working_hours_end,
    v.timezone,
    
    -- Current hour in vendor timezone
    EXTRACT(HOUR FROM CURRENT_TIMESTAMP AT TIME ZONE COALESCE(v.timezone, 'Asia/Kathmandu')) as current_hour,
    
    -- Is in working hours
    CASE 
        WHEN EXTRACT(HOUR FROM CURRENT_TIMESTAMP AT TIME ZONE COALESCE(v.timezone, 'Asia/Kathmandu')) >= v.working_hours_start
          AND EXTRACT(HOUR FROM CURRENT_TIMESTAMP AT TIME ZONE COALESCE(v.timezone, 'Asia/Kathmandu')) < v.working_hours_end
        THEN true
        ELSE false
    END as is_in_working_hours,
    
    -- Intelligence score
    COALESCE(vm.intelligence_score, v.rating * 20, 0) as intelligence_score,
    
    -- Last updated
    CURRENT_TIMESTAMP as calculated_at
    
FROM vendors v
INNER JOIN users u ON v.user_id = u.id
LEFT JOIN vendor_metrics vm ON vm.vendor_id = v.id
WHERE v.deleted_at IS NULL
  AND v.is_approved = true
  AND u.is_active = true;

-- Create view for monopoly monitoring
CREATE OR REPLACE VIEW vendor_market_share AS
SELECT 
    v.id as vendor_id,
    v.vendor_code,
    u.business_name,
    oi.product_id,
    p.name as product_name,
    p.category,
    
    -- Last 30 days
    COUNT(DISTINCT CASE 
        WHEN o.created_at >= CURRENT_DATE - INTERVAL '30 days' 
        THEN o.id 
    END) as orders_last_30_days,
    
    ROUND(
        COUNT(DISTINCT CASE 
            WHEN o.created_at >= CURRENT_DATE - INTERVAL '30 days' 
            THEN o.id 
        END)::numeric / 
        NULLIF(
            (SELECT COUNT(DISTINCT o2.id) 
             FROM orders o2 
             INNER JOIN order_items oi2 ON oi2.order_id = o2.id
             WHERE oi2.product_id = oi.product_id
             AND o2.created_at >= CURRENT_DATE - INTERVAL '30 days'
             AND o2.status NOT IN ('CANCELLED', 'REJECTED')),
            0
        )::numeric * 100,
        2
    ) as market_share_percent_30d,
    
    -- Last 7 days
    COUNT(DISTINCT CASE 
        WHEN o.created_at >= CURRENT_DATE - INTERVAL '7 days' 
        THEN o.id 
    END) as orders_last_7_days,
    
    ROUND(
        COUNT(DISTINCT CASE 
            WHEN o.created_at >= CURRENT_DATE - INTERVAL '7 days' 
            THEN o.id 
        END)::numeric / 
        NULLIF(
            (SELECT COUNT(DISTINCT o2.id) 
             FROM orders o2 
             INNER JOIN order_items oi2 ON oi2.order_id = o2.id
             WHERE oi2.product_id = oi.product_id
             AND o2.created_at >= CURRENT_DATE - INTERVAL '7 days'
             AND o2.status NOT IN ('CANCELLED', 'REJECTED')),
            0
        )::numeric * 100,
        2
    ) as market_share_percent_7d
    
FROM orders o
INNER JOIN order_items oi ON oi.order_id = o.id
INNER JOIN vendors v ON o.vendor_id = v.id
INNER JOIN users u ON v.user_id = u.id
INNER JOIN products p ON oi.product_id = p.id
WHERE o.created_at >= CURRENT_DATE - INTERVAL '30 days'
  AND o.status NOT IN ('CANCELLED', 'REJECTED')
  AND v.deleted_at IS NULL
GROUP BY v.id, v.vendor_code, u.business_name, oi.product_id, p.name, p.category
HAVING COUNT(DISTINCT o.id) > 0;

-- Comments
COMMENT ON TABLE vendor_load_balancing_log IS 'Tracks vendor load balancing decisions for fair distribution';
COMMENT ON COLUMN vendor_load_balancing_log.strategy IS 'Load balancing strategy used: round-robin or least-loaded';
COMMENT ON COLUMN vendor_load_balancing_log.candidate_vendors IS 'List of vendors considered for selection';
COMMENT ON COLUMN vendor_load_balancing_log.config_snapshot IS 'Configuration at time of decision';

COMMENT ON VIEW vendor_capacity_status IS 'Real-time view of vendor capacity and working hours status';
COMMENT ON VIEW vendor_market_share IS 'Vendor market share by product for monopoly prevention';

