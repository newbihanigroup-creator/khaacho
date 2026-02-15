-- Migration: Enhanced Credit Scoring System
-- Description: Add automatic credit limit adjustments and order restrictions based on credit scores
-- Date: 2026-02-14

-- Add credit score columns to retailers table if not exists
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='retailers' AND column_name='credit_score') THEN
        ALTER TABLE retailers ADD COLUMN credit_score INTEGER DEFAULT 500 CHECK (credit_score >= 300 AND credit_score <= 900);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='retailers' AND column_name='last_score_calculation') THEN
        ALTER TABLE retailers ADD COLUMN last_score_calculation TIMESTAMP;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='retailers' AND column_name='score_trend') THEN
        ALTER TABLE retailers ADD COLUMN score_trend VARCHAR(20) DEFAULT 'stable';
    END IF;
END $$;

-- Create credit limit adjustment history table
CREATE TABLE IF NOT EXISTS credit_limit_adjustments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    retailer_id UUID NOT NULL REFERENCES retailers(id),
    
    -- Adjustment details
    previous_limit DECIMAL(15,2) NOT NULL,
    new_limit DECIMAL(15,2) NOT NULL,
    adjustment_amount DECIMAL(15,2) NOT NULL,
    adjustment_percentage DECIMAL(5,2) NOT NULL,
    
    -- Reason for adjustment
    adjustment_type VARCHAR(50) NOT NULL, -- 'AUTOMATIC_INCREASE', 'AUTOMATIC_DECREASE', 'MANUAL', 'SCORE_BASED'
    trigger_reason TEXT NOT NULL,
    credit_score_at_adjustment INTEGER,
    
    -- Approval
    is_automatic BOOLEAN DEFAULT true,
    approved_by UUID REFERENCES users(id),
    approved_at TIMESTAMP,
    
    -- Metadata
    metadata JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_credit_limit_adjustments_retailer ON credit_limit_adjustments(retailer_id, created_at DESC);
CREATE INDEX idx_credit_limit_adjustments_type ON credit_limit_adjustments(adjustment_type);
CREATE INDEX idx_credit_limit_adjustments_date ON credit_limit_adjustments(created_at DESC);

-- Create order restrictions log table
CREATE TABLE IF NOT EXISTS order_restrictions_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    retailer_id UUID NOT NULL REFERENCES retailers(id),
    order_id UUID REFERENCES orders(id),
    
    -- Restriction details
    restriction_type VARCHAR(50) NOT NULL, -- 'LOW_CREDIT_SCORE', 'CREDIT_LIMIT_EXCEEDED', 'PAYMENT_OVERDUE', 'HIGH_RISK'
    credit_score INTEGER,
    order_amount DECIMAL(15,2),
    available_credit DECIMAL(15,2),
    
    -- Decision
    was_blocked BOOLEAN NOT NULL,
    block_reason TEXT,
    override_by UUID REFERENCES users(id),
    override_reason TEXT,
    
    -- Metadata
    metadata JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_order_restrictions_retailer ON order_restrictions_log(retailer_id, created_at DESC);
CREATE INDEX idx_order_restrictions_order ON order_restrictions_log(order_id);
CREATE INDEX idx_order_restrictions_type ON order_restrictions_log(restriction_type);
CREATE INDEX idx_order_restrictions_blocked ON order_restrictions_log(was_blocked, created_at DESC);

