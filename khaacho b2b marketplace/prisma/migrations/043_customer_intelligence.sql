-- Migration: Customer Intelligence Layer
-- Adds conversational intelligence for WhatsApp interactions

-- ============================================================================
-- 1. CUSTOMER MEMORY TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS customer_memory (
  id SERIAL PRIMARY KEY,
  retailer_id UUID NOT NULL REFERENCES retailers(id) ON DELETE CASCADE,
  
  -- Order history summary
  total_orders INTEGER DEFAULT 0,
  first_order_date TIMESTAMP,
  last_order_date TIMESTAMP,
  average_order_value DECIMAL(10, 2) DEFAULT 0,
  total_spent DECIMAL(12, 2) DEFAULT 0,
  
  -- Buying behavior
  is_frequent_buyer BOOLEAN DEFAULT false,
  average_days_between_orders DECIMAL(6, 2),
  order_frequency_tier VARCHAR(20), -- DAILY, WEEKLY, MONTHLY, OCCASIONAL
  preferred_order_day VARCHAR(10), -- MONDAY, TUESDAY, etc.
  preferred_order_time VARCHAR(10), -- MORNING, AFTERNOON, EVENING
  
  -- Product preferences
  favorite_products JSONB DEFAULT '[]'::jsonb,
  favorite_categories JSONB DEFAULT '[]'::jsonb,
  typical_basket_size INTEGER DEFAULT 0,
  
  -- Last interaction
  last_interaction_date TIMESTAMP,
  last_interaction_type VARCHAR(50), -- ORDER, INQUIRY, COMPLAINT, etc.
  
  -- Quick reorder
  last_order_items JSONB DEFAULT '[]'::jsonb,
  quick_reorder_available BOOLEAN DEFAULT false,
  
  -- Metadata
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  UNIQUE(retailer_id)
);

CREATE INDEX idx_customer_memory_retailer ON customer_memory(retailer_id);
CREATE INDEX idx_customer_memory_frequent ON customer_memory(is_frequent_buyer) WHERE is_frequent_buyer = true;
CREATE INDEX idx_customer_memory_last_order ON customer_memory(last_order_date);

-- ============================================================================
-- 2. CONVERSATION CONTEXT TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS conversation_context (
  id SERIAL PRIMARY KEY,
  retailer_id UUID NOT NULL REFERENCES retailers(id) ON DELETE CASCADE,
  session_id VARCHAR(100) NOT NULL,
  
  -- Context tracking
  current_intent VARCHAR(50), -- PLACE_ORDER, REORDER, INQUIRY, COMPLAINT
  conversation_stage VARCHAR(50), -- GREETING, COLLECTING_ITEMS, CONFIRMING, COMPLETED
  
  -- Pending actions
  pending_order_items JSONB DEFAULT '[]'::jsonb,
  pending_clarifications JSONB DEFAULT '[]'::jsonb,
  awaiting_response BOOLEAN DEFAULT false,
  awaiting_response_type VARCHAR(50), -- YES_NO, QUANTITY, PRODUCT_NAME, etc.
  
  -- Quick reorder context
  suggested_reorder JSONB,
  reorder_suggestion_sent BOOLEAN DEFAULT false,
  reorder_accepted BOOLEAN,
  
  -- Conversation metadata
  message_count INTEGER DEFAULT 0,
  started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_message_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP,
  is_active BOOLEAN DEFAULT true,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  UNIQUE(session_id)
);

CREATE INDEX idx_conversation_context_retailer ON conversation_context(retailer_id);
CREATE INDEX idx_conversation_context_active ON conversation_context(is_active) WHERE is_active = true;
CREATE INDEX idx_conversation_context_expires ON conversation_context(expires_at);

