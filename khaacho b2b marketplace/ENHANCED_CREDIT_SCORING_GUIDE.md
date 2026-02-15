# Enhanced Credit Scoring System - Complete Guide

## Overview

The Enhanced Credit Scoring System provides comprehensive credit management for retailers with automatic credit limit adjustments, order restrictions based on credit scores, and real-time monitoring.

## Key Features

### 1. Credit Score Calculation (300-900)
- **Payment Timeliness** (40%): On-time payment history
- **Order Consistency** (20%): Regular ordering patterns
- **Credit Utilization** (20%): How much credit is being used
- **Account Age** (10%): Length of relationship
- **Cancellation Rate** (10%): Order cancellation frequency

### 2. Automatic Credit Limit Adjustments
- **Automatic Increases**: For reliable retailers (excellent/good scores)
- **Automatic Decreases**: For high-risk retailers (poor/very poor scores)
- **Configurable Thresholds**: Per score category
- **Maximum Limits**: Cap on automatic increases

### 3. Order Restrictions
- **Score-Based Limits**: Maximum order amounts per score category
- **Credit-Only Restrictions**: Cash-only for very poor scores
- **Approval Requirements**: Manual approval for risky orders
- **Real-time Checks**: Instant validation before order creation

### 4. Monitoring & Analytics
- **Real-time Dashboards**: Credit score distribution
- **Trend Analysis**: Score improvements/declines
- **Adjustment History**: Complete audit trail
- **Restriction Logs**: All order checks recorded

## Credit Score Categories

### Excellent (750-900)
- **Max Order Amount**: Unlimited
- **Requires Approval**: No
- **Allow Credit Orders**: Yes
- **Auto Increase**: 20% (up to Rs.1,000,000)
- **Benefits**: Highest trust, maximum flexibility

### Good (650-749)
- **Max Order Amount**: Unlimited
- **Requires Approval**: No
- **Allow Credit Orders**: Yes
- **Auto Increase**: 10% (up to Rs.500,000)
- **Benefits**: Good trust, flexible terms

### Fair (550-649)
- **Max Order Amount**: Rs.100,000
- **Requires Approval**: No
- **Allow Credit Orders**: Yes
- **Auto Increase**: Disabled
- **Restrictions**: Limited order amounts

### Poor (450-549)
- **Max Order Amount**: Rs.50,000
- **Requires Approval**: Yes (for large orders)
- **Allow Credit Orders**: Yes
- **Auto Decrease**: -10%
- **Restrictions**: Requires approval, may face limit reduction

### Very Poor (300-449)
- **Max Order Amount**: Rs.25,000
- **Requires Approval**: Yes
- **Allow Credit Orders**: No (cash only)
- **Auto Decrease**: -20%
- **Restrictions**: Cash only, automatic limit reduction

## Architecture

### Database Schema

```sql
-- Credit score thresholds configuration
CREATE TABLE credit_score_thresholds (
  threshold_name VARCHAR(50),
  min_score INTEGER,
  max_score INTEGER,
  max_order_amount DECIMAL(15,2),
  requires_approval BOOLEAN,
  allow_credit_orders BOOLEAN,
  auto_increase_enabled BOOLEAN,
  auto_increase_percentage DECIMAL(5,2),
  auto_increase_max_limit DECIMAL(15,2),
  auto_decrease_enabled BOOLEAN,
  auto_decrease_percentage DECIMAL(5,2)
);

-- Credit limit adjustment history
CREATE TABLE credit_limit_adjustments (
  retailer_id UUID,
  previous_limit DECIMAL(15,2),
  new_limit DECIMAL(15,2),
  adjustment_amount DECIMAL(15,2),
  adjustment_percentage DECIMAL(5,2),
  adjustment_type VARCHAR(50),
  trigger_reason TEXT,
  credit_score_at_adjustment INTEGER,
  is_automatic BOOLEAN
);

-- Order restrictions log
CREATE TABLE order_restrictions_log (
  retailer_id UUID,
  order_id UUID,
  restriction_type VARCHAR(50),
  credit_score INTEGER,
  order_amount DECIMAL(15,2),
  was_blocked BOOLEAN,
  block_reason TEXT
);
```