-- Create credit score thresholds configuration table
CREATE TABLE IF NOT EXISTS credit_score_thresholds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Score ranges
    threshold_name VARCHAR(50) UNIQUE NOT NULL, -- 'EXCELLENT', 'GOOD', 'FAIR', 'POOR', 'VERY_POOR'
    min_score INTEGER NOT NULL,
    max_score INTEGER NOT NULL,
    
    -- Order restrictions
    max_order_amount DECIMAL(15,2), -- NULL = no limit
    requires_approval BOOLEAN DEFAULT false,
    allow_credit_orders BOOLEAN DEFAULT true,
    
    -- Credit limit adjustments
    auto_increase_enabled BOOLEAN DEFAULT false,
    auto_increase_percentage DECIMAL(5,2), -- e.g., 10.00 for 10%
    auto_increase_max_limit DECIMAL(15,2), -- Maximum limit after auto-increase
    
    auto_decrease_enabled BOOLEAN DEFAULT false,
    auto_decrease_percentage DECIMAL(5,2),
    
    -- Metadata
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert default thresholds
INSERT INTO credit_score_thresholds (threshold_name, min_score, max_score, max_order_amount, requires_approval, allow_credit_orders, auto_increase_enabled, auto_increase_percentage, auto_increase_max_limit, description) VALUES
('EXCELLENT', 750, 900, NULL, false, true, true, 20.00, 1000000.00, 'Excellent credit - eligible for automatic credit limit increases'),
('GOOD', 650, 749, NULL, false, true, true, 10.00, 500000.00, 'Good credit - eligible for moderate credit limit increases'),
('FAIR', 550, 649, 100000.00, false, true, false, NULL, NULL, 'Fair credit - limited order amounts'),
('POOR', 450, 549, 50000.00, true, true, true, -10.00, NULL, 'Poor credit - requires approval for large orders, may face credit limit reduction'),
('VERY_POOR', 300, 449, 25000.00, true, false, true, -20.00, NULL, 'Very poor credit - cash only, automatic credit limit reduction')
ON CONFLICT (threshold_name) DO NOTHING;

-- Create view for retailer credit score summary
CREATE OR REPLACE VIEW retailer_credit_score_summary AS
SELECT 
    r.id as retailer_id,
    r.retailer_code,
    u.business_name,
    u.city,
    u.state,
    
    -- Credit score
    r.credit_score,
    r.last_score_calculation,
    r.score_trend,
    
    -- Credit limits
    r.credit_limit,
    r.outstanding_debt,
    r.credit_available,
    CASE 
        WHEN r.credit_limit > 0 THEN ROUND((r.outstanding_debt / r.credit_limit * 100)::numeric, 2)
        ELSE 0
    END as credit_utilization_percent,
    
    -- Score category
    t.threshold_name as score_category,
    t.max_order_amount,
    t.requires_approval,
    t.allow_credit_orders,
    t.auto_increase_enabled,
    t.auto_increase_percentage,
    
    -- Recent activity
    (SELECT COUNT(*) FROM orders o 
     WHERE o.retailer_id = r.id 
     AND o.status IN ('DELIVERED', 'COMPLETED')
     AND o.created_at >= CURRENT_DATE - INTERVAL '30 days') as orders_last_30_days,
    
    (SELECT COUNT(*) FROM orders o 
     WHERE o.retailer_id = r.id 
     AND o.status = 'CANCELLED'
     AND o.created_at >= CURRENT_DATE - INTERVAL '30 days') as cancellations_last_30_days,
    
    -- Payment behavior
    r.last_payment_date,
    CASE 
        WHEN r.last_payment_date IS NOT NULL 
        THEN EXTRACT(DAY FROM CURRENT_TIMESTAMP - r.last_payment_date)::INTEGER
        ELSE NULL
    END as days_since_last_payment,
    
    -- Risk indicators
    r.credit_status,
    r.blocked_at,
    r.blocked_reason,
    
    CURRENT_TIMESTAMP as calculated_at
    
FROM retailers r
INNER JOIN users u ON r.user_id = u.id
LEFT JOIN credit_score_thresholds t ON r.credit_score >= t.min_score AND r.credit_score <= t.max_score AND t.is_active = true
WHERE r.deleted_at IS NULL;

-- Create function to check if order should be restricted
CREATE OR REPLACE FUNCTION check_order_restriction(
    p_retailer_id UUID,
    p_order_amount DECIMAL
) RETURNS TABLE (
    can_order BOOLEAN,
    restriction_type VARCHAR,
    reason TEXT,
    requires_approval BOOLEAN,
    credit_score INTEGER,
    score_category VARCHAR
) AS $$
DECLARE
    v_retailer RECORD;
    v_threshold RECORD;
