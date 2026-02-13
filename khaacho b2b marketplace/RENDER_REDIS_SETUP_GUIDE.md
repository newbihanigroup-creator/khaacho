# Complete Redis Setup Guide for Render

## Step-by-Step: Create and Connect Redis on Render

---

## Step 1: Create Redis Service in Render

### 1.1 Go to Render Dashboard
1. Visit https://dashboard.render.com
2. Click **"New +"** button (top right)
3. Select **"Redis"**

### 1.2 Configure Redis Service
```
Name: khaacho-redis
Region: Oregon (same as your web service)
Plan: Starter ($10/month)
Max Memory Policy: allkeys-lru (recommended)
```

### 1.3 Create Service
1. Click **"Create Redis"**
2. Wait 2-3 minutes for provisioning
3. Redis will show status: **"Available"**

### 1.4 Get Connection Details
After creation, you'll see:
```
Internal Redis URL: redis://red-xxxxx:6379
External Redis URL: rediss://red-xxxxx:6379 (with TLS)
```

**Important**: Use the **Internal URL** for services in the same region (faster, free bandwidth)

---

## Step 2: Configure Environment Variables

### 2.1 Link Redis to Web Service

1. Go to your **khaacho-api** service
2. Click **"Environment"** tab
3. Click **"Add Environment Variable"**
4. Configure:
   ```
   Key: REDIS_URL
   Value: Click "Link to service"
   ```
5. Select:
   ```
   Service: khaacho-redis
   Property: Internal Connection String
   ```
6. Click **"Save Changes"**

### 2.2 Link Redis to Worker Service

1. Go to your **khaacho-worker** service
2. Click **"Environment"** tab
3. Click **"Add Environment Variable"**
4. Configure:
   ```
   Key: REDIS_URL
   Value: Click "Link to service"
   ```
5. Select:
   ```
   Service: khaacho-redis
   Property: Internal Connection String
   ```
6. Click **"Save Changes"**

### 2.3 Verify Environment Variables

Both services should now have:
```bash
REDIS_URL=redis://red-xxxxx:6379
```

---

## Step 3: Update render.yaml (Optional)

If using Blueprint deployment, update `render.yaml`:

```yaml
services:
  - type: web
    name: khaacho-api
    env: node
    envVars:
      - key: REDIS_URL
        fromService:
          type: redis
          name: khaacho-redis
          property: connectionString

  - type: worker
    name: khaacho-worker
    env: node
    envVars:
      - key: REDIS_URL
        fromService:
          type: redis
          name: khaacho-redis
          property: connectionString
```

---

## Step 4: Verify Connection in Code (Already Implemented)

Your code already has proper connection handling:

### 4.1 Connection Configuration
**File**: `src/queues/queueManager.js`

```javascript
const getRedisConfig = () => {
  if (config.redis.url) {
    return {
      redis: config.redis.url,
      settings: {
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
        retryStrategy: (times) => {
          const delay = Math.min(times * 50, 2000);
          logger.warn(`Redis retry attempt ${times}, waiting ${delay}ms`);
          return delay;
        },
        reconnectOnError: (err) => {
          logger.error('Redis reconnect on error', { error: err.message });
          return true;
        },
      },
    };
  }
  // Fallback...
};
```

### 4.2 Connection Events
```javascript
queue.on('ready', () => {
  logger.info('Redis connection ready');
});

queue.on('error', (error) => {
  logger.error('Redis error', { error: error.message });
});

queue.on('reconnecting', () => {
  logger.info('Redis reconnecting...');
});
```

---

## Step 5: Deploy and Verify

### 5.1 Deploy Services

**Option A: Manual Deploy**
1. Go to **khaacho-api** → **Manual Deploy**
2. Click **"Clear build cache & deploy"**
3. Wait for deployment
4. Go to **khaacho-worker** → **Manual Deploy**
5. Click **"Clear build cache & deploy"**

**Option B: Git Push** (if auto-deploy enabled)
```bash
git push origin main
```

### 5.2 Check Logs

