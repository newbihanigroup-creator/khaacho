# Vendor Scoring - Quick Start Guide

## What is Vendor Scoring?

Dynamic scoring system that automatically evaluates vendors based on performance metrics and selects the best vendor for each order.

## Score Components

| Component | Weight | What It Measures |
|-----------|--------|------------------|
| Response Speed | 25% | How fast vendor responds to orders |
| Acceptance Rate | 20% | Percentage of orders accepted |
| Price Competitiveness | 20% | Pricing vs market average |
| Delivery Success | 25% | Successful delivery rate |
| Cancellation Rate | 10% | Orders cancelled by vendor |

## Performance Tiers

- **EXCELLENT** (90-100): Top performers
- **GOOD** (75-89): Reliable vendors
- **AVERAGE** (50-74): Acceptable
- **POOR** (0-49): Needs improvement

## Quick API Examples

### Get Top Vendors

```bash
curl http://localhost:3000/api/v1/vendor-scoring/top-vendors?limit=10
```

### Get Best Vendors for Product

```bash
curl http://localhost:3000/api/v1/vendor-scoring/products/PRODUCT_ID/best-vendors?limit=5
```

### Get Vendor Score (Admin)

```bash
curl http://localhost:3000/api/v1/vendor-scoring/vendors/VENDOR_ID/score \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

### Get Vendor Performance Summary (Admin)

```bash
curl http://localhost:3000/api/v1/vendor-scoring/vendors/VENDOR_ID/summary \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

## Usage in Code

### Track Vendor Response

```javascript
const vendorScoringService = require('./services/vendorScoring.service');

// When vendor responds to order
await vendorScoringService.trackVendorResponse({
  orderId: 'order-123',
  vendorId: 'vendor-456',
  assignedAt: new Date('2026-02-15T10:00:00Z'),
  respondedAt: new Date('2026-02-15T10:15:00Z'),
  responseType: 'ACCEPTED', // ACCEPTED, REJECTED, TIMEOUT
});
```

### Track Order Delivery

```javascript
// When order is delivered
await vendorScoringService.trackOrderDelivery(
  'order-123',
  'vendor-456',
  true // success
);
```

### Select Best Vendor

```javascript
// Automatically select best vendor for order
const orderItems = [
  { productId: 'product-1', quantity: 10 },
  { productId: 'product-2', quantity: 5 },
];

const bestVendor = await vendorScoringService.selectBestVendorForOrder(orderItems);

console.log(`Best vendor: ${bestVendor.vendor.user.businessName}`);
console.log(`Score: ${bestVendor.overallScore}`);
```

## Score Update Triggers

Scores are automatically updated when:

- ✅ Vendor accepts order → `ORDER_ACCEPTED`
- ✅ Vendor rejects order → `ORDER_REJECTED`
- ✅ Order delivered → `ORDER_DELIVERED`
- ✅ Order cancelled → `ORDER_CANCELLED`
- ✅ Late response → `LATE_RESPONSE` (penalty applied)
- ✅ Delivery fails → `DELIVERY_FAILED`
- ✅ Hourly recalculation → `PERIODIC_UPDATE`

## Late Response Penalties

- **Threshold**: 30 minutes (configurable)
- **Penalty**: 5 points per late response
- **Effect**: Reduces response speed score
- **Tracking**: Cumulative penalty points stored

## Database Queries

### View Top Vendors

```sql
SELECT * FROM top_vendors_by_score
LIMIT 10;
```

### Check Vendor Score

```sql
SELECT * FROM vendor_scores
WHERE vendor_id = 'vendor-id';
```

### View Score History

```sql
SELECT * FROM vendor_score_history
WHERE vendor_id = 'vendor-id'
ORDER BY recorded_at DESC
LIMIT 20;
```

### Check Response Performance

```sql
SELECT * FROM vendor_response_performance
WHERE vendor_id = 'vendor-id';
```

## Configuration

Default thresholds (can be customized):

```javascript
{
  responseTimeThreshold: 30, // minutes
  lateResponsePenalty: 5.00, // points
  excellentAcceptanceRate: 90, // %
  excellentDeliveryRate: 95, // %
  excellentCancellationRate: 2, // %
  excellentPriceVsMarket: -5, // % below market
}
```

## Integration Example

### In Order Creation

```javascript
// Select best vendor automatically
const bestVendor = await vendorScoringService.selectBestVendorForOrder(orderItems);

if (bestVendor) {
  order.vendorId = bestVendor.vendorId;
  
  // Track assignment
  await vendorScoringService.trackVendorResponse({
    orderId: order.id,
    vendorId: bestVendor.vendorId,
    assignedAt: new Date(),
  });
}
```

### When Vendor Responds

```javascript
// Update response tracking
await vendorScoringService.trackVendorResponse({
  orderId,
  vendorId,
  assignedAt: order.assignedAt,
  respondedAt: new Date(),
  responseType: accepted ? 'ACCEPTED' : 'REJECTED',
  rejectionReason: accepted ? null : reason,
});
```

### When Order Completes

```javascript
// Track successful delivery
await vendorScoringService.trackOrderDelivery(
  orderId,
  vendorId,
  true
);
```

## Worker

Automatic score updates run every hour:

```javascript
const vendorScoringWorker = require('./workers/vendorScoring.worker');

// Start worker
vendorScoringWorker.start();

// Check stats
const stats = vendorScoringWorker.getStats();
console.log(stats);
```

## Testing

```bash
node test-vendor-scoring.js
```

## Monitoring

### Check Top Performers

```bash
curl http://localhost:3000/api/v1/vendor-scoring/top-vendors
```

### View Vendor Trends

```bash
curl http://localhost:3000/api/v1/vendor-scoring/vendors/VENDOR_ID/history?days=30 \
  -H "Authorization: Bearer TOKEN"
```

### Get Performance Summary

```bash
curl http://localhost:3000/api/v1/vendor-scoring/vendors/VENDOR_ID/summary \
  -H "Authorization: Bearer TOKEN"
```

## Tips

1. **Initialize Scores**: New vendors start at 50 (neutral)
2. **Track Everything**: More data = more accurate scores
3. **Monitor Trends**: Use history to identify patterns
4. **Adjust Weights**: Customize weights based on priorities
5. **Review Penalties**: Check late response penalties regularly

## Troubleshooting

### Scores Not Updating?
- Check worker is running
- Verify events are being tracked
- Review logs for errors

### Incorrect Scores?
- Verify configuration thresholds
- Check component score calculations
- Review raw metrics data

### No Best Vendor Found?
- Check vendor inventory
- Verify vendors are active
- Ensure products are in stock

## Support

- Logs: `logs/combined-*.log`
- Top vendors: `GET /api/v1/vendor-scoring/top-vendors`
- Vendor score: `GET /api/v1/vendor-scoring/vendors/:id/score`
- Config: `GET /api/v1/vendor-scoring/config`
