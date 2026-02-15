# Vendor Scoring System - Implementation Complete ✅

## Overview

Dynamic vendor scoring system that automatically calculates and updates vendor performance scores based on multiple metrics, enabling automatic selection of the best vendor for each order.

## Features Implemented

### 1. Multi-Factor Scoring
- ✅ Response Speed (25% weight) - How fast vendor responds
- ✅ Acceptance Rate (20% weight) - Percentage of orders accepted
- ✅ Price Competitiveness (20% weight) - Pricing vs market average
- ✅ Delivery Success Rate (25% weight) - Successful deliveries
- ✅ Cancellation Rate (10% weight) - Orders cancelled by vendor

### 2. Automatic Score Updates
- ✅ Updates after every order event
- ✅ Real-time score recalculation
- ✅ Weighted average calculation
- ✅ Component score tracking
- ✅ Historical score storage

### 3. Late Response Penalties
- ✅ Automatic penalty for late responses
- ✅ Configurable threshold (default: 30 minutes)
- ✅ Penalty points system
- ✅ Cumulative penalty tracking

### 4. Automatic Vendor Selection
- ✅ Selects highest scoring vendor
- ✅ Checks product availability
- ✅ Considers all score components
- ✅ Fallback to next best vendor

### 5. Score History
- ✅ Complete historical tracking
- ✅ Trigger event recording
- ✅ Score change tracking
- ✅ Trend analysis support

### 6. Performance Monitoring
- ✅ Top vendors view
- ✅ Performance tiers (Excellent/Good/Average/Poor)
- ✅ Response time tracking
- ✅ Price tracking vs market
- ✅ Delivery success tracking

## Database Schema

### Tables Created

1. **vendor_scores** - Current vendor scores
   - Overall score (0-100)
   - Component scores
   - Score weights
   - Performance metrics
   - Penalty tracking

2. **vendor_score_history** - Historical tracking
   - Score snapshots
   - Trigger events
   - Score changes
   - Timestamps

3. **vendor_response_tracking** - Response monitoring
   - Response times
   - Acceptance/rejection
   - Late response flags
   - Timeout tracking

4. **vendor_price_tracking** - Price monitoring
   - Quoted prices
   - Market averages
   - Price vs market percentage
   - Historical pricing

5. **vendor_scoring_config** - Configuration
   - Thresholds
   - Weights
   - Penalty settings
   - Score decay rules

### Database Functions

- `initialize_vendor_score()` - Initialize new vendor
- `calculate_overall_score()` - Calculate weighted score
- `update_vendor_score()` - Update after event
- `recalculate_vendor_scores()` - Recalculate components
- `get_best_vendors_for_product()` - Find top vendors

### Views

- `top_vendors_by_score` - Ranked vendor list
- `vendor_score_trends` - Historical trends
- `vendor_response_performance` - Response metrics

## Scoring Algorithm

### Component Calculations

#### 1. Response Speed Score
```
If avg_response_time <= 10 minutes: 100 points
If avg_response_time <= 30 minutes: 100 - ((time - 10) * 2)
If avg_response_time > 30 minutes: 60 - ((time - 30) * 1.5)
Minimum: 0 points
```

#### 2. Acceptance Rate Score
```
>= 90%: 100 points (Excellent)
>= 75%: 75-100 points (Good)
>= 50%: 50-75 points (Average)
< 50%: 0-50 points (Poor)
```

#### 3. Price Competitiveness Score
```
<= -5% vs market: 100 points (Excellent)
<= 0% vs market: 75-100 points (Good)
<= 10% vs market: 50-75 points (Average)
> 10% vs market: 0-50 points (Poor)
```

#### 4. Delivery Success Score
```
>= 95%: 100 points (Excellent)
>= 85%: 75-100 points (Good)
>= 70%: 50-75 points (Average)
< 70%: 0-50 points (Poor)
```

#### 5. Cancellation Rate Score
```
<= 2%: 100 points (Excellent)
<= 5%: 75-100 points (Acceptable)
<= 10%: 50-75 points (Average)
> 10%: 0-50 points (Poor)
```

### Overall Score Calculation

```
Overall Score = 
  (Response Speed * 25%) +
  (Acceptance Rate * 20%) +
  (Price Competitiveness * 20%) +
  (Delivery Success * 25%) +
  (Cancellation Rate * 10%)
```

## Performance Tiers

| Tier | Score Range | Description |
|------|-------------|-------------|
| EXCELLENT | 90-100 | Top performing vendors |
| GOOD | 75-89 | Reliable vendors |
| AVERAGE | 50-74 | Acceptable performance |
| POOR | 0-49 | Needs improvement |

## API Endpoints

### Public Endpoints

```
GET /api/v1/vendor-scoring/top-vendors?limit=10
GET /api/v1/vendor-scoring/products/:productId/best-vendors?limit=5
```

### Admin Endpoints (Require Auth)

```
GET  /api/v1/vendor-scoring/config
GET  /api/v1/vendor-scoring/vendors/:vendorId/score
GET  /api/v1/vendor-scoring/vendors/:vendorId/history?days=30
GET  /api/v1/vendor-scoring/vendors/:vendorId/summary
POST /api/v1/vendor-scoring/vendors/:vendorId/initialize
POST /api/v1/vendor-scoring/vendors/:vendorId/update
```

## Usage Examples

### Track Vendor Response

```javascript
const vendorScoringService = require('./services/vendorScoring.service');

await vendorScoringService.trackVendorResponse({
  orderId: 'order-123',
  vendorId: 'vendor-456',
  assignedAt: new Date('2026-02-15T10:00:00Z'),
  respondedAt: new Date('2026-02-15T10:15:00Z'),
  responseType: 'ACCEPTED', // or 'REJECTED', 'TIMEOUT'
  rejectionReason: null,
});
```

