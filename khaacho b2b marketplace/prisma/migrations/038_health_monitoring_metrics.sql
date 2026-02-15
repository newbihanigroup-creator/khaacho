-- =====================================================
-- Health Monitoring Metrics System
-- =====================================================
-- Tracks production metrics for health monitoring:
-- 1. Database connection status
-- 2. Queue backlog size
-- 3. WhatsApp webhook latency
-- 4. Failed orders per hour
-- 5. OCR processing failures
-- =====================================================

-- =====================================================
-- 1. Health Metrics Table
-- =====================================================
CREATE TABLE IF NOT EXISTS health_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_name VARCHAR(100) NOT NULL,
  metric_value DECIMAL(15, 2) NOT NULL,
  metric_unit VARCHAR(50),
  metric_status VARCHAR(20) NOT NULL DEFAULT 'normal', -- normal, warning, critical
  metric_metadata JSONB DEFAULT '{}'::jsonb,
  recorded_at TIMESTAMP NOT NULL DEFAULT NOW(),
  hour_bucket TIMESTAMP NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_health_metrics_name_time ON health_metrics(metric_name, recorded_at DESC);
CREATE INDEX idx_health_metrics_hour_bucket ON health_metrics(hour_bucket DESC);
CREATE INDEX idx_health_metrics_status ON health_metrics(metric_status, recorded_at DESC);

-- =====================================================
-- 2. System Health Snapshots
-- =====================================================
CREATE TABLE IF NOT EXISTS system_health_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  database_status BOOLEAN NOT NULL,
  database_response_time_ms INTEGER,
  redis_status BOOLEAN NOT NULL,
  redis_response_time_ms INTEGER,
  queue_backlog_total INTEGER NOT NULL DEFAULT 0,
  queue_backlog_details JSONB DEFAULT '{}'::jsonb,
  webhook_avg_latency_ms DECIMAL(10, 2),
  failed_orders_last_hour INTEGER NOT NULL DEFAULT 0,
  ocr_failures_last_hour INTEGER NOT NULL DEFAULT 0,
  overall_health_score INTEGER NOT NULL DEFAULT 100, -- 0-100
  overall_status VARCHAR(20) NOT NULL DEFAULT 'healthy', -- healthy, degraded, unhealthy
  snapshot_timestamp TIMESTAMP NOT NULL DEFAULT NOW(),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_system_health_snapshots_time ON system_health_snapshots(snapshot_timestamp DESC);
CREATE INDEX idx_system_health_snapshots_status ON system_health_snapshots(overall_status, snapshot_timestamp DESC);

-- =====================================================
-- 3. Alert Thresholds Configuration
-- =====================================================
CREATE TABLE IF NOT EXISTS health_alert_thresholds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_name VARCHAR(100) NOT NULL UNIQUE,
  warning_threshold DECIMAL(15, 2),
  critical_threshold DECIMAL(15, 2),
  comparison_operator VARCHAR(10) NOT NULL DEFAULT 'gt', -- gt, lt, eq, gte, lte
  enabled BOOLEAN NOT NULL DEFAULT true,
  alert_message TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Insert default thresholds
INSERT INTO health_alert_thresholds (metric_name, warning_threshold, critical_threshold, comparison_operator, alert_message) VALUES
('queue_backlog_total', 1000, 5000, 'gt', 'Queue backlog is high'),
('webhook_latency_ms', 1000, 2000, 'gt', 'Webhook latency is high'),
('failed_orders_per_hour', 10, 50, 'gt', 'High order failure rate'),
('ocr_failures_per_hour', 5, 20, 'gt', 'High OCR failure rate'),
('database_response_time_ms', 100, 500, 'gt', 'Database response time is slow'),
('redis_response_time_ms', 50, 200, 'gt', 'Redis response time is slow')
ON CONFLICT (metric_name) DO NOTHING;

