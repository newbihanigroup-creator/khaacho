# Vendor Load Balancing System - Complete Guide

## Overview

The Vendor Load Balancing System prevents vendor overload and ensures fair distribution of orders across vendors. It automatically shifts orders to alternative vendors when capacity limits are reached, considers working hours, and prevents market monopolies.

## Key Features

### 1. Capacity Management
- **Max Active Orders**: Limits concurrent active orders per vendor
- **Max Pending Orders**: Limits unprocessed orders per vendor
- **Automatic Shifting**: Routes to next-best vendor when capacity reached
- **Real-time Monitoring**: Track vendor capacity utilization

### 2. Working Hours Consideration
- **Configurable Hours**: Set working hours per vendor (default 9 AM - 6 PM)
- **Timezone Support**: Handle vendors in different timezones
- **Automatic Filtering**: Only route to vendors during working hours
- **Fallback Logic**: Use all vendors if none in working hours

### 3. Monopoly Prevention
- **Market Share Tracking**: Monitor vendor market share per product
- **Threshold Enforcement**: Prevent vendors from exceeding 40% market share
- **Fair Distribution**: Ensure competitive marketplace
- **Historical Analysis**: Track market share over 7/30 day periods

### 4. Load Balancing Strategies
- **Round-Robin**: Distribute orders evenly across vendors
- **Least-Loaded**: Prioritize vendors with fewer active orders
- **Intelligence-Based**: Factor in vendor performance scores

## Architecture

### Database Schema

```sql
-- Vendor working hours (added to vendors table)
ALTER TABLE vendors ADD COLUMN working_hours_start INTEGER DEFAULT 9;
ALTER TABLE vendors ADD COLUMN working_hours_end INTEGER DEFAULT 18;
ALTER TABLE vendors ADD COLUMN timezone VARCHAR(50) DEFAULT 'Asia/Kathmandu';

-- Load balancing decision log
CREATE TABLE vendor_load_balancing_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES orders(id),
  product_id UUID REFERENCES products(id),
  selected_vendor_id UUID REFERENCES vendors(id),
  candidate_vendors JSONB,
  strategy VARCHAR(50),
  reason TEXT,
  config_snapshot JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Real-time capacity view
CREATE VIEW vendor_capacity_status AS
SELECT 
  v.id as vendor_id,
  v.vendor_code,
  u.business_name,
  -- Active/pending order counts
  -- Working hours status
  -- Intelligence score
FROM vendors v...;

-- Market share view
CREATE VIEW vendor_market_share AS
SELECT 
  v.id as vendor_id,
  oi.product_id,
  -- Order counts for 7/30 days
  -- Market share percentages
FROM vendors v...;
```

### Service Architecture

```
vendorLoadBalancing.service.js
├── selectVendorWithLoadBalancing()  # Main selection method
├── getRankedEligibleVendors()       # Get vendors by intelligence score
├── filterByWorkingHours()           # Filter by time
├── filterByLoadCapacity()           # Filter by capacity
├── applyMonopolyPrevention()        # Filter by market share
├── selectBestVendor()               # Apply strategy
├── logLoadBalancingDecision()       # Audit trail
└── Statistics methods               # Monitoring
```

## Configuration

### Environment Variables

```bash
# Maximum concurrent active orders per vendor
MAX_ACTIVE_ORDERS_PER_VENDOR=10

# Maximum pending (unprocessed) orders per vendor
MAX_PENDING_ORDERS_PER_VENDOR=5

# Market share threshold (0.40 = 40%)
MONOPOLY_THRESHOLD=0.40

# Enable/disable working hours filtering
WORKING_HOURS_ENABLED=true

# Load balancing strategy: 'round-robin' or 'least-loaded'
LOAD_BALANCING_STRATEGY=round-robin
```

### Runtime Configuration

```javascript
const vendorLoadBalancing = require('./services/vendorLoadBalancing.service');

// Update configuration
vendorLoadBalancing.updateConfiguration({
  maxActiveOrdersPerVendor: 15,
  maxPendingOrdersPerVendor: 8,
  monopolyPreventionThreshold: 0.35,
  loadBalancingStrategy: 'least-loaded',
});

// Get current configuration
const config = vendorLoadBalancing.getConfiguration();
```

