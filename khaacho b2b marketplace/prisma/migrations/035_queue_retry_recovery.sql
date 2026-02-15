-- Migration: Queue Retry and Recovery System
-- Description: Enhanced retry logic with exponential backoff and dead-letter queue

-- Create queue_jobs table for tracking all queue jobs
CREATE TABLE IF NOT EXISTS queue_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id VARCHAR(255) UNIQUE NOT NULL,
  queue_name VARCHAR(100) NOT NULL,
  job_name VARCHAR(100) NOT NULL,
  
  -- Job data
  job_data JSONB NOT NULL DEFAULT '{}',
  job_options JSONB NOT NULL DEFAULT '{}',
  
  -- Status tracking
  status VARCHAR(50) NOT NULL DEFAULT 'waiting',
  -- Status: waiting, active, completed, failed, delayed, dead_letter
  
  -- Retry tracking
  attempt_number INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  retry_delays INTEGER[] DEFAULT ARRAY[5000, 15000, 45000], -- 5s, 15s, 45s
  next_retry_at TIMESTAMP,
  
  -- Timing
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  failed_at TIMESTAMP,
  moved_to_dlq_at TIMESTAMP,
  
  -- Error tracking
  last_error_message TEXT,
  last_error_stack TEXT,
  error_history JSONB DEFAULT '[]',
  
  -- Processing info
  worker_id VARCHAR(255),
  processing_duration_ms INTEGER,
  
  -- Result
  result JSONB,
  
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_queue_jobs_job_id ON queue_jobs(job_id);
CREATE INDEX idx_queue_jobs_queue_name ON queue_jobs(queue_name);
CREATE INDEX idx_queue_jobs_status ON queue_jobs(status);
CREATE INDEX idx_queue_jobs_next_retry ON queue_jobs(next_retry_at) WHERE status = 'failed' AND attempt_number < max_attempts;
CREATE INDEX idx_queue_jobs_created ON queue_jobs(created_at);

-- Create dead_letter_queue table
CREATE TABLE IF NOT EXISTS dead_letter_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Original job info
  original_job_id VARCHAR(255) NOT NULL,
  original_queue_name VARCHAR(100) NOT NULL,
  original_job_name VARCHAR(100) NOT NULL,
  original_job_data JSONB NOT NULL,
  
  -- Failure info
  failure_reason TEXT NOT NULL,
  failure_stack TEXT,
  total_attempts INTEGER NOT NULL,
  error_history JSONB NOT NULL DEFAULT '[]',
  
  -- Recovery tracking
  recovery_status VARCHAR(50) NOT NULL DEFAULT 'pending',
  -- Status: pending, recovered, permanently_failed, ignored
  recovery_attempts INTEGER NOT NULL DEFAULT 0,
  max_recovery_attempts INTEGER NOT NULL DEFAULT 3,
  last_recovery_attempt_at TIMESTAMP,
  recovered_at TIMESTAMP,
  
  -- Admin actions
  admin_notes TEXT,
  assigned_to VARCHAR(255),
  priority INTEGER DEFAULT 0,
  
  -- Timestamps
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_dlq_original_job_id ON dead_letter_queue(original_job_id);
CREATE INDEX idx_dlq_queue_name ON dead_letter_queue(original_queue_name);
CREATE INDEX idx_dlq_recovery_status ON dead_letter_queue(recovery_status);
CREATE INDEX idx_dlq_created ON dead_letter_queue(created_at);
CREATE INDEX idx_dlq_priority ON dead_letter_queue(priority DESC);

