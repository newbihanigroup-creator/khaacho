-- Vendor Intelligence Metrics System
-- Dynamic scoring for vendor selection and routing

-- Create vendor_metrics table for real-time intelligence
CREATE TABLE IF NOT EXISTS vendor_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
    
    -- Core Metrics (0-100 scale)
    delivery_success_rate DECIMAL(5,2) DEFAULT 0 CHECK (delivery_success_rate >= 0 AND delivery_success_rate <= 100),
    average_response_time DECIMAL(8,2) DEFAULT 0, -- in minutes
    order_acceptance_rate DECIMAL(5,2) DEFAULT 0 CHECK (order_acceptance_rate >= 0 AND order_acceptance_rate <= 100),
    price_competitiveness DECIMAL(5,2) DEFAULT 0 CHECK (price_competitiveness >= 0 AND price_competitiveness <= 100),
    
    -- Composite Intelligence Score (0-100)
    intelligence_score DECIMAL(5,2) DEFAULT 0 CHECK (intelligence_score >= 0 AND intelligence_score <= 100),
    
    -- Supporting Data
    total_orders INT DEFAULT 0,
    completed_orders INT DEFAULT 0,
    cancelled_orders INT DEFAULT 0,
    rejected_orders INT DEFAULT 0,
    
    total_responses INT DEFAULT 0,
    total_response_time_minutes DECIMAL(12,2) DEFAULT 0,
    
    -- Price Metrics
    average_price_deviation DECIMAL(8,2) DEFAULT 0, -- % deviation from market average
    competitive_products_count INT DEFAULT 0,
    total_products_count INT DEFAULT 0,
    
    -- Timestamps
    last_order_at TIMESTAMP,
    last_calculated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(vendor_id)
);

-- Create indexes for performance
CREATE INDEX idx_vendor_metrics_vendor_id ON vendor_metrics(vendor_id);
CREATE INDEX idx_vendor_metrics_intelligence_score ON vendor_metrics(intelligence_score DESC);
CREATE INDEX idx_vendor_metrics_delivery_success ON vendor_metrics(delivery_success_rate DESC);
CREATE INDEX idx_vendor_metrics_acceptance_rate ON vendor_metrics(order_acceptance_rate DESC);
CREATE INDEX idx_vendor_metrics_last_calculated ON vendor_metrics(last_calculated_at);

-- Create vendor_metric_history for trend analysis
CREATE TABLE IF NOT EXISTS vendor_metric_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
    
    -- Snapshot of metrics
    delivery_success_rate DECIMAL(5,2),
    average_response_time DECIMAL(8,2),
    order_acceptance_rate DECIMAL(5,2),
    price_competitiveness DECIMAL(5,2),
    intelligence_score DECIMAL(5,2),
    
    -- Context
    total_orders INT,
    period_start TIMESTAMP,
    period_end TIMESTAMP,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_vendor_metric_history_vendor_id ON vendor_metric_history(vendor_id);
CREATE INDEX idx_vendor_metric_history_created_at ON vendor_metric_history(created_at DESC);

-- Create vendor_score_events for audit trail
CREATE TABLE IF NOT EXISTS vendor_score_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
    order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
    
    event_type VARCHAR(50) NOT NULL, -- 'order_completed', 'order_cancelled', 'order_accepted', 'order_rejected'
    
    -- Score changes
    old_intelligence_score DECIMAL(5,2),
    new_intelligence_score DECIMAL(5,2),
    score_delta DECIMAL(6,2),
    
    -- Metric changes
    metrics_before JSONB,
    metrics_after JSONB,
    
    -- Context
    trigger_reason TEXT,
    calculation_method VARCHAR(50) DEFAULT 'standard', -- 'standard', 'ml', 'manual'
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_vendor_score_events_vendor_id ON vendor_score_events(vendor_id);
CREATE INDEX idx_vendor_score_events_order_id ON vendor_score_events(order_id);
CREATE INDEX idx_vendor_score_events_created_at ON vendor_score_events(created_at DESC);
CREATE INDEX idx_vendor_score_events_event_type ON vendor_score_events(event_type);

