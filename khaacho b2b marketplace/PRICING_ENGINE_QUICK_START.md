# Pricing Engine - Quick Start

## Setup Pricing in 3 Steps

### 1. Set Base Pricing
```bash
POST /api/pricing/pricing
{
  "vendorId": "uuid",
  "productId": "uuid",
  "basePrice": 150.00
}
```

### 2. Add Bulk Tiers (Optional)
```bash
POST /api/pricing/pricing
{
  "vendorId": "uuid",
  "productId": "uuid",
  "basePrice": 160.00,
  "hasBulkPricing": true,
  "bulkTiers": [
    {
      "tierName": "Bulk 10+",
      "minimumQuantity": 10,
      "tierPrice": 145.00
    },
    {
      "tierName": "Bulk 50+",
      "minimumQuantity": 50,
      "tierPrice": 135.00
    }
  ]
}
```

### 3. Get Best Price
```bash
GET /api/pricing/product/{productId}/best-price?quantity=50
```

---

## Common Operations

### Compare All Vendor Prices
```bash
GET /api/pricing/product/{productId}/all-prices?quantity=50
```

### Calculate Price for Specific Vendor
```bash
GET /api/pricing/vendor/{vendorId}/product/{productId}/calculate?quantity=75
```

### View Price History
```bash
GET /api/pricing/product/{productId}/history
```

### Set Promotional Pricing
```bash
POST /api/pricing/pricing
{
  "vendorId": "uuid",
  "productId": "uuid",
  "basePrice": 99.00,
  "isPromotional": true,
  "promotionalLabel": "Flash Sale!",
  "validUntil": "2026-02-19T23:59:59Z"
}
```

---

## Bulk Tier Examples

### Simple 2-Tier
```javascript
bulkTiers: [
  { tierName: "Retail", minimumQuantity: 1, tierPrice: 100 },
  { tierName: "Wholesale", minimumQuantity: 50, tierPrice: 85 }
]
```

### Complex 4-Tier
```javascript
bulkTiers: [
  { tierName: "Small", minimumQuantity: 10, maximumQuantity: 49, tierPrice: 95 },
  { tierName: "Medium", minimumQuantity: 50, maximumQuantity: 99, tierPrice: 88 },
  { tierName: "Large", minimumQuantity: 100, maximumQuantity: 499, tierPrice: 82 },
  { tierName: "Distributor", minimumQuantity: 500, tierPrice: 75 }
]
```

---

## Integration Example

```javascript
// In order creation
const pricingService = require('./services/pricing.service');

// Get best price
const bestPrice = await pricingService.getBestPrice(productId, quantity);

// Create order with best price
const order = await createOrder({
  vendorId: bestPrice.vendorId,
  productId,
  quantity,
  unitPrice: bestPrice.finalPrice,
  total: bestPrice.finalPrice * quantity
});

// Record price history
await pricingService.recordPriceHistory({
  vendorId: bestPrice.vendorId,
  productId,
  orderId: order.id,
  quantity,
  finalPrice: bestPrice.finalPrice,
  selectionReason: bestPrice.selectionReason
});
```

---

## Testing

```bash
# Run automated tests
node test-pricing-engine.js

# Manual test
curl http://localhost:3000/api/pricing/product/{productId}/best-price?quantity=50
```

---

## Key Features

✅ Vendor-specific pricing  
✅ Quantity-based bulk discounts  
✅ Automatic lowest price selection  
✅ Promotional pricing support  
✅ Complete price history  
✅ Real-time price comparison  

---

## Migration

```bash
psql $DATABASE_URL -f prisma/migrations/025_pricing_engine.sql
```

---

**Full Documentation:** `PRICING_ENGINE_GUIDE.md`
