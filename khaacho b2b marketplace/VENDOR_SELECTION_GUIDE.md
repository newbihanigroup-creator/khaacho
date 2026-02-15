# Vendor Selection & Order Splitting Guide

## Overview

The Vendor Selection system provides intelligent vendor ranking and automatic order splitting based on multiple criteria. It's designed to optimize vendor selection for supply chain efficiency and supports future ML improvements.

## Features

### 1. Multi-Criteria Vendor Ranking

Vendors are ranked using four key metrics:

- **Reliability Score (35%)**: Based on vendor performance history, completion rates, and ratings
- **Delivery Success Rate (25%)**: Percentage of successfully completed orders
- **Response Speed (20%)**: Average time to accept/respond to orders
- **Price Competitiveness (20%)**: Price comparison against market average

### 2. Automatic Order Splitting

Orders are automatically split across multiple vendors when items are sourced from different suppliers:

```
Example:
  Order: Rice (100kg) + Coke (50 bottles) + Sugar (30kg)
  
  Split Result:
    Vendor A: Rice (100kg) + Sugar (30kg)
    Vendor B: Coke (50 bottles)
```

### 3. Top N Vendor Selection

For each product, the system identifies the top 3 vendors (configurable) to provide:
- Primary vendor selection
- Fallback options if primary vendor rejects
- Competitive pricing visibility

### 4. Database Logging

All routing decisions are stored in the database for:
- Audit trail
- Performance analysis
- ML model training
- Business intelligence

### 5. ML-Ready Architecture

The system supports future machine learning improvements:
- Configurable ranking weights
- Comprehensive decision logging
- Performance metrics tracking
- Easy integration with ML models

## API Endpoints

### 1. Select Vendors for Order

```http
POST /api/vendor-selection/select
```

**Request Body:**
```json
{
  "items": [
    {
      "productId": "uuid",
      "quantity": 100
    }
  ],
  "options": {
    "topN": 3,
    "minReliabilityScore": 60,
    "retailerId": "uuid"
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "items": [
      {
        "productId": "uuid",
        "quantity": 100,
        "topVendors": [
          {
            "vendorId": "uuid",
            "vendorCode": "V001",
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
    ],
    "timestamp": "2026-02-14T10:00:00Z"
  }
}
```

### 2. Rank Vendors for Product

```http
GET /api/vendor-selection/rank/:productId?quantity=10&topN=3
```

**Response:**
```json
{
  "success": true,
  "data": {
    "productId": "uuid",
    "quantity": 10,
    "vendors": [
      {
        "vendorId": "uuid",
        "businessName": "Vendor A",
        "finalScore": "85.50",
        "scores": {
          "reliability": "90.00",
          "deliverySuccess": "85.00",
          "responseSpeed": "80.00",
          "price": "87.00"
        },
        "price": 50.00,
        "stock": 500,
        "leadTimeDays": 2
      }
    ],
    "count": 3
  }
}
```

### 3. Split Order by Vendor

```http
POST /api/vendor-selection/split
```

**Request Body:**
```json
{
  "items": [
    {
      "productId": "rice-1kg",
      "quantity": 100,
      "name": "Rice 1kg"
    },
    {
      "productId": "coke-500ml",
      "quantity": 50,
      "name": "Coke 500ml"
    }
  ],
  "vendorSelections": {
    "items": [
      {
        "productId": "rice-1kg",
        "selectedVendor": {
          "vendorId": "vendor-a",
          "price": 50.00
        }
      },
      {
        "productId": "coke-500ml",
        "selectedVendor": {
          "vendorId": "vendor-b",
          "price": 25.00
        }
      }
    ]
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "splitOrders": [
      {
        "vendorId": "vendor-a",
        "vendorInfo": { /* Vendor details */ },
        "items": [
          {
            "productId": "rice-1kg",
            "quantity": 100,
            "unitPrice": 50.00
          }
        ]
      },
      {
        "vendorId": "vendor-b",
        "vendorInfo": { /* Vendor details */ },
        "items": [
          {
            "productId": "coke-500ml",
            "quantity": 50,
            "unitPrice": 25.00
          }
        ]
      }
    ],
    "vendorCount": 2,
    "totalItems": 2
  }
}
```

### 4. Complete Workflow

```http
POST /api/vendor-selection/complete-workflow
```

Executes the complete workflow: select vendors → split order → store decision

**Request Body:**
```json
{
  "orderId": "uuid",
  "retailerId": "uuid",
  "items": [
    {
      "productId": "uuid",
      "quantity": 100,
      "name": "Product Name"
    }
  ],
  "options": {
    "topN": 3,
    "minReliabilityScore": 60
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "vendorSelections": { /* Vendor selection results */ },
    "splitOrders": [ /* Split order groups */ ],
    "routingLog": { /* Database routing log */ },
    "summary": {
      "totalItems": 2,
      "vendorCount": 2,
      "itemsPerVendor": [
        {
          "vendorId": "vendor-a",
          "vendorName": "Vendor A",
          "itemCount": 1,
          "totalValue": 5000.00
        }
      ]
    }
  }
}
```

### 5. Get/Update Ranking Weights

```http
GET /api/vendor-selection/weights
```

```http
PUT /api/vendor-selection/weights
```

**Request Body (PUT):**
```json
{
  "weights": {
    "reliabilityScore": 0.40,
    "deliverySuccessRate": 0.30,
    "responseSpeed": 0.15,
    "priceCompetitiveness": 0.15
  }
}
```

**Note:** Weights must sum to 1.0

## Ranking Algorithm

