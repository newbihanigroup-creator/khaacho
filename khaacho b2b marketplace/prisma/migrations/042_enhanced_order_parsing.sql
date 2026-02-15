-- Migration: Enhanced Order Parsing System
-- Description: Multi-modal order parsing with normalization and clarification

-- ============================================================================
-- PRODUCT NAME ALIASES (Normalization)
-- ============================================================================

CREATE TABLE IF NOT EXISTS product_name_aliases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Product reference
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  
  -- Alias details
  alias_name VARCHAR(255) NOT NULL,
  alias_type VARCHAR(50) NOT NULL, -- COMMON_NAME, BRAND_NAME, MISSPELLING, ABBREVIATION, LOCAL_NAME
  language VARCHAR(10) DEFAULT 'en',
  
  -- Confidence and usage
  confidence_score DECIMAL(5,2) DEFAULT 100.00,
  usage_count INTEGER DEFAULT 0,
  last_used_at TIMESTAMP,
  
  -- Status
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  verified BOOLEAN DEFAULT FALSE,
  
  -- Timestamps
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  UNIQUE(product_id, alias_name)
);

-- Indexes
CREATE INDEX idx_product_name_aliases_product_id ON product_name_aliases(product_id);
CREATE INDEX idx_product_name_aliases_alias_name ON product_name_aliases(LOWER(alias_name));
CREATE INDEX idx_product_name_aliases_active ON product_name_aliases(is_active) WHERE is_active = TRUE;
CREATE INDEX idx_product_name_aliases_usage ON product_name_aliases(usage_count DESC);

-- ============================================================================
-- QUANTITY UNIT MAPPINGS
-- ============================================================================

CREATE TABLE IF NOT EXISTS quantity_unit_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Standard unit
  standard_unit VARCHAR(50) NOT NULL, -- kg, litre, piece, packet, carton, box, dozen
  
  -- Alias/variant
  unit_alias VARCHAR(50) NOT NULL,
  unit_type VARCHAR(50) NOT NULL, -- WEIGHT, VOLUME, COUNT, PACKAGE
  
  -- Conversion
  conversion_factor DECIMAL(10,4) DEFAULT 1.0, -- Multiplier to standard unit
  
  -- Examples
  example_usage TEXT,
  
  -- Status
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  
  -- Timestamps
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  UNIQUE(unit_alias)
);

-- Indexes
CREATE INDEX idx_quantity_unit_mappings_standard_unit ON quantity_unit_mappings(standard_unit);
CREATE INDEX idx_quantity_unit_mappings_alias ON quantity_unit_mappings(LOWER(unit_alias));
CREATE INDEX idx_quantity_unit_mappings_active ON quantity_unit_mappings(is_active) WHERE is_active = TRUE;

-- Insert common unit mappings
INSERT INTO quantity_unit_mappings (standard_unit, unit_alias, unit_type, conversion_factor, example_usage) VALUES
-- Weight units
('kg', 'kg', 'WEIGHT', 1.0, '5 kg rice'),
('kg', 'kgs', 'WEIGHT', 1.0, '5 kgs rice'),
('kg', 'kilogram', 'WEIGHT', 1.0, '5 kilogram rice'),
('kg', 'kilograms', 'WEIGHT', 1.0, '5 kilograms rice'),
('kg', 'kilo', 'WEIGHT', 1.0, '5 kilo rice'),
('kg', 'kilos', 'WEIGHT', 1.0, '5 kilos rice'),
('kg', 'gm', 'WEIGHT', 0.001, '500 gm sugar'),
('kg', 'gram', 'WEIGHT', 0.001, '500 gram sugar'),
('kg', 'grams', 'WEIGHT', 0.001, '500 grams sugar'),

-- Volume units
('litre', 'litre', 'VOLUME', 1.0, '2 litre oil'),
('litre', 'litres', 'VOLUME', 1.0, '2 litres oil'),
('litre', 'liter', 'VOLUME', 1.0, '2 liter oil'),
('litre', 'liters', 'VOLUME', 1.0, '2 liters oil'),
('litre', 'l', 'VOLUME', 1.0, '2 l oil'),
('litre', 'ml', 'VOLUME', 0.001, '500 ml juice'),

-- Count units
('piece', 'piece', 'COUNT', 1.0, '10 piece'),
('piece', 'pieces', 'COUNT', 1.0, '10 pieces'),
('piece', 'pc', 'COUNT', 1.0, '10 pc'),
('piece', 'pcs', 'COUNT', 1.0, '10 pcs'),
('piece', 'item', 'COUNT', 1.0, '10 item'),
('piece', 'items', 'COUNT', 1.0, '10 items'),

