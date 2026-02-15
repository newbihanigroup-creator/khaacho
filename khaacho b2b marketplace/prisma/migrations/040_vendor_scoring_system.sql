-- Migration: Vendor Scoring System
-- Description: Dynamic vendor scoring based on performance metrics

-- ============================================================================
-- VENDOR SCORES (Current Scores)
-- ============================================================================

CREATE TABLE IF NOT EXISTS vendor_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Vendor reference
  vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  
  -- Overall score (0-100)
  overall_score DECIMAL(5,2) NOT NULL DEFAULT 50.00,
  
  -- Component scores (0-100 each)
  response_speed_score DECIMAL(5,2) NOT NULL DEFAULT 50.00,
  acceptance_rate_score DECIMAL(5,2) NOT NULL DEFAULT 50.00,
  price_competitiveness_score DECIMAL(5,2) NOT NULL DEFAULT 50.00,
  delivery_success_score DECIMAL(5,2) NOT NULL DEFAULT 50.00,
  cancellation_rate_score DECIMAL(5,2) NOT NULL DEFAULT 50.00,
  
  -- Score weights (must sum to 100)
  response_speed_weight DECIMAL(5,2) NOT NULL DEFAULT 25.00,
  acceptance_rate_weight DECIMAL(5,2) NOT NULL DEFAULT 20.00,
  price_competitiveness_weight DECIMAL(5,2) NOT NULL DEFAULT 20.00,
  delivery_success_weight DECIMAL(5,2) NOT NULL DEFAULT 25.00,
  cancellation_rate_weight DECIMAL(5,2) NOT NULL DEFAULT 10.00,
  
  -- Performance metrics (raw data)
  avg_response_time_minutes DECIMAL(10,2) DEFAULT 0,
  total_orders_assigned INTEGER DEFAULT 0,
  total_orders_accepted INTEGER DEFAULT 0,
  total_orders_rejected INTEGER DEFAULT 0,
  total_orders_delivered INTEGER DEFAULT 0,
  total_orders_cancelled INTEGER DEFAULT 0,
  total_orders_late INTEGER DEFAULT 0,
  
  -- Price metrics
  avg_price_vs_market DECIMAL(5,2) DEFAULT 0, -- Percentage vs market average
  
  -- Penalties
  late_response_penalties INTEGER DEFAULT 0,
  total_penalty_points DECIMAL(10,2) DEFAULT 0,
  
  -- Status
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_order_at TIMESTAMP,
  
  -- Timestamps
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  UNIQUE(vendor_id)
);

-- Indexes
CREATE INDEX idx_vendor_scores_vendor_id ON vendor_scores(vendor_id);
CREATE INDEX idx_vendor_scores_overall_score ON vendor_scores(overall_score DESC);
CREATE INDEX idx_vendor_scores_active ON vendor_scores(is_active) WHERE is_active = TRUE;
CREATE INDEX idx_vendor_scores_last_order ON vendor_scores(last_order_at DESC);

-- ============================================================================
-- VENDOR SCORE HISTORY (Historical Tracking)
-- ============================================================================

CREATE TABLE IF NOT EXISTS vendor_score_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Vendor reference
  vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  
  -- Scores at this point in time
  overall_score DECIMAL(5,2) NOT NULL,
  response_speed_score DECIMAL(5,2) NOT NULL,
  acceptance_rate_score DECIMAL(5,2) NOT NULL,
  price_competitiveness_score DECIMAL(5,2) NOT NULL,
  delivery_success_score DECIMAL(5,2) NOT NULL,
  cancellation_rate_score DECIMAL(5,2) NOT NULL,
  
  -- What triggered this update
  trigger_event VARCHAR(50) NOT NULL, -- ORDER_ACCEPTED, ORDER_DELIVERED, ORDER_CANCELLED, LATE_RESPONSE, etc.
  trigger_order_id UUID REFERENCES orders(id),
  
  -- Score change
  score_change DECIMAL(5,2) NOT NULL DEFAULT 0,
  previous_score DECIMAL(5,2),
  
  -- Metadata
  notes TEXT,
  
  -- Timestamp
  recorded_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX idx_vendor_score_history_vendor_id ON vendor_score_history(vendor_id);
