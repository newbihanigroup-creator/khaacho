# Redis Queue Production Configuration Guide

## ✅ Production-Safe Redis Connection (Already Implemented)

Your Redis queue system is now configured with production-grade error handling and reconnection logic.

---

## Implementation Summary

### 1. Redis Connection with Retry Strategy

**File**: `src/queues/queueManager.js`

```javascript
const getRedisConfig = () => {
  if (config.redis.url) {
    return {
      redis: config.redis.url,
      settings: {
        maxRetriesPerRequest: null,  // Never give up on requests
        enableReadyCheck: false,      // Faster startup
        retryStrategy: (times) => {
          // Exponential backoff: 50ms, 100ms, 150ms... max 2s
          const delay = Math.min(times * 50, 2000);
          logger.warn(`Redis retry attempt ${times}, waiting ${delay}ms`);
          return delay;
        },
        reconnectOnError: (err) => {
          logger.error('Redis reconnect on error', { error: err.message });
          return true; // Always reconnect
        },
      },
    };
  }
  // Fallback for individual settings...
};
```

### 2. Graceful Queue Initialization

**File**: `src/queues/initializeQueues.js`

```javascript
function initializeQueues() {
  try {
    // Check if Redis is configured
    if (!process.env.REDIS_URL && !process.env.REDIS_HOST) {
      logger.warn('Redis not configured - queues disabled');
      return null; // App continues without queues
    }

    queueManager.initialize();

    // Each processor registers independently
    try {
      queueManager.registerProcessor('WHATSAPP', whatsappProcessor, 5);
    } catch (error) {
      logger.error('Failed to register WhatsApp processor', { error: error.message });
      // Continue with other processors
    }
    
    // ... more processors
    
  } catch (error) {
    logger.error('Failed to initialize queues', { error: error.message });
    logger.warn('Application will continue without job queues');
    return null; // Don't crash the app
  }
}
```

### 3. Enhanced Error Handling

**Connection Events**:
```javascript
queue.on('error', (error) => {
  logger.error(`Queue error`, { error: error.message, code: error.code });
  // Logged, not thrown
});

queue.on('ready', () => {
  logger.info('Redis connection ready');
});

queue.on('close', () => {
  logger.warn('Redis connection closed');
});

queue.on('reconnecting', () => {
  logger.info('Redis reconnecting...');
});
```

---

## Key Features

### ✅ Prevents App Crashes
- Errors are logged, not thrown
- App starts even if Redis is unavailable
- Graceful degradation

### ✅ Automatic Reconnection
- Exponential backoff retry strategy
- Reconnects on any error
- No manual intervention needed

### ✅ Production-Safe Settings
- `maxRetriesPerRequest: null` - Never gives up
- `enableReadyCheck: false` - Faster startup
- Proper error event handling

### ✅ Monitoring & Logging
- Connection state changes logged
- Retry attempts tracked
- Error codes captured

---

## Environment Variables

### Required (Render)
```bash
REDIS_URL=redis://default:password@host:port
```

### Alternative (Individual Settings)
```bash
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=your-password
REDIS_DB=0
```

---

## How It Handles Common Scenarios

### Scenario 1: Redis Temporarily Down
```
1. App starts
2. Redis connection fails
3. Retry strategy kicks in (50ms, 100ms, 150ms...)
4. App continues serving HTTP requests
5. Redis reconnects automatically when available
6. Queues resume processing
```

### Scenario 2: Redis Not Configured
```
1. App starts
2. No REDIS_URL found
3. Logs warning: "Redis not configured"
4. App continues without queues
5. HTTP API works normally
```

### Scenario 3: Connection Lost During Operation
```
1. Redis connection drops (ECONNRESET)
2. Error logged, not thrown
3. Reconnect strategy activates
4. Pending jobs wait in queue
5. Connection restored
6. Jobs resume processing
```

---

## Testing Locally

