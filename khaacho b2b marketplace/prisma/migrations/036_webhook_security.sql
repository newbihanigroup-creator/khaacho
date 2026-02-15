-- Migration: Webhook Security and Deduplication
-- Description: Add tables for webhook signature validation and message deduplication

-- ============================================================================
-- WEBHOOK MESSAGE DEDUPLICATION
-- ============================================================================

-- Track processed webhook messages to prevent duplicates
CREATE TABLE IF NOT EXISTS webhook_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Message identification
  message_id VARCHAR(255) UNIQUE NOT NULL,
  webhook_source VARCHAR(50) NOT NULL, -- 'whatsapp', 'twilio', 'meta'
  phone_number VARCHAR(50) NOT NULL,
  
  -- Processing status
  status VARCHAR(50) NOT NULL DEFAULT 'received', -- received, processing, completed, failed
  processed_at TIMESTAMP,
  
  -- Deduplication
  first_received_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  duplicate_count INTEGER DEFAULT 0,
  last_duplicate_at TIMESTAMP,
  
  -- Request data
  request_body JSONB,
  request_headers JSONB,
  
  -- Response tracking
  response_time_ms INTEGER,
  queue_job_id VARCHAR(255),
  
  -- Error tracking
  error_message TEXT,
  error_count INTEGER DEFAULT 0,
  
  -- Timestamps
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for fast lookups
CREATE INDEX idx_webhook_messages_message_id ON webhook_messages(message_id);
CREATE INDEX idx_webhook_messages_phone_number ON webhook_messages(phone_number);
CREATE INDEX idx_webhook_messages_status ON webhook_messages(status);
CREATE INDEX idx_webhook_messages_created_at ON webhook_messages(created_at DESC);
CREATE INDEX idx_webhook_messages_source_status ON webhook_messages(webhook_source, status);

-- ============================================================================
-- WEBHOOK SIGNATURE VALIDATION LOG
-- ============================================================================

-- Track signature validation attempts for security monitoring
CREATE TABLE IF NOT EXISTS webhook_signature_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Request identification
  webhook_source VARCHAR(50) NOT NULL,
  request_path VARCHAR(255) NOT NULL,
  request_method VARCHAR(10) NOT NULL,
  
  -- Signature validation
  signature_header VARCHAR(500),
  signature_valid BOOLEAN NOT NULL,
  validation_error TEXT,
  
  -- Request metadata
  ip_address VARCHAR(50),
  user_agent TEXT,
  request_timestamp TIMESTAMP NOT NULL,
  
  -- Security flags
  is_replay_attack BOOLEAN DEFAULT FALSE,
  is_suspicious BOOLEAN DEFAULT FALSE,
  suspicious_reason TEXT,
  
  -- Timestamps
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for security monitoring
CREATE INDEX idx_webhook_signature_log_source ON webhook_signature_log(webhook_source);
CREATE INDEX idx_webhook_signature_log_valid ON webhook_signature_log(signature_valid);
CREATE INDEX idx_webhook_signature_log_created_at ON webhook_signature_log(created_at DESC);
CREATE INDEX idx_webhook_signature_log_ip ON webhook_signature_log(ip_address);
CREATE INDEX idx_webhook_signature_log_suspicious ON webhook_signature_log(is_suspicious) WHERE is_suspicious = TRUE;

-- ============================================================================
-- WEBHOOK RATE LIMITING
-- ============================================================================

-- Track webhook request rates per source/phone
CREATE TABLE IF NOT EXISTS webhook_rate_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Identification
  webhook_source VARCHAR(50) NOT NULL,
  phone_number VARCHAR(50),
  ip_address VARCHAR(50),
  
  -- Rate tracking
  request_count INTEGER NOT NULL DEFAULT 1,
  window_start TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  window_end TIMESTAMP NOT NULL,
  
  -- Limit enforcement
  is_blocked BOOLEAN DEFAULT FALSE,
  blocked_until TIMESTAMP,
  blocked_reason TEXT,
  
  -- Timestamps
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  -- Unique constraint per window
  UNIQUE(webhook_source, phone_number, window_start)
);

-- Indexes for rate limiting
CREATE INDEX idx_webhook_rate_limits_source_phone ON webhook_rate_limits(webhook_source, phone_number);
CREATE INDEX idx_webhook_rate_limits_window ON webhook_rate_limits(window_start, window_end);
CREATE INDEX idx_webhook_rate_limits_blocked ON webhook_rate_limits(is_blocked) WHERE is_blocked = TRUE;

-- ============================================================================
-- WEBHOOK PERFORMANCE METRICS
-- ============================================================================

