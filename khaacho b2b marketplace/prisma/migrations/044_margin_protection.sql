-- Migration: Margin Protection System
-- Protects marketplace profitability with margin enforcement

-- ============================================================================
-- 1. MARGIN CONFIGURATION TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS margin_config (
  id SERIAL PRIMARY KEY,
  
  -- Margin thresholds (percentage)
  minimum_margin_percentage DECIMAL(5, 2) NOT NULL DEFAULT 10.00,
  target_margin_percentage DECIMAL(5, 2) NOT NULL DEFAULT 15.00,
  warning_margin_percentage DECIMAL(5, 2) NOT NULL DEFAULT 12.00,
  
  -- Category-specific margins
  category_margins JSONB DEFAULT '{}'::jsonb,
  
  -- Vendor-specific margins
  vendor_margins JSONB DEFAULT '{}'::jsonb,
  
  -- Actions
  auto_reject_below_minimum BOOLEAN DEFAULT true,
  require_approval_below_target BOOLEAN DEFAULT true,
  send_alerts BOOLEAN DEFAULT true,
  
  -- Platform fees
  platform_fee_percentage DECIMAL(5, 2) DEFAULT 5.00,
  payment_processing_fee_percentage DECIMAL(5, 2) DEFAULT 2.00,
  delivery_fee_percentage DECIMAL(5, 2) DEFAULT 3.00,
  
  -- Metadata
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by UUID REFERENCES users(id),
  
  -- Only one active config
  is_active BOOLEAN DEFAULT true,
  UNIQUE(is_active) WHERE is_active = true
);

CREATE INDEX idx_margin_config_active ON margin_config(is_active) WHERE is_active = true;

-- ============================================================================
-- 2. ORDER MARGIN ANALYSIS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS order_margin_analysis (
  id SERIAL PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  
  -- Pricing breakdown
  retailer_price DECIMAL(12, 2) NOT NULL,
  vendor_cost DECIMAL(12, 2) NOT NULL,
  gross_profit DECIMAL(12, 2) NOT NULL,
  
  -- Fees
  platform_fee DECIMAL(10, 2) DEFAULT 0,
  payment_processing_fee DECIMAL(10, 2) DEFAULT 0,
  delivery_fee DECIMAL(10, 2) DEFAULT 0,
  other_fees DECIMAL(10, 2) DEFAULT 0,
  total_fees DECIMAL(10, 2) NOT NULL,
  
  -- Net profit
  net_profit DECIMAL(12, 2) NOT NULL,
  net_margin_percentage DECIMAL(5, 2) NOT NULL,
  
  -- Margin status
  margin_status VARCHAR(20) NOT NULL, -- EXCELLENT, GOOD, WARNING, LOW, REJECTED
  meets_minimum BOOLEAN NOT NULL,
  meets_target BOOLEAN NOT NULL,
  
  -- Thresholds used
  minimum_threshold DECIMAL(5, 2) NOT NULL,
  target_threshold DECIMAL(5, 2) NOT NULL,
  
  -- Decision
  decision VARCHAR(20) NOT NULL, -- APPROVED, REJECTED, PENDING_APPROVAL, RENEGOTIATE
  decision_reason TEXT,
  approved_by UUID REFERENCES users(id),
  approved_at TIMESTAMP,
  
  -- Metadata
  analyzed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  UNIQUE(order_id)
);

CREATE INDEX idx_order_margin_order ON order_margin_analysis(order_id);
CREATE INDEX idx_order_margin_status ON order_m