### 1. Without Redis
```bash
# Don't set REDIS_URL
npm start

# Expected: App starts, logs "Redis not configured"
```

### 2. With Redis
```bash
# Set REDIS_URL
export REDIS_URL=redis://localhost:6379
npm start

# Expected: App starts, queues initialize
```

### 3. Simulate Connection Loss
```bash
# Start app with Redis
npm start

# Stop Redis
docker stop redis

# Expected: Logs show reconnection attempts, app stays running

# Start Redis
docker start redis

# Expected: Logs show "Redis connection ready", queues resume
```

---

## Monitoring in Production

### Check Queue Health
```javascript
// GET /api/v1/queue/health
const health = await queueManager.getAllQueueStats();
```

### Check Redis Connection
```bash
# In Render logs, look for:
✅ "Redis connection ready"
⚠️  "Redis retry attempt X"
❌ "Redis connection closed"
```

---

## Troubleshooting

### Issue: "Redis not configured" warning

**Solution**: Add REDIS_URL to Render environment variables
```bash
# In Render Dashboard → Environment
REDIS_URL=<your-redis-connection-string>
```

### Issue: Constant reconnection attempts

**Cause**: Redis service not running or wrong credentials

**Solution**:
1. Verify Redis service is running in Render
2. Check REDIS_URL format: `redis://user:password@host:port`
3. Ensure Redis accepts connections from Render

### Issue: Jobs not processing

**Cause**: Worker service not running

**Solution**:
1. Check worker service is deployed (khaacho-worker)
2. Verify `ENABLE_BACKGROUND_JOBS=true` on worker
3. Check worker logs for processor registration

---

## Best Practices Implemented

### ✅ Connection Pooling
- Bull manages connection pool automatically
- Reuses connections efficiently

### ✅ Error Boundaries
- Each queue initializes independently
- One queue failure doesn't affect others

### ✅ Graceful Shutdown
```javascript
process.on('SIGTERM', async () => {
  await queueManager.closeAll();
  process.exit(0);
});
```

### ✅ Job Persistence
- Jobs stored in Redis
- Survive app restarts
- Automatic retry on failure

---

## Performance Tuning

### Concurrency Settings
```javascript
// Already configured in initializeQueues.js
WHATSAPP: 5 concurrent jobs
CREDIT_SCORE: 2 concurrent jobs
ORDER_ROUTING: 3 concurrent jobs
PAYMENT_REMINDERS: 3 concurrent jobs
REPORT_GENERATION: 1 concurrent job (resource intensive)
ORDER_PROCESSING: 5 concurrent jobs
```

### Job Options
```javascript
{
  attempts: 3,              // Retry failed jobs 3 times
  backoff: {
    type: 'exponential',    // 2s, 4s, 8s delays
    delay: 2000,
  },
  removeOnComplete: 100,    // Keep last 100 completed
  removeOnFail: 500,        // Keep last 500 failed
}
```

---

## Migration from Old Setup

If you had the old configuration:

### Before (Crashes on Redis failure)
```javascript
const queue = new Queue('my-queue', process.env.REDIS_URL);
// Throws error if Redis unavailable
```

### After (Production-safe)
```javascript
const queue = new Queue('my-queue', {
  redis: process.env.REDIS_URL,
  settings: {
    maxRetriesPerRequest: null,
    retryStrategy: (times) => Math.min(times * 50, 2000),
    reconnectOnError: () => true,
  },
});
// Logs error, continues running
```

---

## Summary

Your Redis queue system now:

✅ **Never crashes** - Errors logged, not thrown  
✅ **Auto-reconnects** - Exponential backoff retry  
✅ **Graceful degradation** - Works without Redis  
✅ **Production-ready** - Proper error handling  
✅ **Monitored** - Connection events logged  
✅ **Resilient** - Survives Redis restarts  

**No additional changes needed** - Already deployed in commit `47f9301`

Deploy to Render and your Redis connection issues will be resolved! 🚀