-- Track webhook performance for monitoring
CREATE TABLE IF NOT EXISTS webhook_performance_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Identification
  webhook_source VARCHAR(50) NOT NULL,
  endpoint_path VARCHAR(255) NOT NULL,
  
  -- Performance metrics
  response_time_ms INTEGER NOT NULL,
  queue_time_ms INTEGER,
  processing_time_ms INTEGER,
  
  -- Status
  http_status INTEGER NOT NULL,
  success BOOLEAN NOT NULL,
  
  -- Aggregation window
  metric_timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  hour_bucket TIMESTAMP NOT NULL,
  
  -- Timestamps
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance monitoring
CREATE INDEX idx_webhook_performance_source ON webhook_performance_metrics(webhook_source);
CREATE INDEX idx_webhook_performance_timestamp ON webhook_performance_metrics(metric_timestamp DESC);
CREATE INDEX idx_webhook_performance_hour_bucket ON webhook_performance_metrics(hour_bucket);
CREATE INDEX idx_webhook_performance_success ON webhook_performance_metrics(success);

-- ============================================================================
-- VIEWS FOR MONITORING
-- ============================================================================

-- Webhook processing statistics
CREATE OR REPLACE VIEW webhook_processing_stats AS
SELECT
  webhook_source,
  status,
  COUNT(*) as message_count,
  AVG(response_time_ms) as avg_response_time_ms,
  MAX(response_time_ms) as max_response_time_ms,
  SUM(duplicate_count) as total_duplicates,
  SUM(error_count) as total_errors,
  COUNT(*) FILTER (WHERE processed_at IS NOT NULL) as processed_count,
  COUNT(*) FILTER (WHERE error_message IS NOT NULL) as failed_count
FROM webhook_messages
WHERE created_at >= NOW() - INTERVAL '24 hours'
GROUP BY webhook_source, status;

-- Signature validation statistics
CREATE OR REPLACE VIEW webhook_security_stats AS
SELECT
  webhook_source,
  DATE_TRUNC('hour', created_at) as hour,
  COUNT(*) as total_requests,
  COUNT(*) FILTER (WHERE signature_valid = TRUE) as valid_signatures,
  COUNT(*) FILTER (WHERE signature_valid = FALSE) as invalid_signatures,
  COUNT(*) FILTER (WHERE is_suspicious = TRUE) as suspicious_requests,
  COUNT(*) FILTER (WHERE is_replay_attack = TRUE) as replay_attacks,
  COUNT(DISTINCT ip_address) as unique_ips
FROM webhook_signature_log
WHERE created_at >= NOW() - INTERVAL '24 hours'
GROUP BY webhook_source, hour
ORDER BY hour DESC;

-- Rate limiting statistics
CREATE OR REPLACE VIEW webhook_rate_limit_stats AS
SELECT
  webhook_source,
  phone_number,
  SUM(request_count) as total_requests,
  COUNT(*) FILTER (WHERE is_blocked = TRUE) as times_blocked,
  MAX(updated_at) as last_request_at
FROM webhook_rate_limits
WHERE window_start >= NOW() - INTERVAL '1 hour'
GROUP BY webhook_source, phone_number
ORDER BY total_requests DESC;

-- Performance statistics
CREATE OR REPLACE VIEW webhook_performance_stats AS
SELECT
  webhook_source,
  endpoint_path,
  DATE_TRUNC('hour', metric_timestamp) as hour,
  COUNT(*) as request_count,
  AVG(response_time_ms) as avg_response_time_ms,
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY response_time_ms) as p50_response_time_ms,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY response_time_ms) as p95_response_time_ms,
  PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY response_time_ms) as p99_response_time_ms,
  MAX(response_time_ms) as max_response_time_ms,
  COUNT(*) FILTER (WHERE success = TRUE) as success_count,
  COUNT(*) FILTER (WHERE success = FALSE) as failure_count,
  ROUND(100.0 * COUNT(*) FILTER (WHERE success = TRUE) / COUNT(*), 2) as success_rate
FROM webhook_performance_metrics
WHERE metric_timestamp >= NOW() - INTERVAL '24 hours'
GROUP BY webhook_source, endpoint_path, hour
ORDER BY hour DESC;

-- ============================================================================
-- FUNCTIONS FOR WEBHOOK PROCESSING
-- ============================================================================

-- Function to check if message is duplicate
CREATE OR REPLACE FUNCTION is_duplicate_webhook_message(
  p_message_id VARCHAR(255),
  p_webhook_source VARCHAR(50)
) RETURNS BOOLEAN AS $$
DECLARE
  v_exists BOOLEAN;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM webhook_messages
    WHERE message_id = p_message_id
    AND webhook_source = p_webhook_source
  ) INTO v_exists;
  
  RETURN v_exists;
END;
$$ LANGUAGE plpgsql;

-- Function to record webhook message
CREATE OR REPLACE FUNCTION record_webhook_message(
  p_message_id VARCHAR(255),
  p_webhook_source VARCHAR(50),
  p_phone_number VARCHAR(50),
  p_request_body JSONB,
  p_request_headers JSONB
) RETURNS UUID AS $$
DECLARE
  v_id UUID;
  v_is_duplicate BOOLEAN;
