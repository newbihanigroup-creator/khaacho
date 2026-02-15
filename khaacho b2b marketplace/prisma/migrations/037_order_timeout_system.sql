-- Migration: Order Processing Timeout System
-- Description: Automatic vendor reassignment when vendors don't respond in time

-- ============================================================================
-- ORDER TIMEOUT CONFIGURATION
-- ============================================================================

CREATE TABLE IF NOT EXISTS order_timeout_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Timeout settings
  vendor_response_timeout_minutes INTEGER NOT NULL DEFAULT 30,
  max_reassignment_attempts INTEGER NOT NULL DEFAULT 3,
  escalation_timeout_minutes INTEGER NOT NULL DEFAULT 60,
  
  -- Notification settings
  notify_admin_after_attempts INTEGER NOT NULL DEFAULT 2,
  notify_retailer_on_delay BOOLEAN DEFAULT TRUE,
  
  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  
  -- Timestamps
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Insert default configuration
INSERT INTO order_timeout_config (
  vendor_response_timeout_minutes,
  max_reassignment_attempts,
  escalation_timeout_minutes,
  notify_admin_after_attempts
) VALUES (30, 3, 60, 2)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- ORDER TIMEOUT TRACKING
-- ============================================================================

CREATE TABLE IF NOT EXISTS order_timeout_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Order identification
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  vendor_id UUID NOT NULL REFERENCES vendors(id),
  
  -- Timeout tracking
  assigned_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  timeout_at TIMESTAMP NOT NULL,
  responded_at TIMESTAMP,
  
  -- Status
  status VARCHAR(50) NOT NULL DEFAULT 'PENDING', -- PENDING, RESPONDED, TIMED_OUT, REASSIGNED
  timeout_reason VARCHAR(255),
  
  -- Reassignment tracking
  reassignment_attempt INTEGER NOT NULL DEFAULT 1,
  is_final_attempt BOOLEAN DEFAULT FALSE,
  next_vendor_id UUID REFERENCES vendors(id),
  
  -- Notifications
  admin_notified BOOLEAN DEFAULT FALSE,
  admin_notified_at TIMESTAMP,
  retailer_notified BOOLEAN DEFAULT FALSE,
  retailer_notified_at TIMESTAMP,
  
  -- Timestamps
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for timeout tracking
CREATE INDEX idx_order_timeout_tracking_order_id ON order_timeout_tracking(order_id);
CREATE INDEX idx_order_timeout_tracking_vendor_id ON order_timeout_tracking(vendor_id);
CREATE INDEX idx_order_timeout_tracking_status ON order_timeout_tracking(status);
CREATE INDEX idx_order_timeout_tracking_timeout_at ON order_timeout_tracking(timeout_at);
CREATE INDEX idx_order_timeout_tracking_pending ON order_timeout_tracking(status, timeout_at) 
  WHERE status = 'PENDING';

-- ============================================================================
-- ORDER DELAY LOG
-- ============================================================================

CREATE TABLE IF NOT EXISTS order_delay_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Order identification
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  order_number VARCHAR(50) NOT NULL,
  
  -- Delay details
  delay_type VARCHAR(50) NOT NULL, -- VENDOR_TIMEOUT, REASSIGNMENT, ESCALATION
  delay_reason TEXT NOT NULL,
  delay_duration_minutes INTEGER,
  
  -- Vendor information
  original_vendor_id UUID REFERENCES vendors(id),
  reassigned_vendor_id UUID REFERENCES vendors(id),
  reassignment_attempt INTEGER,
  
  -- Impact
  is_critical BOOLEAN DEFAULT FALSE,
  customer_impact VARCHAR(50), -- LOW, MEDIUM, HIGH, CRITICAL
  
  -- Resolution
  resolved BOOLEAN DEFAULT FALSE,
  resolved_at TIMESTAMP,
  resolution_notes TEXT,
  
  -- Timestamps
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for delay log
CREATE INDEX idx_order_delay_log_order_id ON order_delay_log(order_id);
CREATE INDEX idx_order_delay_log_order_number ON order_delay_log(order_number);
CREATE INDEX idx_order_delay_log_delay_type ON order_delay_log(delay_type);
CREATE INDEX idx_order_delay_log_created_at ON order_delay_log(created_at DESC);
CREATE INDEX idx_order_delay_log_unresolved ON order_delay_log(resolved) WHERE resolved = FALSE;
CREATE INDEX idx_order_delay_log_critical ON order_delay_log(is_critical) WHERE is_critical = TRUE;

