# Production-Grade Health & Readiness System

## Overview

The health and readiness system provides production-grade monitoring endpoints for the Khaacho platform. These endpoints are used by Render (and other platforms) to determine if the service is running and ready to accept traffic.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Health System                         │
├─────────────────────────────────────────────────────────┤
│                                                           │
│  ┌──────────────┐    ┌──────────────┐    ┌───────────┐ │
│  │   Health     │───▶│   Health     │───▶│  Health   │ │
│  │  Controller  │    │   Service    │    │  Routes   │ │
│  └──────────────┘    └──────────────┘    └───────────┘ │
│         │                    │                           │
│         │                    ├─▶ Database Check         │
│         │                    ├─▶ Redis Check            │
│         │                    └─▶ Environment Check      │
│         │                                                │
│         └─▶ HTTP Response (200 OK or 503 Not Ready)    │
│                                                           │
└─────────────────────────────────────────────────────────┘
```

## Endpoints

### GET /health

Basic health check that returns immediately without blocking.

**Purpose**: Verify the server process is running and responding to requests.

**Response** (200 OK):
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

**Characteristics**:
- Always returns quickly (< 10ms)
- No database or external service checks
- Used by load balancers for basic liveness checks
- Never returns error status

### GET /ready

Comprehensive readiness check that verifies all critical dependencies.

**Purpose**: Verify the service is ready to accept and process requests.

**Response** (200 OK - Ready):
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

**Response** (503 Service Unavailable - Not Ready):
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

**Characteristics**:
- Checks PostgreSQL connection (5s timeout)
- Checks Redis connection (3s timeout, optional)
- Validates environment variables
- Returns 503 if not ready
- Uses caching (10s TTL) to prevent hammering
- Logs failures with structured data

## Components

### HealthService (`src/core/services/health.service.js`)

Core business logic for health checks.

**Key Features**:
- Timeout protection (prevents blocking)
- Caching (prevents database hammering)
- Graceful failure handling
- Structured logging
- Redis is optional (returns true if not configured)

**Configuration**:
```javascript
{
  database: {
    timeout: 5000,  // 5 seconds
    retries: 1,
  },
  redis: {
    timeout: 3000,  // 3 seconds
    retries: 1,
  },
}
```

**Cache Settings**:
```javascript
{
  database: { ttl: 10000 },  // 10 seconds
  redis: { ttl: 10000 },     // 10 seconds
}
```

### HealthController (`src/api/controllers/health.controller.js`)

HTTP request/response handling.

**Responsibilities**:
- Parse HTTP requests
- Call HealthService methods
- Format HTTP responses
- Set appropriate status codes

### Health Routes (`src/api/routes/health.routes.js`)

Route definitions for health endpoints.

**Mounted at**: Root level (`/health`, `/ready`)
**Authentication**: None (public endpoints)

## Integration

### Server Initialization

The health system is initialized in `src/server.js`:

```javascript
// Initialize health service with Prisma and optional Redis
const healthService = new HealthService(prisma, redisClient);

// Create controller and routes
const healthController = new HealthController(healthService);
const healthRoutes = createHealthRoutes(healthController);

// Mount at root level (before API versioning)
app.use('/', healthRoutes);
```

### Render Configuration

In `render.yaml`:

```yaml
services:
  - type: web
    name: khaacho-api
    healthCheckPath: /health  # Uses basic health check
```

Render will:
1. Call `/health` every 30 seconds
2. Expect 200 OK response
3. Mark service as unhealthy after 3 consecutive failures
4. Restart service if unhealthy

## Testing

### Manual Testing

```bash
# Test health endpoint
curl http://localhost:3000/health

# Test readiness endpoint
curl http://localhost:3000/ready

# Test with verbose output
curl -v http://localhost:3000/ready
```

### Automated Testing

```bash
# Run test suite
node test-health-system.js