**Web Service Logs** (khaacho-api):
```
✅ Look for: "Redis connection ready"
✅ Look for: "Using Redis-based job queues"
❌ Avoid: "ECONNRESET"
❌ Avoid: "Redis not configured"
```

**Worker Service Logs** (khaacho-worker):
```
✅ Look for: "Redis connection ready"
✅ Look for: "WhatsApp queue processor registered"
✅ Look for: "All job queues initialized successfully"
```

### 5.3 Test Redis Connection

**Method 1: Check Render Dashboard**
1. Go to **khaacho-redis** service
2. Click **"Metrics"** tab
3. Look for:
   - Connected clients: Should be 2+ (web + worker)
   - Commands/sec: Should show activity

**Method 2: Add Test Job**
```bash
# In your app, trigger a job
curl -X POST https://your-app.onrender.com/api/v1/test-queue
```

**Method 3: Check Queue Stats**
```javascript
// Add this endpoint to test
router.get('/queue-stats', async (req, res) => {
  const { getQueueStats } = require('../utils/queue.helper');
  const stats = await getQueueStats();
  res.json(stats);
});
```

---

## Step 6: Prevent Cold Start Failures

### 6.1 Health Check Configuration

**In render.yaml**:
```yaml
services:
  - type: web
    name: khaacho-api
    healthCheckPath: /api/health
    # Render waits for health check before routing traffic
```

### 6.2 Health Check Endpoint

**File**: `src/routes/health.routes.js` (create if needed)

```javascript
const express = require('express');
const router = express.Router();
const { getQueueManager } = require('../queues');

router.get('/health', async (req, res) => {
  try {
    const queueManager = getQueueManager();
    const redisStatus = queueManager ? 'connected' : 'unavailable';
    
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      redis: redisStatus,
      mode: queueManager?.constructor.name === 'SyncFallback' ? 'sync' : 'redis',
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      error: error.message,
    });
  }
});

module.exports = router;
```

### 6.3 Graceful Startup

Your code already handles this:

```javascript
// In src/queues/initializeQueues.js
function initializeQueues() {
  try {
    if (!process.env.REDIS_URL) {
      logger.warn('Redis not configured - using sync fallback');
      return new SyncFallback(); // App continues
    }
    
    queueManager.initialize();
    return queueManager;
  } catch (error) {
    logger.error('Failed to initialize queues', { error: error.message });
    return new SyncFallback(); // Fallback on error
  }
}
```

---

## Troubleshooting Common Issues

### Issue 1: ECONNRESET During Startup

**Symptoms**:
```
Error: read ECONNRESET
at Queue initialization
```

**Causes**:
- Redis service not fully started
- Wrong REDIS_URL
- Network timeout

**Solutions**:

**A. Verify Redis is Running**
```bash
# In Render Dashboard
1. Go to khaacho-redis
2. Check status: Should be "Available"
3. Check "Events" tab for errors
```

**B. Verify REDIS_URL Format**
```bash
# Correct formats:
redis://red-xxxxx:6379
redis://default:password@red-xxxxx:6379

# Wrong formats:
redis-cli redis://... (has command prefix)
http://redis://... (wrong protocol)
```

**C. Add Connection Timeout**
```javascript
// Already implemented in your code
const getRedisConfig = () => ({
  redis: config.redis.url,
  settings: {
    connectTimeout: 10000, // 10 seconds
    retryStrategy: (times) => Math.min(times * 50, 2000),
  },
});
```

### Issue 2: Connection Refused

**Symptoms**:
```
Error: connect ECONNREFUSED
```

**Cause**: Using external URL instead of internal

**Solution**:
```bash
# Use Internal URL (faster, free)
✅ redis://red-xxxxx:6379

# Not External URL (slower, costs bandwidth)
❌ rediss://red-xxxxx-external:6379
```

### Issue 3: Authentication Failed

**Symptoms**:
```
Error: NOAUTH Authentication required
```

**Solution**:
```bash
# Render Redis includes password in URL
# Format: redis://default:PASSWORD@host:port

# Verify in Render Dashboard:
1. Go to khaacho-redis
2. Check "Connection" tab
3. Copy exact URL
```