-- ============================================================================
-- ADMIN NOTIFICATIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS admin_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Notification details
  notification_type VARCHAR(50) NOT NULL, -- ORDER_TIMEOUT, VENDOR_UNRESPONSIVE, ESCALATION
  priority VARCHAR(20) NOT NULL DEFAULT 'MEDIUM', -- LOW, MEDIUM, HIGH, URGENT
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  
  -- Related entities
  order_id UUID REFERENCES orders(id),
  vendor_id UUID REFERENCES vendors(id),
  retailer_id UUID REFERENCES retailers(id),
  
  -- Status
  status VARCHAR(50) NOT NULL DEFAULT 'UNREAD', -- UNREAD, READ, ACKNOWLEDGED, RESOLVED
  read_at TIMESTAMP,
  acknowledged_at TIMESTAMP,
  acknowledged_by VARCHAR(255),
  
  -- Action required
  requires_action BOOLEAN DEFAULT FALSE,
  action_taken TEXT,
  action_taken_at TIMESTAMP,
  action_taken_by VARCHAR(255),
  
  -- Metadata
  metadata JSONB,
  
  -- Timestamps
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for admin notifications
CREATE INDEX idx_admin_notifications_type ON admin_notifications(notification_type);
CREATE INDEX idx_admin_notifications_priority ON admin_notifications(priority);
CREATE INDEX idx_admin_notifications_status ON admin_notifications(status);
CREATE INDEX idx_admin_notifications_order_id ON admin_notifications(order_id);
CREATE INDEX idx_admin_notifications_created_at ON admin_notifications(created_at DESC);
CREATE INDEX idx_admin_notifications_unread ON admin_notifications(status) WHERE status = 'UNREAD';
CREATE INDEX idx_admin_notifications_requires_action ON admin_notifications(requires_action) 
  WHERE requires_action = TRUE;

-- ============================================================================
-- VENDOR TIMEOUT STATISTICS
-- ============================================================================

CREATE TABLE IF NOT EXISTS vendor_timeout_statistics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  
  -- Timeout metrics
  total_assignments INTEGER DEFAULT 0,
  total_timeouts INTEGER DEFAULT 0,
  total_responses INTEGER DEFAULT 0,
  timeout_rate DECIMAL(5,2) DEFAULT 0.00,
  
  -- Response time metrics
  avg_response_time_minutes INTEGER,
  min_response_time_minutes INTEGER,
  max_response_time_minutes INTEGER,
  
  -- Reassignment impact
  caused_reassignments INTEGER DEFAULT 0,
  caused_escalations INTEGER DEFAULT 0,
  
  -- Time windows
  last_7_days_timeouts INTEGER DEFAULT 0,
  last_30_days_timeouts INTEGER DEFAULT 0,
  
  -- Status
  is_flagged BOOLEAN DEFAULT FALSE,
  flag_reason TEXT,
  flagged_at TIMESTAMP,
  
  -- Timestamps
  last_calculated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  UNIQUE(vendor_id)
);

-- Index for vendor timeout statistics
CREATE INDEX idx_vendor_timeout_statistics_vendor_id ON vendor_timeout_statistics(vendor_id);
CREATE INDEX idx_vendor_timeout_statistics_timeout_rate ON vendor_timeout_statistics(timeout_rate DESC);
CREATE INDEX idx_vendor_timeout_statistics_flagged ON vendor_timeout_statistics(is_flagged) 
  WHERE is_flagged = TRUE;

-- ============================================================================
-- VIEWS FOR MONITORING
-- ============================================================================

