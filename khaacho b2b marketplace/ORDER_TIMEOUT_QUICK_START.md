# Order Processing Timeout - Quick Start

## Overview

Automatic vendor reassignment system that prevents orders from getting stuck when vendors don't respond.

## Key Features

✅ Auto-reassign to next vendor after 30 minutes  
✅ Maximum 3 attempts (prevents infinite loops)  
✅ Admin notifications on delays  
✅ Order marked as DELAYED after max attempts  
✅ Runs automatically every minute  

## Quick Setup

### 1. Run Migration
```bash
npx prisma migrate deploy
```

### 2. Start Worker
Add to `src/server.js`:
```javascript
const orderTimeoutWorker = require('./workers/orderTimeout.worker');
orderTimeoutWorker.start();
```

### 3. Register Routes
Add to `src/routes/index.js`:
```javascript
const orderTimeoutRoutes = require('./orderTimeout.routes');
router.use('/order-timeout', orderTimeoutRoutes);
```

### 4. Test
```bash
node test-order-timeout.js
```

## How It Works

```
Order assigned to Vendor A (30 min timeout)
  ↓ (no response)
Timeout reached → Reassign to Vendor B (attempt 2)
  ↓ (no response)
Timeout reached → Reassign to Vendor C (attempt 3)
  ↓ (no response)
Max attempts → Mark as DELAYED → Notify Admin (URGENT)
```

## Configuration

Default settings (can be changed in database):
- Vendor response timeout: 30 minutes
- Max reassignment attempts: 3
- Notify admin after: 2 attempts
- Escalation timeout: 60 minutes

## Admin Dashboard

### Check Active Timeouts
```bash
GET /api/v1/order-timeout/active-timeouts
```

### Check Unresolved Delays
```bash
GET /api/v1/order-timeout/unresolved-delays
```

### Get Vendor Performance
```bash
GET /api/v1/order-timeout/vendor-performance
```

### Get Notifications
```bash
GET /api/v1/order-timeout/notifications?status=UNREAD
```

## Monitoring Queries

### Active Timeouts
```sql
SELECT * FROM active_order_timeouts
WHERE urgency_level IN ('URGENT', 'OVERDUE');
```

### Vendor Performance
```sql
SELECT * FROM vendor_timeout_performance
WHERE timeout_rate > 30
ORDER BY timeout_rate DESC;
```

### Unresolved Delays
```sql
SELECT * FROM unresolved_order_delays
WHERE is_critical = TRUE;
```

## Service Usage

### Start Tracking
```javascript
// When assigning order to vendor
await orderTimeoutService.startTimeoutTracking(orderId, vendorId, 1);
```

### Mark Responded
```javascript
// When vendor accepts/rejects
await orderTimeoutService.markVendorResponded(orderId, vendorId);
```

## Infinite Loop Prevention

The system prevents infinite loops by:
1. **Max Attempts**: Only 3 reassignment attempts
2. **Escalation**: After 3 attempts, order is marked DELAYED
3. **Admin Notification**: URGENT notification sent
4. **Manual Intervention**: No further automatic reassignments
5. **Status Change**: Order status changed to DELAYED

## Notification Priorities

- **URGENT**: Max attempts reached, manual intervention required
- **HIGH**: Multiple reassignments (2+)
- **MEDIUM**: Single timeout/reassignment
- **LOW**: Informational

## Vendor Performance Status

- **GOOD**: Timeout rate < 15%
- **ATTENTION**: Timeout rate 15-30%
- **WARNING**: Timeout rate 30-50%
- **CRITICAL**: Timeout rate ≥ 50%

## Troubleshooting

### Worker Not Running
```javascript
// Check status
const stats = orderTimeoutWorker.getStats();
console.log(stats);

// Restart if needed
orderTimeoutWorker.start();
```

### Manual Trigger
```bash
POST /api/v1/order-timeout/worker/trigger
```

### Resolve Delay
```bash
POST /api/v1/order-timeout/delays/:delayId/resolve
{
  "resolutionNotes": "Manually assigned to vendor XYZ"
}
```

## Best Practices

1. **Monitor Daily**: Check active timeouts and unresolved delays
2. **Review Performance**: Identify vendors with high timeout rates
3. **Adjust Configuration**: Fine-tune timeout periods based on patterns
4. **Resolve Promptly**: Address escalated orders quickly
5. **Track Metrics**: Monitor reassignment and escalation rates

## Files

- `src/services/orderTimeout.service.js` - Timeout logic
- `src/workers/orderTimeout.worker.js` - Automatic worker
- `src/controllers/orderTimeout.controller.js` - Admin API
- `prisma/migrations/037_order_timeout_system.sql` - Database schema

## Related Documentation

- [ORDER_TIMEOUT_COMPLETE.md](./ORDER_TIMEOUT_COMPLETE.md) - Complete implementation details
- [ORDER_ROUTING_API.md](./ORDER_ROUTING_API.md) - Order routing system
- [VENDOR_SELECTION_GUIDE.md](./VENDOR_SELECTION_GUIDE.md) - Vendor selection

## Summary

The system automatically handles vendor timeouts by:
- Reassigning to next best vendor (up to 3 times)
- Preventing infinite loops with max attempts
- Notifying admins of delays
- Marking orders as DELAYED after max attempts
- Tracking vendor timeout performance

**Production-ready and fully automated!** 🚀
