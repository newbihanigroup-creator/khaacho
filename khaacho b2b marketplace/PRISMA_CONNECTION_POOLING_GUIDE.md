# Prisma PostgreSQL Connection Pooling - Production Guide

## Overview
Optimized Prisma connection pooling configuration for production with connection limits, slow query logging, retry logic, and connection reuse across workers.

## Features Implemented

### 1. Connection Pooling ✅
- Connection limit: 10 per worker
- Pool timeout: 10 seconds
- Connect timeout: 5 seconds
- Connection reuse via singleton pattern

### 2. Slow Query Logging ✅
- Logs queries > 500ms
- Includes query text, duration, and parameters
- Truncates long queries for readability

### 3. Retry Logic ✅
- Automatic retry for transient errors
- Exponential backoff (1s, 2s, 4s)
- 3 retry attempts by default
- Handles connection timeouts, deadlocks, pool exhaustion

### 4. Connection Reuse ✅
- Singleton pattern per process
- Shared across all workers
- Prevents connection leaks
- Graceful shutdown support

## DATABASE_URL Configuration

### Production (Recommended)
```bash
# With connection pooling (10 connections per worker)
DATABASE_URL="postgresql://user:password@host:5432/database?connection_limit=10&pool_timeout=10&connect_timeout=5"

# With SSL (required for most cloud providers)
DATABASE_URL="postgresql://user:password@host:5432/database?connection_limit=10&pool_timeout=10&connect_timeout=5&sslmode=require"

# With connection pooler (PgBouncer)
DATABASE_URL="postgresql://user:password@pooler-host:6543/database?connection_limit=10&pool_timeout=10&connect_timeout=5&pgbouncer=true"
```

### Development
```bash
# Higher connection limit for development
DATABASE_URL="postgresql://user:password@localhost:5432/khaacho_dev?connection_limit=20"
```

### Render.com (Production)
```bash
# Render provides pooled connection string
# Use Internal Database URL for better performance
DATABASE_URL="postgresql://user:password@internal-host:5432/database?connection_limit=10&pool_timeout=10&connect_timeout=5&sslmode=require"
```

## Connection Pool Parameters

### connection_limit
Maximum number of connections per Prisma Client instance.

**Calculation:**
```
Total Connections = Workers × connection_limit
```

**Example:**
- 4 workers × 10 connections = 40 total connections
- Ensure PostgreSQL `max_connections` > 40

**Recommended Values:**
- Single worker: `connection_limit=20`
- Multiple workers (2-4): `connection_limit=10`
- Many workers (5+): `connection_limit=5`

### pool_timeout
Time to wait for available connection from pool (seconds).

**Default:** 10 seconds

**Recommended:**
- Production: `pool_timeout=10`
- High traffic: `pool_timeout=20`
- Low traffic: `pool_timeout=5`

### connect_timeout
Time to wait for initial database connection (seconds).

**Default:** 5 seconds

**Recommended:**
- Production: `connect_timeout=5`
- Slow network: `connect_timeout=10`
- Fast network: `connect_timeout=3`

## Usage Examples

### Basic Query with Retry
```javascript
const { withRetry } = require('./src/config/database');

// Automatically retries on transient errors
const users = await withRetry(async () => {
  return await prisma.user.findMany();
});
```

### Transaction with Retry
```javascript
const { withRetry } = require('./src/config/database');

const result = await withRetry(async () => {
  return await prisma.$transaction(async (tx) => {
    const order = await tx.order.create({ data: orderData });
    await tx.retailer.update({
      where: { id: retailerId },
      data: { totalOrders: { increment: 1 } },
    });
    return order;
  });
});
```

### Custom Retry Configuration
```javascript
const { withRetry } = require('./src/config/database');

// 5 retries with 2 second initial delay
const result = await withRetry(
  async () => {
    return await prisma.order.findMany();
  },
  5,    // maxRetries
  2000  // delayMs
);
```

### Without Retry (for non-critical operations)
```javascript
const prisma = require('./src/config/database');

// Direct query without retry
const stats = await prisma.order.count();
```

## Retryable Errors

The retry logic handles these error types:

### Prisma Error Codes
- `P1001` - Can't reach database server
- `P1002` - Database server timeout
- `P1008` - Operations timed out
- `P1017` - Server closed connection
- `P2024` - Connection pool timeout
- `P2034` - Transaction failed (deadlock)

### PostgreSQL Error Codes
- `40001` - Serialization failure
- `40P01` - Deadlock detected
- `53300` - Too many connections
- `57P03` - Cannot connect now

### Network Errors
- `ECONNREFUSED` - Connection refused
- `ETIMEDOUT` - Connection timeout
- `ENOTFOUND` - DNS lookup failed

## Slow Query Logging

### Configuration
Queries slower than 500ms are automatically logged.