### Issue 4: Max Clients Reached

**Symptoms**:
```
Error: ERR max number of clients reached
```

**Solution**:
```bash
# Upgrade Redis plan or reduce connections
# In Render Dashboard:
1. Go to khaacho-redis
2. Click "Upgrade"
3. Select higher plan (more connections)
```

### Issue 5: Memory Limit Exceeded

**Symptoms**:
```
Error: OOM command not allowed when used memory > 'maxmemory'
```

**Solution**:
```bash
# Set eviction policy
1. Go to khaacho-redis settings
2. Set Max Memory Policy: allkeys-lru
3. Or upgrade to larger plan
```

---

## Performance Optimization

### 1. Connection Pooling

Your code already implements this:
```javascript
// Bull automatically manages connection pool
// No additional configuration needed
```

### 2. Reduce Latency

**Use Internal URL**:
```bash
# Same region = <1ms latency
REDIS_URL=redis://red-xxxxx:6379 (internal)

# External = 50-100ms latency
REDIS_URL=rediss://red-xxxxx-external:6379 (external)
```

### 3. Monitor Performance

**In Render Dashboard**:
1. Go to **khaacho-redis**
2. Click **"Metrics"** tab
3. Monitor:
   - Memory usage
   - Commands/sec
   - Connected clients
   - Hit rate

---

## Security Best Practices

### 1. Use Internal URLs
```bash
✅ redis://red-xxxxx:6379 (internal, secure)
❌ rediss://red-xxxxx-external:6379 (external, exposed)
```

### 2. Don't Commit REDIS_URL
```bash
# In .gitignore
.env
.env.local
.env.production
```

### 3. Rotate Credentials
```bash
# In Render Dashboard:
1. Go to khaacho-redis
2. Click "Rotate Password"
3. Redeploy services (auto-updates REDIS_URL)
```

---

## Cost Optimization

### Starter Plan ($10/month)
```
Memory: 256 MB
Connections: 100
Bandwidth: Unlimited (internal)
Persistence: Daily backups
```

**Good for**:
- Development
- Low traffic (<1000 jobs/day)
- Testing

### Standard Plan ($25/month)
```
Memory: 1 GB
Connections: 500
Bandwidth: Unlimited
Persistence: Daily backups + point-in-time
```

**Good for**:
- Production
- Medium traffic (1000-10000 jobs/day)
- Multiple services

---

## Monitoring Checklist

### Daily Checks
- [ ] Redis service status: "Available"
- [ ] Connected clients: 2+ (web + worker)
- [ ] Memory usage: <80%
- [ ] No ECONNRESET errors in logs

### Weekly Checks
- [ ] Review failed jobs
- [ ] Check queue depths
- [ ] Monitor response times
- [ ] Review error logs

### Monthly Checks
- [ ] Review Redis metrics
- [ ] Optimize queue concurrency
- [ ] Clean old jobs
- [ ] Review costs

---

## Quick Reference

### Create Redis
```bash
Dashboard → New + → Redis → Configure → Create
```

### Link to Service
```bash
Service → Environment → Add Variable → Link to khaacho-redis
```

### Verify Connection
```bash
# Check logs for:
"Redis connection ready"
"Using Redis-based job queues"
```

### Test Queue
```bash
curl https://your-app.onrender.com/api/v1/queue-stats
```

---

## Summary

✅ **Step 1**: Create Redis service in Render  
✅ **Step 2**: Link REDIS_URL to web and worker services  
✅ **Step 3**: Code already has proper connection handling  
✅ **Step 4**: Deploy and verify in logs  
✅ **Step 5**: Monitor Redis metrics  

**Your app is ready for Redis!** 🚀

---

## Next Steps

1. **Create Redis** - Follow Step 1
2. **Link Services** - Follow Step 2
3. **Deploy** - Push to GitHub or manual deploy
4. **Verify** - Check logs for "Redis connection ready"
5. **Monitor** - Watch Redis metrics in dashboard

No code changes needed - everything is already configured!
