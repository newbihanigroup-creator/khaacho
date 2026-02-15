-- Migration: WhatsApp Message Throttling and Delivery Failure Tracking
-- Purpose: Track delivery failures and enable retry mechanism
-- Date: 2026-02-14

-- Create whatsapp_delivery_failures table
CREATE TABLE IF NOT EXISTS whatsapp_delivery_failures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number VARCHAR(20) NOT NULL,
  message TEXT NOT NULL,
  idempotency_key VARCHAR(100) NOT NULL,
  error_message TEXT,
  error_code VARCHAR(50),
  attempt_count INT NOT NULL DEFAULT 1,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  metadata JSONB,
  next_retry_at TIMESTAMP,
  last_attempt_at TIMESTAMP,
  resolved_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for performance
CREATE INDEX idx_whatsapp_failures_phone ON whatsapp_delivery_failures(phone_number);
CREATE INDEX idx_whatsapp_failures_status ON whatsapp_delivery_failures(status, next_retry_at);
CREATE INDEX idx_whatsapp_failures_idempotency ON whatsapp_delivery_failures(idempotency_key);
CREATE INDEX idx_whatsapp_failures_created_at ON whatsapp_delivery_failures(created_at DESC);
CREATE INDEX idx_whatsapp_failures_retry ON whatsapp_delivery_failures(status, next_retry_at, attempt_count);

-- Add comments
COMMENT ON TABLE whatsapp_delivery_failures IS 'Tracks WhatsApp message delivery failures for retry mechanism';
COMMENT ON COLUMN whatsapp_delivery_failures.phone_number IS 'Recipient phone number';
COMMENT ON COLUMN whatsapp_delivery_failures.idempotency_key IS 'Unique key to prevent duplicate messages';
COMMENT ON COLUMN whatsapp_delivery_failures.attempt_count IS 'Number of delivery attempts';
COMMENT ON COLUMN whatsapp_delivery_failures.status IS 'PENDING, RESOLVED, or FAILED';
COMMENT ON COLUMN whatsapp_delivery_failures.next_retry_at IS 'When to retry next (exponential backoff)';
COMMENT ON COLUMN whatsapp_delivery_failures.metadata IS 'Original message data and error details';

-- Create trigger for updated_at
CREATE OR REPLACE FUNCTION update_whatsapp_failures_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_whatsapp_failures_updated_at
  BEFORE UPDATE ON whatsapp_delivery_failures
  FOR EACH ROW
  EXECUTE FUNCTION update_whatsapp_failures_updated_at();

-- Add index to whatsapp_messages for idempotency key lookup
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_metadata_idempotency 
  ON whatsapp_messages USING gin (metadata jsonb_path_ops);

-- Add comment
COMMENT ON INDEX idx_whatsapp_messages_metadata_idempotency IS 'Index for fast idempotency key lookups in metadata';
