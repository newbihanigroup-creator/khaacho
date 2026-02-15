# WhatsApp Message Throttling System - Complete Guide

## Overview
Production-grade WhatsApp message throttling system with rate limiting, queuing, idempotency, delivery failure tracking, and automatic retry mechanism.

## Features Implemented

### 1. Rate Limiting ✅
- **Limit**: 1 message per user per 2 seconds
- **Scope**: Per phone number
- **Implementation**: In-memory tracking with automatic cleanup
- **Behavior**: Messages exceeding limit are queued

### 2. Message Queuing ✅
- **Queue**: Bull queue integration
- **Delay**: Automatic calculation based on rate limit
- **Processing**: Background worker processes queued messages
- **Deduplication**: Job ID = idempotency key

### 3. Idempotency ✅
- **Key Generation**: SHA-256 hash of (phone + message + type + timestamp)
- **Duplicate Detection**: Checks last 24 hours
- **Prevention**: Skips duplicate messages automatically
- **Storage**: Stored in message metadata

### 4. Delivery Failure Tracking ✅
- **Logging**: All failures logged to database
- **Metadata**: Error message, code, attempt count
- **Status**: PENDING, RESOLVED, FAILED
- **Retry Schedule**: Exponential backoff

### 5. Automatic Retry ✅
- **Worker**: Background worker runs every 2 minutes
- **Max Attempts**: 5 attempts before permanent failure
- **Backoff**: 1min, 5min, 15min, 30min, 1hr
- **Recovery**: Successful retries marked as RESOLVED

## Architecture

```
┌─────────────────┐
│  Send Message   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Generate        │
│ Idempotency Key │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Check Duplicate │◄─── Database
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Check Rate      │◄─── In-Memory Map
│ Limit           │
└────────┬────────┘
         │
    ┌────┴────┐
    │         │
    ▼         ▼
┌───────┐ ┌───────┐
│ Send  │ │ Queue │
│ Now   │ │ Later │
└───┬───┘ └───┬───┘
    │         │
    │         ▼
    │    ┌────────┐
    │    │ Bull   │
    │    │ Queue  │
    │    └───┬────┘
    │        │
    │        ▼
    │   ┌────────┐
    │   │ Worker │
    │   └───┬────┘
    │       │
    └───┬───┘
        │
        ▼
   ┌─────────┐
   │ WhatsApp│
   │   API   │
   └────┬────┘
        │
   ┌────┴────┐
   │         │
   ▼         ▼
┌───────┐ ┌───────┐
│Success│ │Failure│
└───────┘ └───┬───┘
              │
              ▼
         ┌─────────┐
         │  Log    │
         │ Failure │
         └────┬────┘
              │
              ▼
         ┌─────────┐
         │ Retry   │
         │ Worker  │
         └─────────┘
```

## Database Schema

### WhatsAppDeliveryFailure Model
```prisma
model WhatsAppDeliveryFailure {
  id              String                  @id @default(uuid())
  phoneNumber     String                  @map("phone_number")
  message         String
  idempotencyKey  String                  @map("idempotency_key")
  errorMessage    String?                 @map("error_message")
  errorCode       String?                 @map("error_code")
  attemptCount    Int                     @default(1) @map("attempt_count")
  status          WhatsAppDeliveryStatus  @default(PENDING)
  metadata        Json?
  nextRetryAt     DateTime?               @map("next_retry_at")
  lastAttemptAt   DateTime?               @map("last_attempt_at")
  resolvedAt      DateTime?               @map("resolved_at")
  createdAt       DateTime                @default(now()) @map("created_at")
  updatedAt       DateTime                @updatedAt @map("updated_at")

  @@index([phoneNumber])
  @@index([status, nextRetryAt])
  @@index([idempotencyKey])
  @@map("whatsapp_delivery_failures")
}
```

## Usage Examples

### Basic Message Sending
```javascript
const whatsappThrottledService = require('./src/services/whatsappThrottled.service');

// Send message with automatic throttling
const result = await whatsappThrottledService.sendMessage(
  '+1234567890',
  'Hello! Your order has been confirmed.'
);

if (result.immediate) {
  console.log('Message sent immediately');
} else if (result.queued) {
  console.log('Message queued for later delivery');
} else if (result.duplicate) {
  console.log('Duplicate message skipped');
}
```

### Send with Options
```javascript
const result = await whatsappThrottledService.sendMessage(
  '+1234567890',
  'Your order #ORD123 is ready for pickup',
  {
    metadata: {
      orderId: 'ORD123',
      type: 'order_notification',
    },
  }
);
```

### Manual Retry
```javascript
// Retry failed messages (called by worker)
const results = await whatsappThrottledService.retryFailedMessages(10);

console.log('Retry results:', {
  total: results.total,
  succeeded: results.succeeded,
  failed: results.failed,
  permanentlyFailed: results.permanentlyFailed,
});
```

### Get Statistics
```javascript
const stats = await whatsappThrottledService.getStats();

console.log('Throttling stats:', stats.throttling);
console.log('Delivery failures:', stats.deliveryFailures);
console.log('Queue stats:', stats.queue);
```

