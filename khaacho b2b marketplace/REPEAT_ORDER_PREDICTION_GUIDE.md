# Repeat Order Prediction System - Complete Guide

## Overview

The Repeat Order Prediction System analyzes historical order patterns and predicts when customers are likely to reorder products. It automatically sends WhatsApp reminders to encourage repeat purchases.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Order Completion                          │
│                           ↓                                  │
│              Database Trigger (Automatic)                    │
│                           ↓                                  │
│              calculate_order_pattern()                       │
│                           ↓                                  │
│                   order_patterns table                       │
│         (frequency, consistency, predicted date)             │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│              Daily Worker (2 AM)                             │
│                           ↓                                  │
│         Generate Predictions for Predictable Patterns        │
│                           ↓                                  │
│              order_predictions table                         │
│            (with cycle control via cycle_id)                 │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│              Daily Worker (9 AM)                             │
│                           ↓                                  │
│         Get Predictions Due for Reminder                     │
│                           ↓                                  │
│         Check Cycle Control (prevent duplicates)             │
│                           ↓                                  │
│         Send WhatsApp Reminder (throttled)                   │
│                           ↓                                  │
│         Log to prediction_reminders_log                      │
└─────────────────────────────────────────────────────────────┘
```

## Database Schema

### order_patterns
Tracks order frequency patterns per retailer-product combination.

**Key Fields:**
- `retailer_id`, `product_id`: Unique combination
- `order_count`: Total orders placed
- `average_days_between_orders`: Average frequency
- `frequency_consistency`: Score 0-100 (higher = more predictable)
- `predicted_next_order_date`: When next order is expected
- `is_frequent`: true if ordered 3+ times
- `is_predictable`: true if consistency >= 60%

**Automatic Updates:**
- Trigger `trigger_order_patterns_update` runs after order completion
- Calls `calculate_order_pattern()` function
- Recalculates all metrics and predicted date

### order_predictions
Stores predictions with cycle control to prevent duplicate reminders.

**Key Fields:**
- `cycle_id`: Unique key (format: `retailer_id:product_id:YYYY-MM-DD`)
- `predicted_order_date`: When order is expected
- `predicted_quantity`: Expected quantity based on average
- `confidence_score`: Same as frequency_consistency (0-100)
- `reminder_sent`: Boolean flag
- `order_placed`: Boolean flag (set when order is actually placed)

**Cycle Control:**
- `cycle_id` ensures only one reminder per retailer-product-date
- Prevents duplicate reminders if prediction is regenerated

### prediction_reminders_log
Audit trail for all reminder attempts.

**Key Fields:**
- `prediction_id`: Links to order_predictions
- `reminder_type`: 'whatsapp', 'sms', 'email'
- `status`: 'pending', 'sent', 'delivered', 'failed'
- `message`: Actual message sent
- `failure_reason`: Error details if failed

## Service Layer

### RepeatOrderPredictionService

**Core Methods:**

#### analyzeOrderPatterns(retailerId)
Analyzes all order patterns for a retailer.

```javascript
const analysis = await repeatOrderPredictionService.analyzeOrderPatterns(retailerId);
// Returns: { totalPatterns, predictablePatterns, patterns: [...] }
```

#### generatePredictions()
Creates predictions for all predictable patterns.

```javascript
const results = await repeatOrderPredictionService.generatePredictions();
// Returns: { total, created, skipped, failed, predictions: [...] }
```

**Logic:**
1. Find all patterns where `is_predictable = true`
2. Check if prediction already exists (via `cycle_id`)
3. Create new prediction if not exists
4. Skip if already exists (prevents duplicates)

#### sendPredictionReminders()
Sends WhatsApp reminders for predictions due today or tomorrow.

```javascript
const results = await repeatOrderPredictionService.sendPredictionReminders();
// Returns: { total, sent, failed, skipped }
```

**Logic:**
1. Find predictions where `predicted_order_date <= today + 1 day`
2. Check cycle control (ensure not already sent)
3. Format phone number (add country code if needed)
4. Generate personalized message
5. Send via WhatsApp throttling service
6. Log to audit trail

#### markOrderPlaced(predictionId, orderId)
Marks prediction as fulfilled when order is placed.

```javascript
await repeatOrderPredictionService.markOrderPlaced(predictionId, orderId);
```

#### getStatistics(filters)
Get prediction performance metrics.

```javascript
const stats = await repeatOrderPredictionService.getStatistics({
  retailerId: 'uuid',
  startDate: new Date('2026-01-01'),
  endDate: new Date('2026-12-31'),
});
// Returns: { totalPredictions, remindersSent, ordersPlaced, conversionRate, ... }
```

**Configuration:**

```javascript
// Default thresholds
{
  minOrders: 3,           // Minimum orders to be considered frequent
  minConsistency: 60,     // Minimum consistency score (0-100)
  reminderDaysBefore: 1,  // Send reminder 1 day before predicted date
  maxPredictionDays: 90,  // Don't predict beyond 90 days
}

