# Multi-Vendor Pricing Engine Guide

Complete guide for the intelligent pricing engine with bulk tiers and automatic price selection.

## Table of Contents
1. [Overview](#overview)
2. [Features](#features)
3. [Database Schema](#database-schema)
4. [Pricing Setup](#pricing-setup)
5. [Bulk Pricing Tiers](#bulk-pricing-tiers)
6. [Automatic Price Selection](#automatic-price-selection)
7. [Price History](#price-history)
8. [API Reference](#api-reference)
9. [Integration](#integration)
10. [Testing](#testing)

---

## Overview

The pricing engine enables multiple vendors to set competitive prices with quantity-based bulk discounts. The system automatically selects the best price during order creation and maintains complete price history.

### Key Capabilities
- Vendor-specific product pricing
- Quantity-based bulk pricing tiers
- Automatic lowest price selection
- Promotional pricing support
- Price validity periods
- Immutable price history
- Real-time price comparison
- Performance-optimized caching

---

## Features

### 1. Base Pricing
Each vendor sets their own base price for products:
- Minimum/maximum order quantities
- Cost price tracking (optional)
- Profit margin calculation
- Currency support

### 2. Bulk Pricing Tiers
Quantity-based discounts:
- Multiple tiers per product
- Flexible quantity ranges
- Priority-based tier selection
- Percentage or fixed discounts

### 3. Automatic Price Selection
System intelligently selects best price:
- Considers all active vendors
- Applies bulk tier discounts
- Respects quantity constraints
- Prioritizes promotional pricing

### 4. Price History
Complete audit trail:
- Every price selection recorded
- Competing prices captured
- Selection reason documented
- Immutable historical data

### 5. Price Comparison
Real-time market intelligence:
- Lowest/highest/average prices
- Price range and variance
- Vendor count
- Statistical analysis

---

## Database Schema

### Tables

**vendor_pricing** - Base pricing configuration
```sql
- id (UUID)
- vendor_id (FK)
- product_id (FK)
- base_price (DECIMAL)
- has_bulk_pricing (BOOLEAN)
- valid_from, valid_until (TIMESTAMP)
- cost_price, margin_percentage
- is_promotional, promotional_label
- min_order_quantity, max_order_quantity
- is_active
```

**vendor_pricing_tiers** - Bulk discount tiers
```sql
- id (UUID)
- pricing_id (FK)
- tier_name (VARCHAR)
- minimum_quantity, maximum_quantity (INT)
- tier_price (DECIMAL)
- discount_percentage (DECIMAL)
- priority (INT)
- is_active
```

**price_history** - Immutable price records
```sql
- id (UUID)
- vendor_id, product_id, order_id (FK)
- base_price, tier_price, final_price
- tier_name, discount_applied
- quantity, selection_reason
- competing_prices (JSONB)
- created_at (immutable)
```

**price_comparison_cache** - Performance cache
```sql
- product_id (FK)
- lowest_price, highest_price, average_price
- vendor_count, price_range, price_variance
- cached_at, expires_at
```

### Views

**active_vendor_pricing** - Active pricing with tiers
```sql
SELECT * FROM active_vendor_pricing;
-- Returns all active pricing with tier counts
```

**product_price_comparison** - Price statistics
```sql
SELECT * FROM product_price_comparison;
-- Returns price comparison data per product
```

### Functions

**get_best_price_for_quantity()** - Intelligent price selection
```sql
SELECT * FROM get_best_price_for_quantity(
  product_id UUID,
  quantity INT,
  vendor_id UUID DEFAULT NULL
);
```

Returns:
- Best vendor and price
- Applied tier information
- Discount details
- Selection reasoning

---

## Pricing Setup

### Set Base Pricing

```javascript
POST /api/pricing/pricing
{
  "vendorId": "uuid",
  "productId": "uuid",
  "basePrice": 150.00,
  "hasBulkPricing": false,
  "minOrderQuantity": 1,
  "maxOrderQuantity": null,
  "isPromotional": false,
  "validFrom": "2026-02-12T00:00:00Z",
  "validUntil": null
}
```

### Set Pricing with Bulk Tiers

```javascript
POST /api/pricing/pricing
{
  "vendorId": "uuid",
  "productId": "uuid",
  "basePrice": 160.00,
  "hasBulkPricing": true,
  "bulkTiers": [
    {
      "tierName": "Small Bulk",
      "minimumQuantity": 10,
      "maximumQuantity": 49,
      "tierPrice": 145.00,
      "priority": 1
    },
    {
      "tierName": "Medium Bulk",
      "minimumQuantity": 50,
      "maximumQuantity": 99,
      "tierPrice": 135.00,
      "priority": 2
    },
    {
      "tierName": "Large Bulk",
      "minimumQuantity": 100,
      "maximumQuantity": null,
      "tierPrice": 125.00,
      "priority": 3
    }
  ]
}
```

### Set Promotional Pricing

```javascript
POST /api/pricing/pricing
{
  "vendorId": "uuid",
  "productId": "uuid",
  "basePrice": 99.00,
  "isPromotional": true,
  "promotionalLabel": "Flash Sale - 50% Off!",
  "validFrom": "2026-02-12T00:00:00Z",
  "validUntil": "2026-02-19T23:59:59Z"
}
```

---

## Bulk Pricing Tiers

### Tier Structure

Each tier defines:
- **Tier Name**: Display name (e.g., "Wholesale", "Bulk")
- **Minimum Quantity**: Threshold to activate tier
- **Maximum Quantity**: Upper limit (null = unlimited)
- **Tier Price**: Discounted price
- **Priority**: Higher priority checked first
- **Discount Percentage**: Auto-calculated or manual

### Tier Selection Logic

1. Filter tiers where `quantity >= minimum_quantity`
2. Filter tiers where `quantity <= maximum_quantity` (if set)
3. Sort by priority (DESC), then by price (ASC)
4. Select first matching tier
5. Fall back to base price if no tier matches

### Example Tier Configuration

```javascript
// Product: Rice 25kg bag
// Base Price: 2000 NPR

Tiers:
1. Retail (1-9 bags): 2000 NPR (base price)
2. Small Shop (10-49 bags): 1850 NPR (7.5% discount)
3. Wholesale (50-99 bags): 1700 NPR (15% discount)
4. Distributor (100+ bags): 1500 NPR (25% discount)
```

### Update Tiers

```javascript
PUT /api/pricing/pricing/{pricingId}/tiers
{
  "tiers": [
    {
      "tierName": "Updated Tier",
      "minimumQuantity": 20,
      "tierPrice": 140.00,
      "priority": 1
    }
  ]
}
```

---

## Automatic Price Selection

### How It Works

When an order is created:

1. **Query Active Pricing**: Get all vendors with active pricing for product
2. **Apply Quantity Filters**: Filter by min/max order quantities
3. **Calculate Tier Prices**: For each vendor, find applicable bulk tier
4. **Select Best Price**: Choose lowest final price
5. **Record History**: Save selection with competing prices

### Selection Criteria

Priority order:
1. **Lowest Final Price** (after tier discounts)
2. **Promotional Pricing** (if prices equal)
3. **Vendor Rating** (future enhancement)

### Get Best Price

```javascript
GET /api/pricing/product/{productId}/best-price?quantity=50

Response:
{
  "vendorId": "uuid",
  "vendorName": "ABC Suppliers",
  "finalPrice": 135.00,
  "basePrice": 160.00,
  "tierPrice": 135.00,
  "tierName": "Medium Bulk",
  "discountPercentage": 15.63,
  "selectionReason": "Bulk tier applied: Medium Bulk (qty >= 50)"
}
```

### Get All Prices (Comparison)

```javascript
GET /api/pricing/product/{productId}/all-prices?quantity=50

Response:
{
  "prices": [
    {
      "vendor_name": "ABC Suppliers",
      "base_price": 160.00,
      "final_price": 135.00,
      "tier_name": "Medium Bulk",
      "available_tiers": [...]
    },
    {
      "vendor_name": "XYZ Traders",
      "base_price": 150.00,
      "final_price": 150.00,
      "tier_name": null,
      "available_tiers": null
    }
  ]
}
```

---

## Price History

### Automatic Recording

Price history is automatically recorded when:
- Order is created
- Price is selected from multiple vendors
- Bulk tier is applied

### History Data Captured

```javascript
{
  "vendorId": "uuid",
  "productId": "uuid",
  "orderId": "uuid",
  "quantity": 50,
  "basePrice": 160.00,
  "tierPrice": 135.00,
  "tierName": "Medium Bulk",
  "finalPrice": 135.00,
  "discountApplied": 15.63,
  "wasPromotional": false,
  "selectionReason": "Bulk tier applied",
  "competingPrices": [
    {"vendor": "XYZ", "price": 150.00},
    {"vendor": "ABC", "price": 135.00}
  ],
  "createdAt": "2026-02-12T10:30:00Z"
}
```

### Query Price History

```javascript
GET /api/pricing/product/{productId}/history?limit=50

Response:
{
  "history": [
    {
      "vendor_name": "ABC Suppliers",
      "product_name": "Rice 25kg",
      "order_number": "ORD-12345",
      "quantity": 50,
      "final_price": 135.00,
      "tier_name": "Medium Bulk",
      "selection_reason": "Bulk tier applied",
      "created_at": "2026-02-12T10:30:00Z"
    }
  ]
}
```

### Price Trend Analysis

Use history to analyze:
- Price changes over time
- Vendor competitiveness
- Bulk tier effectiveness
- Seasonal pricing patterns
- Discount impact on sales

---

## API Reference

### Pricing Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/pricing/pricing` | Set vendor pricing |
| POST | `/api/pricing/vendor/{id}/pricing/bulk` | Bulk set pricing |
| PUT | `/api/pricing/pricing/{id}/deactivate` | Deactivate pricing |
| PUT | `/api/pricing/pricing/{id}/tiers` | Update bulk tiers |

### Price Queries

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/pricing/product/{id}/best-price` | Get best price |
| GET | `/api/pricing/product/{id}/all-prices` | Get all prices |
| GET | `/api/pricing/product/{id}/comparison` | Price comparison |
| GET | `/api/pricing/vendor/{vid}/product/{pid}/calculate` | Calculate price |

### Vendor Pricing

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/pricing/vendor/{id}/pricing` | Get all vendor pricing |
| GET | `/api/pricing/vendor/{vid}/product/{pid}/pricing` | Get specific pricing |

### History & Analytics

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/pricing/product/{id}/history` | Get price history |
| GET | `/api/pricing/dashboard` | Pricing dashboard |

---

## Integration

### Order Creation Integration

```javascript
// In order creation service
const pricingService = require('./pricing.service');

async function createOrder(orderData) {
  const { productId, quantity } = orderData;
  
  // Get best price
  const bestPrice = await pricingService.getBestPrice(
    productId,
    quantity
  );
  
  if (!bestPrice) {
    throw new Error('No pricing available');
  }
  
  // Get all prices for history
  const allPrices = await pricingService.getAllPricesForProduct(
    productId,
    quantity
  );
  
  // Create order with best price
  const order = await createOrderWithPrice({
    ...orderData,
    vendorId: bestPrice.vendorId,
    unitPrice: bestPrice.finalPrice,
    total: bestPrice.finalPrice * quantity
  });
  
  // Record price history
  await pricingService.recordPriceHistory({
    vendorId: bestPrice.vendorId,
    productId,
    orderId: order.id,
    quantity,
    basePrice: bestPrice.basePrice,
    tierPrice: bestPrice.tierPrice,
    tierName: bestPrice.tierName,
    finalPrice: bestPrice.finalPrice,
    pricingId: bestPrice.pricingId,
    tierId: bestPrice.tierId,
    discountApplied: bestPrice.discountPercentage,
    wasPromotional: bestPrice.isPromotional,
    selectionReason: bestPrice.selectionReason,
    competingPrices: allPrices
  });
  
  return order;
}
```

### WhatsApp Order Integration

```javascript
// When retailer orders via WhatsApp
const bestPrice = await pricingService.getBestPrice(
  productId,
  quantity
);

const message = `
Best price found: ${bestPrice.finalPrice} NPR
Vendor: ${bestPrice.vendorName}
${bestPrice.tierName ? `Bulk discount: ${bestPrice.tierName}` : ''}
Total: ${bestPrice.finalPrice * quantity} NPR

Reply YES to confirm order.
`;
```

### Price Display Integration

```javascript
// Show pricing tiers to customer
const pricing = await pricingService.getVendorPricing(
  vendorId,
  productId
);

console.log(`Base Price: ${pricing.base_price}`);
if (pricing.tiers) {
  console.log('Bulk Discounts:');
  pricing.tiers.forEach(tier => {
    console.log(`  ${tier.minimumQuantity}+ units: ${tier.tierPrice} (${tier.discountPercentage}% off)`);
  });
}
```

---

## Testing

### Run Pricing Tests

```bash
node test-pricing-engine.js
```

### Test Scenarios

1. **Base Pricing Setup**
   - Set pricing for multiple vendors
   - Verify pricing activation

2. **Bulk Tier Configuration**
   - Create multiple tiers
   - Test tier priority
   - Verify discount calculation

3. **Price Selection**
   - Test with different quantities
   - Verify lowest price selected
   - Check tier application

4. **Price Comparison**
   - Compare multiple vendors
   - Verify statistics
   - Check price range

5. **Promotional Pricing**
   - Set time-limited promotions
   - Verify expiration
   - Test priority over regular pricing

6. **Price History**
   - Record selections
   - Query history
   - Verify immutability

### Manual Testing

```bash
# Set pricing
curl -X POST http://localhost:3000/api/pricing/pricing \
  -H "Content-Type: application/json" \
  -d '{
    "vendorId": "uuid",
    "productId": "uuid",
    "basePrice": 150.00,
    "hasBulkPricing": true,
    "bulkTiers": [
      {
        "tierName": "Bulk",
        "minimumQuantity": 10,
        "tierPrice": 135.00
      }
    ]
  }'

# Get best price
curl http://localhost:3000/api/pricing/product/{productId}/best-price?quantity=50

# Compare prices
curl http://localhost:3000/api/pricing/product/{productId}/all-prices?quantity=50
```

---

## Performance Optimization

### Caching Strategy

1. **Price Comparison Cache**: Cached for 5 minutes
2. **Active Pricing View**: Materialized for fast queries
3. **Database Indexes**: Optimized for common queries

### Cache Invalidation

Automatic invalidation on:
- Pricing updates
- Tier modifications
- Pricing activation/deactivation

### Query Optimization

- Use `get_best_price_for_quantity()` function for best performance
- Leverage views for reporting
- Index on vendor_id + product_id + is_active

---

## Business Rules

### Pricing Rules

1. Only one active pricing per vendor-product combination
2. Bulk tiers must not overlap (enforced by priority)
3. Tier price must be less than or equal to base price
4. Valid_until must be after valid_from
5. Minimum quantity must be positive

### Selection Rules

1. Only approved vendors considered
2. Only active pricing considered
3. Respect validity periods
4. Apply quantity constraints
5. Prioritize promotional pricing when prices equal

### History Rules

1. All price selections recorded (immutable)
2. Competing prices captured at selection time
3. Selection reason documented
4. Cannot modify historical records

---

## Production Considerations

### Monitoring

- Track price selection performance
- Monitor cache hit rates
- Alert on pricing gaps (no vendors)
- Track promotional pricing effectiveness

### Maintenance

- Archive old price history (> 1 year)
- Clean expired promotional pricing
- Refresh price comparison cache
- Reindex pricing tables monthly

### Security

- Vendors can only update their own pricing
- Price history is read-only
- Admin approval for bulk price changes
- Audit log for pricing modifications

---

## Migration

Run the pricing engine migration:

```bash
psql $DATABASE_URL -f prisma/migrations/025_pricing_engine.sql
```

This creates:
- 4 tables (pricing, tiers, history, cache)
- 2 views (active pricing, comparison)
- 1 function (best price selection)
- Triggers for cache invalidation
- Indexes for performance

---

**System Status:** Production Ready ✅
**Last Updated:** 2026-02-12
**Version:** 1.0.0