-- Package units
('packet', 'packet', 'PACKAGE', 1.0, '5 packet biscuits'),
('packet', 'packets', 'PACKAGE', 1.0, '5 packets biscuits'),
('packet', 'pack', 'PACKAGE', 1.0, '5 pack biscuits'),
('packet', 'packs', 'PACKAGE', 1.0, '5 packs biscuits'),
('carton', 'carton', 'PACKAGE', 1.0, '2 carton drinks'),
('carton', 'cartons', 'PACKAGE', 1.0, '2 cartons drinks'),
('box', 'box', 'PACKAGE', 1.0, '3 box chocolates'),
('box', 'boxes', 'PACKAGE', 1.0, '3 boxes chocolates'),
('dozen', 'dozen', 'PACKAGE', 12.0, '2 dozen eggs'),
('dozen', 'doz', 'PACKAGE', 12.0, '2 doz eggs')
ON CONFLICT (unit_alias) DO NOTHING;

-- ============================================================================
-- ORDER PARSING SESSIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS order_parsing_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Session identification
  session_id VARCHAR(100) NOT NULL UNIQUE,
  retailer_id UUID NOT NULL REFERENCES retailers(id),
  
  -- Input details
  input_type VARCHAR(50) NOT NULL, -- TEXT, VOICE, IMAGE, OCR
  raw_input TEXT NOT NULL,
  input_metadata JSONB, -- Additional data (file URL, audio duration, etc.)
  
  -- Parsing status
  status VARCHAR(50) NOT NULL DEFAULT 'PENDING', -- PENDING, PARSING, NEEDS_CLARIFICATION, COMPLETED, FAILED
  
  -- Parsed items
  parsed_items JSONB, -- Array of parsed items
  confidence_score DECIMAL(5,2),
  
  -- Clarification
  needs_clarification BOOLEAN DEFAULT FALSE,
  clarification_questions JSONB, -- Array of questions
  clarification_responses JSONB, -- Array of responses
  clarification_count INTEGER DEFAULT 0,
  
  -- Normalization
  normalized_items JSONB, -- Items after normalization
  normalization_changes JSONB, -- What was changed
  
  -- Final result
  final_order_data JSONB,
  order_id UUID REFERENCES orders(id),
  
  -- Timing
  started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP,
  processing_time_ms INTEGER,
  
  -- Timestamps
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX idx_order_parsing_sessions_session_id ON order_parsing_sessions(session_id);
CREATE INDEX idx_order_parsing_sessions_retailer_id ON order_parsing_sessions(retailer_id);
CREATE INDEX idx_order_parsing_sessions_status ON order_parsing_sessions(status);
CREATE INDEX idx_order_parsing_sessions_input_type ON order_parsing_sessions(input_type);
CREATE INDEX idx_order_parsing_sessions_created_at ON order_parsing_sessions(created_at DESC);

-- ============================================================================
-- PARSING CLARIFICATIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS parsing_clarifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Session reference
  session_id UUID NOT NULL REFERENCES order_parsing_sessions(id) ON DELETE CASCADE,
  
  -- Clarification details
  clarification_type VARCHAR(50) NOT NULL, -- MISSING_QUANTITY, AMBIGUOUS_PRODUCT, INVALID_UNIT, INCOMPLETE_INFO
  question TEXT NOT NULL,
  context JSONB, -- Context for the question
  
  -- Response
  response TEXT,
  responded_at TIMESTAMP,
  
  -- Resolution
  resolved BOOLEAN DEFAULT FALSE,
  resolution_data JSONB,
  
  -- Timestamps
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX idx_parsing_clarifications_session_id ON parsing_clarifications(session_id);
CREATE INDEX idx_parsing_clarifications_type ON parsing_clarifications(clarification_type);
CREATE INDEX idx_parsing_clarifications_resolved ON parsing_clarifications(resolved);

-- ============================================================================
-- PARSING ANALYTICS
-- ============================================================================

CREATE TABLE IF NOT EXISTS parsing_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Time window
  metric_timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  hour_bucket TIMESTAMP NOT NULL,
  
  -- Input type metrics
  text_orders INTEGER DEFAULT 0,
  voice_orders INTEGER DEFAULT 0,
  image_orders INTEGER DEFAULT 0,
  ocr_orders INTEGER DEFAULT 0,
  
  -- Success metrics
  successful_parses INTEGER DEFAULT 0,
  failed_parses INTEGER DEFAULT 0,
  needed_clarification INTEGER DEFAULT 0,
  
  -- Performance
  avg_confidence_score DECIMAL(5,2),
  avg_processing_time_ms INTEGER,
  
  -- Normalization
  items_normalized INTEGER DEFAULT 0,
  aliases_used INTEGER DEFAULT 0,
  units_converted INTEGER DEFAULT 0,
  
  -- Timestamps
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX idx_parsing_analytics_timestamp ON parsing_analytics(metric_timestamp DESC);
CREATE INDEX idx_parsing_analytics_hour_bucket ON parsing_analytics(hour_bucket);