## Integration

### 1. Initialize Queue Processor
```javascript
// In src/queues/initializeQueues.js
const { queueManager } = require('./queueManager');
const whatsappThrottledProcessor = require('./processors/whatsappThrottledProcessor');

// Register processor
queueManager.registerProcessor(
  'WHATSAPP',
  whatsappThrottledProcessor,
  10 // concurrency
);
```

### 2. Start Retry Worker
```javascript
// In src/server.js
const whatsappRetryWorker = require('./workers/whatsappRetry.worker');

// Start worker
whatsappRetryWorker.start();
console.log('WhatsApp retry worker started');

// Graceful shutdown
process.on('SIGTERM', () => {
  whatsappRetryWorker.stop();
});
```

### 3. Replace Existing WhatsApp Service
```javascript
// Old way
const whatsappService = require('./services/whatsapp.service');
await whatsappService.sendMessage(phone, message);

// New way (with throttling)
const whatsappThrottledService = require('./services/whatsappThrottled.service');
await whatsappThrottledService.sendMessage(phone, message);
```

## Rate Limiting

### Configuration
```javascript
// In whatsappThrottling.service.js
this.RATE_LIMIT_MS = 2000; // 2 seconds per user
```

### How It Works
1. First message to user: Sent immediately
2. Second message within 2 seconds: Queued
3. Queue delay: Calculated to respect 2-second limit
4. Rate limit tracking: In-memory map (auto-cleanup every 5 minutes)

### Example Timeline
```
Time    Action
0ms     Message 1 → Sent immediately
500ms   Message 2 → Queued (delay: 1500ms)
1000ms  Message 3 → Queued (delay: 2500ms)
2000ms  Message 2 processed
4000ms  Message 3 processed
```

## Idempotency

### Key Generation
```javascript
const key = whatsappThrottling.generateIdempotencyKey(
  '+1234567890',
  'Hello world',
  { type: 'text' }
);
// Result: "whatsapp:+1234567890:a1b2c3d4e5f6g7h8"
```

### Duplicate Detection
- Checks last 24 hours of messages
- Compares idempotency keys in metadata
- Skips sending if duplicate found
- Logs duplicate detection

### Use Cases
- Prevent double-sending on retry
- Avoid duplicate notifications
- Handle race conditions
- Idempotent API calls

## Delivery Failure Tracking

### Failure Logging
```javascript
// Automatic on send failure
await whatsappThrottling.logDeliveryFailure(
  {
    to: '+1234567890',
    message: 'Hello',
    idempotencyKey: 'whatsapp:...',
    attemptCount: 1,
  },
  error
);
```

### Failure Status
- **PENDING**: Waiting for retry
- **RESOLVED**: Successfully retried
- **FAILED**: Permanently failed (5 attempts)

### Retry Schedule
```
Attempt 1: 1 minute
Attempt 2: 5 minutes
Attempt 3: 15 minutes
Attempt 4: 30 minutes
Attempt 5: 1 hour
After 5: Permanently failed
```

## Monitoring

### Key Metrics
1. **Active Rate Limits**: Number of users currently rate-limited
2. **Pending Failures**: Messages waiting for retry
3. **Resolved Failures**: Successfully retried messages
4. **Permanent Failures**: Messages that failed 5 times
5. **Queue Size**: Messages waiting in Bull queue

### Get Metrics
```javascript
const stats = await whatsappThrottledService.getStats();

// Monitor these values
console.log('Active rate limits:', stats.throttling.activeRateLimits);
console.log('Pending failures:', stats.deliveryFailures.pending);
console.log('Queue waiting:', stats.queue.waiting);
console.log('Queue active:', stats.queue.active);
```

### Alerts
Set up alerts for:
- Pending failures > 100
- Permanent failures > 10
- Queue size > 1000
- Retry worker stopped

## Testing

### Run Test Suite
```bash
node test-whatsapp-throttling.js
```

### Test Coverage
1. ✅ Idempotency key generation
2. ✅ Rate limiting
3. ✅ Duplicate detection
4. ✅ Delivery failure logging
5. ✅ Retry time calculation
6. ✅ Get messages for retry
7. ✅ Mark as retried
8. ✅ Throttling statistics
9. ✅ Clear rate limit
10. ✅ Cleanup

### Manual Testing
```javascript
// Test rate limiting
const service = require('./src/services/whatsappThrottled.service');

// Send 3 messages quickly
await service.sendMessage('+1234567890', 'Message 1');
await service.sendMessage('+1234567890', 'Message 2');
await service.sendMessage('+1234567890', 'Message 3');

// Check results
// Message 1: Sent immediately
// Message 2: Queued (2 second delay)
// Message 3: Queued (4 second delay)
```

## Deployment

### 1. Run Migration
```bash
npx prisma migrate deploy
npx prisma generate
```

### 2. Start Retry Worker
```javascript
// Add to src/server.js
const whatsappRetryWorker = require('./workers/whatsappRetry.worker');
whatsappRetryWorker.start();
```

