# WhatsApp Throttling - Quick Start Guide

## 🚀 Get Started in 5 Minutes

### Step 1: Run Database Migration
```bash
npx prisma migrate deploy
npx prisma generate
```

### Step 2: Start Retry Worker
Add to `src/server.js`:
```javascript
const whatsappRetryWorker = require('./workers/whatsappRetry.worker');

// Start worker
whatsappRetryWorker.start();
logger.info('WhatsApp retry worker started');

// Graceful shutdown
process.on('SIGTERM', () => {
  whatsappRetryWorker.stop();
});
```

### Step 3: Register Queue Processor
Add to `src/queues/initializeQueues.js`:
```javascript
const whatsappThrottledProcessor = require('./processors/whatsappThrottledProcessor');

// Register processor
queueManager.registerProcessor(
  'WHATSAPP',
  whatsappThrottledProcessor,
  10 // concurrency
);
```

### Step 4: Use Throttled Service
```javascript
const whatsappThrottledService = require('./src/services/whatsappThrottled.service');

// Send message with automatic throttling
const result = await whatsappThrottledService.sendMessage(
  '+1234567890',
  'Hello! Your order has been confirmed.'
);

if (result.immediate) {
  console.log('✅ Sent immediately');
} else if (result.queued) {
  console.log('⏳ Queued for later');
} else if (result.duplicate) {
  console.log('⚠️  Duplicate skipped');
}
```

### Step 5: Test It
```bash
node test-whatsapp-throttling.js
```

## 📋 Key Features

### Rate Limiting ✅
- 1 message per user per 2 seconds
- Automatic queuing for excess messages
- In-memory tracking with cleanup

### Idempotency ✅
- Prevents duplicate messages
- SHA-256 hash-based keys
- 24-hour duplicate window

### Delivery Failure Tracking ✅
- All failures logged to database
- Automatic retry with exponential backoff
- Max 5 attempts before permanent failure

### Retry Schedule ✅
```
Attempt 1: 1 minute
Attempt 2: 5 minutes
Attempt 3: 15 minutes
Attempt 4: 30 minutes
Attempt 5: 1 hour
```

## 🔧 Common Use Cases

### Send Order Confirmation
```javascript
await whatsappThrottledService.sendMessage(
  retailerPhone,
  `✅ Order #${orderNumber} confirmed!\nTotal: Rs.${total}`,
  {
    metadata: {
      orderId: order.id,
      type: 'order_confirmation',
    },
  }
);
```

### Send Payment Reminder
```javascript
await whatsappThrottledService.sendMessage(
  retailerPhone,
  `💰 Payment reminder: Rs.${dueAmount} due for Order #${orderNumber}`,
  {
    metadata: {
      orderId: order.id,
      type: 'payment_reminder',
    },
  }
);
```

### Bulk Messages (Automatically Throttled)
```javascript
// Send to multiple users - automatically throttled
for (const retailer of retailers) {
  await whatsappThrottledService.sendMessage(
    retailer.phoneNumber,
    'New products available!'
  );
  // First message: sent immediately
  // Subsequent messages: queued with 2-second delays
}
```

## 📊 Monitor Performance

### Get Statistics
```javascript
const stats = await whatsappThrottledService.getStats();

console.log('Active rate limits:', stats.throttling.activeRateLimits);
console.log('Pending failures:', stats.deliveryFailures.pending);
console.log('Queue waiting:', stats.queue.waiting);
```

### Check Failures
```bash
# Query database
psql $DATABASE_URL -c "
  SELECT status, COUNT(*) 
  FROM whatsapp_delivery_failures 
  GROUP BY status;
"
```

### Watch Logs
```bash
tail -f logs/whatsapp-*.log | grep "throttl\|retry"
```

## ⚙️ Configuration

### Adjust Rate Limit
```javascript
// In src/services/whatsappThrottling.service.js
this.RATE_LIMIT_MS = 2000; // 2 seconds (default)

// For higher throughput
this.RATE_LIMIT_MS = 1000; // 1 second

// For lower throughput
this.RATE_LIMIT_MS = 5000; // 5 seconds
```

### Adjust Retry Interval
```javascript
// In src/workers/whatsappRetry.worker.js
this.RETRY_INTERVAL_MS = 2 * 60 * 1000; // 2 minutes (default)

// Check more frequently
this.RETRY_INTERVAL_MS = 1 * 60 * 1000; // 1 minute
```

## 🔍 Troubleshooting

### Messages Not Throttled?
Check rate limit map:
```javascript
const stats = whatsappThrottling.getStats();
console.log('Active rate limits:', stats.activeRateLimits);
```

### Duplicates Still Sent?
Verify idempotency keys:
```javascript
const key = whatsappThrottling.generateIdempotencyKey(phone, message);
const isDup = await whatsappThrottling.isDuplicate(key);
console.log('Is duplicate:', isDup);
```

### Retries Not Working?
Check worker status:
```javascript
const status = whatsappRetryWorker.getStatus();
console.log('Worker running:', status.isRunning);
```

## 📚 Full Documentation

See `WHATSAPP_THROTTLING_GUIDE.md` for:
- Complete architecture
- Advanced configuration
- Performance optimization
- Monitoring & alerts
- Best practices

## ✅ You're Ready!

WhatsApp throttling is now active with automatic rate limiting, queuing, and retry!