CREATE INDEX idx_vendor_score_history_recorded_at ON vendor_score_history(recorded_at DESC);
CREATE INDEX idx_vendor_score_history_trigger_event ON vendor_score_history(trigger_event);
CREATE INDEX idx_vendor_score_history_order_id ON vendor_score_history(trigger_order_id);

-- ============================================================================
-- VENDOR RESPONSE TRACKING
-- ============================================================================

CREATE TABLE IF NOT EXISTS vendor_response_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Order and vendor
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  
  -- Response timing
  assigned_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  responded_at TIMESTAMP,
  response_time_minutes INTEGER,
  
  -- Response details
  response_type VARCHAR(50), -- ACCEPTED, REJECTED, TIMEOUT
  rejection_reason TEXT,
  
  -- Was response late?
  is_late_response BOOLEAN DEFAULT FALSE,
  expected_response_time_minutes INTEGER DEFAULT 30,
  
  -- Timestamps
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX idx_vendor_response_tracking_order_id ON vendor_response_tracking(order_id);
CREATE INDEX idx_vendor_response_tracking_vendor_id ON vendor_response_tracking(vendor_id);
CREATE INDEX idx_vendor_response_tracking_assigned_at ON vendor_response_tracking(assigned_at DESC);
CREATE INDEX idx_vendor_response_tracking_late ON vendor_response_tracking(is_late_response) 
  WHERE is_late_response = TRUE;

-- ============================================================================
-- VENDOR PRICE TRACKING
-- ============================================================================

CREATE TABLE IF NOT EXISTS vendor_price_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Product and vendor
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  
  -- Price data
  quoted_price DECIMAL(10,2) NOT NULL,
  market_avg_price DECIMAL(10,2),
  price_vs_market DECIMAL(5,2), -- Percentage difference
  
  -- Context
  order_id UUID REFERENCES orders(id),
  quantity INTEGER,
  
  -- Timestamp
  recorded_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX idx_vendor_price_tracking_product_id ON vendor_price_tracking(product_id);
CREATE INDEX idx_vendor_price_tracking_vendor_id ON vendor_price_tracking(vendor_id);
CREATE INDEX idx_vendor_price_tracking_recorded_at ON vendor_price_tracking(recorded_at DESC);

-- ============================================================================
-- VENDOR SCORING CONFIGURATION
-- ============================================================================

CREATE TABLE IF NOT EXISTS vendor_scoring_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Scoring parameters
  response_time_threshold_minutes INTEGER NOT NULL DEFAULT 30,
  late_response_penalty_points DECIMAL(5,2) NOT NULL DEFAULT 5.00,
  
  -- Acceptance rate thresholds
  excellent_acceptance_rate DECIMAL(5,2) NOT NULL DEFAULT 90.00,
  good_acceptance_rate DECIMAL(5,2) NOT NULL DEFAULT 75.00,
  poor_acceptance_rate DECIMAL(5,2) NOT NULL DEFAULT 50.00,
  
  -- Delivery success thresholds
  excellent_delivery_rate DECIMAL(5,2) NOT NULL DEFAULT 95.00,
  good_delivery_rate DECIMAL(5,2) NOT NULL DEFAULT 85.00,
  poor_delivery_rate DECIMAL(5,2) NOT NULL DEFAULT 70.00,
  
  -- Cancellation rate thresholds
  excellent_cancellation_rate DECIMAL(5,2) NOT NULL DEFAULT 2.00,
  acceptable_cancellation_rate DECIMAL(5,2) NOT NULL DEFAULT 5.00,
  poor_cancellation_rate DECIMAL(5,2) NOT NULL DEFAULT 10.00,
  
  -- Price competitiveness thresholds
  excellent_price_vs_market DECIMAL(5,2) NOT NULL DEFAULT -5.00, -- 5% below market
  good_price_vs_market DECIMAL(5,2) NOT NULL DEFAULT 0.00, -- At market
  poor_price_vs_market DECIMAL(5,2) NOT NULL DEFAULT 10.00, -- 10% above market
  
  -- Score decay
  enable_score_decay BOOLEAN NOT NULL DEFAULT TRUE,
  decay_rate_per_day DECIMAL(5,2) NOT NULL DEFAULT 0.10,
  min_score DECIMAL(5,2) NOT NULL DEFAULT 10.00,
  max_score DECIMAL(5,2) NOT NULL DEFAULT 100.00,
  
  -- Active configuration
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  
  -- Timestamps
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Insert default configuration
INSERT INTO vendor_scoring_config (is_active) VALUES (TRUE)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- VIEWS FOR MONITORING
-- ============================================================================