## Usage

### 1. Basic Vendor Selection

```javascript
const vendorLoadBalancing = require('./services/vendorLoadBalancing.service');

// Select vendor with load balancing
const selectedVendor = await vendorLoadBalancing.selectVendorWithLoadBalancing(
  productId,
  quantity,
  {
    retailerId: 'retailer-uuid',
    excludeVendors: ['vendor-uuid-to-exclude'],
  }
);

console.log('Selected vendor:', selectedVendor.vendorCode);
console.log('Active orders:', selectedVendor.activeOrdersCount);
console.log('Intelligence score:', selectedVendor.intelligenceScore);
```

### 2. Integration with Order Creation

```javascript
const orderRouting = require('./services/orderRouting.service');
const vendorLoadBalancing = require('./services/vendorLoadBalancing.service');

async function createOrderWithLoadBalancing(orderData) {
  const { items } = orderData;
  
  // For each product, select vendor with load balancing
  const vendorAssignments = [];
  
  for (const item of items) {
    const vendor = await vendorLoadBalancing.selectVendorWithLoadBalancing(
      item.productId,
      item.quantity
    );
    
    vendorAssignments.push({
      productId: item.productId,
      vendorId: vendor.vendorId,
      price: vendor.price,
    });
    
    // Log decision
    await vendorLoadBalancing.logLoadBalancingDecision({
      productId: item.productId,
      selectedVendorId: vendor.vendorId,
      candidateVendors: [vendor], // Full list from selection
      strategy: 'automatic',
      reason: 'Load balanced vendor selection',
    });
  }
  
  // Create order with selected vendors
  return await createOrder(orderData, vendorAssignments);
}
```

### 3. Monitor Vendor Capacity

```javascript
// Get load statistics for all vendors
const stats = await vendorLoadBalancing.getVendorLoadStatistics();

stats.forEach(vendor => {
  console.log(`${vendor.vendorCode}:`);
  console.log(`  Active: ${vendor.activeOrders}/${vendor.maxActiveOrders}`);
  console.log(`  Pending: ${vendor.pendingOrders}/${vendor.maxPendingOrders}`);
  console.log(`  Capacity: ${vendor.capacityUtilization}%`);
  console.log(`  Has capacity: ${vendor.hasCapacity}`);
  console.log(`  In working hours: ${vendor.isInWorkingHours}`);
});

// Get statistics for specific vendor
const vendorStats = await vendorLoadBalancing.getVendorLoadStatistics(vendorId);
```

### 4. Monitor Market Share

```javascript
// Get monopoly statistics for all products
const monopolyStats = await vendorLoadBalancing.getMonopolyStatistics(null, 30);

monopolyStats.forEach(stat => {
  if (stat.exceedsThreshold) {
    console.log(`⚠️  ${stat.vendorCode} has ${stat.marketShare}% share of ${stat.productName}`);
  }
});

// Get monopoly statistics for specific product
const productStats = await vendorLoadBalancing.getMonopolyStatistics(productId, 30);
```

### 5. Update Vendor Working Hours

```javascript
await prisma.vendor.update({
  where: { id: vendorId },
  data: {
    workingHoursStart: 8,  // 8 AM
    workingHoursEnd: 20,   // 8 PM
    timezone: 'Asia/Kathmandu',
  },
});
```

## API Endpoints

### GET /api/load-balancing/statistics
Get vendor load statistics

**Query Parameters:**
- `vendorId` (optional): Filter by vendor

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "vendorId": "uuid",
      "vendorCode": "V001",
      "businessName": "ABC Suppliers",
      "activeOrders": 7,
      "pendingOrders": 3,
      "maxActiveOrders": 10,
      "maxPendingOrders": 5,
      "capacityUtilization": 70.0,
      "hasCapacity": true,
      "isInWorkingHours": true
    }
  ]
}
```

### GET /api/load-balancing/monopoly
Get market share statistics

**Query Parameters:**
- `productId` (optional): Filter by product
- `days` (optional): Time period (default: 30)

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "vendorId": "uuid",
      "vendorCode": "V001",
      "businessName": "ABC Suppliers",
      "productId": "uuid",
      "productName": "Rice",
      "orderCount": 45,
      "marketShare": 38.5,
      "exceedsThreshold": false
    }
  ]
}
```

