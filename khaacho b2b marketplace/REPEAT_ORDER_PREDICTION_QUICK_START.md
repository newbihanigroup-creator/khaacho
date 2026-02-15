# Repeat Order Prediction - Quick Start

## 1. Database Setup

The migration is already created. Deploy it:

```bash
npx prisma migrate deploy
```

This creates:
- `order_patterns` table
- `order_predictions` table
- `prediction_reminders_log` table
- `calculate_order_pattern()` function
- Automatic trigger on order completion

## 2. Install Dependencies

```bash
npm install node-cron
```

## 3. Start Worker

Add to `src/server.js`:

```javascript
const repeatOrderPredictionWorker = require('./workers/repeatOrderPrediction.worker');

// After server starts
repeatOrderPredictionWorker.start();

// Graceful shutdown
process.on('SIGTERM', () => {
  repeatOrderPredictionWorker.stop();
  process.exit(0);
});
```

## 4. Register Routes

Add to `src/routes/index.js`:

```javascript
const repeatOrderPredictionRoutes = require('./repeatOrderPrediction.routes');

router.use('/predictions', repeatOrderPredictionRoutes);
```

## 5. Test the System

```bash
# Run test suite
node test-repeat-order-prediction.js

# Generate predictions manually
curl -X POST http://localhost:3000/api/predictions/generate \
  -H "Authorization: Bearer <token>"

# Send reminders manually
curl -X POST http://localhost:3000/api/predictions/send-reminders \
  -H "Authorization: Bearer <token>"

# Check statistics
curl http://localhost:3000/api/predictions/statistics \
  -H "Authorization: Bearer <token>"
```

## 6. How It Works

### Automatic Pattern Tracking
When an order is completed:
```
Order Status → COMPLETED
       ↓
Database Trigger (automatic)
       ↓
calculate_order_pattern()
       ↓
order_patterns table updated
```

### Daily Prediction Generation (2 AM)
```
Worker runs at 2 AM
       ↓
Find predictable patterns
       ↓
Create predictions
       ↓
order_predictions table
```

### Daily Reminder Sending (9 AM)
```
Worker runs at 9 AM
       ↓
Find predictions due today/tomorrow
       ↓
Check cycle control (no duplicates)
       ↓
Send WhatsApp message
       ↓
Log to prediction_reminders_log
```

## 7. API Endpoints

```http
# Analyze patterns for a retailer
GET /api/predictions/analyze/:retailerId

# Generate predictions
POST /api/predictions/generate

# Send reminders
POST /api/predictions/send-reminders

# Get retailer predictions
GET /api/predictions/retailer/:retailerId?status=pending

# Get statistics
GET /api/predictions/statistics

# Mark order placed
POST /api/predictions/:predictionId/order-placed
Body: { "orderId": "uuid" }

# Worker status
GET /api/predictions/worker/status

# Run worker job manually
POST /api/predictions/worker/run/generate
POST /api/predictions/worker/run/reminders
POST /api/predictions/worker/run/statistics

# Configuration
GET /api/predictions/configuration
PUT /api/predictions/configuration/thresholds
Body: { "thresholds": { "minOrders": 4, "minConsistency": 70 } }
```

## 8. WhatsApp Message Example

```
Hi Sharma Store! 👋

You usually order Rice (Basmati) every 7 days.

Based on your pattern, you might need:
📦 50 kg of Rice (Basmati)

Would you like to reorder now?

Reply YES to place order or call us for assistance.
```

## 9. Configuration

Default thresholds:
```javascript
{
  minOrders: 3,           // Minimum orders to be frequent
  minConsistency: 60,     // Minimum consistency score (0-100)
  reminderDaysBefore: 1,  // Send reminder 1 day before
  maxPredictionDays: 90,  // Don't predict beyond 90 days
}
```

Update via API:
```bash
curl -X PUT http://localhost:3000/api/predictions/configuration/thresholds \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "thresholds": {
      "minOrders": 4,
      "minConsistency": 70
    }
  }'
```

## 10. Monitoring

### Check Patterns
```sql
SELECT 
  r.business_name,
  p.name as product_name,
  op.order_count,
  op.average_days_between_orders,
  op.frequency_consistency,
  op.is_predictable,
  op.predicted_next_order_date
FROM order_patterns op
JOIN retailers r ON op.retailer_id = r.id
JOIN products p ON op.product_id = p.id
WHERE op.is_predictable = true
ORDER BY op.frequency_consistency DESC;
```

