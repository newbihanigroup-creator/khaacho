-- Migration: Self-Healing System
-- Automatically detects and recovers stuck orders

-- ============================================================================
-- HEALING ACTIONS LOG
-- ============================================================================

CREATE TABLE IF NOT EXISTS healing_actions (
  id SERIAL PRIMARY KEY,
  order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
  issue_type VARCHAR(50) NOT NULL, -- 'STUCK_PENDING', 'STUCK_CONFIRMED', 'STUCK_ACCEPTED', 'WORKFLOW_FAILED', 'VENDOR_TIMEOUT'
  issue_detected_at TIMESTAMP NOT NULL DEFAULT NOW(),
  
  -- Detection details
  stuck_duration_minutes INTEGER,
  last_status VARCHAR(50),
  last_status_change_at TIMESTAMP,
  detection_reason TEXT,
  
  -- Recovery action
  recovery_action VARCHAR(100) NOT NULL, -- 'REASSIGN_VENDOR', 'RETRY_WORKFLOW', 'CANCEL_ORDER', 'MANUAL_INTERVENTION'
  recovery_attempted_at TIMESTAMP NOT NULL DEFAULT NOW(),
  recovery_status VARCHAR(50) NOT NULL DEFAULT 'IN_PROGRESS', -- 'IN_PROGRESS', 'SUCCESS', 'FAILED'
  recovery_completed_at TIMESTAMP,
  
  -- Results
  new_status VARCHAR(50),
  new_vendor_id INTEGER REFERENCES vendors(id),
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  
  -- Admin notification
  admin_notified BOOLEAN DEFAULT FALSE,
  admin_notified_at TIMESTAMP,
  requires_manual_intervention BOOLEAN DEFAULT FALSE,
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_healing_actions_order ON healing_actions(order_id);
CREATE INDEX idx_healing_actions_status ON healing_actions(recovery_status);
CREATE INDEX idx_healing_actions_detected ON healing_actions(issue_detected_at);
CREATE INDEX idx_healing_actions_admin_notified ON healing_actions(admin_notified) WHERE admin_notified = FALSE;

-- ============================================================================
-- STUCK ORDER DETECTION VIEW
-- ============================================================================

CREATE OR REPLACE VIEW stuck_orders_view AS
SELECT 
  o.id,
  o.order_number,
  o.status,
  o.retailer_id,
  o.vendor_id,
  o.total,
  o.created_at,
  o.updated_at,
  EXTRACT(EPOCH FROM (NOW() - o.updated_at)) / 60 AS stuck_minutes,
  
  -- Determine issue type
  CASE 
    WHEN o.status = 'PENDING' AND EXTRACT(EPOCH FROM (NOW() - o.created_at)) / 60 > 30 THEN 'STUCK_PENDING'
    WHEN o.status = 'CONFIRMED' AND EXTRACT(EPOCH FROM (NOW() - o.updated_at)) / 60 > 60 THEN 'STUCK_CONFIRMED'
    WHEN o.status = 'ACCEPTED' AND EXTRACT(EPOCH FROM (NOW() - o.updated_at)) / 60 > 120 THEN 'STUCK_ACCEPTED'
    WHEN o.status = 'PROCESSING' AND EXTRACT(EPOCH FROM (NOW() - o.updated_at)) / 60 > 180 THEN 'STUCK_PROCESSING'
    ELSE 'UNKNOWN'
  END AS issue_type,
  
  -- Check if already being healed
  (SELECT COUNT(*) FROM healing_actions ha 
   WHERE ha.order_id = o.id 
   AND ha.recovery_status = 'IN_PROGRESS') AS active_healing_count,
   
  -- Check retry count
  (SELECT COUNT(*) FROM healing_actions ha 
   WHERE ha.order_id = o.id) AS total_healing_attempts

FROM orders o
WHERE 
  o.status IN ('PENDING', 'CONFIRMED', 'ACCEPTED', 'PROCESSING')
  AND (
    (o.status = 'PENDING' AND EXTRACT(EPOCH FROM (NOW() - o.created_at)) / 60 > 30)
    OR (o.status = 'CONFIRMED' AND EXTRACT(EPOCH FROM (NOW() - o.updated_at)) / 60 > 60)
    OR (o.status = 'ACCEPTED' AND EXTRACT(EPOCH FROM (NOW() - o.updated_at)) / 60 > 120)
    OR (o.status = 'PROCESSING' AND EXTRACT(EPOCH FROM (NOW() - o.updated_at)) / 60 > 180)
  );

-- ============================================================================
-- HEALING STATISTICS VIEW
-- ============================================================================

CREATE OR REPLACE VIEW healing_statistics_view AS
SELECT 
  DATE(issue_detected_at) AS date,
  issue_type,
  recovery_action,
  recovery_status,
  COUNT(*) AS total_cases,
  AVG(EXTRACT(EPOCH FROM (recovery_completed_at - recovery_attempted_at)) / 60) AS avg_recovery_time_minutes,
  SUM(CASE WHEN recovery_status = 'SUCCESS' THEN 1 ELSE 0 END) AS successful_recoveries,
  SUM(CASE WHEN recovery_status = 'FAILED' THEN 1 ELSE 0 END) AS failed_recoveries,
  SUM(CASE WHEN admin_notified = TRUE THEN 1 ELSE 0 END) AS admin_notifications_sent
FROM healing_actions
GROUP BY DATE(issue_detected_at), issue_type, recovery_action, recovery_status;

-- ============================================================================
-- FUNCTION: Detect and Log Stuck Orders
-- ============================================================================

CREATE OR REPLACE FUNCTION detect_stuck_orders()
RETURNS TABLE(
  order_id INTEGER,
  issue_type VARCHAR(50),
  stuck_minutes NUMERIC,
  recommended_action VARCHAR(100)
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    so.id,
    so.issue_type,
    so.stuck_minutes,
    CASE 
      WHEN so.issue_type = 'STUCK_PENDING' AND so.total_healing_attempts = 0 THEN 'REASSIGN_VENDOR'
      WHEN so.issue_type = 'STUCK_CONFIRMED' AND so.total_healing_attempts < 2 THEN 'RETRY_WORKFLOW'
      WHEN so.issue_type = 'STUCK_ACCEPTED' AND so.total_healing_attempts < 2 THEN 'REASSIGN_VENDOR'
      WHEN so.issue_type = 'STUCK_PROCESSING' AND so.total_healing_attempts < 2 THEN 'RETRY_WORKFLOW'
      WHEN so.total_healing_attempts >= 2 THEN 'MANUAL_INTERVENTION'
      ELSE 'RETRY_WORKFLOW'
    END AS recommended_action
  FROM stuck_orders_view so
  WHERE so.active_healing_count = 0; -- Only return orders not currently being healed
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- FUNCTION: Auto-heal Order
-- ============================================================================

CREATE OR REPLACE FUNCTION auto_heal_order(
  p_order_id INTEGER,
  p_issue_type VARCHAR(50),
  p_recovery_action VARCHAR(100)
)
RETURNS INTEGER AS $$
DECLARE
  v_healing_id INTEGER;
  v_order_status VARCHAR(50);
  v_stuck_minutes INTEGER;
BEGIN
  -- Get current order status
  SELECT status, EXTRACT(EPOCH FROM (NOW() - updated_at)) / 60
  INTO v_order_status, v_stuck_minutes
  FROM orders
  WHERE id = p_order_id;
  
  -- Create healing action record
  INSERT INTO healing_actions (
    order_id,
    issue_type,
    stuck_duration_minutes,
    last_status,
    last_status_change_at,
    detection_reason,
    recovery_action,
    recovery_status
  ) VALUES (
    p_order_id,
    p_issue_type,
    v_stuck_minutes,
    v_order_status,
    NOW(),
    'Automatic detection by self-healing system',
    p_recovery_action,
    'IN_PROGRESS'
  )
  RETURNING id INTO v_healing_id;
  
  RETURN v_healing_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- ADMIN NOTIFICATION QUEUE
-- ============================================================================

CREATE TABLE IF NOT EXISTS admin_notifications (
  id SERIAL PRIMARY KEY,
  notification_type VARCHAR(50) NOT NULL, -- 'HEALING_FAILED', 'MANUAL_INTERVENTION_REQUIRED', 'SYSTEM_ALERT'
  severity VARCHAR(20) NOT NULL DEFAULT 'MEDIUM', -- 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'
  
  -- Related entities
  order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
  healing_action_id INTEGER REFERENCES healing_actions(id) ON DELETE CASCADE,
  
  -- Notification content
  title VARCHAR(200) NOT NULL,
  message TEXT NOT NULL,
  details JSONB,
  
  -- Delivery
  sent BOOLEAN DEFAULT FALSE,
  sent_at TIMESTAMP,
  delivery_method VARCHAR(50), -- 'EMAIL', 'SMS', 'WHATSAPP', 'DASHBOARD'
  recipient VARCHAR(200),
  
  -- Acknowledgment
  acknowledged BOOLEAN DEFAULT FALSE,
  acknowledged_at TIMESTAMP,
  acknowledged_by INTEGER REFERENCES users(id),
  
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_admin_notifications_sent ON admin_notifications(sent) WHERE sent = FALSE;
CREATE INDEX idx_admin_notifications_severity ON admin_notifications(severity);
CREATE INDEX idx_admin_notifications_type ON admin_notifications(notification_type);

-- ============================================================================
-- HEALING METRICS
-- ============================================================================

CREATE TABLE IF NOT EXISTS healing_metrics (
  id SERIAL PRIMARY KEY,
  metric_date DATE NOT NULL DEFAULT CURRENT_DATE,
  
  -- Detection metrics
  total_stuck_orders_detected INTEGER DEFAULT 0,
  stuck_pending_count INTEGER DEFAULT 0,
  stuck_confirmed_count INTEGER DEFAULT 0,
  stuck_accepted_count INTEGER DEFAULT 0,
  stuck_processing_count INTEGER DEFAULT 0,
  
  -- Recovery metrics
  total_recovery_attempts INTEGER DEFAULT 0,
  successful_recoveries INTEGER DEFAULT 0,
  failed_recoveries INTEGER DEFAULT 0,
  avg_recovery_time_minutes NUMERIC(10,2),
  
  -- Action breakdown
  reassign_vendor_count INTEGER DEFAULT 0,
  retry_workflow_count INTEGER DEFAULT 0,
  cancel_order_count INTEGER DEFAULT 0,
  manual_intervention_count INTEGER DEFAULT 0,
  
  -- Admin notifications
  admin_notifications_sent INTEGER DEFAULT 0,
  
  -- System health
  healing_success_rate NUMERIC(5,2),
  avg_stuck_duration_minutes NUMERIC(10,2),
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  UNIQUE(metric_date)
);

CREATE INDEX idx_healing_metrics_date ON healing_metrics(metric_date DESC);

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE healing_actions IS 'Tracks all automatic healing actions performed on stuck orders';
COMMENT ON TABLE admin_notifications IS 'Queue for admin notifications when healing fails';
COMMENT ON TABLE healing_metrics IS 'Daily aggregated metrics for self-healing system performance';
COMMENT ON VIEW stuck_orders_view IS 'Real-time view of orders that are stuck and need healing';
COMMENT ON VIEW healing_statistics_view IS 'Historical statistics of healing actions';
COMMENT ON FUNCTION detect_stuck_orders() IS 'Detects stuck orders and recommends healing actions';
COMMENT ON FUNCTION auto_heal_order(INTEGER, VARCHAR, VARCHAR) IS 'Initiates automatic healing for a stuck order';