-- Active timeouts view
CREATE OR REPLACE VIEW active_order_timeouts AS
SELECT
  ott.id,
  ott.order_id,
  o.order_number,
  ott.vendor_id,
  v.vendor_code,
  u.business_name as vendor_name,
  ott.assigned_at,
  ott.timeout_at,
  ott.reassignment_attempt,
  ott.is_final_attempt,
  EXTRACT(EPOCH FROM (ott.timeout_at - NOW())) / 60 as minutes_until_timeout,
  CASE 
    WHEN ott.timeout_at < NOW() THEN 'OVERDUE'
    WHEN ott.timeout_at < NOW() + INTERVAL '10 minutes' THEN 'URGENT'
    WHEN ott.timeout_at < NOW() + INTERVAL '30 minutes' THEN 'WARNING'
    ELSE 'NORMAL'
  END as urgency_level
FROM order_timeout_tracking ott
INNER JOIN orders o ON ott.order_id = o.id
INNER JOIN vendors v ON ott.vendor_id = v.id
INNER JOIN users u ON v.user_id = u.id
WHERE ott.status = 'PENDING'
ORDER BY ott.timeout_at ASC;

-- Timeout statistics view
CREATE OR REPLACE VIEW timeout_statistics_summary AS
SELECT
  DATE_TRUNC('day', created_at) as date,
  COUNT(*) as total_timeouts,
  COUNT(DISTINCT order_id) as affected_orders,
  COUNT(DISTINCT vendor_id) as affected_vendors,
  AVG(reassignment_attempt) as avg_reassignment_attempts,
  COUNT(*) FILTER (WHERE is_final_attempt = TRUE) as final_attempts,
  COUNT(*) FILTER (WHERE admin_notified = TRUE) as admin_notifications_sent
FROM order_timeout_tracking
WHERE status = 'TIMED_OUT'
  AND created_at >= NOW() - INTERVAL '30 days'
GROUP BY DATE_TRUNC('day', created_at)
ORDER BY date DESC;

-- Vendor timeout performance view
CREATE OR REPLACE VIEW vendor_timeout_performance AS
SELECT
  v.id as vendor_id,
  v.vendor_code,
  u.business_name as vendor_name,
  vts.total_assignments,
  vts.total_timeouts,
  vts.total_responses,
  vts.timeout_rate,
  vts.avg_response_time_minutes,
  vts.caused_reassignments,
  vts.last_7_days_timeouts,
  vts.last_30_days_timeouts,
  vts.is_flagged,
  vts.flag_reason,
  CASE
    WHEN vts.timeout_rate >= 50 THEN 'CRITICAL'
    WHEN vts.timeout_rate >= 30 THEN 'WARNING'
    WHEN vts.timeout_rate >= 15 THEN 'ATTENTION'
    ELSE 'GOOD'
  END as performance_status
FROM vendor_timeout_statistics vts
INNER JOIN vendors v ON vts.vendor_id = v.id
INNER JOIN users u ON v.user_id = u.id
ORDER BY vts.timeout_rate DESC;

-- Unresolved delays view
CREATE OR REPLACE VIEW unresolved_order_delays AS
SELECT
  odl.id,
  odl.order_id,
  odl.order_number,
  odl.delay_type,
  odl.delay_reason,
  odl.delay_duration_minutes,
  odl.reassignment_attempt,
  odl.is_critical,
  odl.customer_impact,
  odl.created_at,
  EXTRACT(EPOCH FROM (NOW() - odl.created_at)) / 60 as minutes_since_delay,
  o.status as current_order_status