-- Function to automatically update vendor metrics after order completion
CREATE OR REPLACE FUNCTION update_vendor_metrics_on_order_complete()
RETURNS TRIGGER AS $$
BEGIN
    -- Only process if order status changed to COMPLETED or CANCELLED
    IF (NEW.status = 'COMPLETED' OR NEW.status = 'CANCELLED') 
       AND (OLD.status IS NULL OR OLD.status != NEW.status) 
       AND NEW.vendor_id IS NOT NULL THEN
        
        -- Trigger async metric recalculation
        -- This will be handled by the application layer
        PERFORM pg_notify('vendor_metrics_update', json_build_object(
            'vendor_id', NEW.vendor_id,
            'order_id', NEW.id,
            'status', NEW.status,
            'event_type', CASE 
                WHEN NEW.status = 'COMPLETED' THEN 'order_completed'
                WHEN NEW.status = 'CANCELLED' THEN 'order_cancelled'
            END
        )::text);
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for automatic metric updates
DROP TRIGGER IF EXISTS trigger_update_vendor_metrics ON orders;
CREATE TRIGGER trigger_update_vendor_metrics
    AFTER UPDATE ON orders
    FOR EACH ROW
    EXECUTE FUNCTION update_vendor_metrics_on_order_complete();

-- Function to calculate vendor intelligence score
CREATE OR REPLACE FUNCTION calculate_vendor_intelligence_score(
    p_vendor_id UUID
) RETURNS DECIMAL AS $$
DECLARE
    v_delivery_rate DECIMAL;
    v_acceptance_rate DECIMAL;
    v_response_score DECIMAL;
    v_price_score DECIMAL;
    v_intelligence_score DECIMAL;
BEGIN
    -- Get current metrics
    SELECT 
        delivery_success_rate,
        order_acceptance_rate,
        CASE 
            WHEN average_response_time <= 15 THEN 100
            WHEN average_response_time <= 30 THEN 90
            WHEN average_response_time <= 60 THEN 80
            WHEN average_response_time <= 120 THEN 70
            WHEN average_response_time <= 240 THEN 60
            ELSE 50
        END,
        price_competitiveness
    INTO v_delivery_rate, v_acceptance_rate, v_response_score, v_price_score
    FROM vendor_metrics
    WHERE vendor_id = p_vendor_id;
    
    -- Calculate weighted intelligence score
    -- Weights: delivery 35%, acceptance 25%, response 20%, price 20%
    v_intelligence_score := (
        COALESCE(v_delivery_rate, 0) * 0.35 +
        COALESCE(v_acceptance_rate, 0) * 0.25 +
        COALESCE(v_response_score, 0) * 0.20 +
        COALESCE(v_price_score, 0) * 0.20
    );
    
    RETURN ROUND(v_intelligence_score, 2);
END;
$$ LANGUAGE plpgsql;

-- Initialize metrics for existing vendors
INSERT INTO vendor_metrics (vendor_id, total_orders, completed_orders, cancelled_orders)
SELECT 
    v.id,
    COUNT(o.id),
    COUNT(CASE WHEN o.status = 'COMPLETED' THEN 1 END),
    COUNT(CASE WHEN o.status = 'CANCELLED' THEN 1 END)
FROM vendors v
LEFT JOIN orders o ON o.vendor_id = v.id
WHERE v.deleted_at IS NULL
GROUP BY v.id
ON CONFLICT (vendor_id) DO NOTHING;

-- Add comment
COMMENT ON TABLE vendor_metrics IS 'Real-time vendor intelligence metrics for dynamic scoring and routing';
COMMENT ON TABLE vendor_metric_history IS 'Historical snapshots of vendor metrics for trend analysis';
COMMENT ON TABLE vendor_score_events IS 'Audit trail of vendor score changes and events';
