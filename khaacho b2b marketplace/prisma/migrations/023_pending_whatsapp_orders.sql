-- Pending WhatsApp Orders Table
-- Stores orders awaiting confirmation from retailers

CREATE TABLE IF NOT EXISTS pending_whatsapp_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  retailer_id UUID NOT NULL REFERENCES retailers(id) ON DELETE CASCADE,
  order_data JSONB NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(retailer_id)
);

CREATE INDEX idx_pending_whatsapp_retailer ON pending_whatsapp_orders(retailer_id);
CREATE INDEX idx_pending_whatsapp_expires ON pending_whatsapp_orders(expires_at);

-- Auto-cleanup expired pending orders (runs every hour)
-- Note: This requires pg_cron extension or can be handled by application cron job
COMMENT ON TABLE pending_whatsapp_orders IS 'Temporary storage for WhatsApp orders awaiting confirmation';