-- Top vendors by overall score
CREATE OR REPLACE VIEW top_vendors_by_score AS
SELECT
  v.id as vendor_id,
  u.business_name as vendor_name,
  vs.overall_score,
  vs.response_speed_score,
  vs.acceptance_rate_score,
  vs.price_competitiveness_score,
  vs.delivery_success_score,
  vs.cancellation_rate_score,
  vs.total_orders_assigned,
  vs.total_orders_accepted,
  vs.total_orders_delivered,
  vs.avg_response_time_minutes,
  vs.last_order_at,
  CASE
    WHEN vs.overall_score >= 90 THEN 'EXCELLENT'
    WHEN vs.overall_score >= 75 THEN 'GOOD'
    WHEN vs.overall_score >= 50 THEN 'AVERAGE'
    ELSE 'POOR'
  END as performance_tier
FROM vendor_scores vs
JOIN vendors v ON vs.vendor_id = v.id
JOIN users u ON v.user_id = u.id
WHERE vs.is_active = TRUE
ORDER BY vs.overall_score DESC;

-- Vendor score trends
CREATE OR REPLACE VIEW vendor_score_trends AS
SELECT
  vendor_id,
  DATE_TRUNC('day', recorded_at) as date,
  AVG(overall_score) as avg_score,
  MIN(overall_score) as min_score,
  MAX(overall_score) as max_score,
  COUNT(*) as score_updates,
  SUM(CASE WHEN score_change > 0 THEN 1 ELSE 0 END) as positive_changes,
  SUM(CASE WHEN score_change < 0 THEN 1 ELSE 0 END) as negative_changes
FROM vendor_score_history
WHERE recorded_at >= NOW() - INTERVAL '30 days'
GROUP BY vendor_id, DATE_TRUNC('day', recorded_at)
ORDER BY date DESC, avg_score DESC;

-- Vendor response performance
CREATE OR REPLACE VIEW vendor_response_performance AS
SELECT
  vendor_id,
  COUNT(*) as total_responses,
  AVG(response_time_minutes) as avg_response_time,
  MIN(response_time_minutes) as min_response_time,
  MAX(response_time_minutes) as max_response_time,
  COUNT(*) FILTER (WHERE is_late_response = TRUE) as late_responses,
  COUNT(*) FILTER (WHERE response_type = 'ACCEPTED') as accepted_count,
  COUNT(*) FILTER (WHERE response_type = 'REJECTED') as rejected_count,
  COUNT(*) FILTER (WHERE response_type = 'TIMEOUT') as timeout_count,
  ROUND(
    (COUNT(*) FILTER (WHERE response_type = 'ACCEPTED')::DECIMAL / 
     NULLIF(COUNT(*), 0) * 100), 2
  ) as acceptance_rate,
  ROUND(
    (COUNT(*) FILTER (WHERE is_late_response = TRUE)::DECIMAL / 
     NULLIF(COUNT(*), 0) * 100), 2
  ) as late_response_rate
FROM vendor_response_tracking
WHERE assigned_at >= NOW() - INTERVAL '30 days'
GROUP BY vendor_id;

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Initialize vendor score
CREATE OR REPLACE FUNCTION initialize_vendor_score(
  p_vendor_id UUID
) RETURNS VOID AS $$
BEGIN
  INSERT INTO vendor_scores (
    vendor_id,
    overall_score,
    response_speed_score,
    acceptance_rate_score,
    price_competitiveness_score,
    delivery_success_score,
    cancellation_rate_score
  ) VALUES (
    p_vendor_id,
    50.00, -- Start at neutral score
    50.00,
    50.00,
    50.00,
    50.00,
    50.00
  )
  ON CONFLICT (vendor_id) DO NOTHING;