-- =====================================================
-- 4. Health Alerts Log
-- =====================================================
CREATE TABLE IF NOT EXISTS health_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_name VARCHAR(100) NOT NULL,
  alert_level VARCHAR(20) NOT NULL, -- warning, critical
  metric_value DECIMAL(15, 2) NOT NULL,
  threshold_value DECIMAL(15, 2) NOT NULL,
  alert_message TEXT NOT NULL,
  alert_metadata JSONB DEFAULT '{}'::jsonb,
  resolved BOOLEAN NOT NULL DEFAULT false,
  resolved_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_health_alerts_unresolved ON health_alerts(resolved, created_at DESC) WHERE NOT resolved;
CREATE INDEX idx_health_alerts_metric ON health_alerts(metric_name, created_at DESC);
CREATE INDEX idx_health_alerts_level ON health_alerts(alert_level, created_at DESC);

-- =====================================================
-- 5. Functions for Metrics Collection
-- =====================================================

-- Function: Get queue backlog size
CREATE OR REPLACE FUNCTION get_queue_backlog_size()
RETURNS TABLE (
  queue_name VARCHAR(100),
  pending_count BIGINT,
  failed_count BIGINT,
  total_count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    qj.queue_name::VARCHAR(100),
    COUNT(*) FILTER (WHERE qj.status = 'pending')::BIGINT as pending_count,
    COUNT(*) FILTER (WHERE qj.status = 'failed')::BIGINT as failed_count,
    COUNT(*)::BIGINT as total_count
  FROM queue_jobs qj
  WHERE qj.status IN ('pending', 'failed', 'active')
    AND qj.created_at > NOW() - INTERVAL '24 hours'
  GROUP BY qj.queue_name;
END;
$$ LANGUAGE plpgsql;

-- Function: Get webhook latency stats
CREATE OR REPLACE FUNCTION get_webhook_latency_stats(hours_back INTEGER DEFAULT 1)
RETURNS TABLE (
  webhook_source VARCHAR(50),
  avg_latency_ms DECIMAL(10, 2),
  p50_latency_ms DECIMAL(10, 2),
  p95_latency_ms DECIMAL(10, 2),
  p99_latency_ms DECIMAL(10, 2),
  max_latency_ms INTEGER,
  total_requests BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    wpm.webhook_source::VARCHAR(50),
    AVG(wpm.response_time_ms)::DECIMAL(10, 2) as avg_latency_ms,
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY wpm.response_time_ms)::DECIMAL(10, 2) as p50_latency_ms,
    PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY wpm.response_time_ms)::DECIMAL(10, 2) as p95_latency_ms,
    PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY wpm.response_time_ms)::DECIMAL(10, 2) as p99_latency_ms,
    MAX(wpm.response_time_ms) as max_latency_ms,
    COUNT(*)::BIGINT as total_requests
  FROM webhook_performance_metrics wpm
  WHERE wpm.metric_timestamp > NOW() - INTERVAL '1 hour' * hours_back
  GROUP BY wpm.webhook_source;
END;
$$ LANGUAGE plpgsql;

-- Function: Get failed orders count
CREATE OR REPLACE FUNCTION get_failed_orders_count(hours_back INTEGER DEFAULT 1)
RETURNS TABLE (
  failed_count BIGINT,
  cancelled_count BIGINT,
  total_failed BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*) FILTER (WHERE o.status = 'FAILED')::BIGINT as failed_count,
    COUNT(*) FILTER (WHERE o.status = 'CANCELLED')::BIGINT as cancelled_count,
    COUNT(*)::BIGINT as total_failed
  FROM orders o
  WHERE o.status IN ('FAILED', 'CANCELLED')
    AND o.updated_at > NOW() - INTERVAL '1 hour' * hours_back;
END;
$$ LANGUAGE plpgsql;