### Score Calculation

For each vendor, four individual scores are calculated (0-100 scale):

#### 1. Reliability Score
```javascript
// Uses existing vendor performance data
reliabilityScore = (
  vendorScore * 0.5 +
  rating * 0.3 +
  completionRate * 0.2
)
```

#### 2. Delivery Success Rate
```javascript
deliverySuccessRate = (completedOrders / totalOrders) * 100
```

#### 3. Response Speed Score
```javascript
// Based on average response time
if (avgMinutes <= 15) return 100;
if (avgMinutes <= 30) return 90;
if (avgMinutes <= 60) return 80;
if (avgMinutes <= 120) return 70;
// ... etc
```

#### 4. Price Competitiveness Score
```javascript
// Lower price = higher score
priceScore = ((maxPrice - vendorPrice) / (maxPrice - minPrice)) * 100
```

### Final Score

```javascript
finalScore = (
  reliabilityScore * 0.35 +
  deliverySuccessRate * 0.25 +
  responseSpeed * 0.20 +
  priceCompetitiveness * 0.20
)
```

## Integration Example

### In Order Processing Service

```javascript
const vendorSelectionService = require('./services/vendorSelection.service');

async function processOrder(orderData) {
  const { items, retailerId } = orderData;
  
  // Step 1: Select vendors
  const vendorSelections = await vendorSelectionService.selectVendorsForOrder(
    items,
    {
      topN: 3,
      minReliabilityScore: 60,
      retailerId,
    }
  );
  
  // Step 2: Split order
  const splitOrders = await vendorSelectionService.splitOrderByVendor(
    items,
    vendorSelections
  );
  
  // Step 3: Create sub-orders for each vendor
  for (const split of splitOrders) {
    await createSubOrder({
      vendorId: split.vendorId,
      items: split.items,
      retailerId,
    });
  }
  
  // Step 4: Store routing decision
  await vendorSelectionService.storeRoutingDecision(orderId, {
    retailerId,
    items,
    vendorSelections,
    splitOrders,
    weights: vendorSelectionService.getRankingWeights(),
  });
}
```

## Configuration

### Environment Variables

```bash
# Ranking weights (optional, defaults provided)
RANKING_WEIGHT_RELIABILITY=0.35
RANKING_WEIGHT_DELIVERY=0.25
RANKING_WEIGHT_RESPONSE=0.20
RANKING_WEIGHT_PRICE=0.20

# Minimum reliability score
MIN_VENDOR_RELIABILITY_SCORE=60

# Top N vendors to consider
VENDOR_SELECTION_TOP_N=3
```

### Database Requirements

The system uses existing tables:
- `vendors`
- `vendor_products`
- `vendor_inventories`
- `vendor_rankings`
- `vendor_routing_scores`
- `vendor_order_acceptance`
- `order_routing_log`

## ML Integration

### Training Data Collection

All routing decisions are logged with:
- Vendor scores and rankings
- Selection criteria and weights
- Actual outcomes (acceptance, completion, delivery time)

### Weight Optimization

Use historical data to optimize ranking weights:

```javascript
// Example: Update weights based on ML model output
const optimizedWeights = await mlModel.optimizeWeights(historicalData);

await vendorSelectionService.updateRankingWeights(optimizedWeights);
```

### Custom Scoring Models

Extend the service to use ML-based scoring:

```javascript
// Override score calculation
async calculateVendorScore(vendor, weights, retailerId) {
  // Use ML model for prediction
  const mlScore = await mlModel.predict({
    vendorFeatures: vendor,
    retailerFeatures: await getRetailerFeatures(retailerId),
  });
  
  return {
    ...vendor,
    finalScore: mlScore,
    scores: { ml: mlScore },
  };
}
```

## Testing

Run the test suite:

```bash
node test-vendor-selection.js
```

Tests cover:
1. Get ranking weights
2. Rank vendors for product
3. Select vendors for order
4. Split order by vendor
5. Update ranking weights
6. Weight validation
7. Generate routing reason

## Best Practices

1. **Minimum Reliability Score**: Set appropriate threshold (60-70) to filter out poor performers
2. **Top N Selection**: Use 3-5 vendors for good fallback options
3. **Weight Tuning**: Start with default weights, adjust based on business priorities
4. **Regular Updates**: Recalculate vendor scores periodically
5. **Monitor Performance**: Track routing decisions and outcomes
6. **Fallback Strategy**: Always have backup vendors selected

## Troubleshooting

### No Vendors Found

**Cause**: No vendors meet minimum criteria
**Solution**: 
- Lower `minReliabilityScore`
- Check vendor inventory levels
- Verify vendor approval status

### Poor Vendor Selection

**Cause**: Weights not aligned with business goals
**Solution**:
- Adjust ranking weights
- Review vendor performance data
- Update vendor scores

### Order Splitting Issues

**Cause**: Missing vendor selection data
**Solution**:
- Ensure all items have selected vendors
- Check vendor product availability
- Verify vendor inventory

## Future Enhancements

1. **Geographic Optimization**: Factor in delivery distance
2. **Capacity Planning**: Consider vendor workload limits
3. **Dynamic Pricing**: Real-time price updates
4. **Predictive Analytics**: Forecast vendor availability
5. **Multi-Objective Optimization**: Balance cost, speed, and reliability
6. **Vendor Clustering**: Group similar vendors for better selection

## Support

For issues or questions:
- Check logs: `logs/combined-*.log`
- Review routing decisions: `order_routing_log` table
- Monitor vendor performance: `/api/vendor-performance`