### Database Functions

```sql
-- Check if order should be restricted
SELECT * FROM check_order_restriction(
  retailer_id UUID,
  order_amount DECIMAL
);

-- Calculate recommended credit limit adjustment
SELECT * FROM calculate_credit_limit_adjustment(
  retailer_id UUID
);
```

### Database Views

```sql
-- Comprehensive retailer credit summary
SELECT * FROM retailer_credit_score_summary
WHERE retailer_id = 'uuid';
```

## Usage

### 1. Check Order Restriction

```javascript
const enhancedCreditScoring = require('./services/enhancedCreditScoring.service');

// Check if order should be restricted
const result = await enhancedCreditScoring.checkOrderRestriction(
  retailerId,
  orderAmount
);

if (!result.canOrder) {
  console.log('Order blocked:', result.reason);
  console.log('Credit score:', result.creditScore);
  console.log('Score category:', result.scoreCategory);
} else {
  console.log('Order approved');
  if (result.requiresApproval) {
    console.log('Manual approval required');
  }
}
```

### 2. Update Credit Score and Trigger Adjustment

```javascript
// Update credit score and check for automatic adjustment
const result = await enhancedCreditScoring.updateCreditScoreAndAdjust(
  retailerId
);

console.log('Credit score:', result.score);
console.log('Score category:', result.scoreCategory);
console.log('Trend:', result.trend);

if (result.adjustment.adjusted) {
  console.log('Credit limit adjusted:');
  console.log('  Type:', result.adjustment.adjustmentType);
  console.log('  Previous:', result.adjustment.previousLimit);
  console.log('  New:', result.adjustment.newLimit);
  console.log('  Change:', result.adjustment.adjustmentAmount);
}
```

### 3. Get Retailer Credit Summary

```javascript
// Get comprehensive credit summary
const summary = await enhancedCreditScoring.getRetailerCreditSummary(
  retailerId
);

console.log('Business:', summary.businessName);
console.log('Credit Score:', summary.creditScore);
console.log('Score Category:', summary.scoreCategory);
console.log('Credit Limit:', summary.creditLimit);
console.log('Available Credit:', summary.creditAvailable);
console.log('Utilization:', summary.creditUtilizationPercent + '%');
console.log('Max Order Amount:', summary.maxOrderAmount || 'Unlimited');
console.log('Requires Approval:', summary.requiresApproval);
console.log('Allow Credit:', summary.allowCreditOrders);
```

### 4. Manual Credit Adjustment

```javascript
// Admin manually adjusts credit limit
const result = await enhancedCreditScoring.manualCreditAdjustment(
  retailerId,
  newLimit,
  'Reason for adjustment',
  adminUserId
);

console.log('Previous limit:', result.previousLimit);
console.log('New limit:', result.newLimit);
console.log('Change:', result.adjustmentAmount);
console.log('Percentage:', result.adjustmentPercentage + '%');
```

### 5. Process All Automatic Adjustments

```javascript
// Process all retailers (typically run by worker)
const results = await enhancedCreditScoring.processAllAutomaticAdjustments();

console.log('Total retailers:', results.total);
console.log('Increased:', results.increased);
console.log('Decreased:', results.decreased);
console.log('No change:', results.noChange);
console.log('Errors:', results.errors);
```

## API Endpoints

### POST /api/enhanced-credit-scoring/check-restriction
Check if order should be restricted

**Request:**
```json
{
  "retailerId": "uuid",
  "orderAmount": 50000
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "canOrder": true,
    "restrictionType": "APPROVED",
    "reason": "Order approved",
    "requiresApproval": false,
    "creditScore": 720,
    "scoreCategory": "GOOD"
  }
}
```

### POST /api/enhanced-credit-scoring/:retailerId/update-score
Update credit score and trigger automatic adjustment

**Response:**
```json
{
  "success": true,
  "data": {
    "score": 720,
    "scoreCategory": "Good",
    "trend": "increasing",
    "trendChange": 25,
    "adjustment": {
      "adjusted": true,
      "adjustmentType": "AUTOMATIC_INCREASE",
      "previousLimit": 100000,
      "newLimit": 110000,
      "adjustmentAmount": 10000,
      "reason": "Credit score 720 (GOOD) qualifies for automatic 10% increase"
    }
  }
}
```

