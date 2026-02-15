# Vendor Load Balancing - Quick Reference

## What It Does

Prevents vendor overload by:
- Limiting concurrent orders per vendor
- Automatically shifting to alternative vendors
- Considering working hours
- Preventing market monopolies
- Fair distribution across vendors

## Quick Start

### 1. Environment Setup

```bash
# .env
MAX_ACTIVE_ORDERS_PER_VENDOR=10
MAX_PENDING_ORDERS_PER_VENDOR=5
MONOPOLY_THRESHOLD=0.40
WORKING_HOURS_ENABLED=true
LOAD_BALANCING_STRATEGY=round-robin
```

### 2. Run Migration

```bash
npx prisma migrate deploy
```

Migration `032_vendor_load_balancing.sql` adds:
- Working hours columns to vendors table
- `vendor_load_balancing_log` table
- `vendor_capacity_status` view
- `vendor_market_share` view

### 3. Basic Usage

```javascript
const vendorLoadBalancing = require('./services/vendorLoadBalancing.service');

// Select vendor with load balancing
const vendor = await vendorLoadBalancing.selectVendorWithLoadBalancing(
  productId,
  quantity,
  { retailerId }
);

console.log('Selected:', vendor.vendorCode);
console.log('Active orders:', vendor.activeOrdersCount);
console.log('Has capacity:', vendor.activeOrdersCount < 10);
```

### 4. Integration with Order Creation

```javascript
async function createOrder(orderData) {
  const { items } = orderData;
  
  // Select vendors with load balancing
  for (const item of items) {
    const vendor = await vendorLoadBalancing.selectVendorWithLoadBalancing(
      item.productId,
      item.quantity
    );
    
    item.vendorId = vendor.vendorId;
    item.price = vendor.price;
  }
  
  // Create order
  return await prisma.order.create({ data: orderData });
}
```

## Key Features

### Capacity Management
```javascript
// Check vendor capacity
const stats = await vendorLoadBalancing.getVendorLoadStatistics(vendorId);

console.log(`Active: ${stats.activeOrders}/${stats.maxActiveOrders}`);
console.log(`Capacity: ${stats.capacityUtilization}%`);
console.log(`Has capacity: ${stats.hasCapacity}`);
```

### Working Hours
```javascript
// Update vendor working hours
await prisma.vendor.update({
  where: { id: vendorId },
  data: {
    workingHoursStart: 8,   // 8 AM
    workingHoursEnd: 20,    // 8 PM
    timezone: 'Asia/Kathmandu',
  },
});
```

### Monopoly Prevention
```javascript
// Check market share
const monopolyStats = await vendorLoadBalancing.getMonopolyStatistics(productId, 30);

monopolyStats.forEach(stat => {
  if (stat.exceedsThreshold) {
    console.log(`⚠️  ${stat.vendorCode}: ${stat.marketShare}% market share`);
  }
});
```

### Load Balancing Strategies
```javascript
// Round-robin: Fair distribution
vendorLoadBalancing.updateConfiguration({
  loadBalancingStrategy: 'round-robin',
});

// Least-loaded: Prioritize vendors with fewer orders
vendorLoadBalancing.updateConfiguration({
  loadBalancingStrategy: 'least-loaded',
});
```

## API Endpoints

### Monitor Capacity
```bash
GET /api/load-balancing/statistics
GET /api/load-balancing/capacity
```

### Monitor Market Share
```bash
GET /api/load-balancing/monopoly?productId=uuid&days=30
GET /api/load-balancing/market-share?threshold=35
```

### View History
```bash
GET /api/load-balancing/history?vendorId=uuid&limit=50
```

### Configuration
```bash
GET /api/load-balancing/configuration
PUT /api/load-balancing/configuration
PUT /api/load-balancing/vendors/:vendorId/working-hours
```

## Selection Process

```
Eligible Vendors (by intelligence score)
    ↓
Filter by Working Hours
    ↓
Filter by Capacity (active < max, pending < max)
    ↓
Apply Monopoly Prevention (market share < threshold)
    ↓
Select Best (round-robin or least-loaded)
    ↓
Log Decision
    ↓
Return Selected Vendor
```

## Configuration Options

```javascript
const config = {
  // Maximum concurrent active orders per vendor
  maxActiveOrdersPerVendor: 10,
  
  // Maximum pending orders per vendor
  maxPendingOrdersPerVendor: 5,
  
  // Market share threshold (0.40 = 40%)
  monopolyPreventionThreshold: 0.40,
  
  // Enable working hours filtering
  workingHoursEnabled: true,
  
  // Default working hours (if not set per vendor)
  defaultWorkingHours: {
    start: 9,   // 9 AM
    end: 18,    // 6 PM
  },
  
  // Strategy: 'round-robin' or 'least-loaded'
  loadBalancingStrategy: 'round-robin',
};

// Update configuration
vendorLoadBalancing.updateConfiguration(config);
```

## Monitoring

### Real-time Capacity
```javascript
// Get capacity status from database view
const capacity = await prisma.$queryRaw`
  SELECT * FROM vendor_capacity_status
  WHERE active_orders_count >= 8
  ORDER BY capacity_utilization_percent DESC
`;
```

### Market Concentration
```javascript
// Get market share from database view
const marketShare = await prisma.$queryRaw`
  SELECT * FROM vendor_market_share
  WHERE market_share_percent_30d >= 35
  ORDER BY market_share_percent_30d DESC
`;
```