BEGIN
  -- Check if duplicate
  SELECT is_duplicate_webhook_message(p_message_id, p_webhook_source) INTO v_is_duplicate;
  
  IF v_is_duplicate THEN
    -- Update duplicate count
    UPDATE webhook_messages
    SET 
      duplicate_count = duplicate_count + 1,
      last_duplicate_at = CURRENT_TIMESTAMP,
      updated_at = CURRENT_TIMESTAMP
    WHERE message_id = p_message_id
    AND webhook_source = p_webhook_source
    RETURNING id INTO v_id;
  ELSE
    -- Insert new message
    INSERT INTO webhook_messages (
      message_id,
      webhook_source,
      phone_number,
      status,
      request_body,
      request_headers
    ) VALUES (
      p_message_id,
      p_webhook_source,
      p_phone_number,
      'received',
      p_request_body,
      p_request_headers
    ) RETURNING id INTO v_id;
  END IF;
  
  RETURN v_id;
END;
$$ LANGUAGE plpgsql;

-- Function to check rate limit
CREATE OR REPLACE FUNCTION check_webhook_rate_limit(
  p_webhook_source VARCHAR(50),
  p_phone_number VARCHAR(50),
  p_max_requests INTEGER DEFAULT 100,
  p_window_minutes INTEGER DEFAULT 60
) RETURNS BOOLEAN AS $$
DECLARE
  v_request_count INTEGER;
  v_is_blocked BOOLEAN;
BEGIN
  -- Get current request count in window
  SELECT COALESCE(SUM(request_count), 0)
  INTO v_request_count
  FROM webhook_rate_limits
  WHERE webhook_source = p_webhook_source
  AND phone_number = p_phone_number
  AND window_start >= NOW() - (p_window_minutes || ' minutes')::INTERVAL
  AND window_end > NOW();
  
  -- Check if blocked
  SELECT COALESCE(bool_or(is_blocked AND blocked_until > NOW()), FALSE)
  INTO v_is_blocked
  FROM webhook_rate_limits
  WHERE webhook_source = p_webhook_source
  AND phone_number = p_phone_number;
  
  -- Return TRUE if under limit and not blocked
  RETURN (v_request_count < p_max_requests) AND NOT v_is_blocked;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- CLEANUP FUNCTIONS
-- ============================================================================

-- Function to clean up old webhook data
CREATE OR REPLACE FUNCTION cleanup_old_webhook_data(
  p_days_to_keep INTEGER DEFAULT 30
) RETURNS TABLE(
  deleted_messages INTEGER,
  deleted_signatures INTEGER,
  deleted_rate_limits INTEGER,
  deleted_metrics INTEGER
) AS $$
DECLARE
  v_deleted_messages INTEGER;
  v_deleted_signatures INTEGER;
  v_deleted_rate_limits INTEGER;
  v_deleted_metrics INTEGER;
BEGIN
  -- Delete old webhook messages
  DELETE FROM webhook_messages
  WHERE created_at < NOW() - (p_days_to_keep || ' days')::INTERVAL
  AND status IN ('completed', 'failed');
  GET DIAGNOSTICS v_deleted_messages = ROW_COUNT;
  
  -- Delete old signature logs
  DELETE FROM webhook_signature_log
  WHERE created_at < NOW() - (p_days_to_keep || ' days')::INTERVAL;
  GET DIAGNOSTICS v_deleted_signatures = ROW_COUNT;
  
  -- Delete old rate limit records
  DELETE FROM webhook_rate_limits
  WHERE window_end < NOW() - (p_days_to_keep || ' days')::INTERVAL;
  GET DIAGNOSTICS v_deleted_rate_limits = ROW_COUNT;
  
  -- Delete old performance metrics
  DELETE FROM webhook_performance_metrics
  WHERE created_at < NOW() - (p_days_to_keep || ' days')::INTERVAL;
  GET DIAGNOSTICS v_deleted_metrics = ROW_COUNT;
  
  RETURN QUERY SELECT 
    v_deleted_messages,
    v_deleted_signatures,
    v_deleted_rate_limits,
    v_deleted_metrics;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE webhook_messages IS 'Tracks all webhook messages for deduplication and replay attack prevention';
COMMENT ON TABLE webhook_signature_log IS 'Logs all signature validation attempts for security monitoring';
COMMENT ON TABLE webhook_rate_limits IS 'Tracks request rates per source/phone for rate limiting';
COMMENT ON TABLE webhook_performance_metrics IS 'Stores webhook performance metrics for monitoring';

COMMENT ON FUNCTION is_duplicate_webhook_message IS 'Checks if a webhook message has already been processed';
COMMENT ON FUNCTION record_webhook_message IS 'Records a webhook message and handles duplicates';
COMMENT ON FUNCTION check_webhook_rate_limit IS 'Checks if a webhook request is within rate limits';
COMMENT ON FUNCTION cleanup_old_webhook_data IS 'Cleans up old webhook data to prevent table bloat';