// Update thresholds
repeatOrderPredictionService.updateThresholds({
  minOrders: 4,
  minConsistency: 70,
});
```

## Worker Layer

### RepeatOrderPredictionWorker

**Scheduled Jobs:**

1. **Generate Predictions** - Daily at 2 AM
   - Runs `generatePredictions()`
   - Creates new predictions for predictable patterns

2. **Send Reminders** - Daily at 9 AM
   - Runs `sendPredictionReminders()`
   - Sends WhatsApp messages to customers

3. **Update Statistics** - Daily at 11 PM
   - Runs `getStatistics()`
   - Logs performance metrics

**Usage:**

```javascript
const repeatOrderPredictionWorker = require('./src/workers/repeatOrderPrediction.worker');

// Start worker (in server.js)
repeatOrderPredictionWorker.start();

// Stop worker
repeatOrderPredictionWorker.stop();

// Run job manually
await repeatOrderPredictionWorker.runManual('generate');
await repeatOrderPredictionWorker.runManual('reminders');
await repeatOrderPredictionWorker.runManual('statistics');

// Get status
const status = repeatOrderPredictionWorker.getStatus();
```

## API Endpoints

### Analyze Patterns
```http
GET /api/predictions/analyze/:retailerId
Authorization: Bearer <token>

Response:
{
  "success": true,
  "data": {
    "retailerId": "uuid",
    "totalPatterns": 15,
    "predictablePatterns": 8,
    "frequentPatterns": 12,
    "patterns": [...]
  }
}
```

### Generate Predictions
```http
POST /api/predictions/generate
Authorization: Bearer <token>

Response:
{
  "success": true,
  "data": {
    "total": 50,
    "created": 45,
    "skipped": 5,
    "failed": 0
  }
}
```

### Send Reminders
```http
POST /api/predictions/send-reminders
Authorization: Bearer <token>

Response:
{
  "success": true,
  "data": {
    "total": 20,
    "sent": 18,
    "failed": 2,
    "skipped": 0
  }
}
```

### Get Retailer Predictions
```http
GET /api/predictions/retailer/:retailerId?status=pending
Authorization: Bearer <token>

Query Parameters:
- status: 'all' | 'pending' | 'sent' | 'completed'

Response:
{
  "success": true,
  "data": {
    "retailerId": "uuid",
    "count": 5,
    "predictions": [...]
  }
}
```

### Get Statistics
```http
GET /api/predictions/statistics?retailerId=uuid&startDate=2026-01-01
Authorization: Bearer <token>

Response:
{
  "success": true,
  "data": {
    "totalPredictions": 100,
    "remindersSent": 80,
    "ordersPlaced": 45,
    "conversionRate": 56.25,
    "averageConfidence": 75.5,
    "averagePredictionAccuracyDays": 1.2
  }
}
```

### Mark Order Placed
```http
POST /api/predictions/:predictionId/order-placed
Authorization: Bearer <token>
Content-Type: application/json

{
  "orderId": "uuid"
}

Response:
{
  "success": true,
  "message": "Prediction marked as order placed"
}
```

### Worker Management
```http
GET /api/predictions/worker/status
POST /api/predictions/worker/run/:jobName
```

### Configuration
```http
GET /api/predictions/configuration
PUT /api/predictions/configuration/thresholds
```

## WhatsApp Message Format

```
Hi {retailerName}! 👋