END;
$$ LANGUAGE plpgsql;

-- Calculate overall score from component scores
CREATE OR REPLACE FUNCTION calculate_overall_score(
  p_vendor_id UUID
) RETURNS DECIMAL AS $$
DECLARE
  v_overall_score DECIMAL(5,2);
  v_scores RECORD;
BEGIN
  SELECT
    response_speed_score,
    acceptance_rate_score,
    price_competitiveness_score,
    delivery_success_score,
    cancellation_rate_score,
    response_speed_weight,
    acceptance_rate_weight,
    price_competitiveness_weight,
    delivery_success_weight,
    cancellation_rate_weight
  INTO v_scores
  FROM vendor_scores
  WHERE vendor_id = p_vendor_id;
  
  IF NOT FOUND THEN
    RETURN 50.00;
  END IF;
  
  -- Weighted average
  v_overall_score := (
    (v_scores.response_speed_score * v_scores.response_speed_weight / 100) +
    (v_scores.acceptance_rate_score * v_scores.acceptance_rate_weight / 100) +
    (v_scores.price_competitiveness_score * v_scores.price_competitiveness_weight / 100) +
    (v_scores.delivery_success_score * v_scores.delivery_success_weight / 100) +
    (v_scores.cancellation_rate_score * v_scores.cancellation_rate_weight / 100)
  );
  
  -- Clamp between 0 and 100
  v_overall_score := GREATEST(0, LEAST(100, v_overall_score));
  
  RETURN v_overall_score;
END;
$$ LANGUAGE plpgsql;

-- Update vendor score after event
CREATE OR REPLACE FUNCTION update_vendor_score(
  p_vendor_id UUID,
  p_trigger_event VARCHAR(50),
  p_order_id UUID DEFAULT NULL
) RETURNS VOID AS $$
DECLARE
  v_previous_score DECIMAL(5,2);
  v_new_score DECIMAL(5,2);
  v_score_change DECIMAL(5,2);
BEGIN
  -- Get current score
  SELECT overall_score INTO v_previous_score
  FROM vendor_scores
  WHERE vendor_id = p_vendor_id;
  
  -- Recalculate component scores based on metrics
  PERFORM recalculate_vendor_scores(p_vendor_id);
  
  -- Calculate new overall score
  v_new_score := calculate_overall_score(p_vendor_id);
  
  -- Update overall score
  UPDATE vendor_scores
  SET
    overall_score = v_new_score,
    updated_at = NOW()
  WHERE vendor_id = p_vendor_id;
  
  -- Calculate change
  v_score_change := v_new_score - COALESCE(v_previous_score, 50.00);
  
  -- Record in history
  INSERT INTO vendor_score_history (
    vendor_id,
    overall_score,
    response_speed_score,
    acceptance_rate_score,
    price_competitiveness_score,
    delivery_success_score,
    cancellation_rate_score,
    trigger_event,
    trigger_order_id,
    score_change,
    previous_score
  )
  SELECT
    vendor_id,
    overall_score,
    response_speed_score,
    acceptance_rate_score,
    price_competitiveness_score,
    delivery_success_score,
    cancellation_rate_score,
    p_trigger_event,
    p_order_id,
    v_score_change,
    v_previous_score
  FROM vendor_scores
  WHERE vendor_id = p_vendor_id;
END;
$$ LANGUAGE plpgsql;

-- Recalculate all component scores
CREATE OR REPLACE FUNCTION recalculate_vendor_scores(
  p_vendor_id UUID
) RETURNS VOID AS $$
DECLARE
  v_config RECORD;
  v_metrics RECORD;
  v_response_score DECIMAL(5,2);
  v_acceptance_score DECIMAL(5,2);
  v_price_score DECIMAL(5,2);
  v_delivery_score DECIMAL(5,2);
  v_cancellation_score DECIMAL(5,2);
