# Prisma Connection Pooling - Deployment Guide

## Pre-Deployment Checklist

### 1. Update Environment Variables ✅
```bash
# Update .env file
DATABASE_URL="postgresql://user:password@host:5432/database?connection_limit=10&pool_timeout=10&connect_timeout=5"
```

### 2. Configure PostgreSQL ✅
```sql
-- Calculate max_connections
-- Formula: (workers × connection_limit) + 10 buffer
-- Example: (4 workers × 10) + 10 = 50

ALTER SYSTEM SET max_connections = 50;
SELECT pg_reload_conf();

-- Verify setting
SHOW max_connections;
```

### 3. Test Locally ✅
```bash
# Run test suite
node test-connection-pooling.js

# Expected: All tests pass
# ✅ Connection healthy
# ✅ Pool stats retrieved
# ✅ Retry logic working
```

## Deployment Steps

### Step 1: Update Production DATABASE_URL

#### On Render.com
```bash
# Go to Dashboard > Service > Environment
# Update DATABASE_URL:
postgresql://user:password@host:5432/database?connection_limit=10&pool_timeout=10&connect_timeout=5&sslmode=require

# Save and redeploy
```

#### On Heroku
```bash
heroku config:set DATABASE_URL="postgresql://user:password@host:5432/database?connection_limit=10&pool_timeout=10&connect_timeout=5&sslmode=require"
```

#### On AWS/VPS
```bash
# Update .env file
nano .env

# Add connection pooling parameters
DATABASE_URL="postgresql://user:password@host:5432/database?connection_limit=10&pool_timeout=10&connect_timeout=5"

# Restart service
pm2 restart khaacho-api
```

### Step 2: Deploy Code

```bash
# Commit changes
git add .
git commit -m "Optimize Prisma connection pooling for production"
git push origin main

# Render will auto-deploy
# Or manually deploy on your platform
```

### Step 3: Verify Deployment

```bash
# Check health endpoint
curl https://your-app.com/health

# Check logs for slow queries
# (Should see "Prisma client initialized" message)
```

### Step 4: Monitor Performance

```bash
# Watch logs for slow queries
tail -f logs/combined-*.log | grep "Slow query"

# Check connection pool stats via API
curl https://your-app.com/api/v1/monitoring/database-stats
```

## Post-Deployment Verification

### 1. Connection Pool Working ✅
```bash
# Test endpoint
curl https://your-app.com/api/v1/health

# Expected response:
{
  "status": "healthy",
  "database": "connected",
  "timestamp": "2026-02-14T..."
}
```

### 2. Slow Query Logging ✅
```bash
# Make a complex query
curl https://your-app.com/api/v1/orders?include=items,retailer

# Check logs
tail -f logs/combined-*.log | grep "Slow query"

# If query > 500ms, you'll see:
# "Slow query detected: 750ms"
```

### 3. Retry Logic ✅
```bash
# Simulate connection issue (optional)
# Retry logic will automatically handle transient errors

# Check logs for retry attempts
tail -f logs/combined-*.log | grep "Retrying database operation"
```

### 4. Connection Reuse ✅
```bash
# Check process logs
tail -f logs/combined-*.log | grep "Prisma client initialized"

# Should see only ONE initialization per process
# "Prisma client initialized { nodeEnv: 'production', pid: 12345 }"
```

## Monitoring Setup

### 1. Set Up Alerts

#### High Connection Utilization
```javascript
// Add to monitoring service
const { getConnectionPoolStats } = require('./src/config/database');

setInterval(async () => {
  const stats = await getConnectionPoolStats();
  const utilization = stats.active_connections / stats.total_connections;
  
  if (utilization > 0.8) {
    // Send alert
    await sendAlert('High connection pool utilization: ' + utilization);
  }
}, 60000); // Every minute
```

#### Slow Query Count
```javascript
// Track slow queries
let slowQueryCount = 0;

prisma.$on('query', (e) => {
  if (e.duration > 500) {
    slowQueryCount++;
    
    if (slowQueryCount > 10) {
      // Send alert
      sendAlert('High slow query count: ' + slowQueryCount);
      slowQueryCount = 0; // Reset
    }
  }
});
```

### 2. Dashboard Metrics