# Test against production
API_URL=https://khaacho-api.onrender.com node test-health-system.js
```

### Test Coverage

The test suite verifies:
- Health endpoint returns 200 OK
- Readiness endpoint checks all components
- Response times are acceptable
- Caching is working correctly
- Error handling works properly

## Performance

### Expected Response Times

| Endpoint | First Call | Cached Call | Target |
|----------|-----------|-------------|--------|
| /health  | < 10ms    | < 10ms      | < 50ms |
| /ready   | < 100ms   | < 20ms      | < 500ms |

### Optimization Strategies

1. **Caching**: Results cached for 10 seconds
2. **Timeouts**: Prevent hanging on slow dependencies
3. **Parallel Checks**: All checks run concurrently
4. **Simple Queries**: Use `SELECT 1` for database check
5. **No Business Logic**: Pure infrastructure checks

## Monitoring

### Structured Logging

All health check failures are logged with context:

```javascript
logger.warn('Readiness check failed', {
  status: 'not_ready',
  database: false,
  redis: true,
  environment: true,
  responseTime: 5002,
});
```

### Metrics to Track

- Health check response time
- Readiness check failure rate
- Database check timeout rate
- Redis check timeout rate
- Cache hit rate

## Troubleshooting

### Service Not Ready

**Symptom**: `/ready` returns 503

**Possible Causes**:
1. Database connection failed
2. Missing environment variables
3. Redis connection failed (if required)

**Solution**:
```bash
# Check logs for specific failure
grep "Readiness check failed" logs/combined-*.log

# Test database connection
psql $DATABASE_URL -c "SELECT 1"

# Test Redis connection
redis-cli -u $REDIS_URL ping

# Verify environment variables
node -e "console.log(process.env.DATABASE_URL ? 'SET' : 'MISSING')"
```

### Slow Response Times

**Symptom**: Health checks take > 500ms

**Possible Causes**:
1. Database is slow
2. Network latency
3. Cache not working

**Solution**:
```bash
# Check database performance
psql $DATABASE_URL -c "EXPLAIN ANALYZE SELECT 1"

# Clear health check cache
curl -X POST http://localhost:3000/api/v1/admin/health/clear-cache

# Check Redis latency
redis-cli -u $REDIS_URL --latency
```

### Health Check Failing on Render

**Symptom**: Render marks service as unhealthy

**Possible Causes**:
1. Wrong health check path
2. Service not listening on PORT
3. Startup taking too long

**Solution**:
```yaml
# Verify render.yaml configuration
healthCheckPath: /health  # Must be /health not /api/health

# Verify server listens on PORT
const PORT = process.env.PORT || 3000;
app.listen(PORT);

# Increase startup timeout in Render dashboard
# Settings → Health Check → Initial Delay: 60 seconds
```

## Best Practices

### DO

✅ Use `/health` for load balancer checks
✅ Use `/ready` for deployment readiness
✅ Keep health checks simple and fast
✅ Log all readiness failures
✅ Use caching to prevent hammering
✅ Set appropriate timeouts
✅ Make Redis optional

### DON'T

❌ Don't add business logic to health checks
❌ Don't check external APIs in health checks
❌ Don't return 500 errors from health endpoints
❌ Don't block the event loop
❌ Don't skip timeout protection
❌ Don't hammer the database
❌ Don't require authentication

## Security Considerations

### Public Endpoints

Health endpoints are public (no authentication required) because:
- Load balancers need access
- Monitoring tools need access
- No sensitive data is exposed

### Information Disclosure

Health endpoints reveal:
- Service is running (acceptable)
- Database connectivity (acceptable)
- Uptime (acceptable)

Health endpoints DO NOT reveal:
- Database credentials
- Internal IP addresses
- Detailed error messages
- Business metrics

### Rate Limiting

Health endpoints are exempt from rate limiting to ensure:
- Load balancers can check frequently
- Monitoring tools can poll regularly
- No false positives from rate limits

## Future Enhancements

### Planned Features

1. **Detailed Component Status**
   - Individual service health
   - Dependency graph
   - Version information

2. **Custom Health Checks**
   - Plugin system for custom checks
   - Business-specific validations
   - External service monitoring

3. **Health Metrics API**
   - Historical health data
   - Uptime statistics
   - Failure analysis

4. **Alerting Integration**
   - Webhook notifications
   - Slack/email alerts
   - PagerDuty integration

## References

- [Kubernetes Liveness and Readiness Probes](https://kubernetes.io/docs/tasks/configure-pod-container/configure-liveness-readiness-startup-probes/)
- [Render Health Checks](https://render.com/docs/health-checks)
- [12-Factor App: Admin Processes](https://12factor.net/admin-processes)
- [Node.js Best Practices: Health Checks](https://github.com/goldbergyoni/nodebestpractices#-64-use-health-checks)
