# Enhanced Credit Scoring - Quick Reference

## What It Does

Comprehensive credit management for retailers:
- Tracks payment delays, order volume, cancellation rate
- Generates credit score (300-900)
- Restricts high-value orders for low scores
- Automatically increases credit limits for reliable users
- Automatically decreases limits for high-risk users

## Quick Start

### 1. Run Migration

```bash
npx prisma migrate deploy
```

Migration `033_enhanced_credit_scoring.sql` adds:
- Credit score columns to retailers table
- `credit_limit_adjustments` table
- `order_restrictions_log` table
- `credit_score_thresholds` table (with default thresholds)
- `retailer_credit_score_summary` view
- Database functions for restriction checks and adjustments

### 2. Basic Usage

```javascript
const enhancedCreditScoring = require('./services/enhancedCreditScoring.service');

// Check if order should be restricted
const result = await enhancedCreditScoring.checkOrderRestriction(
  retailerId,
  orderAmount
);

if (!result.canOrder) {
  console.log('Order blocked:', result.reason);
} else {
  console.log('Order approved');
}
```

### 3. Update Credit Score and Trigger Adjustment

```javascript
// Update score and check for automatic adjustment
const result = await enhancedCreditScoring.updateCreditScoreAndAdjust(
  retailerId
);

console.log('Score:', result.score);
console.log('Category:', result.scoreCategory);

if (result.adjustment.adjusted) {
  console.log('Limit adjusted:', result.adjustment.adjustmentType);
  console.log('New limit:', result.adjustment.newLimit);
}
```

## Credit Score Categories

| Category | Score Range | Max Order | Credit Orders | Auto Adjustment |
|----------|-------------|-----------|---------------|-----------------|
| Excellent | 750-900 | Unlimited | Yes | +20% (max Rs.1M) |
| Good | 650-749 | Unlimited | Yes | +10% (max Rs.500K) |
| Fair | 550-649 | Rs.100K | Yes | None |
| Poor | 450-549 | Rs.50K | Yes (approval) | -10% |
| Very Poor | 300-449 | Rs.25K | No (cash only) | -20% |

## Score Calculation

- **Payment Timeliness** (40%): On-time payment history
- **Order Consistency** (20%): Regular ordering patterns
- **Credit Utilization** (20%): How much credit is used
- **Account Age** (10%): Length of relationship
- **Cancellation Rate** (10%): Order cancellation frequency

## Key Features

### Automatic Credit Limit Increases
```javascript
// Excellent score (750+): +20% increase
// Good score (650-749): +10% increase
// Triggered daily at 2 AM by worker
```

### Automatic Credit Limit Decreases
```javascript
// Poor score (450-549): -10% decrease
// Very Poor score (300-449): -20% decrease
// Triggered daily at 2 AM by worker
```

### Order Restrictions
```javascript
// Check before order creation
const restriction = await enhancedCreditScoring.checkOrderRestriction(
  retailerId,
  orderAmount
);

// Possible restriction types:
// - ORDER_AMOUNT_EXCEEDS_LIMIT
// - CREDIT_NOT_ALLOWED (cash only)
// - CREDIT_LIMIT_EXCEEDED
// - ACCOUNT_BLOCKED
// - APPROVED
```

## API Endpoints

### Check Order Restriction
```bash
POST /api/enhanced-credit-scoring/check-restriction
Body: { "retailerId": "uuid", "orderAmount": 50000 }
```

### Update Score and Adjust
```bash
POST /api/enhanced-credit-scoring/:retailerId/update-score
```

### Get Credit Summary
```bash
GET /api/enhanced-credit-scoring/:retailerId/summary
```

### Get Adjustment History
```bash
GET /api/enhanced-credit-scoring/:retailerId/adjustment-history?limit=50
```

### Get Restrictions Log
```bash
GET /api/enhanced-credit-scoring/:retailerId/restrictions-log?limit=50
```

### Manual Adjustment (Admin)
```bash
POST /api/enhanced-credit-scoring/:retailerId/manual-adjust
Body: { "newLimit": 150000, "reason": "Exceptional performance" }
```

### Process All (Admin)
```bash
POST /api/enhanced-credit-scoring/process-all
```

### Get Statistics (Admin)
```bash
GET /api/enhanced-credit-scoring/statistics
```

## Integration with Order Creation

```javascript
async function createOrder(orderData) {
  const { retailerId, total } = orderData;
  
  // Check restriction
  const restriction = await enhancedCreditScoring.checkOrderRestriction(
    retailerId,
    total
  );
  
  if (!restriction.canOrder) {
    throw new Error(`Order blocked: ${restriction.reason}`);
  }
  
  if (restriction.requiresApproval) {
    orderData.requiresApproval = true;
  }
  
  // Create order
  return await prisma.order.create({ data: orderData });
}
```

## Automated Worker

Worker runs two scheduled jobs:

### Daily Credit Score Update (2 AM)
- Updates all retailer credit scores
- Processes automatic adjustments
- Logs all changes