-- ============================================================================
-- 3. QUICK REORDER SUGGESTIONS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS quick_reorder_suggestions (
  id SERIAL PRIMARY KEY,
  retailer_id UUID NOT NULL REFERENCES retailers(id) ON DELETE CASCADE,
  
  -- Suggestion details
  suggestion_type VARCHAR(50) NOT NULL, -- LAST_ORDER, WEEKLY_PATTERN, PREDICTED
  reference_order_id UUID REFERENCES orders(id),
  suggested_items JSONB NOT NULL,
  total_items INTEGER NOT NULL,
  estimated_total DECIMAL(10, 2),
  
  -- Timing
  suggested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  valid_until TIMESTAMP,
  
  -- Response tracking
  suggestion_sent BOOLEAN DEFAULT false,
  sent_at TIMESTAMP,
  response_received BOOLEAN DEFAULT false,
  response_type VARCHAR(20), -- ACCEPTED, REJECTED, MODIFIED, IGNORED
  responded_at TIMESTAMP,
  
  -- Outcome
  order_created BOOLEAN DEFAULT false,
  created_order_id UUID REFERENCES orders(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  UNIQUE(retailer_id, suggestion_type, suggested_at)
);

CREATE INDEX idx_quick_reorder_retailer ON quick_reorder_suggestions(retailer_id);
CREATE INDEX idx_quick_reorder_pending ON quick_reorder_suggestions(suggestion_sent, response_received);
CREATE INDEX idx_quick_reorder_suggested_at ON quick_reorder_suggestions(suggested_at);

-- ============================================================================
-- 4. CONVERSATION MESSAGES TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS conversation_messages (
  id SERIAL PRIMARY KEY,
  session_id VARCHAR(100) NOT NULL REFERENCES conversation_context(session_id) ON DELETE CASCADE,
  retailer_id UUID NOT NULL REFERENCES retailers(id) ON DELETE CASCADE,
  
  -- Message details
  direction VARCHAR(10) NOT NULL, -- INBOUND, OUTBOUND
  message_type VARCHAR(50) NOT NULL, -- TEXT, SUGGESTION, CONFIRMATION, CLARIFICATION
  message_text TEXT NOT NULL,
  
  -- Context
  intent VARCHAR(50),
  entities JSONB DEFAULT '{}'::jsonb,
  
  -- Metadata
  sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  delivered_at TIMESTAMP,
  read_at TIMESTAMP,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_conversation_messages_session ON conversation_messages(session_id);
CREATE INDEX idx_conversation_messages_retailer ON conversation_messages(retailer_id);
CREATE INDEX idx_conversation_messages_sent_at ON conversation_messages(sent_at);

-- ============================================================================
-- 5. INTELLIGENCE METRICS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS customer_intelligence_metrics (
  id SERIAL PRIMARY KEY,
  metric_date DATE NOT NULL,
  hour_bucket TIMESTAMP NOT NULL,
  
  -- Suggestion metrics
  suggestions_sent INTEGER DEFAULT 0,
  suggestions_accepted INTEGER DEFAULT 0,
  suggestions_rejected INTEGER DEFAULT 0,
  suggestions_modified INTEGER DEFAULT 0,
  suggestions_ignored INTEGER DEFAULT 0,
  
  -- Conversion metrics
  quick_reorders_completed INTEGER DEFAULT 0,
  manual_orders_completed INTEGER DEFAULT 0,
  
  -- Engagement metrics
  active_conversations INTEGER DEFAULT 0,
  avg_messages_per_conversation DECIMAL(6, 2) DEFAULT 0,
  avg_response_time_seconds INTEGER DEFAULT 0,
  
  -- Performance
  suggestion_acceptance_rate DECIMAL(5, 2) DEFAULT 0,
  quick_reorder_conversion_rate DECIMAL(5, 2) DEFAULT 0,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  UNIQUE(hour_bucket)
);

CREATE INDEX idx_intelligence_metrics_date ON customer_intelligence_metrics(metric_date);
CREATE INDEX idx_intelligence_metrics_hour ON customer_intelligence_metrics(hour_bucket);

-- ============================================================================
-- 6. FUNCTIONS
-- ============================================================================

-- Function: Update customer memory after order
CREATE OR REPLACE FUNCTION update_customer_memory_after_order()
RETURNS TRIGGER AS $$
DECLARE
  v_retailer_id UUID;
  v_order_total DECIMAL(10, 2);
  v_item_count INTEGER;
BEGIN
  -- Get retailer ID and order details
  v_retailer_id := NEW.retailer_id;
  v_order_total := NEW.total_amount;
  
  -- Count items in order
  SELECT COUNT(*) INTO v_item_count
  FROM order_items
  WHERE order_id = NEW.id;
  
  -- Update or create customer memory
  INSERT INTO customer_memory (
    retailer_id,
    total_orders,
    first_order_date,
    last_order_date,
    total_spent,
    last_order_items,
    quick_reorder_available,
    updated_at
  )
  VALUES (
    v_retailer_id,
    1,
    NEW.created_at,
    NEW.created_at,
    v_order_total,
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'productId', product_id,
          'quantity', quantity,
          'unit', unit,
          'price', unit_price
        )
      )
      FROM order_items
      WHERE order_id = NEW.id
    ),
    true,
    CURRENT_TIMESTAMP
  )
  ON CONFLICT (retailer_id) DO UPDATE SET
    total_orders = customer_memory.total_orders + 1,
    last_order_date = NEW.created_at,
    total_spent = customer_memory.total_spent + v_order_total,
    average_order_value = (customer_memory.total_spent + v_order_total) / (customer_memory.total_orders + 1),
    last_order_items = (
      SELECT jsonb_agg(
        jsonb_build_object(
          'productId', product_id,
          'quantity', quantity,
          'unit', unit,
          'price', unit_price
        )
      )
      FROM order_items
      WHERE order_id = NEW.id
    ),
    quick_reorder_available = true,
    updated_at = CURRENT_TIMESTAMP;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger: Update customer memory on order creation