Add these metrics to your monitoring dashboard:
- Active connections
- Idle connections
- Connection pool utilization (%)
- Slow query count (per hour)
- Query error rate
- Average query duration

### 3. Log Aggregation

Configure log aggregation for:
- Slow queries (>500ms)
- Connection errors
- Retry attempts
- Pool exhaustion warnings

## Performance Tuning

### If Connection Pool Exhausted

**Symptoms:**
```
Error: P2024: Timed out fetching a new connection from the connection pool
```

**Solutions:**
1. Increase `connection_limit`:
   ```bash
   DATABASE_URL="...?connection_limit=15"
   ```

2. Increase `pool_timeout`:
   ```bash
   DATABASE_URL="...?pool_timeout=20"
   ```

3. Check for connection leaks:
   ```javascript
   // Ensure all queries complete
   // Use transactions properly
   // Close connections on errors
   ```

### If Too Many Connections

**Symptoms:**
```
Error: 53300: sorry, too many clients already
```

**Solutions:**
1. Reduce `connection_limit`:
   ```bash
   DATABASE_URL="...?connection_limit=5"
   ```

2. Increase PostgreSQL `max_connections`:
   ```sql
   ALTER SYSTEM SET max_connections = 100;
   SELECT pg_reload_conf();
   ```

3. Use PgBouncer:
   ```bash
   # Install PgBouncer
   sudo apt-get install pgbouncer
   
   # Configure and use pooler
   DATABASE_URL="postgresql://user:password@pooler:6543/database?connection_limit=10&pgbouncer=true"
   ```

### If Slow Queries

**Symptoms:**
```
Slow query detected: 1250ms
```

**Solutions:**
1. Add indexes:
   ```sql
   CREATE INDEX idx_orders_created_at ON orders(created_at DESC);
   CREATE INDEX idx_orders_retailer_id ON orders(retailer_id);
   ```

2. Optimize query:
   ```javascript
   // ✅ Good - select only needed fields
   const orders = await prisma.order.findMany({
     select: {
       id: true,
       orderNumber: true,
       total: true,
     },
   });
   
   // ❌ Bad - fetch all fields
   const orders = await prisma.order.findMany();
   ```

3. Implement caching:
   ```javascript
   const cache = new NodeCache({ stdTTL: 300 });
   
   const cacheKey = 'products:all';
   let products = cache.get(cacheKey);
   
   if (!products) {
     products = await prisma.product.findMany();
     cache.set(cacheKey, products);
   }
   ```

## Rollback Plan

### If Issues Occur

#### 1. Revert DATABASE_URL
```bash
# Remove connection pooling parameters
DATABASE_URL="postgresql://user:password@host:5432/database"

# Redeploy
```

#### 2. Revert Code
```bash
git revert HEAD
git push origin main
```

#### 3. Monitor Recovery
```bash
# Check health
curl https://your-app.com/health

# Check logs
tail -f logs/combined-*.log
```

## Success Criteria

### Deployment Successful If:
- ✅ Health endpoint returns 200
- ✅ No connection errors in logs
- ✅ Slow queries logged correctly
- ✅ Connection pool stats available
- ✅ Retry logic working
- ✅ Performance acceptable

### Rollback If:
- ❌ Connection errors persist
- ❌ Pool exhaustion errors
- ❌ Performance degradation
- ❌ Critical bugs found

## Support

### Documentation
- Complete Guide: `PRISMA_CONNECTION_POOLING_GUIDE.md`
- Quick Start: `PRISMA_CONNECTION_POOLING_QUICK_START.md`
- Summary: `PRISMA_CONNECTION_POOLING_SUMMARY.md`

### Testing
- Test Suite: `test-connection-pooling.js`

### Monitoring
- Health Check: `/health`
- Database Stats: `/api/v1/monitoring/database-stats`

## Sign-Off

### Deployment Approved By:
- [ ] Backend Lead: _________________ Date: _______
- [ ] DevOps Lead: _________________ Date: _______

### Deployment Completed By:
- [ ] Engineer: ___________________ Date: _______
- [ ] Verified By: ________________ Date: _______

### Deployment Status:
- [ ] ⏳ Pending
- [ ] ✅ Complete
- [ ] ❌ Failed (see notes)

### Notes:
_Add any deployment notes or issues here_

---

**Ready for Production Deployment!**