### Decision History
```javascript
// Get load balancing decisions
const history = await prisma.vendorLoadBalancingLog.findMany({
  where: { productId },
  orderBy: { createdAt: 'desc' },
  take: 50,
});
```

## Testing

```bash
# Run test script
node test-vendor-load-balancing.js
```

Tests:
- ✅ Configuration management
- ✅ Load statistics
- ✅ Monopoly detection
- ✅ Vendor selection
- ✅ Working hours filtering
- ✅ Capacity filtering
- ✅ Database views

## Common Scenarios

### Scenario 1: Vendor at Capacity
```javascript
// System automatically shifts to next ranked vendor
const vendor = await vendorLoadBalancing.selectVendorWithLoadBalancing(
  productId,
  quantity
);

// If vendor1 at capacity → selects vendor2
// If vendor2 at capacity → selects vendor3
// Logs decision for audit
```

### Scenario 2: Outside Working Hours
```javascript
// System filters vendors by working hours
// Falls back to all vendors if none available
const vendor = await vendorLoadBalancing.selectVendorWithLoadBalancing(
  productId,
  quantity
);

// Only selects vendors currently in working hours
// Or all vendors if WORKING_HOURS_ENABLED=false
```

### Scenario 3: Monopoly Risk
```javascript
// System prevents vendor from exceeding market share
const vendor = await vendorLoadBalancing.selectVendorWithLoadBalancing(
  productId,
  quantity
);

// If vendor has >40% market share → skips to next vendor
// Ensures competitive marketplace
```

### Scenario 4: Peak Hours
```javascript
// Switch to least-loaded strategy during peak
if (isPeakHours()) {
  vendorLoadBalancing.updateConfiguration({
    loadBalancingStrategy: 'least-loaded',
  });
}

// Prioritizes vendors with fewer active orders
// Maximizes throughput
```

## Integration Points

### With Vendor Intelligence
```javascript
// Load balancing uses intelligence scores for ranking
const rankedVendors = await vendorLoadBalancing.getRankedEligibleVendors(
  productId,
  quantity
);

// Vendors ranked by intelligence_score
// Then filtered by capacity, hours, monopoly
```

### With Order Routing
```javascript
// Order routing can use load balancing
const orderRouting = require('./services/orderRouting.service');

// Modify _scoreAndRankVendors to use load balancing
async function routeOrderWithLoadBalancing(orderId, orderData) {
  const vendor = await vendorLoadBalancing.selectVendorWithLoadBalancing(
    productId,
    quantity
  );
  
  return await orderRouting.routeOrder(orderId, orderData, {
    manualVendorId: vendor.vendorId,
  });
}
```

### With Vendor Selection
```javascript
// Vendor selection can integrate load balancing
const vendorSelection = require('./services/vendorSelection.service');

// Add capacity check to vendor selection
async function selectVendorWithCapacity(productId, quantity) {
  const vendors = await vendorSelection.selectVendorsForProduct(productId, quantity);
  
  // Filter by capacity
  const withCapacity = await vendorLoadBalancing.filterByLoadCapacity(vendors);
  
  return withCapacity[0];
}
```

## Troubleshooting

### All vendors at capacity
```javascript
// Increase limits
MAX_ACTIVE_ORDERS_PER_VENDOR=15
MAX_PENDING_ORDERS_PER_VENDOR=8

// Or check if orders are being completed
const stats = await vendorLoadBalancing.getVendorLoadStatistics();
console.log('Vendors at capacity:', stats.filter(v => !v.hasCapacity).length);
```

### No vendors in working hours
```javascript
// Disable working hours check
WORKING_HOURS_ENABLED=false

// Or extend working hours
await prisma.vendor.updateMany({
  data: {
    workingHoursStart: 7,
    workingHoursEnd: 21,
  },
});
```

### Monopoly prevention too strict
```javascript
// Increase threshold
MONOPOLY_THRESHOLD=0.50

// Or check market share
const stats = await vendorLoadBalancing.getMonopolyStatistics(null, 30);
console.log('Vendors exceeding threshold:', stats.filter(s => s.exceedsThreshold).length);
```

## Performance Tips

1. **Use database views** for real-time monitoring
2. **Cache configuration** to avoid repeated reads
3. **Batch vendor selection** for multi-item orders
4. **Index frequently queried columns** (vendor_id, product_id, status)
5. **Archive old logs** to keep table size manageable

## Related Documentation

- `VENDOR_LOAD_BALANCING_GUIDE.md` - Complete guide
- `VENDOR_INTELLIGENCE_GUIDE.md` - Intelligence scoring
- `VENDOR_SELECTION_GUIDE.md` - Multi-criteria selection
- `ORDER_ROUTING_API.md` - Order routing system

## Quick Commands

```bash
# Test the system
node test-vendor-load-balancing.js

# Check capacity
curl http://localhost:3000/api/load-balancing/capacity

# Check market share
curl http://localhost:3000/api/load-balancing/market-share

# Get configuration
curl http://localhost:3000/api/load-balancing/configuration

# Update configuration
curl -X PUT http://localhost:3000/api/load-balancing/configuration \
  -H "Content-Type: application/json" \
  -d '{"config":{"maxActiveOrdersPerVendor":15}}'
```

## Status

✅ **COMPLETE** - Ready for production use

- Service implementation complete
- Controller with all endpoints
- Routes registered
- Database migration ready
- Test script included
- Documentation complete
- Environment variables configured
