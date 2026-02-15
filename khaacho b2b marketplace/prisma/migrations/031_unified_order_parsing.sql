-- Unified Order Parsing System
-- Stores parsing results from WhatsApp and OCR sources

-- Create order_parsing_log table
CREATE TABLE IF NOT EXISTS order_parsing_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Source information
    source VARCHAR(20) NOT NULL CHECK (source IN ('whatsapp', 'ocr')),
    raw_text TEXT NOT NULL,
    
    -- References
    retailer_id UUID NOT NULL REFERENCES retailers(id) ON DELETE CASCADE,
    order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
    
    -- Extracted items (raw extraction)
    extracted_items JSONB NOT NULL DEFAULT '{}',
    
    -- Normalized items (matched against catalog)
    normalized_items JSONB NOT NULL DEFAULT '{}',
    
    -- Confidence and status
    overall_confidence DECIMAL(5,2) DEFAULT 0 CHECK (overall_confidence >= 0 AND overall_confidence <= 100),
    needs_clarification BOOLEAN DEFAULT false,
    status VARCHAR(50) DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PENDING_REVIEW', 'COMPLETED', 'FAILED', 'CANCELLED')),
    
    -- Clarification tracking
    clarification_sent BOOLEAN DEFAULT false,
    clarification_sent_at TIMESTAMP,
    clarification_response TEXT,
    clarification_responded_at TIMESTAMP,
    
    -- Processing metadata
    processing_duration_ms INT,
    error_message TEXT,
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX idx_order_parsing_log_retailer_id ON order_parsing_log(retailer_id);
CREATE INDEX idx_order_parsing_log_order_id ON order_parsing_log(order_id);
CREATE INDEX idx_order_parsing_log_source ON order_parsing_log(source);
CREATE INDEX idx_order_parsing_log_status ON order_parsing_log(status);
CREATE INDEX idx_order_parsing_log_needs_clarification ON order_parsing_log(needs_clarification);
CREATE INDEX idx_order_parsing_log_created_at ON order_parsing_log(created_at DESC);
CREATE INDEX idx_order_parsing_log_confidence ON order_parsing_log(overall_confidence);

-- GIN index for JSONB search
CREATE INDEX idx_order_parsing_log_extracted_items ON order_parsing_log USING GIN (extracted_items);
CREATE INDEX idx_order_parsing_log_normalized_items ON order_parsing_log USING GIN (normalized_items);

-- Comments
COMMENT ON TABLE order_parsing_log IS 'Stores parsing results from WhatsApp and OCR sources with confidence scoring';
COMMENT ON COLUMN order_parsing_log.source IS 'Input source: whatsapp or ocr';
COMMENT ON COLUMN order_parsing_log.raw_text IS 'Original unprocessed text input';
COMMENT ON COLUMN order_parsing_log.extracted_items IS 'Raw extracted items before normalization';
COMMENT ON COLUMN order_parsing_log.normalized_items IS 'Items matched against product catalog';
COMMENT ON COLUMN order_parsing_log.overall_confidence IS 'Average confidence score (0-100)';
COMMENT ON COLUMN order_parsing_log.needs_clarification IS 'True if confidence < 80% and requires user confirmation';