### GET /api/enhanced-credit-scoring/:retailerId/summary
Get comprehensive credit summary

**Response:**
```json
{
  "success": true,
  "data": {
    "retailerId": "uuid",
    "retailerCode": "R001",
    "businessName": "ABC Store",
    "creditScore": 720,
    "scoreCategory": "GOOD",
    "creditLimit": 110000,
    "outstandingDebt": 35000,
    "creditAvailable": 75000,
    "creditUtilizationPercent": 31.82,
    "maxOrderAmount": null,
    "requiresApproval": false,
    "allowCreditOrders": true,
    "autoIncreaseEnabled": true,
    "autoIncreasePercentage": 10,
    "ordersLast30Days": 12,
    "cancellationsLast30Days": 1,
    "lastPaymentDate": "2026-02-10T00:00:00.000Z",
    "daysSinceLastPayment": 4
  }
}
```

### GET /api/enhanced-credit-scoring/:retailerId/adjustment-history
Get credit limit adjustment history

**Query Parameters:**
- `limit` (optional): Number of records (default: 50)

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "previousLimit": 100000,
      "newLimit": 110000,
      "adjustmentAmount": 10000,
      "adjustmentPercentage": 10,
      "adjustmentType": "AUTOMATIC_INCREASE",
      "triggerReason": "Credit score 720 (GOOD) qualifies for automatic 10% increase",
      "creditScoreAtAdjustment": 720,
      "isAutomatic": true,
      "approvedBy": null,
      "approvedAt": "2026-02-14T02:00:00.000Z",
      "createdAt": "2026-02-14T02:00:00.000Z"
    }
  ]
}
```

### GET /api/enhanced-credit-scoring/:retailerId/restrictions-log
Get order restriction check history

**Query Parameters:**
- `limit` (optional): Number of records (default: 50)

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "orderId": null,
      "restrictionType": "APPROVED",
      "creditScore": 720,
      "orderAmount": 50000,
      "availableCredit": 75000,
      "wasBlocked": false,
      "blockReason": "Order approved",
      "overrideBy": null,
      "overrideReason": null,
      "createdAt": "2026-02-14T10:30:00.000Z"
    }
  ]
}
```

### POST /api/enhanced-credit-scoring/:retailerId/manual-adjust
Manual credit limit adjustment (admin only)

**Request:**
```json
{
  "newLimit": 150000,
  "reason": "Exceptional performance, increasing limit"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "previousLimit": 110000,
    "newLimit": 150000,
    "adjustmentAmount": 40000,
    "adjustmentPercentage": 36.36
  }
}
```

### POST /api/enhanced-credit-scoring/process-all
Process all retailers for automatic adjustments (admin only)

**Response:**
```json
{
  "success": true,
  "message": "Automatic adjustments processing started in background"
}
```

### GET /api/enhanced-credit-scoring/statistics
Get credit score statistics (admin only)

**Response:**
```json
{
  "success": true,
  "data": {
    "totalRetailers": 150,
    "avgScore": 625,
    "minScore": 350,
    "maxScore": 850,
    "distribution": {
      "excellent": 25,
      "good": 45,
      "fair": 50,
      "poor": 20,
      "veryPoor": 10
    },
    "trends": {
      "increasing": 60,
      "decreasing": 30,
      "stable": 60
    }
  }
}
```

## Integration with Order Creation

```javascript
const enhancedCreditScoring = require('./services/enhancedCreditScoring.service');

async function createOrder(orderData) {
  const { retailerId, items, total } = orderData;
  
  // Check order restriction before creating order
  const restriction = await enhancedCreditScoring.checkOrderRestriction(
    retailerId,
    total
  );
  
  if (!restriction.canOrder) {
    throw new Error(`Order blocked: ${restriction.reason}`);
  }
  
  if (restriction.requiresApproval) {
    // Flag order for manual approval
    orderData.requiresApproval = true;
    orderData.approvalReason = restriction.reason;
  }
  
  // Create order
  const order = await prisma.order.create({
    data: orderData,
  });
  
  // Log restriction check with order ID
  await enhancedCreditScoring.logOrderRestriction({
    retailerId,
    orderId: order.id,
    orderAmount: total,
    restrictionType: restriction.restrictionType,
    creditScore: restriction.creditScore,
    wasBlocked: false,
    blockReason: null,
  });
  
  return order;
}
```