### Check Predictions
```sql
SELECT 
  r.business_name,
  p.name as product_name,
  op.predicted_order_date,
  op.predicted_quantity,
  op.confidence_score,
  op.reminder_sent,
  op.order_placed
FROM order_predictions op
JOIN retailers r ON op.retailer_id = r.id
JOIN products p ON op.product_id = p.id
ORDER BY op.predicted_order_date ASC;
```

### Check Conversion Rate
```sql
SELECT 
  COUNT(*) as total_reminders,
  COUNT(CASE WHEN order_placed = true THEN 1 END) as orders_placed,
  ROUND(
    COUNT(CASE WHEN order_placed = true THEN 1 END)::numeric / 
    COUNT(*)::numeric * 100, 
    2
  ) as conversion_rate_percent
FROM order_predictions
WHERE reminder_sent = true;
```

## 11. Troubleshooting

### No patterns generated?
```sql
-- Check if trigger exists
\d+ orders

-- Manually calculate pattern
SELECT calculate_order_pattern(
  'retailer-uuid'::uuid, 
  'product-uuid'::uuid
);

-- Check results
SELECT * FROM order_patterns 
WHERE retailer_id = 'retailer-uuid';
```

### No predictions created?
```sql
-- Check predictable patterns
SELECT COUNT(*) FROM order_patterns 
WHERE is_predictable = true;

-- Check if predictions already exist
SELECT * FROM order_predictions 
WHERE retailer_id = 'retailer-uuid';
```

### Reminders not sending?
```javascript
// Check WhatsApp configuration
console.log(process.env.TWILIO_ACCOUNT_SID);
console.log(process.env.TWILIO_AUTH_TOKEN);
console.log(process.env.TWILIO_WHATSAPP_NUMBER);

// Test WhatsApp service
const whatsappThrottled = require('./src/services/whatsappThrottled.service');
await whatsappThrottled.sendMessage('919876543210', 'Test message');
```

## 12. Integration with Order Creation

When a customer places an order, mark matching predictions as fulfilled:

```javascript
// In your order creation service
const { orderId, retailerId, items } = orderData;

// Find matching predictions
const predictions = await prisma.orderPrediction.findMany({
  where: {
    retailerId,
    productId: { in: items.map(i => i.productId) },
    orderPlaced: false,
    predictedOrderDate: {
      gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
    },
  },
});

// Mark as fulfilled
const repeatOrderPredictionService = require('./services/repeatOrderPrediction.service');
for (const prediction of predictions) {
  await repeatOrderPredictionService.markOrderPlaced(prediction.id, orderId);
}
```

## 13. Worker Schedule

The worker runs three jobs daily:

| Time  | Job                  | Description                          |
|-------|----------------------|--------------------------------------|
| 2 AM  | Generate Predictions | Create predictions for patterns      |
| 9 AM  | Send Reminders       | Send WhatsApp messages to customers  |
| 11 PM | Update Statistics    | Calculate performance metrics        |

To change schedule, edit `src/workers/repeatOrderPrediction.worker.js`:

```javascript
// Change from 9 AM to 10 AM
const reminderJob = cron.schedule('0 10 * * *', async () => {
  await this.runSendReminders();
});
```

## 14. Manual Operations

```bash
# Generate predictions now
curl -X POST http://localhost:3000/api/predictions/generate \
  -H "Authorization: Bearer <token>"

# Send reminders now
curl -X POST http://localhost:3000/api/predictions/send-reminders \
  -H "Authorization: Bearer <token>"

# Run worker job manually
curl -X POST http://localhost:3000/api/predictions/worker/run/generate \
  -H "Authorization: Bearer <token>"
```

## 15. Success Criteria

✅ System is working correctly when:

1. **Patterns are tracked:**
   - `order_patterns` table has records
   - `is_predictable = true` for consistent orders
   - `predicted_next_order_date` is calculated

2. **Predictions are generated:**
   - `order_predictions` table has records
   - `cycle_id` prevents duplicates
   - Predictions are created daily at 2 AM

3. **Reminders are sent:**
   - WhatsApp messages delivered successfully
   - `reminder_sent = true` in database
   - `prediction_reminders_log` has entries

4. **Orders are tracked:**
   - `order_placed = true` when customer orders
   - Conversion rate is calculated
   - Statistics show performance

## Need Help?

1. Check logs: `logs/orders-*.log`, `logs/whatsapp-*.log`
2. Run tests: `node test-repeat-order-prediction.js`
3. Review full guide: `REPEAT_ORDER_PREDICTION_GUIDE.md`
4. Check worker status: `GET /api/predictions/worker/status`