### GET /api/load-balancing/capacity
Get real-time capacity status from database view

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "vendorId": "uuid",
      "vendorCode": "V001",
      "businessName": "ABC Suppliers",
      "activeOrdersCount": 7,
      "pendingOrdersCount": 3,
      "workingHoursStart": 9,
      "workingHoursEnd": 18,
      "isInWorkingHours": true,
      "intelligenceScore": 85.5
    }
  ]
}
```

### GET /api/load-balancing/market-share
Get market share view

**Query Parameters:**
- `productId` (optional): Filter by product
- `threshold` (optional): Minimum market share percentage

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "vendorId": "uuid",
      "vendorCode": "V001",
      "productName": "Rice",
      "ordersLast30Days": 45,
      "marketSharePercent30d": 38.5,
      "ordersLast7Days": 12,
      "marketSharePercent7d": 40.0
    }
  ]
}
```

### GET /api/load-balancing/history
Get load balancing decision history

**Query Parameters:**
- `vendorId` (optional): Filter by vendor
- `productId` (optional): Filter by product
- `limit` (optional): Results per page (default: 50)
- `offset` (optional): Pagination offset (default: 0)

### GET /api/load-balancing/configuration
Get current configuration

### PUT /api/load-balancing/configuration
Update configuration

**Request Body:**
```json
{
  "config": {
    "maxActiveOrdersPerVendor": 15,
    "maxPendingOrdersPerVendor": 8,
    "monopolyPreventionThreshold": 0.35,
    "loadBalancingStrategy": "least-loaded"
  }
}
```

### PUT /api/load-balancing/vendors/:vendorId/working-hours
Update vendor working hours

**Request Body:**
```json
{
  "workingHoursStart": 8,
  "workingHoursEnd": 20,
  "timezone": "Asia/Kathmandu"
}
```

## Load Balancing Strategies

### Round-Robin Strategy
Distributes orders evenly across vendors in rotation.

**Best for:**
- Fair distribution
- Preventing vendor favoritism
- Balanced workload

**How it works:**
1. Get last selected vendor for product
2. Select next vendor in ranked list
3. Wrap around to first vendor after last

### Least-Loaded Strategy
Prioritizes vendors with fewer active orders.

**Best for:**
- Maximizing throughput
- Minimizing delivery times
- Dynamic load distribution

**How it works:**
1. Sort vendors by active order count (ascending)
2. Break ties with intelligence score (descending)
3. Select vendor with lowest load

## Selection Process

The vendor selection follows this multi-step process:

```
1. Get Eligible Vendors
   ↓ (Ranked by intelligence score)
   
2. Filter by Working Hours
   ↓ (Only vendors currently working)
   
3. Filter by Load Capacity
   ↓ (Only vendors with capacity)
   
4. Apply Monopoly Prevention
   ↓ (Exclude vendors exceeding threshold)
   
5. Select Best Vendor
   ↓ (Using configured strategy)
   
6. Log Decision
   ↓ (Audit trail)
   
7. Return Selected Vendor
```

### Fallback Logic

At each step, if no vendors pass the filter:
- **Working Hours**: Use all eligible vendors
- **Capacity**: Try to find any vendor with capacity
- **Monopoly**: Use original capacity-filtered list
- **No Vendors**: Throw error

## Monitoring & Analytics

### Real-time Monitoring

```javascript
// Check capacity status
const capacity = await prisma.$queryRaw`
  SELECT * FROM vendor_capacity_status
  WHERE active_orders_count >= 8
  ORDER BY capacity_utilization_percent DESC
`;

// Check market concentration
const marketShare = await prisma.$queryRaw`
  SELECT * FROM vendor_market_share
  WHERE market_share_percent_30d >= 35
  ORDER BY market_share_percent_30d DESC
`;
```