DROP TRIGGER IF EXISTS trigger_update_customer_memory ON orders;
CREATE TRIGGER trigger_update_customer_memory
  AFTER INSERT ON orders
  FOR EACH ROW
  WHEN (NEW.status != 'CANCELLED')
  EXECUTE FUNCTION update_customer_memory_after_order();

-- Function: Calculate buying frequency tier
CREATE OR REPLACE FUNCTION calculate_frequency_tier(avg_days DECIMAL)
RETURNS VARCHAR AS $$
BEGIN
  IF avg_days IS NULL THEN
    RETURN 'OCCASIONAL';
  ELSIF avg_days <= 2 THEN
    RETURN 'DAILY';
  ELSIF avg_days <= 10 THEN
    RETURN 'WEEKLY';
  ELSIF avg_days <= 35 THEN
    RETURN 'MONTHLY';
  ELSE
    RETURN 'OCCASIONAL';
  END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function: Refresh customer memory analytics
CREATE OR REPLACE FUNCTION refresh_customer_memory_analytics()
RETURNS void AS $$
BEGIN
  UPDATE customer_memory cm
  SET
    -- Calculate average days between orders
    average_days_between_orders = (
      SELECT AVG(days_between)
      FROM (
        SELECT 
          EXTRACT(EPOCH FROM (created_at - LAG(created_at) OVER (ORDER BY created_at))) / 86400 as days_between
        FROM orders
        WHERE retailer_id = cm.retailer_id
          AND status IN ('CONFIRMED', 'DELIVERED', 'COMPLETED')
        ORDER BY created_at
      ) gaps
      WHERE days_between IS NOT NULL
    ),
    
    -- Determine if frequent buyer (3+ orders in last 30 days)
    is_frequent_buyer = (
      SELECT COUNT(*) >= 3
      FROM orders
      WHERE retailer_id = cm.retailer_id
        AND created_at >= CURRENT_DATE - INTERVAL '30 days'
        AND status IN ('CONFIRMED', 'DELIVERED', 'COMPLETED')
    ),
    
    -- Calculate typical basket size
    typical_basket_size = (
      SELECT ROUND(AVG(item_count))
      FROM (
        SELECT COUNT(*) as item_count
        FROM order_items oi
        INNER JOIN orders o ON oi.order_id = o.id
        WHERE o.retailer_id = cm.retailer_id
          AND o.status IN ('CONFIRMED', 'DELIVERED', 'COMPLETED')
        GROUP BY o.id
      ) baskets
    ),
    
    updated_at = CURRENT_TIMESTAMP;
  
  -- Update frequency tiers
  UPDATE customer_memory
  SET order_frequency_tier = calculate_frequency_tier(average_days_between_orders);
  
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 7. VIEWS
-- ============================================================================

