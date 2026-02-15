# Health Monitoring Quick Start

## Overview

Production health monitoring system that tracks:
1. Database connection status
2. Queue backlog size
3. WhatsApp webhook latency
4. Failed orders per hour
5. OCR processing failures

## Quick Setup

### 1. Run Migration
```bash
npx prisma migrate deploy
```

### 2. Test Locally
```bash
# Start server
npm start

# Test metrics endpoint
curl http://localhost:3000/health/metrics

# Run test suite
node test-health-monitoring.js
```

### 3. Deploy
```bash
git add .
git commit -m "Add enhanced health monitoring"
git push
```

## Endpoints

### GET /health
Basic health check.
```bash
curl http://localhost:3000/health
```

### GET /ready
Readiness check with dependencies.
```bash
curl http://localhost:3000/ready
```

### GET /health/metrics
Production metrics (cached 30s).
```bash
curl http://localhost:3000/health/metrics
```

Response includes:
- Database status and response time
- Queue backlog by queue
- Webhook latency statistics
- Failed orders count
- OCR failures count

### GET /health/alerts
Active health alerts.
```bash
curl http://localhost:3000/health/alerts
```

### GET /health/snapshot
Latest system health snapshot with overall score.
```bash
curl http://localhost:3000/health/snapshot
```

### POST /health/alerts/:alertId/resolve
Resolve an alert.
```bash
curl -X POST http://localhost:3000/health/alerts/{id}/resolve
```

## Metrics Tracked

| Metric | Warning | Critical | Unit |
|--------|---------|----------|------|
| Queue Backlog | > 1000 | > 5000 | count |
| Webhook Latency | > 1000ms | > 2000ms | milliseconds |
| Failed Orders | > 10/hr | > 50/hr | count |
| OCR Failures | > 5/hr | > 20/hr | count |
| Database Response | > 100ms | > 500ms | milliseconds |
| Redis Response | > 50ms | > 200ms | milliseconds |

## Health Score

Overall health score (0-100) based on all metrics:
- **80-100**: Healthy (green)
- **50-79**: Degraded (yellow)
- **0-49**: Unhealthy (red)

## Monitoring Integration

### Poll Metrics
```javascript
// Every minute
setInterval(async () => {
  const response = await fetch('http://localhost:3000/health/metrics');
  const metrics = await response.json();
  
  console.log('Queue backlog:', metrics.data.queues.total);
  console.log('Webhook latency:', metrics.data.webhooks.avgLatencyMs);
  console.log('Failed orders:', metrics.data.orders.totalCount);
  console.log('OCR failures:', metrics.data.ocr.failedCount);
}, 60000);
```

### Check Alerts
```javascript
// Every minute
setInterval(async () => {
  const response = await fetch('http://localhost:3000/health/alerts');
  const alerts = await response.json();
  
  for (const alert of alerts.data.alerts) {
    if (alert.alert_level === 'critical') {
      sendNotification(`🚨 ${alert.alert_message}`);
    }
  }
}, 60000);
```

### Check Health Score
```javascript
// Every 5 minutes
setInterval(async () => {
  const response = await fetch('http://localhost:3000/health/snapshot');
  const snapshot = await response.json();
  
  if (snapshot.data.overall_health_score < 50) {
    sendAlert('System unhealthy!');
  }
}, 300000);
```

## Database Queries

### View Latest Metrics
```sql
SELECT * FROM latest_health_metrics;
```

### View Metrics Summary (24h)
```sql
SELECT * FROM health_metrics_summary;
```

### View Active Alerts
```sql
SELECT * FROM active_health_alerts;
```

### View Latest Snapshot
```sql
SELECT * FROM latest_system_health;
```

### Cleanup Old Data
```sql
-- Keep 30 days
SELECT * FROM cleanup_old_health_data(30);
```

## Alert Configuration

### View Thresholds
```sql
SELECT * FROM health_alert_thresholds;
```

### Update Threshold
```sql
UPDATE health_alert_thresholds
SET warning_threshold = 2000,
    critical_threshold = 10000
WHERE metric_name = 'queue_backlog_total';
```

### Disable Alert
```sql
UPDATE health_alert_thresholds
SET enabled = false
WHERE metric_name = 'webhook_latency_ms';
```

## Performance

- Metrics cached for 30 seconds
- First call: ~500ms
- Cached calls: ~50ms (10x faster)
- Handles 10+ concurrent requests easily

## Troubleshooting

### No Metrics
```bash
# Check migration
psql $DATABASE_URL -c "SELECT * FROM health_metrics LIMIT 1"

# Trigger collection
curl http://localhost:3000/health/metrics
```

### Slow Response
```bash
# Wait for cache to expire (30s)
# Or restart server to clear cache
```

### Alerts Not Working
```bash
# Check thresholds
psql $DATABASE_URL -c "SELECT * FROM health_alert_thresholds WHERE enabled = true"

# Check current metrics
psql $DATABASE_URL -c "SELECT * FROM latest_health_metrics"
```

## Files

- `prisma/migrations/038_health_monitoring_metrics.sql` - Database schema
- `src/core/services/health.service.js` - Metrics collection
- `src/api/controllers/health.controller.js` - HTTP endpoints
- `src/api/routes/health.routes.js` - Route definitions
- `test-health-monitoring.js` - Test suite
- `HEALTH_MONITORING_COMPLETE.md` - Full documentation

## Next Steps

1. Set up monitoring dashboard (Grafana/Datadog)
2. Configure alert notifications (Slack/PagerDuty)
3. Set up daily cleanup cron job
4. Monitor metrics regularly

## Support

For issues or questions, check:
- `HEALTH_MONITORING_COMPLETE.md` - Complete documentation
- Test suite output: `node test-health-monitoring.js`
- Server logs: `logs/combined-*.log`