-- Function: Get OCR processing failures
CREATE OR REPLACE FUNCTION get_ocr_failures_count(hours_back INTEGER DEFAULT 1)
RETURNS TABLE (
  failed_count BIGINT,
  total_processed BIGINT,
  failure_rate DECIMAL(5, 2)
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*) FILTER (WHERE uo.status = 'FAILED')::BIGINT as failed_count,
    COUNT(*)::BIGINT as total_processed,
    CASE
      WHEN COUNT(*) > 0 THEN
        (COUNT(*) FILTER (WHERE uo.status = 'FAILED')::DECIMAL / COUNT(*) * 100)::DECIMAL(5, 2)
      ELSE 0::DECIMAL(5, 2)
    END as failure_rate
  FROM uploaded_orders uo
  WHERE uo.processed_at > NOW() - INTERVAL '1 hour' * hours_back
    OR (uo.status = 'PROCESSING' AND uo.created_at > NOW() - INTERVAL '1 hour' * hours_back);
END;
$$ LANGUAGE plpgsql;

-- Function: Record health metric
CREATE OR REPLACE FUNCTION record_health_metric(
  p_metric_name VARCHAR(100),
  p_metric_value DECIMAL(15, 2),
  p_metric_unit VARCHAR(50) DEFAULT NULL,
  p_metric_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID AS $$
DECLARE
  v_metric_id UUID;
  v_metric_status VARCHAR(20);
  v_threshold RECORD;
  v_should_alert BOOLEAN;
BEGIN
  -- Determine metric status based on thresholds
  SELECT * INTO v_threshold
  FROM health_alert_thresholds
  WHERE metric_name = p_metric_name AND enabled = true;

  IF FOUND THEN
    v_metric_status := 'normal';
    v_should_alert := false;

    -- Check critical threshold
    IF v_threshold.critical_threshold IS NOT NULL THEN
      CASE v_threshold.comparison_operator
        WHEN 'gt' THEN
          IF p_metric_value > v_threshold.critical_threshold THEN
            v_metric_status := 'critical';
            v_should_alert := true;
          END IF;
        WHEN 'lt' THEN
          IF p_metric_value < v_threshold.critical_threshold THEN
            v_metric_status := 'critical';
            v_should_alert := true;
          END IF;
        WHEN 'gte' THEN
          IF p_metric_value >= v_threshold.critical_threshold THEN
            v_metric_status := 'critical';
            v_should_alert := true;
          END IF;
        WHEN 'lte' THEN
          IF p_metric_value <= v_threshold.critical_threshold THEN
            v_metric_status := 'critical';
            v_should_alert := true;
          END IF;
      END CASE;
    END IF;

    -- Check warning threshold if not critical
    IF v_metric_status = 'normal' AND v_threshold.warning_threshold IS NOT NULL THEN
      CASE v_threshold.comparison_operator
        WHEN 'gt' THEN
          IF p_metric_value > v_threshold.warning_threshold THEN
            v_metric_status := 'warning';
            v_should_alert := true;
          END IF;
        WHEN 'lt' THEN
          IF p_metric_value < v_threshold.warning_threshold THEN
            v_metric_status := 'warning';
            v_should_alert := true;
          END IF;
        WHEN 'gte' THEN
          IF p_metric_value >= v_threshold.warning_threshold THEN
            v_metric_status := 'warning';
            v_should_alert := true;
          END IF;
        WHEN 'lte' THEN
          IF p_metric_value <= v_threshold.warning_threshold THEN
            v_metric_status := 'warning';
            v_should_alert := true;
          END IF;
      END CASE;
    END IF;

    -- Create alert if threshold exceeded
    IF v_should_alert THEN
      INSERT INTO health_alerts (
        metric_name,
        alert_level,
        metric_value,
        threshold_value,
        alert_message,
        alert_metadata
      ) VALUES (
        p_metric_name,
        v_metric_status,
        p_metric_value,
        CASE WHEN v_metric_status = 'critical' THEN v_threshold.critical_threshold ELSE v_threshold.warning_threshold END,
        v_threshold.alert_message,
        p_metric_metadata
      );
    END IF;
  ELSE
    v_metric_status := 'normal';
  END IF;

  -- Insert metric
  INSERT INTO health_metrics (
    metric_name,
    metric_value,
    metric_unit,
    metric_status,
    metric_metadata,
    hour_bucket
  ) VALUES (
    p_metric_name,
    p_metric_value,
    p_metric_unit,
    v_metric_status,
    p_metric_metadata,
    DATE_TRUNC('hour', NOW())
  )
  RETURNING id INTO v_metric_id;

  RETURN v_metric_id;
END;
$$ LANGUAGE plpgsql;

-- Function: Create system health snapshot
CREATE OR REPLACE FUNCTION create_system_health_snapshot(
  p_database_status BOOLEAN,
  p_database_response_time_ms INTEGER,
  p_redis_status BOOLEAN,
  p_redis_response_time_ms INTEGER,
  p_queue_backlog_total INTEGER,
  p_queue_backlog_details JSONB,
  p_webhook_avg_latency_ms DECIMAL(10, 2),
  p_failed_orders_last_hour INTEGER,
  p_ocr_failures_last_hour INTEGER
)
RETURNS UUID AS $$
DECLARE
  v_snapshot_id UUID;
  v_health_score INTEGER;
  v_overall_status VARCHAR(20);
BEGIN
  -- Calculate health score (0-100)
  v_health_score := 100;

  -- Deduct points for issues
  IF NOT p_database_status THEN v_health_score := v_health_score - 50; END IF;
  IF NOT p_redis_status THEN v_health_score := v_health_score - 10; END IF;
  IF p_database_response_time_ms > 500 THEN v_health_score := v_health_score - 20; END IF;
  IF p_database_response_time_ms > 100 THEN v_health_score := v_health_score - 10; END IF;
  IF p_queue_backlog_total > 5000 THEN v_health_score := v_health_score - 30; END IF;
  IF p_queue_backlog_total > 1000 THEN v_health_score := v_health_score - 15; END IF;
  IF p_webhook_avg_latency_ms > 2000 THEN v_health_score := v_health_score - 20; END IF;
  IF p_webhook_avg_latency_ms > 1000 THEN v_health_score := v_health_score - 10; END IF;
  IF p_failed_orders_last_hour > 50 THEN v_health_score := v_health_score - 25; END IF;
  IF p_failed_orders_last_hour > 10 THEN v_health_score := v_health_score - 10; END IF;
  IF p_ocr_failures_last_hour > 20 THEN v_health_score := v_health_score - 20; END IF;
  IF p_ocr_failures_last_hour > 5 THEN v_health_score := v_health_score - 10; END IF;

  -- Ensure score is between 0 and 100
  v_health_score := GREATEST(0, LEAST(100, v_health_score));

  -- Determine overall status
  IF v_health_score >= 80 THEN
    v_overall_status := 'healthy';
  ELSIF v_health_score >= 50 THEN
    v_overall_status := 'degraded';
  ELSE
    v_overall_status := 'unhealthy';
  END IF;

  -- Insert snapshot
  INSERT INTO system_health_snapshots (
    database_status,
    database_response_time_ms,
    redis_status,
    redis_response_time_ms,
    queue_backlog_total,
    queue_backlog_details,
    webhook_avg_latency_ms,
    failed_orders_last_hour,
    ocr_failures_last_hour,
    overall_health_score,
    overall_status
  ) VALUES (
    p_database_status,
    p_database_response_time_ms,
    p_redis_status,
    p_redis_response_time_ms,
    p_queue_backlog_total,
    p_queue_backlog_details,
    p_webhook_avg_latency_ms,
    p_failed_orders_last_hour,
    p_ocr_failures_last_hour,
    v_health_score,
    v_overall_status
  )
  RETURNING id INTO v_snapshot_id;

  RETURN v_snapshot_id;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 6. Views for Monitoring
-- =====================================================

-- View: Latest health metrics
CREATE OR REPLACE VIEW latest_health_metrics AS
SELECT DISTINCT ON (metric_name)
  metric_name,
  metric_value,
  metric_unit,
  metric_status,
  metric_metadata,
  recorded_at
FROM health_metrics
ORDER BY metric_name, recorded_at DESC;

-- View: Health metrics summary (last 24 hours)
CREATE OR REPLACE VIEW health_metrics_summary AS
SELECT
  metric_name,
  COUNT(*) as total_readings,
  AVG(metric_value) as avg_value,
  MIN(metric_value) as min_value,
  MAX(metric_value) as max_value,
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY metric_value) as median_value,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY metric_value) as p95_value,
  COUNT(*) FILTER (WHERE metric_status = 'warning') as warning_count,
  COUNT(*) FILTER (WHERE metric_status = 'critical') as critical_count