BEGIN
    -- Get retailer details
    SELECT 
        r.credit_score,
        r.credit_limit,
        r.outstanding_debt,
        r.credit_available,
        r.credit_status,
        r.blocked_at,
        t.threshold_name,
        t.max_order_amount,
        t.requires_approval,
        t.allow_credit_orders
    INTO v_retailer
    FROM retailers r
    LEFT JOIN credit_score_thresholds t ON r.credit_score >= t.min_score AND r.credit_score <= t.max_score AND t.is_active = true
    WHERE r.id = p_retailer_id;
    
    -- Check if retailer exists
    IF NOT FOUND THEN
        RETURN QUERY SELECT false, 'RETAILER_NOT_FOUND'::VARCHAR, 'Retailer not found'::TEXT, false, 0, ''::VARCHAR;
        RETURN;
    END IF;
    
    -- Check if blocked
    IF v_retailer.credit_status = 'BLOCKED' THEN
        RETURN QUERY SELECT false, 'ACCOUNT_BLOCKED'::VARCHAR, 'Account is blocked'::TEXT, false, v_retailer.credit_score, v_retailer.threshold_name;
        RETURN;
    END IF;
    
    -- Check credit score threshold
    IF v_retailer.max_order_amount IS NOT NULL AND p_order_amount > v_retailer.max_order_amount THEN
        RETURN QUERY SELECT 
            false, 
            'ORDER_AMOUNT_EXCEEDS_LIMIT'::VARCHAR, 
            format('Order amount Rs.%s exceeds maximum allowed Rs.%s for credit score %s', p_order_amount, v_retailer.max_order_amount, v_retailer.credit_score)::TEXT,
            v_retailer.requires_approval,
            v_retailer.credit_score,
            v_retailer.threshold_name;
        RETURN;
    END IF;
    
    -- Check if credit orders allowed
    IF NOT v_retailer.allow_credit_orders THEN
        RETURN QUERY SELECT 
            false, 
            'CREDIT_NOT_ALLOWED'::VARCHAR, 
            format('Credit orders not allowed for credit score %s. Cash payment required.', v_retailer.credit_score)::TEXT,
            false,
            v_retailer.credit_score,
            v_retailer.threshold_name;
        RETURN;
    END IF;
    
    -- Check credit limit
    IF p_order_amount > v_retailer.credit_available THEN
        RETURN QUERY SELECT 
            false, 
            'CREDIT_LIMIT_EXCEEDED'::VARCHAR, 
            format('Insufficient credit. Available: Rs.%s, Required: Rs.%s', v_retailer.credit_available, p_order_amount)::TEXT,
            v_retailer.requires_approval,
            v_retailer.credit_score,
            v_retailer.threshold_name;
        RETURN;
    END IF;
    
    -- All checks passed
    RETURN QUERY SELECT 
        true, 
        'APPROVED'::VARCHAR, 
        'Order approved'::TEXT,
        v_retailer.requires_approval,
        v_retailer.credit_score,
        v_retailer.threshold_name;
END;
$$ LANGUAGE plpgsql;

-- Create function to calculate recommended credit limit adjustment
CREATE OR REPLACE FUNCTION calculate_credit_limit_adjustment(
    p_retailer_id UUID
) RETURNS TABLE (
    should_adjust BOOLEAN,
    adjustment_type VARCHAR,
    current_limit DECIMAL,
    recommended_limit DECIMAL,
    adjustment_amount DECIMAL,
    adjustment_percentage DECIMAL,
    reason TEXT,
    credit_score INTEGER
) AS $$
DECLARE
    v_retailer RECORD;
    v_threshold RECORD;
    v_new_limit DECIMAL;
    v_adjustment DECIMAL;
