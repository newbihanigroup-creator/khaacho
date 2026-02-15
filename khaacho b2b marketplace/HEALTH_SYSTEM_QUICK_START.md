# Health System Quick Start

## What is it?

Production-grade health and readiness endpoints for monitoring service availability.

## Endpoints

### GET /health
- **Purpose**: Basic liveness check
- **Response**: Always 200 OK (if server is running)
- **Speed**: < 10ms
- **Use**: Load balancer health checks

### GET /ready
- **Purpose**: Comprehensive readiness check
- **Response**: 200 OK (ready) or 503 (not ready)
- **Checks**: Database, Redis, Environment
- **Speed**: < 100ms (cached)
- **Use**: Deployment readiness verification

## Quick Test

```bash
# Test locally
curl http://localhost:3000/health
curl http://localhost:3000/ready

# Run test suite
node test-health-system.js
```

## Expected Responses

### Health (Always OK)
```json
{
  "success": true,
  "data": {
    "status": "ok",
    "timestamp": "2026-02-14T10:30:00.000Z",
    "uptime": 3600
  }
}
```

### Ready (When Ready)
```json
{
  "success": true,
  "data": {
    "status": "ready",
    "checks": {
      "database": true,
      "redis": true,
      "environment": true
    },
    "uptime": 3600,
    "timestamp": "2026-02-14T10:30:00.000Z",
    "responseTime": 45
  }
}
```

### Not Ready (503)
```json
{
  "success": false,
  "data": {
    "status": "not_ready",
    "checks": {
      "database": false,
      "redis": true,
      "environment": true
    },
    "uptime": 120,
    "timestamp": "2026-02-14T10:30:00.000Z",
    "responseTime": 5002
  }
}
```

## Architecture

```
GET /health  → HealthController → HealthService → 200 OK
GET /ready   → HealthController → HealthService → Check DB/Redis/Env → 200/503
```

## Files

- `src/core/services/health.service.js` - Business logic
- `src/api/controllers/health.controller.js` - HTTP handling
- `src/api/routes/health.routes.js` - Route definitions
- `src/server.js` - Integration
- `render.yaml` - Deployment config

## Key Features

✅ Timeout protection (no hanging)
✅ Caching (10s TTL, no hammering)
✅ Graceful failure handling
✅ Structured logging
✅ Redis optional
✅ Non-blocking checks

## Troubleshooting

### Service Not Ready

```bash
# Check logs
grep "Readiness check failed" logs/combined-*.log

# Test database
psql $DATABASE_URL -c "SELECT 1"

# Test Redis
redis-cli -u $REDIS_URL ping
```

### Slow Response

```bash
# Check database performance
psql $DATABASE_URL -c "EXPLAIN ANALYZE SELECT 1"

# Check Redis latency
redis-cli -u $REDIS_URL --latency
```

## Render Configuration

```yaml
services:
  - type: web
    healthCheckPath: /health  # ← Must be /health
```

## Performance Targets

| Endpoint | Target | Cached |
|----------|--------|--------|
| /health  | < 50ms | < 10ms |
| /ready   | < 500ms| < 20ms |

## What's Checked?

### Database
- PostgreSQL connection via Prisma
- Simple query: `SELECT 1`
- Timeout: 5 seconds

### Redis
- Connection via ping
- Timeout: 3 seconds
- Optional (returns true if not configured)

### Environment
- NODE_ENV
- DATABASE_URL
- JWT_SECRET

## Next Steps

1. ✅ Test endpoints locally
2. ✅ Run test suite
3. ✅ Deploy to Render
4. ✅ Verify health checks pass
5. ✅ Monitor logs for failures

## Full Documentation

See `HEALTH_SYSTEM_GUIDE.md` for complete documentation.
