-- Migration: Add Rejected Orders Table
-- Purpose: Track orders rejected due to credit limit or other validation failures
-- Date: 2026-02-14

-- Create rejected_orders table
CREATE TABLE IF NOT EXISTS rejected_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  retailer_id UUID NOT NULL REFERENCES retailers(id) ON DELETE CASCADE,
  order_data JSONB NOT NULL,
  rejection_reason VARCHAR(100) NOT NULL,
  rejection_message TEXT NOT NULL,
  requested_amount DECIMAL(15, 2) NOT NULL DEFAULT 0,
  available_credit DECIMAL(15, 2) NOT NULL DEFAULT 0,
  shortfall DECIMAL(15, 2),
  metadata JSONB,
  is_reviewed BOOLEAN NOT NULL DEFAULT FALSE,
  reviewed_at TIMESTAMP,
  reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  review_notes TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for performance
CREATE INDEX idx_rejected_orders_retailer_id ON rejected_orders(retailer_id, created_at DESC);
CREATE INDEX idx_rejected_orders_rejection_reason ON rejected_orders(rejection_reason);
CREATE INDEX idx_rejected_orders_is_reviewed ON rejected_orders(is_reviewed, created_at DESC);
CREATE INDEX idx_rejected_orders_created_at ON rejected_orders(created_at DESC);
CREATE INDEX idx_rejected_orders_reviewed_by ON rejected_orders(reviewed_by);

-- Add comments
COMMENT ON TABLE rejected_orders IS 'Tracks orders rejected due to credit limit or validation failures';
COMMENT ON COLUMN rejected_orders.order_data IS 'Complete order data that was rejected';
COMMENT ON COLUMN rejected_orders.rejection_reason IS 'Reason code for rejection (CREDIT_LIMIT_EXCEEDED, ACCOUNT_INACTIVE, etc.)';
COMMENT ON COLUMN rejected_orders.shortfall IS 'Amount by which order exceeds available credit';
COMMENT ON COLUMN rejected_orders.metadata IS 'Additional metadata (WhatsApp message ID, phone number, etc.)';
COMMENT ON COLUMN rejected_orders.is_reviewed IS 'Whether admin has reviewed this rejection';

-- Create trigger for updated_at
CREATE OR REPLACE FUNCTION update_rejected_orders_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_rejected_orders_updated_at
  BEFORE UPDATE ON rejected_orders
  FOR EACH ROW
  EXECUTE FUNCTION update_rejected_orders_updated_at();
