-- Migration: Safe Mode System
-- Description: Admin-controlled safe mode to pause new orders during high load or maintenance

-- ============================================================================
-- SAFE MODE CONFIGURATION
-- ============================================================================

CREATE TABLE IF NOT EXISTS safe_mode_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Safe mode status
  is_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  
  -- Activation details
  enabled_at TIMESTAMP,
  enabled_by VARCHAR(255),
  enabled_reason TEXT,
  
  -- Deactivation details
  disabled_at TIMESTAMP,
  disabled_by VARCHAR(255),
  
  -- Auto-disable settings
  auto_disable_after_minutes INTEGER,
  auto_disable_at TIMESTAMP,
  
  -- Custom message
  custom_message TEXT,
  
  -- Timestamps
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Insert default configuration
INSERT INTO safe_mode_config (is_enabled) VALUES (FALSE)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- SAFE MODE HISTORY
-- ============================================================================

CREATE TABLE IF NOT EXISTS safe_mode_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Action details
  action VARCHAR(20) NOT NULL, -- ENABLED, DISABLED, AUTO_DISABLED
  reason TEXT,
  
  -- User details
  triggered_by VARCHAR(255),
  triggered_by_ip VARCHAR(50),
  
  -- Duration (for DISABLED action)
  duration_minutes INTEGER,
  
  -- Impact metrics
  orders_paused INTEGER DEFAULT 0,
  orders_queued INTEGER DEFAULT 0,
  whatsapp_messages_sent INTEGER DEFAULT 0,
  
  -- Timestamps
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Index for history
CREATE INDEX idx_safe_mode_history_action ON safe_mode_history(action);
CREATE INDEX idx_safe_mode_history_created_at ON safe_mode_history(created_at DESC);

-- ============================================================================
-- QUEUED ORDERS (During Safe Mode)
-- ============================================================================

CREATE TABLE IF NOT EXISTS safe_mode_queued_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Order identification
  retailer_id UUID NOT NULL REFERENCES retailers(id),
  phone_number VARCHAR(50) NOT NULL,
  
  -- Order data
  order_text TEXT NOT NULL,
  order_data JSONB,
  
  -- Source
  source VARCHAR(50) NOT NULL DEFAULT 'whatsapp', -- whatsapp, api, upload
  message_id VARCHAR(255),
  
  -- Status
  status VARCHAR(50) NOT NULL DEFAULT 'QUEUED', -- QUEUED, PROCESSING, COMPLETED, FAILED
  processed_at TIMESTAMP,
  order_id UUID REFERENCES orders(id),
  
  -- Error tracking
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  
  -- Timestamps
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for queued orders
CREATE INDEX idx_safe_mode_queued_orders_retailer_id ON safe_mode_queued_orders(retailer_id);
CREATE INDEX idx_safe_mode_queued_orders_phone_number ON safe_mode_queued_orders(phone_number);
CREATE INDEX idx_safe_mode_queued_orders_status ON safe_mode_queued_orders(status);
CREATE INDEX idx_safe_mode_queued_orders_created_at ON safe_mode_queued_orders(created_at DESC);
CREATE INDEX idx_safe_mode_queued_orders_pending ON safe_mode_queued_orders(status) 
  WHERE status = 'QUEUED';

-- ============================================================================
-- SAFE MODE METRICS
-- ============================================================================

CREATE TABLE IF NOT EXISTS safe_mode_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Time window
  metric_timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  hour_bucket TIMESTAMP NOT NULL,
  
  -- Metrics
  orders_queued INTEGER DEFAULT 0,
  orders_processed INTEGER DEFAULT 0,
  whatsapp_responses_sent INTEGER DEFAULT 0,
  api_requests_blocked INTEGER DEFAULT 0,
  
  -- Performance
  avg_queue_time_minutes INTEGER,
  max_queue_time_minutes INTEGER,
  
  -- Timestamps
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Index for metrics
CREATE INDEX idx_safe_mode_metrics_timestamp ON safe_mode_metrics(metric_timestamp DESC);
CREATE INDEX idx_safe_mode_metrics_hour_bucket ON safe_mode_metrics(hour_bucket);

-- ============================================================================
-- VIEWS FOR MONITORING
-- ============================================================================