FROM health_metrics
WHERE recorded_at > NOW() - INTERVAL '24 hours'
GROUP BY metric_name;

-- View: Active health alerts
CREATE OR REPLACE VIEW active_health_alerts AS
SELECT
  id,
  metric_name,
  alert_level,
  metric_value,
  threshold_value,
  alert_message,
  alert_metadata,
  created_at,
  EXTRACT(EPOCH FROM (NOW() - created_at)) / 60 as minutes_active
FROM health_alerts
WHERE NOT resolved
ORDER BY
  CASE alert_level
    WHEN 'critical' THEN 1
    WHEN 'warning' THEN 2
    ELSE 3
  END,
  created_at DESC;

-- View: Latest system health snapshot
CREATE OR REPLACE VIEW latest_system_health AS
SELECT *
FROM system_health_snapshots
ORDER BY snapshot_timestamp DESC
LIMIT 1;

-- =====================================================
-- 7. Cleanup Function
-- =====================================================

-- Function: Cleanup old health data
CREATE OR REPLACE FUNCTION cleanup_old_health_data(days_to_keep INTEGER DEFAULT 30)
RETURNS TABLE (
  health_metrics_deleted BIGINT,
  snapshots_deleted BIGINT,
  alerts_deleted BIGINT
) AS $$
DECLARE
  v_health_metrics_deleted BIGINT;
  v_snapshots_deleted BIGINT;
  v_alerts_deleted BIGINT;