-- Create queue_retry_log table for audit trail
CREATE TABLE IF NOT EXISTS queue_retry_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id VARCHAR(255) NOT NULL,
  queue_name VARCHAR(100) NOT NULL,
  
  -- Retry info
  attempt_number INTEGER NOT NULL,
  retry_delay_ms INTEGER NOT NULL,
  retry_reason TEXT,
  
  -- Error info
  error_message TEXT,
  error_stack TEXT,
  
  -- Timing
  failed_at TIMESTAMP NOT NULL,
  next_retry_at TIMESTAMP NOT NULL,
  
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_retry_log_job_id ON queue_retry_log(job_id);
CREATE INDEX idx_retry_log_queue_name ON queue_retry_log(queue_name);
CREATE INDEX idx_retry_log_created ON queue_retry_log(created_at);

-- Create queue_recovery_runs table for tracking recovery worker runs
CREATE TABLE IF NOT EXISTS queue_recovery_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Run info
  run_type VARCHAR(50) NOT NULL,
  -- Type: scheduled, manual, triggered
  
  -- Statistics
  jobs_processed INTEGER NOT NULL DEFAULT 0,
  jobs_retried INTEGER NOT NULL DEFAULT 0,
  jobs_moved_to_dlq INTEGER NOT NULL DEFAULT 0,
  jobs_recovered INTEGER NOT NULL DEFAULT 0,
  jobs_failed INTEGER NOT NULL DEFAULT 0,
  
  -- Timing
  started_at TIMESTAMP NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMP,
  duration_ms INTEGER,
  
  -- Status
  status VARCHAR(50) NOT NULL DEFAULT 'running',
  -- Status: running, completed, failed
  error_message TEXT,
  
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_recovery_runs_run_type ON queue_recovery_runs(run_type);
CREATE INDEX idx_recovery_runs_started ON queue_recovery_runs(started_at);
CREATE INDEX idx_recovery_runs_status ON queue_recovery_runs(status);

-- Create queue_statistics view
CREATE OR REPLACE VIEW queue_statistics AS
SELECT
  queue_name,
  COUNT(*) FILTER (WHERE status = 'waiting') as waiting_count,
  COUNT(*) FILTER (WHERE status = 'active') as active_count,
  COUNT(*) FILTER (WHERE status = 'completed') as completed_count,
  COUNT(*) FILTER (WHERE status = 'failed') as failed_count,
  COUNT(*) FILTER (WHERE status = 'delayed') as delayed_count,
  COUNT(*) FILTER (WHERE status = 'dead_letter') as dead_letter_count,
  COUNT(*) as total_count,
  AVG(processing_duration_ms) FILTER (WHERE status = 'completed') as avg_processing_time_ms,
  MAX(processing_duration_ms) FILTER (WHERE status = 'completed') as max_processing_time_ms,
  COUNT(*) FILTER (WHERE status = 'failed' AND attempt_number < max_attempts) as retryable_count
FROM queue_jobs
WHERE created_at >= NOW() - INTERVAL '24 hours'
GROUP BY queue_name;

-- Create dead_letter_queue_summary view
CREATE OR REPLACE VIEW dead_letter_queue_summary AS
SELECT
  original_queue_name as queue_name,
  COUNT(*) as total_failed_jobs,
  COUNT(*) FILTER (WHERE recovery_status = 'pending') as pending_recovery,
  COUNT(*) FILTER (WHERE recovery_status = 'recovered') as recovered,
  COUNT(*) FILTER (WHERE recovery_status = 'permanently_failed') as permanently_failed,
  COUNT(*) FILTER (WHERE recovery_status = 'ignored') as ignored,
  AVG(total_attempts) as avg_attempts_before_failure,
  MAX(created_at) as last_failure_at
FROM dead_letter_queue
GROUP BY original_queue_name;

-- Create function to calculate next retry delay (exponential backoff)
CREATE OR REPLACE FUNCTION calculate_next_retry_delay(
  attempt_number INTEGER,
  retry_delays INTEGER[]
) RETURNS INTEGER AS $$
BEGIN
  -- If attempt number exceeds array length, use last delay
  IF attempt_number > array_length(retry_delays, 1) THEN
    RETURN retry_delays[array_length(retry_delays, 1)];
  END IF;
  
  RETURN retry_delays[attempt_number];
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Create function to move job to dead letter queue
CREATE OR REPLACE FUNCTION move_job_to_dead_letter_queue(
  p_job_id VARCHAR(255)
) RETURNS UUID AS $$
DECLARE
  v_job RECORD;
  v_dlq_id UUID;