-- Current safe mode status view
CREATE OR REPLACE VIEW safe_mode_status AS
SELECT
  is_enabled,
  enabled_at,
  enabled_by,
  enabled_reason,
  auto_disable_at,
  custom_message,
  CASE
    WHEN is_enabled = FALSE THEN 'DISABLED'
    WHEN auto_disable_at IS NOT NULL AND auto_disable_at <= NOW() THEN 'AUTO_DISABLE_PENDING'
    ELSE 'ENABLED'
  END as current_status,
  CASE
    WHEN is_enabled = TRUE AND enabled_at IS NOT NULL THEN
      EXTRACT(EPOCH FROM (NOW() - enabled_at)) / 60
    ELSE 0
  END as minutes_enabled,
  (SELECT COUNT(*) FROM safe_mode_queued_orders WHERE status = 'QUEUED') as queued_orders_count,
  (SELECT COUNT(*) FROM orders WHERE status IN ('PENDING', 'CONFIRMED', 'ACCEPTED', 'DISPATCHED')) as active_orders_count
FROM safe_mode_config
ORDER BY created_at DESC
LIMIT 1;

-- Safe mode history summary
CREATE OR REPLACE VIEW safe_mode_history_summary AS
SELECT
  DATE_TRUNC('day', created_at) as date,
  COUNT(*) FILTER (WHERE action = 'ENABLED') as times_enabled,
  COUNT(*) FILTER (WHERE action = 'DISABLED') as times_disabled,
  COUNT(*) FILTER (WHERE action = 'AUTO_DISABLED') as times_auto_disabled,
  SUM(orders_queued) as total_orders_queued,
  SUM(orders_queued) FILTER (WHERE action = 'DISABLED') as orders_processed_after_disable,
  AVG(duration_minutes) FILTER (WHERE action = 'DISABLED') as avg_duration_minutes
FROM safe_mode_history
WHERE created_at >= NOW() - INTERVAL '30 days'
GROUP BY DATE_TRUNC('day', created_at)
ORDER BY date DESC;

-- Queued orders summary
CREATE OR REPLACE VIEW safe_mode_queued_orders_summary AS
SELECT
  status,
  COUNT(*) as order_count,
  MIN(created_at) as oldest_order,
  MAX(created_at) as newest_order,
  AVG(EXTRACT(EPOCH FROM (NOW() - created_at)) / 60) as avg_wait_time_minutes,
  MAX(EXTRACT(EPOCH FROM (NOW() - created_at)) / 60) as max_wait_time_minutes
FROM safe_mode_queued_orders
WHERE created_at >= NOW() - INTERVAL '24 hours'
GROUP BY status;

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Function to check if safe mode is enabled
CREATE OR REPLACE FUNCTION is_safe_mode_enabled()
RETURNS BOOLEAN AS $$
DECLARE
  v_is_enabled BOOLEAN;
  v_auto_disable_at TIMESTAMP;
BEGIN
  SELECT is_enabled, auto_disable_at
  INTO v_is_enabled, v_auto_disable_at
  FROM safe_mode_config
  ORDER BY created_at DESC
  LIMIT 1;
  
  -- Check if auto-disable time has passed
  IF v_is_enabled = TRUE AND v_auto_disable_at IS NOT NULL AND v_auto_disable_at <= NOW() THEN
    -- Auto-disable safe mode
    UPDATE safe_mode_config
    SET
      is_enabled = FALSE,
      disabled_at = NOW(),
      disabled_by = 'AUTO_DISABLE',
      updated_at = NOW()
    WHERE id = (SELECT id FROM safe_mode_config ORDER BY created_at DESC LIMIT 1);
    
    -- Log auto-disable
    INSERT INTO safe_mode_history (action, reason, triggered_by)
    VALUES ('AUTO_DISABLED', 'Auto-disable time reached', 'SYSTEM');
    
    RETURN FALSE;
  END IF;
  
  RETURN COALESCE(v_is_enabled, FALSE);
END;
$$ LANGUAGE plpgsql;

-- Function to enable safe mode
CREATE OR REPLACE FUNCTION enable_safe_mode(
  p_enabled_by VARCHAR(255),
  p_reason TEXT,
  p_auto_disable_minutes INTEGER DEFAULT NULL,
  p_custom_message TEXT DEFAULT NULL
) RETURNS VOID AS $$
DECLARE
  v_auto_disable_at TIMESTAMP;
BEGIN
  -- Calculate auto-disable time if specified
  IF p_auto_disable_minutes IS NOT NULL THEN
    v_auto_disable_at := NOW() + (p_auto_disable_minutes || ' minutes')::INTERVAL;
  END IF;
  
  -- Update configuration
  UPDATE safe_mode_config
  SET
    is_enabled = TRUE,
    enabled_at = NOW(),
    enabled_by = p_enabled_by,
    enabled_reason = p_reason,
    auto_disable_after_minutes = p_auto_disable_minutes,
    auto_disable_at = v_auto_disable_at,
    custom_message = p_custom_message,
    updated_at = NOW()
  WHERE id = (SELECT id FROM safe_mode_config ORDER BY created_at DESC LIMIT 1);
  
  -- Log activation
  INSERT INTO safe_mode_history (action, reason, triggered_by)
  VALUES ('ENABLED', p_reason, p_enabled_by);