### High-Risk Monitoring (Every 6 hours)
- Monitors poor/very poor scores
- Generates alerts

### Worker Control
```javascript
const worker = require('./workers/enhancedCreditScoring.worker');

// Get status
const status = worker.getStatus();

// Run manually
await worker.runJob('daily-update');
await worker.runJob('monitoring');
```

## Database Functions

### Check Order Restriction
```sql
SELECT * FROM check_order_restriction(
  'retailer-uuid'::uuid,
  50000::decimal
);
```

Returns:
- `can_order`: boolean
- `restriction_type`: varchar
- `reason`: text
- `requires_approval`: boolean
- `credit_score`: integer
- `score_category`: varchar

### Calculate Credit Adjustment
```sql
SELECT * FROM calculate_credit_limit_adjustment(
  'retailer-uuid'::uuid
);
```

Returns:
- `should_adjust`: boolean
- `adjustment_type`: varchar
- `current_limit`: decimal
- `recommended_limit`: decimal
- `adjustment_amount`: decimal
- `adjustment_percentage`: decimal
- `reason`: text
- `credit_score`: integer

## Database Views

### Retailer Credit Score Summary
```sql
SELECT * FROM retailer_credit_score_summary
WHERE retailer_id = 'uuid';
```

Provides comprehensive credit information:
- Credit score and category
- Credit limits and utilization
- Order activity (last 30 days)
- Payment behavior
- Risk indicators

## Testing

```bash
node test-enhanced-credit-scoring.js
```

Tests:
- ✅ Credit score statistics
- ✅ Retailer credit summary
- ✅ Order restriction checks
- ✅ Automatic adjustments
- ✅ Manual adjustments
- ✅ Adjustment history
- ✅ Restrictions log
- ✅ Database views and functions

## Common Scenarios

### Scenario 1: Excellent Retailer Gets Automatic Increase
```javascript
// Retailer has score 780 (Excellent)
// Current limit: Rs.100,000
// Daily worker runs at 2 AM

// Result:
// - New limit: Rs.120,000 (+20%)
// - Logged in credit_limit_adjustments
// - Adjustment type: AUTOMATIC_INCREASE
```

### Scenario 2: Poor Retailer Gets Automatic Decrease
```javascript
// Retailer has score 480 (Poor)
// Current limit: Rs.100,000
// Daily worker runs at 2 AM

// Result:
// - New limit: Rs.90,000 (-10%)
// - Logged in credit_limit_adjustments
// - Adjustment type: AUTOMATIC_DECREASE
```

### Scenario 3: Order Blocked Due to Low Score
```javascript
// Retailer has score 420 (Very Poor)
// Tries to place Rs.50,000 order
// Max allowed: Rs.25,000

// Result:
// - Order blocked
// - Restriction type: ORDER_AMOUNT_EXCEEDS_LIMIT
// - Logged in order_restrictions_log
```

### Scenario 4: Cash-Only Restriction
```javascript
// Retailer has score 380 (Very Poor)
// Tries to place credit order

// Result:
// - Order blocked
// - Restriction type: CREDIT_NOT_ALLOWED
// - Message: "Cash payment required"
```

## Configuration

### Environment Variables
```bash
ENABLE_CREDIT_SCORING_WORKER=true
```

### Threshold Configuration
Update in database:
```javascript
await prisma.creditScoreThreshold.update({
  where: { thresholdName: 'EXCELLENT' },
  data: {
    autoIncreasePercentage: 25,
    autoIncreaseMaxLimit: 1500000,
  },
});
```

## Monitoring

### Get Statistics
```javascript
const stats = await enhancedCreditScoring.getCreditScoreStatistics();

console.log('Total retailers:', stats.totalRetailers);
console.log('Average score:', stats.avgScore);
console.log('Distribution:', stats.distribution);
console.log('Trends:', stats.trends);
```

### Monitor High-Risk Retailers
```javascript
const summary = await prisma.$queryRaw`
  SELECT * FROM retailer_credit_score_summary
  WHERE credit_score < 550
  ORDER BY credit_score ASC
`;
```

## Troubleshooting

### Order incorrectly blocked
```javascript
// Check credit summary
const summary = await enhancedCreditScoring.getRetailerCreditSummary(retailerId);

// Manual override if needed
await enhancedCreditScoring.manualCreditAdjustment(
  retailerId,
  newLimit,
  'Override reason',
  adminUserId
);
```

### Automatic adjustments not working
```javascript
// Check worker status
const status = worker.getStatus();

// Run manually
await enhancedCreditScoring.processAutomaticCreditAdjustment(retailerId);
```

## Related Documentation

- `ENHANCED_CREDIT_SCORING_GUIDE.md` - Complete guide
- `CREDIT_SCORING.md` - Original scoring system
- `CREDIT_CONTROL_API.md` - Credit control

## Status

✅ **COMPLETE** - Ready for production use

- Database migration ready
- Service with automatic adjustments
- Controller with all endpoints
- Routes registered
- Worker for scheduled jobs
- Test script included
- Documentation complete