BEGIN
  -- Delete old health metrics
  DELETE FROM health_metrics
  WHERE recorded_at < NOW() - INTERVAL '1 day' * days_to_keep;
  GET DIAGNOSTICS v_health_metrics_deleted = ROW_COUNT;

  -- Delete old snapshots
  DELETE FROM system_health_snapshots
  WHERE snapshot_timestamp < NOW() - INTERVAL '1 day' * days_to_keep;
  GET DIAGNOSTICS v_snapshots_deleted = ROW_COUNT;

  -- Delete old resolved alerts
  DELETE FROM health_alerts
  WHERE resolved = true
    AND resolved_at < NOW() - INTERVAL '1 day' * days_to_keep;
  GET DIAGNOSTICS v_alerts_deleted = ROW_COUNT;

  RETURN QUERY SELECT v_health_metrics_deleted, v_snapshots_deleted, v_alerts_deleted;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 8. Comments
-- =====================================================

COMMENT ON TABLE health_metrics IS 'Stores individual health metric readings';
COMMENT ON TABLE system_health_snapshots IS 'Stores complete system health snapshots';
COMMENT ON TABLE health_alert_thresholds IS 'Configuration for health metric alert thresholds';
COMMENT ON TABLE health_alerts IS 'Log of health alerts triggered by threshold violations';

COMMENT ON FUNCTION get_queue_backlog_size() IS 'Returns current queue backlog size by queue name';
COMMENT ON FUNCTION get_webhook_latency_stats(INTEGER) IS 'Returns webhook latency statistics';
COMMENT ON FUNCTION get_failed_orders_count(INTEGER) IS 'Returns count of failed orders';
COMMENT ON FUNCTION get_ocr_failures_count(INTEGER) IS 'Returns count of OCR processing failures';
COMMENT ON FUNCTION record_health_metric(VARCHAR, DECIMAL, VARCHAR, JSONB) IS 'Records a health metric and checks thresholds';
COMMENT ON FUNCTION create_system_health_snapshot(BOOLEAN, INTEGER, BOOLEAN, INTEGER, INTEGER, JSONB, DECIMAL, INTEGER, INTEGER) IS 'Creates a complete system health snapshot';
COMMENT ON FUNCTION cleanup_old_health_data(INTEGER) IS 'Removes old health monitoring data';

-- =====================================================
-- Migration Complete
-- =====================================================