FROM order_delay_log odl
INNER JOIN orders o ON odl.order_id = o.id
WHERE odl.resolved = FALSE
ORDER BY odl.is_critical DESC, odl.created_at ASC;

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Function to check for timed out orders
CREATE OR REPLACE FUNCTION check_timed_out_orders()
RETURNS TABLE(
  timeout_id UUID,
  order_id UUID,
  vendor_id UUID,
  reassignment_attempt INTEGER,
  is_final_attempt BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    ott.id,
    ott.order_id,
    ott.vendor_id,
    ott.reassignment_attempt,
    ott.is_final_attempt
  FROM order_timeout_tracking ott
  WHERE ott.status = 'PENDING'
    AND ott.timeout_at <= NOW()
  ORDER BY ott.timeout_at ASC;
END;
$$ LANGUAGE plpgsql;

-- Function to record timeout
CREATE OR REPLACE FUNCTION record_order_timeout(
  p_timeout_id UUID,
  p_timeout_reason VARCHAR(255)
) RETURNS VOID AS $$
BEGIN
  UPDATE order_timeout_tracking
  SET
    status = 'TIMED_OUT',
    timeout_reason = p_timeout_reason,
    updated_at = NOW()
  WHERE id = p_timeout_id;
END;
$$ LANGUAGE plpgsql;

-- Function to update vendor timeout statistics
CREATE OR REPLACE FUNCTION update_vendor_timeout_stats(
  p_vendor_id UUID
) RETURNS VOID AS $$
DECLARE
  v_total_assignments INTEGER;
  v_total_timeouts INTEGER;
  v_total_responses INTEGER;
  v_timeout_rate DECIMAL(5,2);
  v_avg_response_time INTEGER;
  v_last_7_days_timeouts INTEGER;
  v_last_30_days_timeouts INTEGER;
BEGIN
  -- Calculate metrics
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE status = 'TIMED_OUT'),
    COUNT(*) FILTER (WHERE status = 'RESPONDED'),
    COALESCE(AVG(EXTRACT(EPOCH FROM (responded_at - assigned_at)) / 60), 0)
  INTO
    v_total_assignments,
    v_total_timeouts,
    v_total_responses,
    v_avg_response_time
  FROM order_timeout_tracking
  WHERE vendor_id = p_vendor_id;
  
  -- Calculate timeout rate
  IF v_total_assignments > 0 THEN
    v_timeout_rate := (v_total_timeouts::DECIMAL / v_total_assignments) * 100;
  ELSE
    v_timeout_rate := 0;
  END IF;
  
  -- Calculate recent timeouts
  SELECT
    COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days'),
    COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days')
  INTO
    v_last_7_days_timeouts,
    v_last_30_days_timeouts
  FROM order_timeout_tracking
  WHERE vendor_id = p_vendor_id
    AND status = 'TIMED_OUT';
  
  -- Upsert statistics
  INSERT INTO vendor_timeout_statistics (
    vendor_id,
    total_assignments,
    total_timeouts,
    total_responses,
    timeout_rate,
    avg_response_time_minutes,
    last_7_days_timeouts,
    last_30_days_timeouts,
    last_calculated_at
  ) VALUES (
    p_vendor_id,
    v_total_assignments,
    v_total_timeouts,
    v_total_responses,
    v_timeout_rate,
    v_avg_response_time,
    v_last_7_days_timeouts,
    v_last_30_days_timeouts,
    NOW()
  )
  ON CONFLICT (vendor_id) DO UPDATE SET
    total_assignments = EXCLUDED.total_assignments,
    total_timeouts = EXCLUDED.total_timeouts,
    total_responses = EXCLUDED.total_responses,
    timeout_rate = EXCLUDED.timeout_rate,
    avg_response_time_minutes = EXCLUDED.avg_response_time_minutes,
    last_7_days_timeouts = EXCLUDED.last_7_days_timeouts,
    last_30_days_timeouts = EXCLUDED.last_30_days_timeouts,
    last_calculated_at = NOW(),
    updated_at = NOW();
    
  -- Flag vendor if timeout rate is high
  IF v_timeout_rate >= 30 AND v_total_assignments >= 10 THEN
    UPDATE vendor_timeout_statistics
    SET
      is_flagged = TRUE,
      flag_reason = 'High timeout rate: ' || v_timeout_rate || '%',
      flagged_at = NOW()
    WHERE vendor_id = p_vendor_id;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE order_timeout_config IS 'Configuration for order processing timeout system';
COMMENT ON TABLE order_timeout_tracking IS 'Tracks vendor response timeouts for orders';
COMMENT ON TABLE order_delay_log IS 'Logs all order delays and reassignments';
COMMENT ON TABLE admin_notifications IS 'Admin dashboard notifications for order issues';
COMMENT ON TABLE vendor_timeout_statistics IS 'Vendor timeout performance metrics';

COMMENT ON FUNCTION check_timed_out_orders IS 'Returns all orders that have timed out';
COMMENT ON FUNCTION record_order_timeout IS 'Records a timeout event for an order';
COMMENT ON FUNCTION update_vendor_timeout_stats IS 'Updates vendor timeout statistics';