### 3. Register Queue Processor
```javascript
// Add to src/queues/initializeQueues.js
const whatsappThrottledProcessor = require('./processors/whatsappThrottledProcessor');
queueManager.registerProcessor('WHATSAPP', whatsappThrottledProcessor, 10);
```

### 4. Update Service Calls
```javascript
// Replace old service with throttled service
const whatsappThrottledService = require('./services/whatsappThrottled.service');
```

### 5. Monitor
```bash
# Watch logs
tail -f logs/whatsapp-*.log | grep "throttl\|retry"

# Check queue
curl http://localhost:3000/api/v1/queues/stats

# Check failures
psql $DATABASE_URL -c "SELECT status, COUNT(*) FROM whatsapp_delivery_failures GROUP BY status;"
```

## Troubleshooting

### Issue: Messages Not Being Throttled
**Check:**
1. Rate limit map size: `stats.throttling.activeRateLimits`
2. Rate limit value: Should be 2000ms
3. Update rate limit calls: Ensure `updateRateLimit()` is called

### Issue: Duplicates Still Sent
**Check:**
1. Idempotency keys being generated
2. Keys stored in message metadata
3. Database index on metadata field
4. 24-hour window for duplicate check

### Issue: Retries Not Working
**Check:**
1. Retry worker is running: `whatsappRetryWorker.getStatus()`
2. Failures have `nextRetryAt` in past
3. Attempt count < 5
4. Status is 'PENDING'

### Issue: Queue Growing Too Large
**Solutions:**
1. Increase worker concurrency
2. Reduce rate limit (allow more messages)
3. Check for stuck jobs
4. Monitor Bull queue health

## Performance Optimization

### 1. Adjust Rate Limit
```javascript
// Increase throughput (1 message per second)
this.RATE_LIMIT_MS = 1000;

// Decrease throughput (1 message per 5 seconds)
this.RATE_LIMIT_MS = 5000;
```

### 2. Increase Worker Concurrency
```javascript
// Process more messages in parallel
queueManager.registerProcessor('WHATSAPP', processor, 20);
```

### 3. Optimize Retry Interval
```javascript
// Check for retries more frequently
this.RETRY_INTERVAL_MS = 1 * 60 * 1000; // 1 minute
```

### 4. Database Indexes
```sql
-- Ensure indexes exist
CREATE INDEX IF NOT EXISTS idx_whatsapp_failures_retry 
  ON whatsapp_delivery_failures(status, next_retry_at, attempt_count);
```

## Best Practices

### 1. Always Use Throttled Service
```javascript
// ✅ Good
const whatsappThrottledService = require('./services/whatsappThrottled.service');
await whatsappThrottledService.sendMessage(phone, message);

// ❌ Bad
const whatsappService = require('./services/whatsapp.service');
await whatsappService.sendMessage(phone, message);
```

### 2. Include Metadata
```javascript
// ✅ Good - with metadata
await whatsappThrottledService.sendMessage(phone, message, {
  metadata: {
    orderId: 'ORD123',
    type: 'order_confirmation',
  },
});

// ❌ Bad - no metadata
await whatsappThrottledService.sendMessage(phone, message);
```

### 3. Monitor Failures
```javascript
// Set up monitoring
setInterval(async () => {
  const stats = await whatsappThrottledService.getStats();
  
  if (stats.deliveryFailures.pending > 100) {
    sendAlert('High pending WhatsApp failures');
  }
}, 60000);
```

### 4. Handle Permanent Failures
```javascript
// Query permanent failures
const permanentFailures = await prisma.whatsAppDeliveryFailure.findMany({
  where: { status: 'FAILED' },
  orderBy: { createdAt: 'desc' },
});

// Notify admin or take action
permanentFailures.forEach(failure => {
  console.error('Permanent failure:', failure.phoneNumber, failure.errorMessage);
});
```

## Configuration

### Environment Variables
```bash
# WhatsApp API (existing)
WHATSAPP_API_URL=https://graph.facebook.com/v18.0
WHATSAPP_PHONE_NUMBER_ID=your-phone-number-id
WHATSAPP_ACCESS_TOKEN=your-access-token

# Redis (for Bull queue)
REDIS_URL=redis://localhost:6379

# Rate limiting (optional)
WHATSAPP_RATE_LIMIT_MS=2000
WHATSAPP_RETRY_INTERVAL_MS=120000
```

### Adjust Settings
```javascript
// In whatsappThrottling.service.js
constructor() {
  this.RATE_LIMIT_MS = process.env.WHATSAPP_RATE_LIMIT_MS || 2000;
}

// In whatsappRetry.worker.js
constructor() {
  this.RETRY_INTERVAL_MS = process.env.WHATSAPP_RETRY_INTERVAL_MS || 120000;
}
```

## Conclusion

WhatsApp throttling system is production-ready with:
- ✅ Rate limiting: 1 message per 2 seconds per user
- ✅ Message queuing: Bull queue integration
- ✅ Idempotency: Duplicate prevention
- ✅ Failure tracking: Complete audit trail
- ✅ Automatic retry: Exponential backoff
- ✅ Monitoring: Comprehensive statistics

Ready for immediate deployment!