You usually order {productName} every {daysBetween} days.

Based on your pattern, you might need:
📦 {quantity} {unit} of {productName}

Would you like to reorder now?

Reply YES to place order or call us for assistance.
```

**Example:**
```
Hi Sharma Store! 👋

You usually order Rice (Basmati) every 7 days.

Based on your pattern, you might need:
📦 50 kg of Rice (Basmati)

Would you like to reorder now?

Reply YES to place order or call us for assistance.
```

## Integration Points

### 1. Order Completion Hook
When an order is marked as COMPLETED or DELIVERED:

```javascript
// Automatic via database trigger
// No code changes needed - trigger handles it
```

### 2. Order Creation Hook
When a customer places an order, check if it matches a prediction:

```javascript
const { orderId, retailerId, items } = orderData;

// Find matching predictions
const predictions = await prisma.orderPrediction.findMany({
  where: {
    retailerId,
    productId: { in: items.map(i => i.productId) },
    orderPlaced: false,
    predictedOrderDate: {
      gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // Within last 7 days
    },
  },
});

// Mark predictions as fulfilled
for (const prediction of predictions) {
  await repeatOrderPredictionService.markOrderPlaced(prediction.id, orderId);
}
```

### 3. Server Startup
Start the worker in your main server file:

```javascript
// src/server.js
const repeatOrderPredictionWorker = require('./workers/repeatOrderPrediction.worker');

// Start worker
repeatOrderPredictionWorker.start();

// Graceful shutdown
process.on('SIGTERM', () => {
  repeatOrderPredictionWorker.stop();
});
```

### 4. Routes Registration
```javascript
// src/routes/index.js
const repeatOrderPredictionRoutes = require('./repeatOrderPrediction.routes');

router.use('/predictions', repeatOrderPredictionRoutes);
```

## Testing

### Run Test Suite
```bash
node test-repeat-order-prediction.js
```

### Manual Testing

1. **Create test orders:**
```sql
-- Create 3+ orders for same retailer-product with consistent frequency
INSERT INTO orders (retailer_id, status, created_at, ...)
VALUES 
  ('retailer-uuid', 'COMPLETED', '2026-01-01', ...),
  ('retailer-uuid', 'COMPLETED', '2026-01-08', ...),
  ('retailer-uuid', 'COMPLETED', '2026-01-15', ...);
```

2. **Trigger pattern calculation:**
```sql
SELECT calculate_order_pattern('retailer-uuid'::uuid, 'product-uuid'::uuid);
```

3. **Check pattern:**
```sql
SELECT * FROM order_patterns 
WHERE retailer_id = 'retailer-uuid' 
  AND product_id = 'product-uuid';
```

4. **Generate predictions:**
```bash
curl -X POST http://localhost:3000/api/predictions/generate \
  -H "Authorization: Bearer <token>"
```

5. **Check predictions:**
```sql
SELECT * FROM order_predictions 
WHERE retailer_id = 'retailer-uuid';
```

6. **Send reminders (dry run):**
```bash
curl -X POST http://localhost:3000/api/predictions/send-reminders \
  -H "Authorization: Bearer <token>"
```

## Monitoring

### Key Metrics to Track

1. **Pattern Quality:**
   - Average frequency_consistency score
   - Percentage of patterns that are predictable
   - Distribution of order frequencies

2. **Prediction Accuracy:**
   - Average days between predicted and actual order
   - Conversion rate (reminders → orders)
   - False positive rate (reminders with no order)

3. **Reminder Performance:**
   - Delivery success rate
   - Response rate
   - Time to order after reminder

### Logging

All operations are logged with structured context:

```javascript
logger.info('Prediction created', {
  predictionId,
  retailerId,
  productId,
  predictedDate,
  confidenceScore,
});

logger.error('Reminder sending failed', {
  predictionId,
  retailerId,
  error: error.message,
  stack: error.stack,
});
```

### Database Queries for Monitoring

```sql
-- Patterns by consistency
SELECT 
  CASE 
    WHEN frequency_consistency >= 80 THEN 'High (80-100)'
    WHEN frequency_consistency >= 60 THEN 'Medium (60-79)'
    ELSE 'Low (0-59)'
  END as consistency_level,
  COUNT(*) as pattern_count