-- ============================================================================
-- VIEWS FOR MONITORING
-- ============================================================================

-- Parsing success rate
CREATE OR REPLACE VIEW parsing_success_rate AS
SELECT
  DATE_TRUNC('day', metric_timestamp) as date,
  SUM(text_orders + voice_orders + image_orders + ocr_orders) as total_orders,
  SUM(successful_parses) as successful,
  SUM(failed_parses) as failed,
  SUM(needed_clarification) as needed_clarification,
  ROUND(
    (SUM(successful_parses)::DECIMAL / 
     NULLIF(SUM(text_orders + voice_orders + image_orders + ocr_orders), 0) * 100), 2
  ) as success_rate,
  AVG(avg_confidence_score) as avg_confidence,
  AVG(avg_processing_time_ms) as avg_processing_time
FROM parsing_analytics
WHERE metric_timestamp >= NOW() - INTERVAL '30 days'
GROUP BY DATE_TRUNC('day', metric_timestamp)
ORDER BY date DESC;

-- Most used aliases
CREATE OR REPLACE VIEW most_used_aliases AS
SELECT
  pna.alias_name,
  p.name as product_name,
  pna.alias_type,
  pna.usage_count,
  pna.confidence_score,
  pna.last_used_at
FROM product_name_aliases pna
JOIN products p ON pna.product_id = p.id
WHERE pna.is_active = TRUE
ORDER BY pna.usage_count DESC
LIMIT 100;

-- Clarification patterns
CREATE OR REPLACE VIEW clarification_patterns AS
SELECT
  clarification_type,
  COUNT(*) as occurrence_count,
  COUNT(*) FILTER (WHERE resolved = TRUE) as resolved_count,
  ROUND(
    (COUNT(*) FILTER (WHERE resolved = TRUE)::DECIMAL / 
     NULLIF(COUNT(*), 0) * 100), 2
  ) as resolution_rate,
  AVG(EXTRACT(EPOCH FROM (responded_at - created_at)) / 60) as avg_response_time_minutes
FROM parsing_clarifications
WHERE created_at >= NOW() - INTERVAL '30 days'
GROUP BY clarification_type
ORDER BY occurrence_count DESC;

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Normalize product name
CREATE OR REPLACE FUNCTION normalize_product_name(
  p_input_name VARCHAR
) RETURNS TABLE(
  product_id UUID,
  product_name VARCHAR,
  confidence DECIMAL,
  alias_used VARCHAR
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    pna.product_id,
    p.name,
    pna.confidence_score,
    pna.alias_name
  FROM product_name_aliases pna
  JOIN products p ON pna.product_id = p.id
  WHERE pna.is_active = TRUE
    AND LOWER(pna.alias_name) = LOWER(p_input_name)
  ORDER BY pna.confidence_score DESC, pna.usage_count DESC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- Normalize quantity unit
CREATE OR REPLACE FUNCTION normalize_quantity_unit(
  p_input_unit VARCHAR
) RETURNS TABLE(
  standard_unit VARCHAR,
  conversion_factor DECIMAL,
  unit_type VARCHAR
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    qum.standard_unit,
    qum.conversion_factor,
    qum.unit_type
  FROM quantity_unit_mappings qum
  WHERE qum.is_active = TRUE
    AND LOWER(qum.unit_alias) = LOWER(p_input_unit)
  LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- Record alias usage
CREATE OR REPLACE FUNCTION record_alias_usage(
  p_alias_name VARCHAR
) RETURNS VOID AS $$
BEGIN
  UPDATE product_name_aliases
  SET
    usage_count = usage_count + 1,
    last_used_at = NOW(),
    updated_at = NOW()
  WHERE LOWER(alias_name) = LOWER(p_alias_name)
    AND is_active = TRUE;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE product_name_aliases IS 'Product name variations for normalization';
COMMENT ON TABLE quantity_unit_mappings IS 'Unit variations and conversions';
COMMENT ON TABLE order_parsing_sessions IS 'Multi-modal order parsing sessions';
COMMENT ON TABLE parsing_clarifications IS 'Clarification questions and responses';
COMMENT ON TABLE parsing_analytics IS 'Parsing performance metrics';

COMMENT ON FUNCTION normalize_product_name IS 'Find product by alias name';
COMMENT ON FUNCTION normalize_quantity_unit IS 'Normalize unit to standard form';
COMMENT ON FUNCTION record_alias_usage IS 'Track alias usage for learning';