### Track Order Delivery

```javascript
await vendorScoringService.trackOrderDelivery(
  'order-123',
  'vendor-456',
  true // success
);
```

### Track Order Cancellation

```javascript
await vendorScoringService.trackOrderCancellation(
  'order-123',
  'vendor-456',
  'Out of stock'
);
```

### Track Vendor Pricing

```javascript
await vendorScoringService.trackVendorPricing({
  productId: 'product-789',
  vendorId: 'vendor-456',
  quotedPrice: 100.00,
  orderId: 'order-123',
  quantity: 10,
});
```

### Select Best Vendor for Order

```javascript
const orderItems = [
  { productId: 'product-1', quantity: 10 },
  { productId: 'product-2', quantity: 5 },
];

const bestVendor = await vendorScoringService.selectBestVendorForOrder(orderItems);

console.log(`Selected vendor: ${bestVendor.vendor.user.businessName}`);
console.log(`Score: ${bestVendor.overallScore}`);
```

### Get Vendor Performance Summary

```javascript
const summary = await vendorScoringService.getVendorPerformanceSummary('vendor-456');

console.log('Current Score:', summary.currentScore.overallScore);
console.log('Performance Tier:', summary.performanceTier);
console.log('Response Performance:', summary.responsePerformance);
```

## Integration Points

### Order Assignment

```javascript
// In order creation service
const bestVendor = await vendorScoringService.selectBestVendorForOrder(orderItems);

if (bestVendor) {
  order.vendorId = bestVendor.vendorId;
  
  // Track assignment
  await vendorScoringService.trackVendorResponse({
    orderId: order.id,
    vendorId: bestVendor.vendorId,
    assignedAt: new Date(),
    // ... will be updated when vendor responds
  });
}
```

### Vendor Response

```javascript
// When vendor accepts/rejects order
await vendorScoringService.trackVendorResponse({
  orderId,
  vendorId,
  assignedAt: order.assignedAt,
  respondedAt: new Date(),
  responseType: accepted ? 'ACCEPTED' : 'REJECTED',
  rejectionReason,
});
```

### Order Delivery

```javascript
// When order is delivered
await vendorScoringService.trackOrderDelivery(
  orderId,
  vendorId,
  true // success
);
```

### Order Cancellation

```javascript
// When vendor cancels order
await vendorScoringService.trackOrderCancellation(
  orderId,
  vendorId,
  cancellationReason
);
```

## Worker

The scoring worker runs automatically every hour:

```javascript
const vendorScoringWorker = require('./workers/vendorScoring.worker');

// Start worker
vendorScoringWorker.start();

// Get stats
const stats = vendorScoringWorker.getStats();

// Manual trigger
await vendorScoringWorker.triggerManually();
```

## Monitoring Queries

### Top Vendors

```sql
SELECT * FROM top_vendors_by_score
LIMIT 10;
```

### Vendor Score Trends

```sql
SELECT * FROM vendor_score_trends
WHERE vendor_id = 'vendor-id'
ORDER BY date DESC
LIMIT 30;
```

### Vendor Response Performance

```sql
SELECT * FROM vendor_response_performance
WHERE vendor_id = 'vendor-id';
```

### Score History

```sql
SELECT * FROM vendor_score_history
WHERE vendor_id = 'vendor-id'
ORDER BY recorded_at DESC
LIMIT 50;
```

## Configuration

Default configuration values:

```javascript
{
  responseTimeThresholdMinutes: 30,
  lateResponsePenaltyPoints: 5.00,
  excellentAcceptanceRate: 90.00,
  goodAcceptanceRate: 75.00,
  poorAcceptanceRate: 50.00,
  excellentDeliveryRate: 95.00,
  goodDeliveryRate: 85.00,
  poorDeliveryRate: 70.00,
  excellentCancellationRate: 2.00,
  acceptableCancellationRate: 5.00,
  poorCancellationRate: 10.00,
  excellentPriceVsMarket: -5.00,
  goodPriceVsMarket: 0.00,
  poorPriceVsMarket: 10.00,
}
```

## Testing

Run the test suite:

```bash
node test-vendor-scoring.js
```

## Files Created

### Database
- `prisma/migrations/040_vendor_scoring_system.sql`

### Services
- `src/services/vendorScoring.service.js`

### Controllers
- `src/controllers/vendorScoring.controller.js`

### Routes
- `src/routes/vendorScoring.routes.js`

### Workers
- `src/workers/vendorScoring.worker.js`

### Tests
- `test-vendor-scoring.js`

### Documentation
- `VENDOR_SCORING_COMPLETE.md`
- `VENDOR_SCORING_QUICK_START.md`

## Deployment Checklist

- [ ] Apply database migration
- [ ] Add routes to main router
- [ ] Start worker in server.js
- [ ] Initialize scores for existing vendors
- [ ] Test score calculations
- [ ] Monitor score updates
- [ ] Verify automatic vendor selection

## Next Steps

1. Apply migration: `npx prisma migrate deploy`
2. Add routes to `src/routes/index.js`
3. Start worker in `src/server.js`
4. Initialize existing vendor scores
5. Test with real orders
6. Monitor performance

## Support

For issues or questions:
- Check logs: `logs/combined-*.log`
- View scores: `GET /api/v1/vendor-scoring/top-vendors`
- Check history: `GET /api/v1/vendor-scoring/vendors/:id/history`
- Review config: `GET /api/v1/vendor-scoring/config`
