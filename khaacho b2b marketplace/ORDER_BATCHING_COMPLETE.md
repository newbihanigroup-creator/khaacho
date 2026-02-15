# Order Batching System - Implementation Complete ✅

## Overview

Intelligent order batching system that combines orders from nearby buyers, groups same products, sends bulk requests to wholesalers, reduces delivery costs, and tracks savings per batch.

## Features Implemented

### 1. Geographic Batching
- ✅ Combines orders from nearby buyers (configurable radius)
- ✅ Haversine formula for accurate distance calculation
- ✅ Center point calculation for optimal routing
- ✅ Maximum distance threshold (default: 5km)
- ✅ Delivery zone support

### 2. Product Grouping
- ✅ Groups same products across orders
- ✅ Bulk quantity aggregation
- ✅ Bulk discount calculation
- ✅ Wholesale request optimization
- ✅ Product efficiency tracking

### 3. Cost Optimization
- ✅ Route optimization for delivery
- ✅ Delivery sequence planning
- ✅ Cost per kilometer calculation
- ✅ Cost per stop calculation
- ✅ Bulk discount application

### 4. Savings Tracking
- ✅ Individual vs batch cost comparison
- ✅ Delivery cost savings
- ✅ Bulk discount savings
- ✅ Route optimization savings
- ✅ CO2 emissions reduction
- ✅ Per-order savings calculation

### 5. Automatic Batching
- ✅ Worker runs every 30 minutes
- ✅ Auto-batches pending orders
- ✅ Vendor-specific batching
- ✅ Time window management
- ✅ Minimum order threshold

## Database Schema

### Tables Created

1. **order_batches** - Batch records
   - Batch identification
   - Vendor and location
   - Order totals
   - Delivery optimization
   - Cost savings
   - Status tracking

2. **batch_order_items** - Orders in batch
   - Order references
   - Retailer locations
   - Distance from center
   - Delivery sequence
   - Delivery status

3. **batch_product_groups** - Grouped products
   - Product aggregation
   - Total quantities
   - Bulk discounts
   - Pricing

4. **batching_config** - Configuration
   - Geographic settings
   - Time windows
   - Cost parameters
   - Discount thresholds

5. **batch_savings_tracking** - Savings records
   - Savings breakdown
   - Cost comparison
   - Efficiency metrics
   - Environmental impact

6. **delivery_zones** - Geographic zones
   - Zone boundaries
   - Delivery costs
   - Zone characteristics

### Database Functions

- `calculate_distance_km()` - Haversine distance calculation
- `find_nearby_orders()` - Find orders for batching
- `calculate_batch_delivery_cost()` - Calculate batch cost
- `calculate_individual_delivery_costs()` - Calculate individual costs
- `record_batch_savings()` - Record savings data

### Views

- `active_batches_summary` - Active batches overview
- `batch_savings_summary` - Savings by date
- `product_batching_efficiency` - Product performance

## Batching Algorithm

### Step 1: Find Nearby Orders

```
1. Get pending orders for vendor
2. Calculate center point (average lat/lon)
3. Find orders within radius (default 5km)
4. Check minimum order threshold (default 3)
5. Limit to maximum orders (default 20)
```

### Step 2: Create Batch

```
1. Generate unique batch number
2. Calculate batch totals
3. Add orders to batch
4. Assign delivery sequence
5. Set batch window
```

### Step 3: Group Products

```
1. Aggregate same products across orders
2. Calculate total quantities
3. Count orders per product
4. Apply bulk discounts if threshold met
5. Calculate total value
```

### Step 4: Calculate Savings

```
Individual Cost = Σ(Base + Distance × 2 × Cost/km)
Batch Cost = Base + Total Distance × Cost/km + Stops × Cost/stop
Delivery Savings = Individual Cost - Batch Cost
Bulk Savings = Σ(Bulk Discounts)
Total Savings = Delivery Savings + Bulk Savings
```

## Cost Calculation

### Individual Delivery Cost

```
For each order:
  Cost = Base Delivery Cost + (Distance × 2 × Cost per km)
  
Total Individual Cost = Sum of all individual costs
```

### Batch Delivery Cost

```
Batch Cost = Base Delivery Cost + 
             (Total Distance × Cost per km) + 
             (Number of Stops × Cost per stop)
```

### Savings

```
Delivery Savings = Individual Cost - Batch Cost
Bulk Discount Savings = Σ(Product bulk discounts)
Total Savings = Delivery Savings + Bulk Discount Savings
Savings Percentage = (Total Savings / Individual Cost) × 100
```

## API Endpoints

### Batch Management

```
GET  /api/v1/order-batching/config
GET  /api/v1/order-batching/active?vendorId=xxx
GET  /api/v1/order-batching/:batchId
POST /api/v1/order-batching/create
POST /api/v1/order-batching/auto-batch
POST /api/v1/order-batching/:batchId/confirm
POST /api/v1/order-batching/:batchId/dispatch
POST /api/v1/order-batching/:batchId/delivered
```

### Analytics

```
GET /api/v1/order-batching/savings-summary?days=30
GET /api/v1/order-batching/product-efficiency
```

## Usage Examples

### Create Batch Manually