-- View: Frequent buyers summary
CREATE OR REPLACE VIEW frequent_buyers_summary AS
SELECT 
  cm.retailer_id,
  u.name as retailer_name,
  u.phone_number,
  cm.total_orders,
  cm.average_days_between_orders,
  cm.order_frequency_tier,
  cm.last_order_date,
  cm.quick_reorder_available,
  EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - cm.last_order_date)) / 86400 as days_since_last_order,
  CASE 
    WHEN cm.average_days_between_orders IS NOT NULL 
    THEN cm.last_order_date + (cm.average_days_between_orders || ' days')::INTERVAL
  END as predicted_next_order_date
FROM customer_memory cm
INNER JOIN retailers r ON cm.retailer_id = r.id
INNER JOIN users u ON r.user_id = u.id
WHERE cm.is_frequent_buyer = true
  AND r.deleted_at IS NULL
  AND u.is_active = true
ORDER BY cm.last_order_date DESC;

-- View: Quick reorder candidates
CREATE OR REPLACE VIEW quick_reorder_candidates AS
SELECT 
  cm.retailer_id,
  u.name as retailer_name,
  u.phone_number,
  cm.last_order_date,
  cm.last_order_items,
  cm.average_days_between_orders,
  EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - cm.last_order_date)) / 86400 as days_since_last_order,
  CASE 
    WHEN cm.average_days_between_orders IS NOT NULL 
    THEN EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - cm.last_order_date)) / 86400 >= cm.average_days_between_orders * 0.8
    ELSE false
  END as ready_for_reorder
FROM customer_memory cm
INNER JOIN retailers r ON cm.retailer_id = r.id
INNER JOIN users u ON r.user_id = u.id
WHERE cm.quick_reorder_available = true
  AND cm.last_order_items IS NOT NULL
  AND jsonb_array_length(cm.last_order_items) > 0
  AND r.deleted_at IS NULL
  AND u.is_active = true
ORDER BY days_since_last_order DESC;

-- View: Intelligence performance
CREATE OR REPLACE VIEW intelligence_performance AS
SELECT 
  metric_date,
  SUM(suggestions_sent) as total_suggestions,
  SUM(suggestions_accepted) as total_accepted,
  SUM(quick_reorders_completed) as total_quick_reorders,
  CASE 
    WHEN SUM(suggestions_sent) > 0 
    THEN ROUND((SUM(suggestions_accepted)::DECIMAL / SUM(suggestions_sent)) * 100, 2)
    ELSE 0
  END as acceptance_rate,
  CASE 
    WHEN SUM(suggestions_accepted) > 0 
    THEN ROUND((SUM(quick_reorders_completed)::DECIMAL / SUM(suggestions_accepted)) * 100, 2)
    ELSE 0
  END as conversion_rate
FROM customer_intelligence_metrics
GROUP BY metric_date
ORDER BY metric_date DESC;

-- ============================================================================
-- 8. INITIAL DATA
-- ============================================================================

-- Refresh customer memory for existing retailers
INSERT INTO customer_memory (retailer_id, created_at, updated_at)
SELECT DISTINCT r.id, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM retailers r
WHERE NOT EXISTS (
  SELECT 1 FROM customer_memory cm WHERE cm.retailer_id = r.id
)
AND r.deleted_at IS NULL;

-- Run initial analytics refresh
SELECT refresh_customer_memory_analytics();

COMMENT ON TABLE customer_memory IS 'Stores customer order history and buying patterns';
COMMENT ON TABLE conversation_context IS 'Tracks active WhatsApp conversation state';
COMMENT ON TABLE quick_reorder_suggestions IS 'Stores quick reorder suggestions sent to customers';
COMMENT ON TABLE conversation_messages IS 'Logs all conversation messages for analysis';
COMMENT ON TABLE customer_intelligence_metrics IS 'Tracks intelligence system performance metrics';