FROM order_patterns
WHERE is_frequent = true
GROUP BY consistency_level;

-- Prediction conversion rate
SELECT 
  COUNT(*) as total_reminders,
  COUNT(CASE WHEN order_placed = true THEN 1 END) as orders_placed,
  ROUND(
    COUNT(CASE WHEN order_placed = true THEN 1 END)::numeric / 
    COUNT(*)::numeric * 100, 
    2
  ) as conversion_rate
FROM order_predictions
WHERE reminder_sent = true;

-- Average prediction accuracy
SELECT 
  AVG(
    EXTRACT(EPOCH FROM (order_placed_at - predicted_order_date)) / 86400
  ) as avg_days_difference
FROM order_predictions
WHERE order_placed = true
  AND order_placed_at IS NOT NULL;
```

## Troubleshooting

### No Patterns Generated
**Problem:** `order_patterns` table is empty

**Solutions:**
1. Check if orders have status COMPLETED or DELIVERED
2. Verify trigger is installed: `\d+ orders` in psql
3. Manually run: `SELECT calculate_order_pattern('retailer-uuid', 'product-uuid');`

### No Predictions Created
**Problem:** `generatePredictions()` returns 0 created

**Solutions:**
1. Check if patterns have `is_predictable = true`
2. Verify `predicted_next_order_date` is not NULL
3. Check if predictions already exist (cycle_id conflict)

### Reminders Not Sending
**Problem:** `sendPredictionReminders()` returns 0 sent

**Solutions:**
1. Check if predictions have `reminder_sent = false`
2. Verify `predicted_order_date` is within reminder window
3. Check WhatsApp service configuration
4. Verify phone numbers are valid

### Duplicate Reminders
**Problem:** Same customer receives multiple reminders

**Solutions:**
1. Check cycle_id uniqueness
2. Verify `checkCycleControl()` is working
3. Check if predictions are being regenerated

## Performance Optimization

### Database Indexes
All necessary indexes are created in migration:
- `idx_order_patterns_retailer_id`
- `idx_order_patterns_predicted_date`
- `idx_order_predictions_cycle_id`
- `idx_order_predictions_reminder_sent`

### Batch Processing
Worker processes predictions in batches to avoid memory issues:

```javascript
// Process in chunks of 100
const BATCH_SIZE = 100;
for (let i = 0; i < patterns.length; i += BATCH_SIZE) {
  const batch = patterns.slice(i, i + BATCH_SIZE);
  await Promise.all(batch.map(p => createPrediction(p)));
}
```

### Caching
Consider caching frequently accessed data:
- Retailer phone numbers
- Product names
- Pattern statistics

## Future Enhancements

### ML-Based Predictions
Replace rule-based frequency calculation with ML model:

```javascript
// Train model on historical data
const model = await trainPredictionModel(historicalOrders);

// Use model for predictions
const predictedDate = await model.predict({
  retailerId,
  productId,
  orderHistory,
  seasonality,
  externalFactors,
});
```

### Multi-Channel Reminders
Add SMS and email support:

```javascript
const reminderChannels = ['whatsapp', 'sms', 'email'];
for (const channel of reminderChannels) {
  await sendReminder(prediction, channel);
}
```

### Dynamic Reminder Timing
Optimize reminder timing based on response patterns:

```javascript
// Learn best time to send reminders
const optimalTime = await analyzeResponsePatterns(retailerId);
// Send at optimal time instead of fixed 9 AM
```

### A/B Testing
Test different message formats:

```javascript
const messageVariants = ['variant_a', 'variant_b', 'variant_c'];
const variant = selectVariant(retailerId);
const message = generateMessage(prediction, variant);
```

## Support

For issues or questions:
1. Check logs: `logs/orders-*.log`, `logs/whatsapp-*.log`
2. Run test suite: `node test-repeat-order-prediction.js`
3. Check database: Query `order_patterns`, `order_predictions` tables
4. Review worker status: `GET /api/predictions/worker/status`