BEGIN
  -- Get configuration
  SELECT * INTO v_config
  FROM vendor_scoring_config
  WHERE is_active = TRUE
  ORDER BY created_at DESC
  LIMIT 1;
  
  -- Get current metrics
  SELECT
    avg_response_time_minutes,
    total_orders_assigned,
    total_orders_accepted,
    total_orders_rejected,
    total_orders_delivered,
    total_orders_cancelled,
    avg_price_vs_market
  INTO v_metrics
  FROM vendor_scores
  WHERE vendor_id = p_vendor_id;
  
  -- Calculate response speed score (lower time = higher score)
  IF v_metrics.avg_response_time_minutes IS NULL OR v_metrics.avg_response_time_minutes = 0 THEN
    v_response_score := 50.00;
  ELSIF v_metrics.avg_response_time_minutes <= 10 THEN
    v_response_score := 100.00;
  ELSIF v_metrics.avg_response_time_minutes <= v_config.response_time_threshold_minutes THEN
    v_response_score := 100.00 - ((v_metrics.avg_response_time_minutes - 10) * 2);
  ELSE
    v_response_score := GREATEST(0, 60.00 - ((v_metrics.avg_response_time_minutes - v_config.response_time_threshold_minutes) * 1.5));
  END IF;
  
  -- Calculate acceptance rate score
  IF v_metrics.total_orders_assigned = 0 THEN
    v_acceptance_score := 50.00;
  ELSE
    DECLARE
      v_acceptance_rate DECIMAL(5,2);
    BEGIN
      v_acceptance_rate := (v_metrics.total_orders_accepted::DECIMAL / v_metrics.total_orders_assigned * 100);
      
      IF v_acceptance_rate >= v_config.excellent_acceptance_rate THEN
        v_acceptance_score := 100.00;
      ELSIF v_acceptance_rate >= v_config.good_acceptance_rate THEN
        v_acceptance_score := 75.00 + ((v_acceptance_rate - v_config.good_acceptance_rate) / 
          (v_config.excellent_acceptance_rate - v_config.good_acceptance_rate) * 25);
      ELSIF v_acceptance_rate >= v_config.poor_acceptance_rate THEN
        v_acceptance_score := 50.00 + ((v_acceptance_rate - v_config.poor_acceptance_rate) / 
          (v_config.good_acceptance_rate - v_config.poor_acceptance_rate) * 25);
      ELSE
        v_acceptance_score := (v_acceptance_rate / v_config.poor_acceptance_rate * 50);
      END IF;
    END;
  END IF;
  
  -- Calculate price competitiveness score (lower price = higher score)
  IF v_metrics.avg_price_vs_market IS NULL THEN
    v_price_score := 50.00;
  ELSIF v_metrics.avg_price_vs_market <= v_config.excellent_price_vs_market THEN
    v_price_score := 100.00;
  ELSIF v_metrics.avg_price_vs_market <= v_config.good_price_vs_market THEN
    v_price_score := 75.00 + ((v_config.good_price_vs_market - v_metrics.avg_price_vs_market) / 
      (v_config.good_price_vs_market - v_config.excellent_price_vs_market) * 25);
  ELSIF v_metrics.avg_price_vs_market <= v_config.poor_price_vs_market THEN
    v_price_score := 50.00 + ((v_config.poor_price_vs_market - v_metrics.avg_price_vs_market) / 
      (v_config.poor_price_vs_market - v_config.good_price_vs_market) * 25);
  ELSE
    v_price_score := GREATEST(0, 50.00 - ((v_metrics.avg_price_vs_market - v_config.poor_price_vs_market) * 2));
  END IF;
  
  -- Calculate delivery success score
  IF v_metrics.total_orders_accepted = 0 THEN
    v_delivery_score := 50.00;
  ELSE
    DECLARE
      v_delivery_rate DECIMAL(5,2);
    BEGIN
      v_delivery_rate := (v_metrics.total_orders_delivered::DECIMAL / v_metrics.total_orders_accepted * 100);
      
      IF v_delivery_rate >= v_config.excellent_delivery_rate THEN
        v_delivery_score := 100.00;
      ELSIF v_delivery_rate >= v_config.good_delivery_rate THEN
        v_delivery_score := 75.00 + ((v_delivery_rate - v_config.good_delivery_rate) / 
          (v_config.excellent_delivery_rate - v_config.good_delivery_rate) * 25);
      ELSIF v_delivery_rate >= v_config.poor_delivery_rate THEN
        v_delivery_score := 50.00 + ((v_delivery_rate - v_config.poor_delivery_rate) / 
          (v_config.good_delivery_rate - v_config.poor_delivery_rate) * 25);
      ELSE
        v_delivery_score := (v_delivery_rate / v_config.poor_delivery_rate * 50);
      END IF;
    END;
  END IF;
  
  -- Calculate cancellation rate score (lower cancellation = higher score)
  IF v_metrics.total_orders_accepted = 0 THEN
    v_cancellation_score := 50.00;
  ELSE
    DECLARE
      v_cancellation_rate DECIMAL(5,2);
    BEGIN
      v_cancellation_rate := (v_metrics.total_orders_cancelled::DECIMAL / v_metrics.total_orders_accepted * 100);
      
      IF v_cancellation_rate <= v_config.excellent_cancellation_rate THEN
        v_cancellation_score := 100.00;
      ELSIF v_cancellation_rate <= v_config.acceptable_cancellation_rate THEN
        v_cancellation_score := 75.00 + ((v_config.acceptable_cancellation_rate - v_cancellation_rate) / 
          (v_config.acceptable_cancellation_rate - v_config.excellent_cancellation_rate) * 25);
      ELSIF v_cancellation_rate <= v_config.poor_cancellation_rate THEN
        v_cancellation_score := 50.00 + ((v_config.poor_cancellation_rate - v_cancellation_rate) / 
          (v_config.poor_cancellation_rate - v_config.acceptable_cancellation_rate) * 25);
      ELSE
        v_cancellation_score := GREATEST(0, 50.00 - ((v_cancellation_rate - v_config.poor_cancellation_rate) * 5));
      END IF;
    END;
  END IF;
  
  -- Update component scores
  UPDATE vendor_scores
  SET
    response_speed_score = v_response_score,
    acceptance_rate_score = v_acceptance_score,
    price_competitiveness_score = v_price_score,
    delivery_success_score = v_delivery_score,
    cancellation_rate_score = v_cancellation_score,
    updated_at = NOW()
  WHERE vendor_id = p_vendor_id;
