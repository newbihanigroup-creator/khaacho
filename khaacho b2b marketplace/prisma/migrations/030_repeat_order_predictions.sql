-- Repeat Order Prediction System
-- Track order patterns and predict next orders

-- Create order_patterns table to track frequently ordered items
CREATE TABLE IF NOT EXISTS order_patterns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    retailer_id UUID NOT NULL REFERENCES retailers(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    
    -- Pattern metrics
    order_count INT DEFAULT 0,
    total_quantity DECIMAL(12,2) DEFAULT 0,
    average_quantity DECIMAL(12,2) DEFAULT 0,
    
    -- Frequency analysis
    average_days_between_orders DECIMAL(8,2) DEFAULT 0,
    min_days_between_orders INT DEFAULT 0,
    max_days_between_orders INT DEFAULT 0,
    frequency_consistency DECIMAL(5,2) DEFAULT 0, -- 0-100, higher = more consistent
    
    -- Dates
    first_order_date TIMESTAMP,
    last_order_date TIMESTAMP,
    predicted_next_order_date TIMESTAMP,
    
    -- Status
    is_frequent BOOLEAN DEFAULT false, -- true if ordered 3+ times
    is_predictable BOOLEAN DEFAULT false, -- true if frequency is consistent
    
    -- Timestamps
    last_calculated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(retailer_id, product_id)
);

CREATE INDEX idx_order_patterns_retailer_id ON order_patterns(retailer_id);
CREATE INDEX idx_order_patterns_product_id ON order_patterns(product_id);
CREATE INDEX idx_order_patterns_predicted_date ON order_patterns(predicted_next_order_date);
CREATE INDEX idx_order_patterns_is_frequent ON order_patterns(is_frequent);
CREATE INDEX idx_order_patterns_is_predictable ON order_patterns(is_predictable);

-- Create order_predictions table to track prediction reminders
CREATE TABLE IF NOT EXISTS order_predictions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    retailer_id UUID NOT NULL REFERENCES retailers(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    
    -- Prediction details
    predicted_order_date DATE NOT NULL,
    predicted_quantity DECIMAL(12,2),
    confidence_score DECIMAL(5,2) DEFAULT 0, -- 0-100
    
    -- Pattern context
    average_days_between_orders DECIMAL(8,2),
    last_order_date TIMESTAMP,
    order_count INT,
    
    -- Reminder status
    reminder_sent BOOLEAN DEFAULT false,
    reminder_sent_at TIMESTAMP,
    reminder_message TEXT,
    
    -- Response tracking
    order_placed BOOLEAN DEFAULT false,
    order_placed_at TIMESTAMP,
    order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
    
    -- Cycle control (prevent duplicate reminders)
    cycle_id VARCHAR(100) NOT NULL, -- Format: retailer_id:product_id:YYYY-MM-DD
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(cycle_id)
);

CREATE INDEX idx_order_predictions_retailer_id ON order_predictions(retailer_id);
CREATE INDEX idx_order_predictions_product_id ON order_predictions(product_id);
CREATE INDEX idx_order_predictions_predicted_date ON order_predictions(predicted_order_date);
CREATE INDEX idx_order_predictions_reminder_sent ON order_predictions(reminder_sent);
CREATE INDEX idx_order_predictions_cycle_id ON order_predictions(cycle_id);
CREATE INDEX idx_order_predictions_created_at ON order_predictions(created_at DESC);