END;
$$ LANGUAGE plpgsql;

-- Function to disable safe mode
CREATE OR REPLACE FUNCTION disable_safe_mode(
  p_disabled_by VARCHAR(255)
) RETURNS TABLE(
  orders_queued INTEGER,
  duration_minutes INTEGER
) AS $$
DECLARE
  v_enabled_at TIMESTAMP;
  v_duration_minutes INTEGER;
  v_orders_queued INTEGER;
BEGIN
  -- Get enabled_at time
  SELECT enabled_at INTO v_enabled_at
  FROM safe_mode_config
  WHERE id = (SELECT id FROM safe_mode_config ORDER BY created_at DESC LIMIT 1);
  
  -- Calculate duration
  IF v_enabled_at IS NOT NULL THEN
    v_duration_minutes := EXTRACT(EPOCH FROM (NOW() - v_enabled_at)) / 60;
  ELSE
    v_duration_minutes := 0;
  END IF;
  
  -- Count queued orders
  SELECT COUNT(*) INTO v_orders_queued
  FROM safe_mode_queued_orders
  WHERE status = 'QUEUED';
  
  -- Update configuration
  UPDATE safe_mode_config
  SET
    is_enabled = FALSE,
    disabled_at = NOW(),
    disabled_by = p_disabled_by,
    auto_disable_at = NULL,
    updated_at = NOW()
  WHERE id = (SELECT id FROM safe_mode_config ORDER BY created_at DESC LIMIT 1);
  
  -- Log deactivation
  INSERT INTO safe_mode_history (
    action,
    reason,
    triggered_by,
    duration_minutes,
    orders_queued
  ) VALUES (
    'DISABLED',
    'Manually disabled by admin',
    p_disabled_by,
    v_duration_minutes,
    v_orders_queued
  );
  
  RETURN QUERY SELECT v_orders_queued, v_duration_minutes;
END;
$$ LANGUAGE plpgsql;

-- Function to queue order during safe mode
CREATE OR REPLACE FUNCTION queue_order_safe_mode(
  p_retailer_id UUID,
  p_phone_number VARCHAR(50),
  p_order_text TEXT,
  p_order_data JSONB,
  p_source VARCHAR(50),
  p_message_id VARCHAR(255)
) RETURNS UUID AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO safe_mode_queued_orders (
    retailer_id,
    phone_number,
    order_text,
    order_data,
    source,
    message_id,
    status
  ) VALUES (
    p_retailer_id,
    p_phone_number,
    p_order_text,
    p_order_data,
    p_source,
    p_message_id,
    'QUEUED'
  ) RETURNING id INTO v_id;
  
  RETURN v_id;
END;
$$ LANGUAGE plpgsql;

-- Function to process queued orders
CREATE OR REPLACE FUNCTION get_queued_orders_to_process(
  p_limit INTEGER DEFAULT 100
) RETURNS TABLE(
  id UUID,
  retailer_id UUID,
  phone_number VARCHAR(50),
  order_text TEXT,
  order_data JSONB,
  source VARCHAR(50),
  message_id VARCHAR(255),
  created_at TIMESTAMP
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    qo.id,
    qo.retailer_id,
    qo.phone_number,
    qo.order_text,
    qo.order_data,
    qo.source,
    qo.message_id,
    qo.created_at
  FROM safe_mode_queued_orders qo
  WHERE qo.status = 'QUEUED'
  ORDER BY qo.created_at ASC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE safe_mode_config IS 'Configuration for safe mode system';
COMMENT ON TABLE safe_mode_history IS 'History of safe mode activations and deactivations';
COMMENT ON TABLE safe_mode_queued_orders IS 'Orders queued during safe mode';
COMMENT ON TABLE safe_mode_metrics IS 'Metrics for safe mode performance';

COMMENT ON FUNCTION is_safe_mode_enabled IS 'Checks if safe mode is currently enabled';
COMMENT ON FUNCTION enable_safe_mode IS 'Enables safe mode with optional auto-disable';
COMMENT ON FUNCTION disable_safe_mode IS 'Disables safe mode and returns statistics';
COMMENT ON FUNCTION queue_order_safe_mode IS 'Queues an order during safe mode';
COMMENT ON FUNCTION get_queued_orders_to_process IS 'Gets queued orders ready for processing';
