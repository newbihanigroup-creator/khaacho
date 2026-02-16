`wsav-- Analytics & Intelligence Layer
-- Data Warehouse Aggregation Tables

-- Daily Sales Summary
CREATE TABLE IF NOT EXISTS daily_sales_summary (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  summary_date DATE NOT NULL UNIQUE,
  total_orders INT DEFAULT 0,
  completed_orders INT DEFAULT 0,
  cancelled_orders INT DEFAULT 0,
  total_gmv DECIMAL(15,2) DEFAULT 0,
  total_revenue DECIMAL(15,2) DEFAULT 0,
  total_margin DECIMAL(15,2) DEFAULT 0,
  avg_order_value DECIMAL(15,2) DEFAULT 0,
  total_credit_issued DECIMAL(15,2) DEFAULT 0,
  total_payments_received DECIMAL(15,2) DEFAULT 0,
  active_retailers INT DEFAULT 0,
  active_vendors INT DEFAULT 0,
  new_retailers INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_daily_sales_date ON daily_sales_summary(summary_date DESC);

-- Monthly Retailer Summary
CREATE TABLE IF NOT EXISTS monthly_retailer_summary (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  retailer_id UUID NOT NULL REFERENCES retailers(id) ON DELETE CASCADE,
  summary_month DATE NOT NULL,
  total_orders INT DEFAULT 0,
  total_purchase_value DECIMAL(15,2) DEFAULT 0,
  avg_order_value DECIMAL(15,2) DEFAULT 0,
  order_frequency DECIMAL(8,2) DEFAULT 0,
  total_payments DECIMAL(15,2) DEFAULT 0,
  avg_payment_delay_days DECIMAL(8,2) DEFAULT 0,
  credit_utilization_rate DECIMAL(5,2) DEFAULT 0,
  repayment_speed_score INT DEFAULT 0,
  growth_rate DECIMAL(5,2) DEFAULT 0,
  churn_risk_score INT DEFAULT 0,
  lifetime_value DECIMAL(15,2) DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(retailer_id, summary_month)
);

CREATE INDEX idx_monthly_retailer_month ON monthly_retailer_summary(summary_month DESC);
CREATE INDEX idx_monthly_retailer_retailer ON monthly_retailer_summary(retailer_id);
CREATE INDEX idx_monthly_retailer_churn ON monthly_retailer_summary(churn_risk_score DESC);

-- Vendor Performance Summary
CREATE TABLE IF NOT EXISTS vendor_performance_summary (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  summary_month DATE NOT NULL,
  total_orders INT DEFAULT 0,
  accepted_orders INT DEFAULT 0,
  completed_orders INT DEFAULT 0,
  cancelled_orders INT DEFAULT 0,
  acceptance_rate DECIMAL(5,2) DEFAULT 0,
  fulfillment_rate DECIMAL(5,2) DEFAULT 0,
  avg_margin_per_product DECIMAL(12,2) DEFAULT 0,
  price_competitiveness_index DECIMAL(5,2) DEFAULT 0,
  avg_accept_time_minutes INT DEFAULT 0,
  avg_delivery_time_hours DECIMAL(8,2) DEFAULT 0,
  late_delivery_rate DECIMAL(5,2) DEFAULT 0,
  cancellation_rate DECIMAL(5,2) DEFAULT 0,
  total_revenue DECIMAL(15,2) DEFAULT 0,
  performance_score INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(vendor_id, summary_month)
);

CREATE INDEX idx_vendor_perf_month ON vendor_performance_summary(summary_month DESC);
CREATE INDEX idx_vendor_perf_vendor ON vendor_performance_summary(vendor_id);
CREATE INDEX idx_vendor_perf_score ON vendor_performance_summary(performance_score DESC);

-- Credit Exposure Summary
CREATE TABLE IF NOT EXISTS credit_exposure_summary (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  summary_date DATE NOT NULL UNIQUE,
  total_credit_issued DECIMAL(15,2) DEFAULT 0,
  total_outstanding DECIMAL(15,2) DEFAULT 0,
  total_overdue DECIMAL(15,2) DEFAULT 0,
  aging_0_7_days DECIMAL(15,2) DEFAULT 0,
  aging_8_15_days DECIMAL(15,2) DEFAULT 0,
  aging_16_30_days DECIMAL(15,2) DEFAULT 0,
  aging_30_plus_days DECIMAL(15,2) DEFAULT 0,
  high_risk_exposure DECIMAL(15,2) DEFAULT 0,
  medium_risk_exposure DECIMAL(15,2) DEFAULT 0,
  low_risk_exposure DECIMAL(15,2) DEFAULT 0,
  default_rate DECIMAL(5,2) DEFAULT 0,
  recovery_rate DECIMAL(5,2) DEFAULT 0,
  credit_utilization_avg DECIMAL(5,2) DEFAULT 0,
  expected_inflow_7_days DECIMAL(15,2) DEFAULT 0,
  expected_inflow_30_days DECIMAL(15,2) DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_credit_exposure_date ON credit_exposure_summary(summary_date DESC);

-- Inventory Velocity Summary
CREATE TABLE IF NOT EXISTS inventory_velocity_summary (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  summary_month DATE NOT NULL,
  total_quantity_sold INT DEFAULT 0,
  total_revenue DECIMAL(15,2) DEFAULT 0,
  avg_price DECIMAL(12,2) DEFAULT 0,
  turnover_ratio DECIMAL(8,2) DEFAULT 0,
  days_of_stock_left INT DEFAULT 0,
  stockout_count INT DEFAULT 0,
  velocity_category VARCHAR(20) DEFAULT 'MEDIUM',
  demand_trend VARCHAR(20) DEFAULT 'STABLE',
  seasonal_index DECIMAL(5,2) DEFAULT 1.0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(product_id, summary_month)
);

CREATE INDEX idx_inventory_velocity_month ON inventory_velocity_summary(summary_month DESC);
CREATE INDEX idx_inventory_velocity_product ON inventory_velocity_summary(product_id);
CREATE INDEX idx_inventory_velocity_category ON inventory_velocity_summary(velocity_category);

-- Product Demand Forecast
CREATE TABLE IF NOT EXISTS product_demand_forecast (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  forecast_date DATE NOT NULL,
  forecast_period VARCHAR(20) NOT NULL,
  predicted_quantity INT DEFAULT 0,
  predicted_revenue DECIMAL(15,2) DEFAULT 0,
  confidence_level DECIMAL(5,2) DEFAULT 0,
  moving_avg_7_day DECIMAL(8,2) DEFAULT 0,
  moving_avg_30_day DECIMAL(8,2) DEFAULT 0,
  trend_slope DECIMAL(8,4) DEFAULT 0,
  seasonal_factor DECIMAL(5,2) DEFAULT 1.0,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(product_id, forecast_date, forecast_period)
);

CREATE INDEX idx_demand_forecast_product ON product_demand_forecast(product_id);
CREATE INDEX idx_demand_forecast_date ON product_demand_forecast(forecast_date DESC);

-- Intelligence Actions Log
CREATE TABLE IF NOT EXISTS intelligence_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action_type VARCHAR(50) NOT NULL,
  entity_type VARCHAR(50) NOT NULL,
  entity_id UUID,
  recommendation TEXT NOT NULL,
  priority VARCHAR(20) DEFAULT 'MEDIUM',
  status VARCHAR(20) DEFAULT 'PENDING',
  confidence_score DECIMAL(5,2) DEFAULT 0,
  metadata JSONB,
  executed_at TIMESTAMP,
  executed_by UUID,
  result TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_intelligence_actions_type ON intelligence_actions(action_type);
CREATE INDEX idx_intelligence_actions_status ON intelligence_actions(status, priority);
CREATE INDEX idx_intelligence_actions_created ON intelligence_actions(created_at DESC);

-- Platform Intelligence Metrics (CEO Dashboard)
CREATE TABLE IF NOT EXISTS platform_intelligence_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_date DATE NOT NULL UNIQUE,
  gross_merchandise_value DECIMAL(15,2) DEFAULT 0,
  net_margin DECIMAL(15,2) DEFAULT 0,
  net_margin_percentage DECIMAL(5,2) DEFAULT 0,
  total_credit_exposure DECIMAL(15,2) DEFAULT 0,
  credit_exposure_ratio DECIMAL(5,2) DEFAULT 0,
  cash_conversion_cycle_days INT DEFAULT 0,
  active_retailers INT DEFAULT 0,
  active_vendors INT DEFAULT 0,
  vendor_activation_rate DECIMAL(5,2) DEFAULT 0,
  revenue_per_retailer DECIMAL(15,2) DEFAULT 0,
  avg_order_frequency DECIMAL(8,2) DEFAULT 0,
  retailer_churn_rate DECIMAL(5,2) DEFAULT 0,
  vendor_reliability_score DECIMAL(5,2) DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_platform_metrics_date ON platform_intelligence_metrics(metric_date DESC);

COMMENT ON TABLE daily_sales_summary IS 'Daily aggregated sales and operational metrics';
COMMENT ON TABLE monthly_retailer_summary IS 'Monthly retailer behavior and performance metrics';
COMMENT ON TABLE vendor_performance_summary IS 'Monthly vendor performance and reliability metrics';
COMMENT ON TABLE credit_exposure_summary IS 'Daily credit risk and exposure tracking';
COMMENT ON TABLE inventory_velocity_summary IS 'Monthly product movement and inventory health';
COMMENT ON TABLE product_demand_forecast IS 'AI-driven demand predictions for products';
COMMENT ON TABLE intelligence_actions IS 'Automated system recommendations and actions';
COMMENT ON TABLE platform_intelligence_metrics IS 'CEO-level platform health metrics';