## Automated Worker

The system includes a worker that runs scheduled jobs:

### Daily Credit Score Update (2 AM)
- Updates all retailer credit scores
- Processes automatic credit limit adjustments
- Logs all changes

### High-Risk Monitoring (Every 6 hours)
- Monitors retailers with poor/very poor scores
- Generates alerts for high-risk accounts
- Tracks score trends

### Worker Control

```javascript
const worker = require('./workers/enhancedCreditScoring.worker');

// Get worker status
const status = worker.getStatus();

// Run job manually
await worker.runJob('daily-update');
await worker.runJob('monitoring');

// Stop worker
worker.stop();

// Start worker
worker.start();
```

## Configuration

### Environment Variables

```bash
# Enable/disable automatic credit scoring worker
ENABLE_CREDIT_SCORING_WORKER=true
```

### Threshold Configuration

Thresholds are stored in the database and can be updated:

```javascript
await prisma.creditScoreThreshold.update({
  where: { thresholdName: 'EXCELLENT' },
  data: {
    autoIncreasePercentage: 25, // Increase from 20% to 25%
    autoIncreaseMaxLimit: 1500000, // Increase max limit
  },
});
```

## Best Practices

### 1. Regular Score Updates
- Update scores after every completed order
- Update scores after every payment
- Run daily batch updates for all retailers

### 2. Monitor Adjustments
- Review automatic adjustments weekly
- Investigate large adjustments
- Track adjustment effectiveness

### 3. Handle Restrictions Gracefully
- Provide clear messages to retailers
- Offer alternative payment methods
- Suggest ways to improve credit score

### 4. Audit Trail
- Keep complete history of all adjustments
- Log all restriction checks
- Track manual overrides

### 5. Performance Optimization
- Use database views for reporting
- Cache credit summaries
- Batch process adjustments

## Testing

Run the test script:

```bash
node test-enhanced-credit-scoring.js
```

Tests include:
- Credit score statistics
- Retailer credit summary
- Order restriction checks (small and large orders)
- Automatic credit adjustments
- Manual credit adjustments
- Adjustment history
- Restrictions log
- Database views and functions

## Troubleshooting

### Issue: Automatic adjustments not working

**Solution:**
```javascript
// Check if worker is running
const status = worker.getStatus();
console.log('Worker running:', status.isRunning);

// Run adjustment manually
await enhancedCreditScoring.processAutomaticCreditAdjustment(retailerId);
```

### Issue: Order incorrectly blocked

**Solution:**
```javascript
// Check retailer credit summary
const summary = await enhancedCreditScoring.getRetailerCreditSummary(retailerId);

// Check threshold configuration
const threshold = await prisma.creditScoreThreshold.findFirst({
  where: {
    minScore: { lte: summary.creditScore },
    maxScore: { gte: summary.creditScore },
  },
});

// Manual override if needed
await enhancedCreditScoring.manualCreditAdjustment(
  retailerId,
  newLimit,
  'Override for special case',
  adminUserId
);
```

### Issue: Credit score not updating

**Solution:**
```javascript
// Force credit score recalculation
await enhancedCreditScoring.updateCreditScoreAndAdjust(retailerId);

// Check if retailer has sufficient order history
const summary = await enhancedCreditScoring.getRetailerCreditSummary(retailerId);
console.log('Orders last 30 days:', summary.ordersLast30Days);
```

## Related Documentation

- `ENHANCED_CREDIT_SCORING_SUMMARY.md` - Quick reference
- `CREDIT_SCORING.md` - Original credit scoring system
- `CREDIT_CONTROL_API.md` - Credit control endpoints

## Support

For issues or questions:
1. Check logs: `logs/orders-*.log`
2. Review adjustment history
3. Check restriction logs
4. Monitor credit score statistics
