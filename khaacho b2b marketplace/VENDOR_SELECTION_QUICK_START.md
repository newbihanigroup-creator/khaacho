# Vendor Selection Quick Start

## 🚀 Quick Implementation

### 1. Basic Vendor Selection

```javascript
const vendorSelectionService = require('./src/services/vendorSelection.service');

// Select vendors for order items
const items = [
  { productId: 'rice-1kg', quantity: 100 },
  { productId: 'coke-500ml', quantity: 50 },
];

const result = await vendorSelectionService.selectVendorsForOrder(items, {
  topN: 3,
  minReliabilityScore: 60,
});

console.log('Selected vendors:', result.items);
```

### 2. Rank Vendors for Single Product

```javascript
// Get top 3 vendors for a product
const vendors = await vendorSelectionService.rankVendorsForProduct(
  'product-id',
  10, // quantity
  { topN: 3 }
);

console.log('Top vendor:', vendors[0]);
console.log('Score:', vendors[0].finalScore);
```

### 3. Split Order Automatically

```javascript
// After vendor selection
const splitOrders = await vendorSelectionService.splitOrderByVendor(
  items,
  vendorSelections
);

// Result: Orders grouped by vendor
splitOrders.forEach(split => {
  console.log(`Vendor: ${split.vendorInfo.businessName}`);
  console.log(`Items: ${split.items.length}`);
});
```

### 4. Complete Workflow (Recommended)

```javascript
// One-step: select, split, and store
const result = await vendorSelectionService.completeWorkflow({
  orderId: 'order-123',
  retailerId: 'retailer-456',
  items: [
    { productId: 'rice-1kg', quantity: 100, name: 'Rice 1kg' },
    { productId: 'coke-500ml', quantity: 50, name: 'Coke 500ml' },
  ],
  options: {
    topN: 3,
    minReliabilityScore: 60,
  },
});

console.log('Vendors:', result.splitOrders.length);
console.log('Routing logged:', result.routingLog.id);
```

## 📊 Ranking Criteria

| Criterion | Weight | Description |
|-----------|--------|-------------|
| Reliability | 35% | Performance history, ratings |
| Delivery Success | 25% | Completion rate |
| Response Speed | 20% | Time to accept orders |
| Price | 20% | Competitive pricing |

## 🔧 Configuration

### Update Ranking Weights

```javascript
// Adjust weights for your business needs
await vendorSelectionService.updateRankingWeights({
  reliabilityScore: 0.40,        // Increase reliability importance
  deliverySuccessRate: 0.30,     // Increase delivery importance
  responseSpeed: 0.15,           // Decrease response importance
  priceCompetitiveness: 0.15,    // Decrease price importance
});
```

### Get Current Weights

```javascript
const weights = vendorSelectionService.getRankingWeights();
console.log(weights);
```

## 🌐 API Usage

### Select Vendors

```bash
curl -X POST http://localhost:3000/api/vendor-selection/select \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "items": [
      {"productId": "uuid", "quantity": 100}
    ],
    "options": {
      "topN": 3,
      "minReliabilityScore": 60
    }
  }'
```

### Rank Vendors

```bash
curl http://localhost:3000/api/vendor-selection/rank/PRODUCT_ID?quantity=10&topN=3 \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Complete Workflow

```bash
curl -X POST http://localhost:3000/api/vendor-selection/complete-workflow \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "orderId": "uuid",
    "retailerId": "uuid",
    "items": [
      {"productId": "uuid", "quantity": 100, "name": "Product"}
    ]
  }'