### Log Output
```json
{
  "level": "warn",
  "message": "Slow query detected",
  "query": "SELECT * FROM orders WHERE ...",
  "duration": "1250ms",
  "params": "[1, 'PENDING']",
  "timestamp": "2026-02-14T10:30:00.000Z"
}
```

### Optimization Tips
1. Add indexes for frequently queried columns
2. Use `select` to fetch only needed fields
3. Paginate large result sets
4. Use database views for complex queries
5. Consider caching for read-heavy operations

## Connection Pool Monitoring

### Check Pool Health
```javascript
const { checkDatabaseConnection } = require('./src/config/database');

const isHealthy = await checkDatabaseConnection();
console.log('Database healthy:', isHealthy);
```

### Get Pool Statistics
```javascript
const { getConnectionPoolStats } = require('./src/config/database');

const stats = await getConnectionPoolStats();
console.log('Total connections:', stats.total_connections);
console.log('Active connections:', stats.active_connections);
console.log('Idle connections:', stats.idle_connections);
```

### Get Database Statistics
```javascript
const { getDatabaseStats } = require('./src/config/database');

const stats = await getDatabaseStats();
console.log('Database size:', stats.databaseSize);
console.log('Largest tables:', stats.largestTables);
```

## PostgreSQL Configuration

### Recommended Settings

#### max_connections
```sql
-- Calculate based on your workers
-- Formula: (workers × connection_limit) + 10 (buffer)
-- Example: (4 workers × 10) + 10 = 50

ALTER SYSTEM SET max_connections = 50;
SELECT pg_reload_conf();
```

#### shared_buffers
```sql
-- 25% of available RAM
-- Example: 2GB RAM = 512MB shared_buffers

ALTER SYSTEM SET shared_buffers = '512MB';
```

#### effective_cache_size
```sql
-- 50-75% of available RAM
-- Example: 2GB RAM = 1.5GB effective_cache_size

ALTER SYSTEM SET effective_cache_size = '1536MB';
```

#### work_mem
```sql
-- RAM / max_connections / 4
-- Example: 2GB / 50 / 4 = 10MB

ALTER SYSTEM SET work_mem = '10MB';
```

#### maintenance_work_mem
```sql
-- 10% of RAM (max 2GB)
-- Example: 2GB RAM = 200MB

ALTER SYSTEM SET maintenance_work_mem = '200MB';
```

## Multi-Worker Setup

### Worker Configuration
```javascript
// server-web.js (API server)
const prisma = require('./config/database');
// Uses shared connection pool

// server-worker.js (Background jobs)
const prisma = require('./config/database');
// Reuses same connection pool
```

### Connection Distribution
```
API Server (2 workers):
  Worker 1: 10 connections
  Worker 2: 10 connections
  
Background Jobs (2 workers):
  Worker 1: 10 connections
  Worker 2: 10 connections
  
Total: 40 connections
PostgreSQL max_connections: 50 (with buffer)
```

## Performance Optimization

### 1. Use Connection Pooler (PgBouncer)
```bash
# Install PgBouncer
sudo apt-get install pgbouncer

# Configure /etc/pgbouncer/pgbouncer.ini
[databases]
khaacho = host=localhost port=5432 dbname=khaacho

[pgbouncer]
pool_mode = transaction
max_client_conn = 100
default_pool_size = 20

# Update DATABASE_URL
DATABASE_URL="postgresql://user:password@localhost:6543/khaacho?connection_limit=10&pgbouncer=true"
```

### 2. Enable Query Caching
```javascript
// Cache frequently accessed data
const NodeCache = require('node-cache');
const cache = new NodeCache({ stdTTL: 300 }); // 5 minutes

async function getProducts() {
  const cacheKey = 'products:all';
  const cached = cache.get(cacheKey);
  
  if (cached) {
    return cached;
  }
  
  const products = await withRetry(async () => {
    return await prisma.product.findMany();
  });
  
  cache.set(cacheKey, products);
  return products;
}
```

### 3. Use Read Replicas
```bash
# Primary (write)
DATABASE_URL="postgresql://user:password@primary:5432/khaacho?connection_limit=10"

# Replica (read)
DATABASE_REPLICA_URL="postgresql://user:password@replica:5432/khaacho?connection_limit=20"
```

```javascript
// Use replica for read operations
const prismaRead = new PrismaClient({
  datasources: {
    db: { url: process.env.DATABASE_REPLICA_URL },
  },
});

// Read from replica
const orders = await prismaRead.order.findMany();

// Write to primary
const order = await prisma.order.create({ data: orderData });
```

## Troubleshooting

### Issue: Connection Pool Exhausted
```
Error: P2024: Timed out fetching a new connection from the connection pool
```

**Solutions:**
1. Increase `connection_limit`
2. Increase `pool_timeout`
3. Check for connection leaks
4. Reduce concurrent requests