BEGIN
  -- Get job details
  SELECT * INTO v_job
  FROM queue_jobs
  WHERE job_id = p_job_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Job not found: %', p_job_id;
  END IF;
  
  -- Insert into dead letter queue
  INSERT INTO dead_letter_queue (
    original_job_id,
    original_queue_name,
    original_job_name,
    original_job_data,
    failure_reason,
    failure_stack,
    total_attempts,
    error_history
  )
  VALUES (
    v_job.job_id,
    v_job.queue_name,
    v_job.job_name,
    v_job.job_data,
    v_job.last_error_message,
    v_job.last_error_stack,
    v_job.attempt_number,
    v_job.error_history
  )
  RETURNING id INTO v_dlq_id;
  
  -- Update original job status
  UPDATE queue_jobs
  SET status = 'dead_letter',
      moved_to_dlq_at = NOW(),
      updated_at = NOW()
  WHERE job_id = p_job_id;
  
  RETURN v_dlq_id;
END;
$$ LANGUAGE plpgsql;

-- Create function to get jobs ready for retry
CREATE OR REPLACE FUNCTION get_jobs_ready_for_retry(
  p_limit INTEGER DEFAULT 100
) RETURNS TABLE (
  job_id VARCHAR(255),
  queue_name VARCHAR(100),
  job_name VARCHAR(100),
  job_data JSONB,
  attempt_number INTEGER,
  max_attempts INTEGER,
  last_error_message TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    qj.job_id,
    qj.queue_name,
    qj.job_name,
    qj.job_data,
    qj.attempt_number,
    qj.max_attempts,
    qj.last_error_message
  FROM queue_jobs qj
  WHERE qj.status = 'failed'
  AND qj.attempt_number < qj.max_attempts
  AND qj.next_retry_at <= NOW()
  ORDER BY qj.next_retry_at ASC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- Create function to get jobs that should move to DLQ
CREATE OR REPLACE FUNCTION get_jobs_for_dead_letter_queue(
  p_limit INTEGER DEFAULT 100
) RETURNS TABLE (
  job_id VARCHAR(255),
  queue_name VARCHAR(100),
  job_name VARCHAR(100),
  attempt_number INTEGER,
  last_error_message TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    qj.job_id,
    qj.queue_name,
    qj.job_name,
    qj.attempt_number,
    qj.last_error_message
  FROM queue_jobs qj
  WHERE qj.status = 'failed'
  AND qj.attempt_number >= qj.max_attempts
  AND qj.moved_to_dlq_at IS NULL
  ORDER BY qj.failed_at ASC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to update updated_at
CREATE OR REPLACE FUNCTION update_queue_jobs_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_queue_jobs_timestamp
BEFORE UPDATE ON queue_jobs
FOR EACH ROW
EXECUTE FUNCTION update_queue_jobs_timestamp();

CREATE TRIGGER trigger_update_dlq_timestamp
BEFORE UPDATE ON dead_letter_queue
FOR EACH ROW
EXECUTE FUNCTION update_queue_jobs_timestamp();

-- Add comments
COMMENT ON TABLE queue_jobs IS 'Tracks all queue jobs with retry logic';
COMMENT ON TABLE dead_letter_queue IS 'Stores permanently failed jobs for manual review';
COMMENT ON TABLE queue_retry_log IS 'Audit trail of all retry attempts';
COMMENT ON TABLE queue_recovery_runs IS 'Tracks recovery worker execution';
COMMENT ON VIEW queue_statistics IS 'Real-time queue statistics';
COMMENT ON VIEW dead_letter_queue_summary IS 'Summary of dead letter queue by queue name';