END;
$$ LANGUAGE plpgsql;

-- Get best vendors for product
CREATE OR REPLACE FUNCTION get_best_vendors_for_product(
  p_product_id UUID,
  p_limit INTEGER DEFAULT 5
) RETURNS TABLE(
  vendor_id UUID,
  vendor_name VARCHAR,
  overall_score DECIMAL,
  avg_price DECIMAL,
  avg_response_time INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    v.id,
    u.business_name,
    vs.overall_score,
    COALESCE(vi.price, 0) as avg_price,
    vs.avg_response_time_minutes::INTEGER
  FROM vendor_scores vs
  JOIN vendors v ON vs.vendor_id = v.id
  JOIN users u ON v.user_id = u.id
  LEFT JOIN vendor_inventory vi ON vi.vendor_id = v.id AND vi.product_id = p_product_id
  WHERE vs.is_active = TRUE
    AND vi.in_stock = TRUE
  ORDER BY vs.overall_score DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE vendor_scores IS 'Current vendor performance scores';
COMMENT ON TABLE vendor_score_history IS 'Historical tracking of vendor score changes';
COMMENT ON TABLE vendor_response_tracking IS 'Tracks vendor response times and acceptance';
COMMENT ON TABLE vendor_price_tracking IS 'Tracks vendor pricing vs market';
COMMENT ON TABLE vendor_scoring_config IS 'Configuration for scoring algorithm';

COMMENT ON FUNCTION initialize_vendor_score IS 'Initialize score for new vendor';
COMMENT ON FUNCTION calculate_overall_score IS 'Calculate weighted overall score';
COMMENT ON FUNCTION update_vendor_score IS 'Update vendor score after event';
COMMENT ON FUNCTION recalculate_vendor_scores IS 'Recalculate all component scores';
COMMENT ON FUNCTION get_best_vendors_for_product IS 'Get top vendors for a product';