### Issue: Too Many Connections
```
Error: 53300: sorry, too many clients already
```

**Solutions:**
1. Reduce `connection_limit` per worker
2. Increase PostgreSQL `max_connections`
3. Use connection pooler (PgBouncer)
4. Scale horizontally with read replicas

### Issue: Slow Queries
```
Slow query detected: 2500ms
```

**Solutions:**
1. Add database indexes
2. Optimize query with `EXPLAIN ANALYZE`
3. Use pagination for large datasets
4. Consider database views
5. Implement caching

### Issue: Connection Timeout
```
Error: P1002: The database server was not reachable
```

**Solutions:**
1. Check network connectivity
2. Verify database is running
3. Increase `connect_timeout`
4. Check firewall rules
5. Verify DATABASE_URL is correct

## Monitoring & Alerts

### Key Metrics to Monitor
1. Active connections
2. Idle connections
3. Connection pool utilization
4. Slow query count
5. Query error rate
6. Average query duration

### Example Monitoring Script
```javascript
const { getConnectionPoolStats } = require('./src/config/database');

setInterval(async () => {
  const stats = await getConnectionPoolStats();
  
  // Alert if > 80% connections used
  const utilization = stats.active_connections / stats.total_connections;
  if (utilization > 0.8) {
    console.warn('High connection pool utilization:', utilization);
  }
  
  // Log stats
  console.log('Connection pool stats:', stats);
}, 60000); // Every minute
```

## Environment Variables

### Required
```bash
DATABASE_URL="postgresql://user:password@host:5432/database?connection_limit=10"
```

### Optional
```bash
# Enable query logging in development
NODE_ENV="development"

# Custom slow query threshold (ms)
SLOW_QUERY_THRESHOLD=500

# Database replica for read operations
DATABASE_REPLICA_URL="postgresql://user:password@replica:5432/database"
```

## Testing

### Test Connection Pool
```bash
node -e "
const prisma = require('./src/config/database');
prisma.\$queryRaw\`SELECT 1\`.then(() => {
  console.log('✅ Connection pool working');
  process.exit(0);
}).catch(err => {
  console.error('❌ Connection pool failed:', err.message);
  process.exit(1);
});
"
```

### Test Retry Logic
```bash
node -e "
const { withRetry } = require('./src/config/database');
withRetry(async () => {
  throw new Error('P1002: Database timeout');
}, 3, 1000).catch(err => {
  console.log('✅ Retry logic working - error caught after retries');
});
"
```

### Load Test
```bash
# Install autocannon
npm install -g autocannon

# Run load test
autocannon -c 100 -d 30 http://localhost:3000/api/v1/health

# Monitor connections during test
watch -n 1 "psql \$DATABASE_URL -c 'SELECT count(*) FROM pg_stat_activity;'"
```

## Best Practices

### 1. Always Use Retry for Critical Operations
```javascript
// ✅ Good - with retry
const order = await withRetry(async () => {
  return await prisma.order.create({ data: orderData });
});

// ❌ Bad - no retry
const order = await prisma.order.create({ data: orderData });
```

### 2. Close Connections on Shutdown
```javascript
process.on('SIGTERM', async () => {
  await disconnectDatabase();
  process.exit(0);
});
```

### 3. Monitor Slow Queries
```javascript
// Review logs regularly
tail -f logs/combined-*.log | grep "Slow query"
```

### 4. Use Transactions for Related Operations
```javascript
await withRetry(async () => {
  return await prisma.$transaction(async (tx) => {
    // All operations succeed or fail together
    await tx.order.create({ data: orderData });
    await tx.retailer.update({ where: { id }, data: { totalOrders: { increment: 1 } } });
  });
});
```

### 5. Paginate Large Queries
```javascript
// ✅ Good - paginated
const orders = await prisma.order.findMany({
  take: 20,
  skip: (page - 1) * 20,
});

// ❌ Bad - fetch all
const orders = await prisma.order.findMany();
```

## Deployment Checklist

- [ ] Set `connection_limit=10` in DATABASE_URL
- [ ] Configure PostgreSQL `max_connections`
- [ ] Enable slow query logging
- [ ] Test retry logic
- [ ] Monitor connection pool
- [ ] Set up alerts for high utilization
- [ ] Document connection limits for team
- [ ] Test under load
- [ ] Configure graceful shutdown
- [ ] Set up connection pool monitoring

## Conclusion

Production-optimized Prisma connection pooling is now configured with:
- ✅ Connection limit: 10 per worker
- ✅ Slow query logging: >500ms
- ✅ Retry logic: 3 attempts with exponential backoff
- ✅ Connection reuse: Singleton pattern
- ✅ Monitoring: Pool stats and health checks

Ready for production deployment!