```

## 📝 Example Output

### Vendor Selection Result

```json
{
  "items": [
    {
      "productId": "rice-1kg",
      "quantity": 100,
      "topVendors": [
        {
          "vendorId": "vendor-a",
          "businessName": "Vendor A",
          "finalScore": "85.50",
          "scores": {
            "reliability": "90.00",
            "deliverySuccess": "85.00",
            "responseSpeed": "80.00",
            "price": "87.00"
          },
          "price": 50.00,
          "stock": 500
        }
      ],
      "selectedVendor": { /* Top vendor */ }
    }
  ]
}
```

### Split Order Result

```json
{
  "splitOrders": [
    {
      "vendorId": "vendor-a",
      "vendorInfo": {
        "businessName": "Vendor A",
        "finalScore": "85.50"
      },
      "items": [
        {
          "productId": "rice-1kg",
          "quantity": 100,
          "unitPrice": 50.00
        },
        {
          "productId": "sugar-1kg",
          "quantity": 30,
          "unitPrice": 45.00
        }
      ]
    },
    {
      "vendorId": "vendor-b",
      "vendorInfo": {
        "businessName": "Vendor B",
        "finalScore": "82.30"
      },
      "items": [
        {
          "productId": "coke-500ml",
          "quantity": 50,
          "unitPrice": 25.00
        }
      ]
    }
  ],
  "vendorCount": 2
}
```

## 🧪 Testing

```bash
# Run test suite
node test-vendor-selection.js
```

## ⚙️ Common Options

```javascript
const options = {
  topN: 3,                    // Number of top vendors to return
  minReliabilityScore: 60,    // Minimum score (0-100)
  retailerId: 'uuid',         // For location-based optimization
  weights: {                  // Custom weights (optional)
    reliabilityScore: 0.35,
    deliverySuccessRate: 0.25,
    responseSpeed: 0.20,
    priceCompetitiveness: 0.20,
  },
};
```

## 🎯 Use Cases

### 1. Order Processing
```javascript
// In order creation flow
const vendorSelections = await vendorSelectionService.selectVendorsForOrder(items);
const splitOrders = await vendorSelectionService.splitOrderByVendor(items, vendorSelections);

// Create sub-orders for each vendor
for (const split of splitOrders) {
  await createSubOrder(split);
}
```

### 2. Vendor Comparison
```javascript
// Compare vendors for a product
const vendors = await vendorSelectionService.rankVendorsForProduct(productId, quantity);

// Show to admin for manual selection
displayVendorComparison(vendors);
```

### 3. Price Discovery
```javascript
// Find best prices across vendors
const vendors = await vendorSelectionService.rankVendorsForProduct(productId, quantity, {
  weights: {
    reliabilityScore: 0.20,
    deliverySuccessRate: 0.20,
    responseSpeed: 0.10,
    priceCompetitiveness: 0.50, // Prioritize price
  },
});
```

## 🔍 Monitoring

### Check Routing Decisions

```javascript
// Get routing decision for an order
const routingLog = await vendorSelectionService.getRoutingDecision(orderId);

console.log('Selected vendor:', routingLog.selectedVendorId);
console.log('Vendors evaluated:', routingLog.vendorsEvaluated);
console.log('Routing reason:', routingLog.routingReason);
```

### API Endpoint

```bash
curl http://localhost:3000/api/vendor-selection/routing-decision/ORDER_ID \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## 📈 Performance Tips

1. **Cache vendor scores**: Update periodically, not per request
2. **Batch processing**: Select vendors for multiple orders at once
3. **Async operations**: Use Promise.all for parallel vendor ranking
4. **Database indexes**: Ensure proper indexes on vendor tables
5. **Minimum score threshold**: Filter vendors early to reduce processing

## 🚨 Troubleshooting

### No vendors found
```javascript
// Lower minimum score or check vendor data
const vendors = await vendorSelectionService.rankVendorsForProduct(
  productId,
  quantity,
  { minReliabilityScore: 50 } // Lower threshold
);
```

### Weights validation error
```javascript
// Ensure weights sum to 1.0
const weights = {
  reliabilityScore: 0.35,
  deliverySuccessRate: 0.25,
  responseSpeed: 0.20,
  priceCompetitiveness: 0.20,
}; // Sum = 1.0 ✓
```

## 📚 Next Steps

- Read full guide: `VENDOR_SELECTION_GUIDE.md`
- Review API documentation: `API_DOCUMENTATION.md`
- Check vendor performance: `/api/vendor-performance`
- Monitor routing logs: `order_routing_log` table

## 🎓 Key Concepts

- **Multi-criteria ranking**: Vendors scored on 4 dimensions
- **Automatic splitting**: Orders divided by optimal vendor
- **Top N selection**: Multiple vendors for fallback
- **ML-ready**: Weights adjustable for optimization
- **Full logging**: All decisions tracked in database
