# Quick Reference: Delivery & Inventory

## Delivery Management

### Create Delivery
```bash
POST /api/delivery/deliveries
{
  "orderId": "uuid",
  "deliveryPersonId": "uuid",
  "deliveryAddress": "Address",
  "estimatedDeliveryTime": "2026-02-12T15:00:00Z"
}
```

### Update Status
```bash
# Quick methods
PUT /api/delivery/deliveries/{id}/picked-up
PUT /api/delivery/deliveries/{id}/out-for-delivery
PUT /api/delivery/deliveries/{id}/delivered  # ← Triggers credit ledger
PUT /api/delivery/deliveries/{id}/failed
```

### Get Active Deliveries
```bash
GET /api/delivery/deliveries/active
```

### Status Flow
```
ASSIGNED → PICKED_UP → OUT_FOR_DELIVERY → DELIVERED
                                              ↓
                                    Credit Ledger Updated
```

---

## Inventory Management

### Check Stock
```bash
GET /api/vendor-inventory/vendor/{vendorId}/inventory?status=AVAILABLE
```

### Update Stock
```bash
PUT /api/vendor-inventory/vendor/{vendorId}/inventory
{
  "productId": "uuid",
  "availableQuantity": 100,
  "price": 150.00,
  "minStock": 20
}
```

### Low Stock Alerts
```bash
GET /api/vendor-inventory/vendor/{vendorId}/low-stock-alerts
```

### Price Comparison
```bash
GET /api/vendor-inventory/product/{productId}/price-comparison
```

---

## Service Methods

### Stock Deduction (Order Confirmation)
```javascript
await vendorInventoryService.reduceStockOnOrderAcceptance(
  orderId, vendorId, productId, quantity
);
```

### Stock Restoration (Order Cancellation)
```javascript
await vendorInventoryService.restoreStockOnCancellation(
  orderId, vendorId, productId, quantity
);
```

### Manual Adjustment
```javascript
await vendorInventoryService.adjustStock(
  vendorId, productId, +10, "Restock"
);
```

### Delivery Status Update
```javascript
await deliveryService.updateDeliveryStatus(
  deliveryId, 'DELIVERED', { signatureUrl, photoUrl }
);
// Automatically updates credit ledger
```

---

## Key Features

### Delivery System
✅ Immutable logs  
✅ Auto credit ledger integration  
✅ Performance tracking  
✅ Proof of delivery  
✅ Rating system  

### Inventory System
✅ Transaction safety  
✅ Negative stock prevention  
✅ Auto status updates  
✅ Low stock alerts  
✅ Bulk operations  

---

## Testing

```bash
# Run delivery tests
node test-delivery-system.js

# Test inventory
curl http://localhost:3000/api/vendor-inventory/inventory-dashboard
```

---

## Migration

```bash
psql $DATABASE_URL -f prisma/migrations/024_delivery_management.sql
```

---

## Common Workflows

### Complete Delivery Flow
1. Create delivery → `POST /api/delivery/deliveries`
2. Mark picked up → `PUT /deliveries/{id}/picked-up`
3. Mark out for delivery → `PUT /deliveries/{id}/out-for-delivery`
4. Mark delivered → `PUT /deliveries/{id}/delivered`
5. Credit ledger automatically updated ✅

### Stock Management Flow
1. Check stock → `GET /vendor/{id}/inventory`
2. Order placed → Stock auto-deducted
3. Order cancelled → Stock auto-restored
4. Low stock → Alert generated
5. Restock → Update inventory

---

**Full Documentation:** `DELIVERY_INVENTORY_GUIDE.md`