```javascript
const orderBatchingService = require('./services/orderBatching.service');

const batch = await orderBatchingService.createBatch(
  'vendor-id',
  {
    latitude: 27.7172,
    longitude: 85.3240,
  }
);
```

### Auto-Batch Pending Orders

```javascript
const batches = await orderBatchingService.autoBatchPendingOrders('vendor-id');
```

### Confirm Batch

```javascript
await orderBatchingService.confirmBatch('batch-id');
```

### Dispatch Batch

```javascript
await orderBatchingService.dispatchBatch('batch-id', {
  vehicleType: 'VAN',
  driverId: 'driver-id',
  routeOptimization: { /* route data */ },
});
```

### Mark Delivered

```javascript
await orderBatchingService.markBatchDelivered('batch-id');
```

## Configuration

Default configuration values:

```javascript
{
  maxDistanceKm: 5.00,              // Max distance between orders
  minOrdersPerBatch: 3,             // Minimum orders to create batch
  maxOrdersPerBatch: 20,            // Maximum orders per batch
  batchWindowMinutes: 60,           // Time to collect orders
  maxWaitTimeMinutes: 120,          // Max wait time for order
  enableProductGrouping: true,      // Enable product grouping
  minSameProductOrders: 2,          // Min orders for product grouping
  baseDeliveryCost: 50.00,          // Base delivery cost
  costPerKm: 5.00,                  // Cost per kilometer
  costPerStop: 10.00,               // Cost per delivery stop
  bulkDiscountThreshold: 5,         // Orders needed for bulk discount
  bulkDiscountPercentage: 5.00,    // Bulk discount percentage
}
```

## Worker

Automatic batching runs every 30 minutes:

```javascript
const orderBatchingWorker = require('./workers/orderBatching.worker');

// Start worker
orderBatchingWorker.start();

// Get stats
const stats = orderBatchingWorker.getStats();

// Manual trigger
await orderBatchingWorker.triggerManually();
```

## Monitoring Queries

### Active Batches

```sql
SELECT * FROM active_batches_summary
ORDER BY batch_window_end ASC;
```

### Savings Summary

```sql
SELECT * FROM batch_savings_summary
WHERE date >= NOW() - INTERVAL '30 days'
ORDER BY date DESC;
```

### Product Efficiency

```sql
SELECT * FROM product_batching_efficiency
ORDER BY times_batched DESC
LIMIT 20;
```

### Batch Details

```sql
SELECT
  ob.*,
  COUNT(boi.id) as order_count,
  SUM(boi.order_value) as total_value
FROM order_batches ob
LEFT JOIN batch_order_items boi ON ob.id = boi.batch_id
WHERE ob.id = 'batch-id'
GROUP BY ob.id;
```

## Benefits

### Cost Savings
- Reduced delivery costs through route optimization
- Bulk discounts on grouped products
- Lower per-order delivery cost
- Typical savings: 30-50% on delivery

### Efficiency
- Optimized delivery routes
- Fewer delivery trips
- Better vehicle utilization
- Faster order fulfillment

### Environmental
- Reduced CO2 emissions
- Lower fuel consumption
- Fewer delivery vehicles needed
- Sustainable logistics

### Customer Experience
- Lower delivery fees
- Faster delivery times
- Bulk pricing benefits
- Transparent savings

## Integration Points

### Order Creation

```javascript
// When order is created
const order = await createOrder(orderData);

// Check if can be batched
const nearbyBatches = await orderBatchingService.getActiveBatches(order.vendorId);

if (nearbyBatches.length > 0) {
  // Add to existing batch
  await addOrderToBatch(nearbyBatches[0].id, order.id);
} else {
  // Will be batched by worker
  logger.info('Order will be batched automatically', { orderId: order.id });
}
```

### Vendor Dashboard

```javascript
// Show active batches
const batches = await orderBatchingService.getActiveBatches(vendorId);

// Show savings
const savings = await orderBatchingService.getBatchSavingsSummary(30);
```

## Testing

Run the test suite:

```bash
node test-order-batching.js
```

## Files Created

### Database
- `prisma/migrations/041_order_batching_system.sql`

### Services
- `src/services/orderBatching.service.js`

### Controllers
- `src/controllers/orderBatching.controller.js`

### Routes
- `src/routes/orderBatching.routes.js`

### Workers
- `src/workers/orderBatching.worker.js`

### Tests
- `test-order-batching.js`

### Documentation
- `ORDER_BATCHING_COMPLETE.md`
- `ORDER_BATCHING_QUICK_START.md`

## Deployment Checklist

- [ ] Apply database migration
- [ ] Add routes to main router
- [ ] Start worker in server.js
- [ ] Configure batching parameters
- [ ] Test with real orders
- [ ] Monitor savings

## Next Steps

1. Apply migration: `npx prisma migrate deploy`
2. Restart server
3. Configure batching parameters
4. Test automatic batching
5. Monitor savings and efficiency
6. Adjust parameters based on results

## Support

For issues or questions:
- Check logs: `logs/combined-*.log`
- View active batches: `GET /api/v1/order-batching/active`
- Check savings: `GET /api/v1/order-batching/savings-summary`
- Review config: `GET /api/v1/order-batching/config`