BEGIN
    -- Get retailer and threshold details
    SELECT 
        r.credit_score,
        r.credit_limit,
        r.outstanding_debt,
        r.score_trend,
        r.last_score_calculation,
        t.threshold_name,
        t.auto_increase_enabled,
        t.auto_increase_percentage,
        t.auto_increase_max_limit,
        t.auto_decrease_enabled,
        t.auto_decrease_percentage
    INTO v_retailer
    FROM retailers r
    LEFT JOIN credit_score_thresholds t ON r.credit_score >= t.min_score AND r.credit_score <= t.max_score AND t.is_active = true
    WHERE r.id = p_retailer_id;
    
    IF NOT FOUND THEN
        RETURN;
    END IF;
    
    -- Check for automatic increase
    IF v_retailer.auto_increase_enabled AND v_retailer.auto_increase_percentage IS NOT NULL THEN
        v_adjustment := v_retailer.credit_limit * (v_retailer.auto_increase_percentage / 100);
        v_new_limit := v_retailer.credit_limit + v_adjustment;
        
        -- Cap at maximum limit
        IF v_retailer.auto_increase_max_limit IS NOT NULL AND v_new_limit > v_retailer.auto_increase_max_limit THEN
            v_new_limit := v_retailer.auto_increase_max_limit;
            v_adjustment := v_new_limit - v_retailer.credit_limit;
        END IF;
        
        -- Only recommend if there's an actual increase
        IF v_new_limit > v_retailer.credit_limit THEN
            RETURN QUERY SELECT 
                true,
                'AUTOMATIC_INCREASE'::VARCHAR,
                v_retailer.credit_limit,
                v_new_limit,
                v_adjustment,
                v_retailer.auto_increase_percentage,
                format('Credit score %s (%s) qualifies for automatic %s%% increase', 
                       v_retailer.credit_score, v_retailer.threshold_name, v_retailer.auto_increase_percentage)::TEXT,
                v_retailer.credit_score;
            RETURN;
        END IF;
    END IF;
    
    -- Check for automatic decrease
    IF v_retailer.auto_decrease_enabled AND v_retailer.auto_decrease_percentage IS NOT NULL THEN
        v_adjustment := v_retailer.credit_limit * (ABS(v_retailer.auto_decrease_percentage) / 100);
        v_new_limit := GREATEST(v_retailer.credit_limit - v_adjustment, v_retailer.outstanding_debt * 1.2); -- Keep at least 20% buffer above debt
        
        IF v_new_limit < v_retailer.credit_limit THEN
            RETURN QUERY SELECT 
                true,
                'AUTOMATIC_DECREASE'::VARCHAR,
                v_retailer.credit_limit,
                v_new_limit,
                -(v_retailer.credit_limit - v_new_limit),
                v_retailer.auto_decrease_percentage,
                format('Credit score %s (%s) requires %s%% decrease', 
                       v_retailer.credit_score, v_retailer.threshold_name, ABS(v_retailer.auto_decrease_percentage))::TEXT,
                v_retailer.credit_score;
            RETURN;
        END IF;
    END IF;
    
    -- No adjustment needed
    RETURN QUERY SELECT 
        false,
        'NO_ADJUSTMENT'::VARCHAR,
        v_retailer.credit_limit,
        v_retailer.credit_limit,
        0::DECIMAL,
        0::DECIMAL,
        'No adjustment needed'::TEXT,
        v_retailer.credit_score;
END;
$$ LANGUAGE plpgsql;

-- Add comments
COMMENT ON TABLE credit_limit_adjustments IS 'History of all credit limit adjustments (automatic and manual)';
COMMENT ON TABLE order_restrictions_log IS 'Log of all order restriction checks and decisions';
COMMENT ON TABLE credit_score_thresholds IS 'Configuration for credit score-based restrictions and automatic adjustments';
COMMENT ON VIEW retailer_credit_score_summary IS 'Comprehensive view of retailer credit scores and restrictions';
COMMENT ON FUNCTION check_order_restriction IS 'Check if an order should be restricted based on credit score and limits';
COMMENT ON FUNCTION calculate_credit_limit_adjustment IS 'Calculate recommended credit limit adjustment based on credit score';

