# Delivery Management & Inventory System Guide

Complete guide for delivery tracking and inventory management in Khaacho B2B platform.

## Table of Contents
1. [Delivery Management System](#delivery-management-system)
2. [Inventory Management System](#inventory-management-system)
3. [Integration Points](#integration-points)
4. [API Reference](#api-reference)
5. [Testing](#testing)

---

## Delivery Management System

### Overview
Immutable delivery tracking system with automatic credit ledger integration when deliveries are completed.

### Features
- ✅ Delivery person management
- ✅ Order-to-delivery assignment
- ✅ Real-time status tracking
- ✅ Immutable delivery logs
- ✅ Automatic credit ledger updates on delivery
- ✅ Performance metrics and ratings
- ✅ Proof of delivery (signature, photos)

### Delivery Statuses

```
ASSIGNED → PICKED_UP → OUT_FOR_DELIVERY → DELIVERED
                ↓              ↓
            FAILED         CANCELLED
```

**Status Transitions:**
- `ASSIGNED`: Delivery person assigned to order
- `PICKED_UP`: Package collected from warehouse
- `OUT_FOR_DELIVERY`: En route to customer
- `DELIVERED`: Successfully delivered (triggers credit ledger)
- `FAILED`: Delivery attempt failed (can reassign)
- `CANCELLED`: Delivery cancelled

### Database Schema

**Tables:**
- `delivery_persons` - Delivery personnel records
- `deliveries` - Immutable delivery tracking
- `delivery_status_logs` - Complete status history
- `delivery_ratings` - Customer feedback

**Key Fields:**
```sql
deliveries:
  - delivery_number (unique)
  - order_id (FK to orders)
  - delivery_person_id (FK to delivery_persons)
  - status (enum)
  - assigned_at, picked_up_at, out_for_delivery_at, delivered_at
  - delivery_address, recipient_name, recipient_phone
  - signature_url, photo_url (proof of delivery)
  - metadata (JSONB for tracking data)
```

### Credit Ledger Integration

When delivery status changes to `DELIVERED`:
1. Order status updated to `DELIVERED`
2. Credit ledger entry created automatically
3. Retailer account debited for order amount
4. Vendor account credited for order amount
5. All operations in single transaction

### API Endpoints

#### Create Delivery
```http
POST /api/delivery/deliveries
Authorization: Bearer {token}

{
  "orderId": "uuid",
  "deliveryPersonId": "uuid",
  "deliveryAddress": "Kathmandu, Nepal",
  "recipientName": "Shop Name",
  "recipientPhone": "+977-9841234567",
  "estimatedDeliveryTime": "2026-02-12T15:00:00Z"
}
```

#### Update Status
```http
PUT /api/delivery/deliveries/{deliveryId}/status

{
  "status": "PICKED_UP",
  "location": { "lat": 27.7172, "lng": 85.3240 },
  "notes": "Package picked up"
}
```

#### Quick Status Updates
```http
PUT /api/delivery/deliveries/{deliveryId}/picked-up
PUT /api/delivery/deliveries/{deliveryId}/out-for-delivery
PUT /api/delivery/deliveries/{deliveryId}/delivered
PUT /api/delivery/deliveries/{deliveryId}/failed
```

#### Get Delivery Details
```http
GET /api/delivery/deliveries/{deliveryId}
```

Response includes:
- Delivery information
- Order details
- Delivery person info
- Complete status log history

#### Get Active Deliveries
```http
GET /api/delivery/deliveries/active
```

Returns all deliveries in ASSIGNED, PICKED_UP, or OUT_FOR_DELIVERY status.

#### Delivery Person Management
```http
POST /api/delivery/delivery-persons
GET /api/delivery/delivery-persons/{personId}/deliveries
GET /api/delivery/delivery-persons/{personId}/performance
```

#### Rate Delivery
```http
POST /api/delivery/deliveries/rate

{
  "deliveryId": "uuid",
  "orderId": "uuid",
  "deliveryPersonId": "uuid",
  "retailerId": "uuid",
  "rating": 5,
  "feedback": "Excellent service"
}
```

### Performance Metrics

Automatically tracked for each delivery person:
- Total deliveries
- Successful deliveries
- Failed deliveries
- Success rate (%)
- Average delivery time
- Average rating
- Active deliveries count

### Views

**active_deliveries** - Real-time active delivery tracking
```sql
SELECT * FROM active_deliveries;
```

**delivery_person_performance** - Performance dashboard
```sql
SELECT * FROM delivery_person_performance;
```

---

## Inventory Management System

### Overview
Vendor-based inventory system with transactional stock management, automatic status updates, and low stock alerts.

### Features
- ✅ Vendor-specific inventory tracking
- ✅ Transactional stock updates (prevents negative stock)
- ✅ Automatic stock deduction on order confirmation
- ✅ Automatic stock restoration on cancellation
- ✅ Low stock alerts
- ✅ Price comparison across vendors
- ✅ Bulk inventory updates
- ✅ Inventory dashboard

### Inventory Statuses

- `AVAILABLE` - In stock and available
- `LOW_STOCK` - Below minimum threshold
- `OUT_OF_STOCK` - No stock available
- `DISCONTINUED` - Product discontinued

### Database Schema

**Table:** `vendor_inventories`

```sql
vendor_inventories:
  - vendor_id (FK to vendors)
  - product_id (FK to products)
  - price (vendor's selling price)
  - available_quantity (current stock)
  - min_stock (reorder threshold)
  - max_stock (maximum capacity)
  - status (enum)
  - last_updated (timestamp)
  - is_active (boolean)
```

### Stock Management Rules

1. **Prevent Negative Stock**: All adjustments validated before commit
2. **Transactional Safety**: Serializable isolation level
3. **Automatic Status Updates**: Based on quantity vs min_stock
4. **Order Integration**: Stock deducted on order acceptance
5. **Cancellation Handling**: Stock restored on order cancellation

### API Endpoints

#### Get Vendor Inventory
```http
GET /api/vendor-inventory/vendor/{vendorId}/inventory
Query params: ?productId=uuid&status=AVAILABLE&lowStockOnly=true
```

#### Update Inventory
```http
PUT /api/vendor-inventory/vendor/{vendorId}/inventory

{
  "productId": "uuid",
  "price": 150.00,
  "availableQuantity": 100,
  "minStock": 20,
  "status": "AVAILABLE"
}
```

#### Bulk Update
```http
POST /api/vendor-inventory/vendor/{vendorId}/inventory/bulk

{
  "updates": [
    {
      "productId": "uuid",
      "availableQuantity": 50,
      "price": 120.00
    },
    {
      "productId": "uuid",
      "availableQuantity": 30,
      "minStock": 10
    }
  ]
}
```

#### Mark Out of Stock
```http
PUT /api/vendor-inventory/vendor/{vendorId}/product/{productId}/out-of-stock
```

#### Get Price Comparison
```http
GET /api/vendor-inventory/product/{productId}/price-comparison
```

Returns all vendors selling the product, sorted by price.

#### Get Low Stock Alerts
```http
GET /api/vendor-inventory/vendor/{vendorId}/low-stock-alerts
```

#### Inventory Dashboard
```http
GET /api/vendor-inventory/inventory-dashboard
```

Returns:
- Total inventory items
- Available/Low/Out of stock counts
- Low stock items list
- Out of stock items list
- Most ordered products

### Service Methods

#### Stock Deduction (Order Confirmation)
```javascript
await vendorInventoryService.reduceStockOnOrderAcceptance(
  orderId,
  vendorId,
  productId,
  quantity
);
```

Features:
- Transactional update
- Prevents negative stock
- Auto-updates status
- Returns previous and new quantities

#### Stock Restoration (Order Cancellation)
```javascript
await vendorInventoryService.restoreStockOnCancellation(
  orderId,
  vendorId,
  productId,
  quantity
);
```

Features:
- Transactional restore
- Updates status to AVAILABLE if sufficient
- Serializable isolation level

#### Manual Stock Adjustment
```javascript
await vendorInventoryService.adjustStock(
  vendorId,
  productId,
  adjustment, // +10 or -5
  reason
);
```

Features:
- Prevents negative stock
- Validates before commit
- Logs adjustment reason
- Transactional safety

#### Find Available Vendors
```javascript
const vendors = await vendorInventoryService.findAvailableVendors(
  productName,
  requestedQuantity
);
```

Returns vendors sorted by:
1. Price (cheapest first)
2. Available quantity (most stock first)

### Low Stock Alerts

Automatically generated for:
- Items with status `LOW_STOCK` or `OUT_OF_STOCK`
- Items below minimum stock threshold

Alert levels:
- `CRITICAL` - Out of stock
- `WARNING` - Low stock

Alert data includes:
- Current stock vs minimum stock
- Shortfall amount
- Days since last update
- Vendor contact information

---

## Integration Points

### Order Lifecycle Integration

**Order Confirmation:**
```javascript
// Stock deducted when order accepted
await vendorInventoryService.reduceStockOnOrderAcceptance(
  order.id,
  order.vendorId,
  item.productId,
  item.quantity
);
```

**Order Cancellation:**
```javascript
// Stock restored when order cancelled
await vendorInventoryService.restoreStockOnCancellation(
  order.id,
  order.vendorId,
  item.productId,
  item.quantity
);
```

**Delivery Completion:**
```javascript
// Triggers credit ledger update
await deliveryService.updateDeliveryStatus(
  deliveryId,
  'DELIVERED',
  { signatureUrl, photoUrl }
);
// Automatically creates credit ledger entries
```

### WhatsApp Order Processing

When retailer places order via WhatsApp:
1. System finds available vendors with stock
2. Checks inventory availability
3. Routes to vendor with best price + stock
4. Deducts stock on vendor acceptance
5. Creates delivery assignment
6. Tracks delivery status
7. Updates credit ledger on delivery

---

## API Reference

### Delivery Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/delivery/deliveries` | Create delivery |
| GET | `/api/delivery/deliveries/active` | Get active deliveries |
| GET | `/api/delivery/deliveries/{id}` | Get delivery details |
| PUT | `/api/delivery/deliveries/{id}/status` | Update status |
| PUT | `/api/delivery/deliveries/{id}/picked-up` | Mark picked up |
| PUT | `/api/delivery/deliveries/{id}/out-for-delivery` | Mark out for delivery |
| PUT | `/api/delivery/deliveries/{id}/delivered` | Mark delivered |
| PUT | `/api/delivery/deliveries/{id}/failed` | Mark failed |
| POST | `/api/delivery/delivery-persons` | Create delivery person |
| GET | `/api/delivery/delivery-persons/{id}/deliveries` | Get person's deliveries |
| GET | `/api/delivery/delivery-persons/{id}/performance` | Get performance |
| POST | `/api/delivery/deliveries/rate` | Rate delivery |

### Inventory Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/vendor-inventory/vendor/{id}/inventory` | Get inventory |
| PUT | `/api/vendor-inventory/vendor/{id}/inventory` | Update inventory |
| POST | `/api/vendor-inventory/vendor/{id}/inventory/bulk` | Bulk update |
| PUT | `/api/vendor-inventory/vendor/{id}/product/{id}/out-of-stock` | Mark out of stock |
| GET | `/api/vendor-inventory/product/{id}/price-comparison` | Compare prices |
| GET | `/api/vendor-inventory/vendor/{id}/low-stock-alerts` | Get alerts |
| GET | `/api/vendor-inventory/inventory-dashboard` | Get dashboard |

---

## Testing

### Run Delivery Tests
```bash
node test-delivery-system.js
```

Tests:
1. Create delivery person
2. Create delivery assignment
3. Update status to PICKED_UP
4. Update status to OUT_FOR_DELIVERY
5. Update status to DELIVERED (credit ledger integration)
6. Get delivery details with status logs
7. Get active deliveries
8. Get delivery person performance
9. Rate delivery
10. Get deliveries for person

### Run Inventory Tests
```bash
# Test stock deduction
curl -X POST http://localhost:3000/api/vendor-inventory/vendor/{vendorId}/inventory \
  -H "Content-Type: application/json" \
  -d '{"productId": "uuid", "availableQuantity": 100, "price": 150}'

# Test low stock alerts
curl http://localhost:3000/api/vendor-inventory/vendor/{vendorId}/low-stock-alerts

# Test price comparison
curl http://localhost:3000/api/vendor-inventory/product/{productId}/price-comparison
```

### Manual Testing Scenarios

**Scenario 1: Complete Delivery Flow**
1. Create order (DISPATCHED status)
2. Assign delivery person
3. Mark as PICKED_UP
4. Mark as OUT_FOR_DELIVERY
5. Mark as DELIVERED
6. Verify credit ledger entry created
7. Check delivery person stats updated

**Scenario 2: Stock Management**
1. Set initial stock (100 units)
2. Place order (50 units)
3. Verify stock reduced to 50
4. Cancel order
5. Verify stock restored to 100
6. Try to order 150 units (should fail)

**Scenario 3: Low Stock Alerts**
1. Set min_stock = 20
2. Reduce stock to 15
3. Verify status = LOW_STOCK
4. Check alert appears in dashboard
5. Restock to 50
6. Verify status = AVAILABLE

---

## Production Considerations

### Delivery System
- Monitor delivery person performance metrics
- Set up alerts for delayed deliveries
- Implement geofencing for location validation
- Add SMS notifications for status updates
- Consider delivery time windows

### Inventory System
- Schedule daily stock reconciliation
- Set up automated reorder triggers
- Monitor stock turnover rates
- Implement ABC analysis for inventory prioritization
- Add vendor performance scoring based on stock availability

### Performance
- Index on delivery_person_id, status, created_at
- Index on vendor_id, product_id, status for inventory
- Use materialized views for dashboard queries
- Cache frequently accessed inventory data
- Implement read replicas for reporting

### Monitoring
- Track delivery completion rates
- Monitor stock-out frequency
- Alert on failed deliveries
- Track inventory accuracy
- Monitor transaction rollback rates

---

## Migration

Run the delivery management migration:
```bash
psql $DATABASE_URL -f prisma/migrations/024_delivery_management.sql
```

This creates:
- delivery_persons table
- deliveries table
- delivery_status_logs table
- delivery_ratings table
- Triggers for automatic stats updates
- Views for active deliveries and performance

---

## Support

For issues or questions:
- Check logs in `logs/` directory
- Review error messages in API responses
- Verify database constraints
- Check transaction isolation levels
- Ensure proper authentication tokens

---

**System Status:** Production Ready ✅
**Last Updated:** 2026-02-12
**Version:** 1.0.0
