-- Migration: WhatsApp Intent Detection and Conversation State
-- Description: Add tables for intent detection and conversation state management

-- Create conversation state table
CREATE TABLE IF NOT EXISTS whatsapp_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number VARCHAR(20) NOT NULL,
  retailer_id UUID REFERENCES retailers(id) ON DELETE CASCADE,
  
  -- Current conversation state
  current_intent VARCHAR(50),
  last_message_at TIMESTAMP NOT NULL DEFAULT NOW(),
  last_intent_at TIMESTAMP,
  
  -- Conversation context
  context JSONB DEFAULT '{}',
  pending_action VARCHAR(100),
  pending_order_data JSONB,
  
  -- Conversation metrics
  message_count INTEGER DEFAULT 0,
  successful_orders INTEGER DEFAULT 0,
  failed_orders INTEGER DEFAULT 0,
  help_requests INTEGER DEFAULT 0,
  
  -- Timestamps
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  
  -- Indexes
  CONSTRAINT unique_phone_number UNIQUE (phone_number)
);

CREATE INDEX idx_whatsapp_conversations_phone ON whatsapp_conversations(phone_number);
CREATE INDEX idx_whatsapp_conversations_retailer ON whatsapp_conversations(retailer_id);
CREATE INDEX idx_whatsapp_conversations_last_message ON whatsapp_conversations(last_message_at);

-- Create intent detection log table
CREATE TABLE IF NOT EXISTS whatsapp_intent_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES whatsapp_conversations(id) ON DELETE CASCADE,
  phone_number VARCHAR(20) NOT NULL,
  
  -- Message details
  message_text TEXT NOT NULL,
  message_id VARCHAR(255),
  
  -- Intent detection results
  detected_intent VARCHAR(50) NOT NULL,
  confidence_score INTEGER NOT NULL CHECK (confidence_score >= 0 AND confidence_score <= 100),
  alternative_intents JSONB DEFAULT '[]',
  
  -- Processing details
  processing_time_ms INTEGER,
  matched_patterns JSONB DEFAULT '[]',
  
  -- Action taken
  action_taken VARCHAR(100),
  response_sent TEXT,
  
  -- Timestamps
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_whatsapp_intent_log_conversation ON whatsapp_intent_log(conversation_id);
CREATE INDEX idx_whatsapp_intent_log_phone ON whatsapp_intent_log(phone_number);
CREATE INDEX idx_whatsapp_intent_log_intent ON whatsapp_intent_log(detected_intent);
CREATE INDEX idx_whatsapp_intent_log_created ON whatsapp_intent_log(created_at);

-- Create intent statistics view
CREATE OR REPLACE VIEW whatsapp_intent_statistics AS
SELECT
  detected_intent,
  COUNT(*) as total_count,
  AVG(confidence_score) as avg_confidence,
  MIN(confidence_score) as min_confidence,
  MAX(confidence_score) as max_confidence,
  AVG(processing_time_ms) as avg_processing_time_ms,
  COUNT(DISTINCT phone_number) as unique_users,
  DATE_TRUNC('day', created_at) as date
FROM whatsapp_intent_log
GROUP BY detected_intent, DATE_TRUNC('day', created_at)
ORDER BY date DESC, total_count DESC;

-- Create conversation activity view
CREATE OR REPLACE VIEW whatsapp_conversation_activity AS
SELECT
  wc.phone_number,
  wc.retailer_id,
  r.user_id,
  u.business_name,
  wc.current_intent,
  wc.message_count,
  wc.successful_orders,
  wc.failed_orders,
  wc.help_requests,
  wc.last_message_at,
  wc.created_at,
  EXTRACT(EPOCH FROM (NOW() - wc.last_message_at)) / 3600 as hours_since_last_message
FROM whatsapp_conversations wc
LEFT JOIN retailers r ON wc.retailer_id = r.id
LEFT JOIN users u ON r.user_id = u.id
ORDER BY wc.last_message_at DESC;

-- Add trigger to update updated_at
CREATE OR REPLACE FUNCTION update_whatsapp_conversation_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_whatsapp_conversation_timestamp
BEFORE UPDATE ON whatsapp_conversations
FOR EACH ROW
EXECUTE FUNCTION update_whatsapp_conversation_timestamp();

-- Add comments
COMMENT ON TABLE whatsapp_conversations IS 'Stores conversation state for each WhatsApp user';
COMMENT ON TABLE whatsapp_intent_log IS 'Logs all intent detection results for analytics';
COMMENT ON VIEW whatsapp_intent_statistics IS 'Aggregated statistics for intent detection performance';
COMMENT ON VIEW whatsapp_conversation_activity IS 'Active conversations with user details';