### Historical Analysis

```javascript
// Get load balancing history
const history = await prisma.vendorLoadBalancingLog.findMany({
  where: {
    createdAt: {
      gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // Last 7 days
    },
  },
  orderBy: { createdAt: 'desc' },
});

// Analyze strategy effectiveness
const strategyStats = history.reduce((acc, log) => {
  acc[log.strategy] = (acc[log.strategy] || 0) + 1;
  return acc;
}, {});
```

## Best Practices

### 1. Configuration Tuning

```javascript
// Start conservative
MAX_ACTIVE_ORDERS_PER_VENDOR=5
MAX_PENDING_ORDERS_PER_VENDOR=3

// Monitor and adjust based on:
// - Vendor capacity
// - Order volume
// - Fulfillment times
// - Vendor feedback

// Scale up gradually
MAX_ACTIVE_ORDERS_PER_VENDOR=10
MAX_PENDING_ORDERS_PER_VENDOR=5
```

### 2. Working Hours Management

```javascript
// Set realistic working hours
// Consider:
// - Vendor business hours
// - Delivery schedules
// - Peak order times
// - Timezone differences

// Example: Extended hours for high-demand vendors
await updateVendorWorkingHours(vendorId, {
  start: 7,  // 7 AM
  end: 21,   // 9 PM
  timezone: 'Asia/Kathmandu',
});
```

### 3. Monopoly Prevention

```javascript
// Monitor market concentration
// Alert when vendors approach threshold
// Adjust threshold based on:
// - Number of vendors
// - Product availability
// - Market dynamics

// Example: Stricter threshold for competitive products
if (productHasManyVendors) {
  MONOPOLY_THRESHOLD = 0.30; // 30%
} else {
  MONOPOLY_THRESHOLD = 0.50; // 50%
}
```

### 4. Strategy Selection

```javascript
// Choose strategy based on goals:

// Fair distribution → Round-robin
LOAD_BALANCING_STRATEGY=round-robin

// Fast fulfillment → Least-loaded
LOAD_BALANCING_STRATEGY=least-loaded

// Can switch strategies dynamically:
if (peakHours) {
  vendorLoadBalancing.updateConfiguration({
    loadBalancingStrategy: 'least-loaded',
  });
} else {
  vendorLoadBalancing.updateConfiguration({
    loadBalancingStrategy: 'round-robin',
  });
}
```

## Testing

Run the test script:

```bash
node test-vendor-load-balancing.js
```

Tests include:
- Configuration management
- Load statistics retrieval
- Monopoly detection
- Vendor selection
- Working hours filtering
- Capacity filtering
- Database views

## Troubleshooting

### Issue: All vendors at capacity

**Solution:**
```javascript
// Increase capacity limits
MAX_ACTIVE_ORDERS_PER_VENDOR=15
MAX_PENDING_ORDERS_PER_VENDOR=8

// Or add more vendors
// Or implement order queuing
```

### Issue: No vendors in working hours

**Solution:**
```javascript
// Disable working hours temporarily
WORKING_HOURS_ENABLED=false

// Or extend working hours
// Or add vendors in different timezones
```

### Issue: Monopoly prevention too strict

**Solution:**
```javascript
// Increase threshold
MONOPOLY_THRESHOLD=0.50

// Or disable for specific products
// Or add more vendors
```

### Issue: Poor vendor selection

**Solution:**
```javascript
// Check intelligence scores
const stats = await vendorLoadBalancing.getVendorLoadStatistics();

// Update vendor metrics
// Adjust routing weights
// Review vendor performance
```

## Integration Examples

See `VENDOR_LOAD_BALANCING_SUMMARY.md` for quick integration examples.

## Related Systems

- **Vendor Intelligence**: Provides intelligence scores for ranking
- **Order Routing**: Uses load balancing for vendor selection
- **Vendor Selection**: Multi-criteria vendor ranking
- **Repeat Order Prediction**: Benefits from fair distribution

## Support

For issues or questions:
1. Check logs: `logs/orders-*.log`
2. Review load balancing history
3. Check vendor capacity status
4. Monitor market share statistics