-- Create prediction_reminders_log for audit trail
CREATE TABLE IF NOT EXISTS prediction_reminders_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    prediction_id UUID NOT NULL REFERENCES order_predictions(id) ON DELETE CASCADE,
    retailer_id UUID NOT NULL REFERENCES retailers(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    
    -- Reminder details
    reminder_type VARCHAR(50) DEFAULT 'whatsapp', -- 'whatsapp', 'sms', 'email'
    message TEXT,
    
    -- Delivery status
    status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'sent', 'delivered', 'failed'
    sent_at TIMESTAMP,
    delivered_at TIMESTAMP,
    failed_at TIMESTAMP,
    failure_reason TEXT,
    
    -- Response
    customer_responded BOOLEAN DEFAULT false,
    response_type VARCHAR(50), -- 'order_placed', 'not_interested', 'later'
    response_at TIMESTAMP,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_prediction_reminders_log_prediction_id ON prediction_reminders_log(prediction_id);
CREATE INDEX idx_prediction_reminders_log_retailer_id ON prediction_reminders_log(retailer_id);
CREATE INDEX idx_prediction_reminders_log_status ON prediction_reminders_log(status);
CREATE INDEX idx_prediction_reminders_log_created_at ON prediction_reminders_log(created_at DESC);

-- Function to calculate order patterns
CREATE OR REPLACE FUNCTION calculate_order_pattern(
    p_retailer_id UUID,
    p_product_id UUID
) RETURNS void AS $$
DECLARE
    v_order_count INT;
    v_total_quantity DECIMAL;
    v_avg_quantity DECIMAL;
    v_first_order_date TIMESTAMP;
    v_last_order_date TIMESTAMP;
    v_avg_days DECIMAL;
    v_min_days INT;
    v_max_days INT;
    v_consistency DECIMAL;
    v_predicted_date TIMESTAMP;
    v_is_frequent BOOLEAN;
    v_is_predictable BOOLEAN;
BEGIN
    -- Get order statistics
    SELECT 
        COUNT(DISTINCT o.id),
        SUM(oi.quantity),
        AVG(oi.quantity),
        MIN(o.created_at),
        MAX(o.created_at)
    INTO v_order_count, v_total_quantity, v_avg_quantity, v_first_order_date, v_last_order_date
    FROM orders o
    INNER JOIN order_items oi ON oi.order_id = o.id
    WHERE o.retailer_id = p_retailer_id
      AND oi.product_id = p_product_id
      AND o.status IN ('COMPLETED', 'DELIVERED');
    
    -- Calculate frequency if multiple orders
    IF v_order_count >= 2 THEN
        WITH order_dates AS (
            SELECT 
                o.created_at,
                LAG(o.created_at) OVER (ORDER BY o.created_at) as prev_order_date
            FROM orders o
            INNER JOIN order_items oi ON oi.order_id = o.id
            WHERE o.retailer_id = p_retailer_id
              AND oi.product_id = p_product_id
              AND o.status IN ('COMPLETED', 'DELIVERED')
        ),
        intervals AS (
            SELECT 
                EXTRACT(EPOCH FROM (created_at - prev_order_date)) / 86400 as days_between
            FROM order_dates
            WHERE prev_order_date IS NOT NULL
        )
        SELECT 
            AVG(days_between),
            MIN(days_between),
            MAX(days_between),
            CASE 
                WHEN STDDEV(days_between) = 0 THEN 100
                WHEN AVG(days_between) > 0 THEN 
                    GREATEST(0, 100 - (STDDEV(days_between) / AVG(days_between) * 100))
                ELSE 0
            END
        INTO v_avg_days, v_min_days, v_max_days, v_consistency
        FROM intervals;
        
        -- Predict next order date
        v_predicted_date := v_last_order_date + (v_avg_days || ' days')::INTERVAL;
    ELSE
        v_avg_days := 0;
        v_min_days := 0;
        v_max_days := 0;
        v_consistency := 0;
        v_predicted_date := NULL;
    END IF;
    
    -- Determine if frequent and predictable
    v_is_frequent := v_order_count >= 3;
    v_is_predictable := v_is_frequent AND v_consistency >= 60;
    
    -- Upsert pattern
    INSERT INTO order_patterns (
        retailer_id,
        product_id,
        order_count,
        total_quantity,
        average_quantity,
        average_days_between_orders,
        min_days_between_orders,
        max_days_between_orders,
        frequency_consistency,
        first_order_date,
        last_order_date,
        predicted_next_order_date,
        is_frequent,
        is_predictable,
        last_calculated_at,
        updated_at
    ) VALUES (
        p_retailer_id,
        p_product_id,
        v_order_count,
        v_total_quantity,
        v_avg_quantity,
        v_avg_days,
        v_min_days,
        v_max_days,
        v_consistency,
        v_first_order_date,
        v_last_order_date,
        v_predicted_date,
        v_is_frequent,
        v_is_predictable,
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
    )
    ON CONFLICT (retailer_id, product_id) DO UPDATE SET
        order_count = EXCLUDED.order_count,
        total_quantity = EXCLUDED.total_quantity,
        average_quantity = EXCLUDED.average_quantity,
        average_days_between_orders = EXCLUDED.average_days_between_orders,
        min_days_between_orders = EXCLUDED.min_days_between_orders,
        max_days_between_orders = EXCLUDED.max_days_between_orders,
        frequency_consistency = EXCLUDED.frequency_consistency,
        first_order_date = EXCLUDED.first_order_date,
        last_order_date = EXCLUDED.last_order_date,
        predicted_next_order_date = EXCLUDED.predicted_next_order_date,
        is_frequent = EXCLUDED.is_frequent,
        is_predictable = EXCLUDED.is_predictable,
        last_calculated_at = EXCLUDED.last_calculated_at,
        updated_at = EXCLUDED.updated_at;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update patterns when order is completed
CREATE OR REPLACE FUNCTION trigger_update_order_patterns()
RETURNS TRIGGER AS $$
BEGIN
    -- Only process completed orders
    IF NEW.status IN ('COMPLETED', 'DELIVERED') 
       AND (OLD.status IS NULL OR OLD.status NOT IN ('COMPLETED', 'DELIVERED')) THEN
        
        -- Update patterns for all items in the order
        PERFORM calculate_order_pattern(NEW.retailer_id, oi.product_id)
        FROM order_items oi
        WHERE oi.order_id = NEW.id;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_order_patterns_update ON orders;
CREATE TRIGGER trigger_order_patterns_update
    AFTER UPDATE ON orders
    FOR EACH ROW
    EXECUTE FUNCTION trigger_update_order_patterns();

-- Add comments
COMMENT ON TABLE order_patterns IS 'Tracks order frequency patterns for repeat order predictions';
COMMENT ON TABLE order_predictions IS 'Stores predictions and reminder status with cycle control';
COMMENT ON TABLE prediction_reminders_log IS 'Audit trail for prediction reminders';
