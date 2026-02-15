# Prisma Connection Pooling - Quick Start

## 🚀 Get Started in 5 Minutes

### Step 1: Update DATABASE_URL

Add connection pooling parameters to your DATABASE_URL:

```bash
# .env file
DATABASE_URL="postgresql://user:password@host:5432/database?connection_limit=10&pool_timeout=10&connect_timeout=5"
```

**Parameters:**
- `connection_limit=10` - Max 10 connections per worker
- `pool_timeout=10` - Wait 10s for available connection
- `connect_timeout=5` - Wait 5s for initial connection

### Step 2: Use Retry Logic

Wrap database operations with retry logic:

```javascript
const { withRetry } = require('./src/config/database');

// Automatically retries on transient errors
const orders = await withRetry(async () => {
  return await prisma.order.findMany();
});
```

### Step 3: Test Configuration

```bash
# Run test suite
node test-connection-pooling.js
```

### Step 4: Monitor Slow Queries

```bash
# Watch for slow queries (>500ms)
tail -f logs/combined-*.log | grep "Slow query"
```

## 📊 Key Features

### 1. Connection Pooling ✅
- 10 connections per worker
- Automatic connection reuse
- Pool timeout: 10 seconds

### 2. Slow Query Logging ✅
- Logs queries > 500ms
- Includes query text and duration
- Helps identify optimization opportunities

### 3. Retry Logic ✅
- 3 automatic retries
- Exponential backoff (1s, 2s, 4s)
- Handles connection timeouts, deadlocks

### 4. Connection Reuse ✅
- Singleton pattern per process
- Shared across all workers
- Prevents connection leaks

## 🔧 Common Use Cases

### Basic Query
```javascript
const { withRetry } = require('./src/config/database');

const users = await withRetry(async () => {
  return await prisma.user.findMany();
});
```

### Transaction
```javascript
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

### Custom Retry
```javascript
// 5 retries with 2 second delay
const result = await withRetry(
  async () => await prisma.order.findMany(),
  5,    // maxRetries
  2000  // delayMs
);
```

## 📈 Monitoring

### Check Connection Health
```javascript
const { checkDatabaseConnection } = require('./src/config/database');

const isHealthy = await checkDatabaseConnection();
console.log('Database healthy:', isHealthy);
```

### Get Pool Statistics
```javascript
const { getConnectionPoolStats } = require('./src/config/database');

const stats = await getConnectionPoolStats();
console.log('Active connections:', stats.active_connections);
console.log('Idle connections:', stats.idle_connections);
```

## ⚙️ Configuration Examples

### Single Worker (Development)
```bash
DATABASE_URL="postgresql://user:password@localhost:5432/khaacho?connection_limit=20"
```

### Multiple Workers (Production)
```bash
# 4 workers × 10 connections = 40 total
DATABASE_URL="postgresql://user:password@host:5432/database?connection_limit=10&pool_timeout=10&connect_timeout=5"
```

### With SSL (Cloud Providers)
```bash
DATABASE_URL="postgresql://user:password@host:5432/database?connection_limit=10&pool_timeout=10&connect_timeout=5&sslmode=require"
```

### With PgBouncer
```bash
DATABASE_URL="postgresql://user:password@pooler:6543/database?connection_limit=10&pgbouncer=true"
```

## 🔍 Troubleshooting

### Connection Pool Exhausted
```
Error: P2024: Timed out fetching a new connection
```
**Solution:** Increase `connection_limit` or `pool_timeout`

### Too Many Connections
```
Error: 53300: sorry, too many clients already
```
**Solution:** Reduce `connection_limit` or increase PostgreSQL `max_connections`

### Slow Queries
```
Slow query detected: 1250ms
```
**Solution:** Add indexes, optimize query, or implement caching

## 📚 Full Documentation

See `PRISMA_CONNECTION_POOLING_GUIDE.md` for:
- Detailed configuration options
- PostgreSQL tuning
- Multi-worker setup
- Performance optimization
- Monitoring & alerts

## ✅ Checklist

- [ ] Update DATABASE_URL with connection_limit
- [ ] Test with `node test-connection-pooling.js`
- [ ] Monitor slow queries in logs
- [ ] Check connection pool stats
- [ ] Configure PostgreSQL max_connections
- [ ] Set up monitoring alerts

## 🎯 You're Ready!

Connection pooling is now optimized for production!
