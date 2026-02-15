# Safe Mode - Quick Start Guide

## What is Safe Mode?

Admin-controlled system to temporarily pause new orders during high load or maintenance. Existing orders continue processing normally.

## Quick Commands

### Enable Safe Mode
```bash
curl -X POST http://localhost:3000/api/admin/safe-mode/enable \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "reason": "High load - scaling infrastructure",
    "autoDisableMinutes": 30,
    "customMessage": "System maintenance. Orders will be processed shortly."
  }'
```

### Disable Safe Mode
```bash
curl -X POST http://localhost:3000/api/admin/safe-mode/disable \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

### Check Status
```bash
curl http://localhost:3000/api/admin/safe-mode/status \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

## What Happens?

### When Enabled
1. New WhatsApp orders → Queued
2. Customer receives auto-reply
3. Existing orders → Continue normally
4. API orders → 503 Service Unavailable

### When Disabled
1. Worker processes queued orders
2. Customers notified of success
3. Normal operations resume

## Admin Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/safe-mode/status` | Current status |
| POST | `/api/admin/safe-mode/enable` | Enable safe mode |
| POST | `/api/admin/safe-mode/disable` | Disable safe mode |
| GET | `/api/admin/safe-mode/history` | Activation history |
| GET | `/api/admin/safe-mode/metrics` | Performance metrics |
| GET | `/api/admin/safe-mode/queued-orders` | View queued orders |
| GET | `/api/admin/safe-mode/queued-orders/summary` | Queue summary |

## Enable Request Body

```json
{
  "reason": "Required - Why enabling safe mode",
  "autoDisableMinutes": 30,  // Optional - Auto-disable after X minutes
  "customMessage": "Optional - Custom message for customers"
}
```

## Status Response

```json
{
  "is_enabled": true,
  "enabled_at": "2026-02-15T10:00:00Z",
  "enabled_by": "admin@example.com",
  "enabled_reason": "High load",
  "auto_disable_at": "2026-02-15T10:30:00Z",
  "custom_message": "System maintenance...",
  "current_status": "ENABLED",
  "minutes_enabled": 15,
  "queued_orders_count": 25,
  "active_orders_count": 150
}
```

## Use Cases

### 1. High Load
```bash
# Enable during traffic spike
POST /api/admin/safe-mode/enable
{
  "reason": "High load - scaling infrastructure",
  "autoDisableMinutes": 15
}

# Auto-disables after 15 minutes
```

### 2. Maintenance
```bash
# Enable during database maintenance
POST /api/admin/safe-mode/enable
{
  "reason": "Database maintenance",
  "customMessage": "System maintenance 10-11 AM. Orders will be processed after."
}

# Manually disable when done
POST /api/admin/safe-mode/disable
```

### 3. Emergency
```bash
# Enable immediately
POST /api/admin/safe-mode/enable
{
  "reason": "Emergency - investigating issue"
}

# Disable when resolved
POST /api/admin/safe-mode/disable
```

## Monitoring

### View Queued Orders
```bash
GET /api/admin/safe-mode/queued-orders?limit=50
```

### Check Metrics
```bash
GET /api/admin/safe-mode/metrics?hours=24
```

### View History
```bash
GET /api/admin/safe-mode/history?days=7
```

## Worker

The worker runs automatically every minute:
- Checks if safe mode is disabled
- Processes queued orders (50 per run)
- Notifies customers
- Updates metrics

## Testing

```bash
node test-safe-mode.js
```

## Database Queries

### Check Status
```sql
SELECT * FROM safe_mode_status;
```

### View Queued Orders
```sql
SELECT * FROM safe_mode_queued_orders 
WHERE status = 'QUEUED' 
ORDER BY created_at;
```

### View History
```sql
SELECT * FROM safe_mode_history 
ORDER BY created_at DESC 
LIMIT 10;
```

## Tips

1. **Use Auto-Disable**: Set `autoDisableMinutes` for temporary issues
2. **Custom Messages**: Inform customers about expected wait time
3. **Monitor Queue**: Check queued orders count regularly
4. **Test First**: Test in staging before production use
5. **Document Reason**: Always provide clear reason for audit trail

## Troubleshooting

### Orders Not Queuing?
- Check safe mode status: `GET /api/admin/safe-mode/status`
- Verify middleware is active
- Check logs: `logs/combined-*.log`

### Queued Orders Not Processing?
- Verify safe mode is disabled
- Check worker is running
- View worker stats in logs
- Manually trigger: Call worker endpoint

### Auto-Disable Not Working?
- Check `auto_disable_at` timestamp
- Database function runs on status check
- Wait for next status check (< 5 seconds)

## Support

- Logs: `logs/combined-*.log`
- Metrics: `GET /api/admin/safe-mode/metrics`
- Status: `GET /api/admin/safe-mode/status`
- History: `GET /api/admin/safe-mode/history`
