# Queue Production Configuration - Quick Start

## Key Features

✅ 3 retry attempts with exponential backoff (5s, 10s, 20s)
✅ Failed job logging
✅ Retry logging
✅ Dead letter queue
✅ Worker error handling
✅ Non-blocking WhatsApp sending

## Example: Order Processing Queue

```javascript
const { queueManager } = require('./src/queues/queueManager');

// Add job to queue
await queueManager.addJob(
  'ORDER_PROCESSING',
  'order-confirmation',
  {
    orderId: '12345',
    action: 'CONFIRM',
    data: {},
  }
);
```

**Configuration**:
- Concurrency: 5
- Attempts: 3
- Timeout: 2 minutes
- Priority: High

## Example: WhatsApp Messages Queue

```javascript
const { queueManager } = require('./src/queues/queueManager');

// Add WhatsApp message (non-blocking)
await queueManager.addJob(
  'WHATSAPP',
  'order-confirmation',
  {
    messageType: 'ORDER_CONFIRMATION',
    recipient: '+1234567890',
    data: {
      orderNumber: 'ORD-12345',
      total: 1500.00,
    },
  }
);

// API returns immediately
// Message sent asynchronously
```

**Configuration**:
- Concurrency: 10
- Attempts: 5
- Timeout: 30 seconds
- Rate limit: 50 messages/second

## Retry Schedule

| Attempt | Delay | Total Time |
|---------|-------|------------|
| 1 | 0s | 0s |
| 2 | 5s | 5s |
| 3 | 10s | 15s |

After 3 attempts → Dead Letter Queue

## Event Logs

### Success
```
[whatsapp-messages] Job completed
  jobId: 12345
  duration: 1234ms
  attempts: 1
```

### Failure
```
[whatsapp-messages] Job failed
  jobId: 12345
  attempt: 1/5
  error: API rate limit exceeded
```

### Retry
```
[whatsapp-messages] Job retrying
  jobId: 12345
  attempt: 2/5
  backoffDelay: 5000ms
```

### Dead Letter Queue
```
[whatsapp-messages] Job moved to dead letter queue
  jobId: 12345
```

## Dead Letter Queue

### View Failed Jobs

```javascript
const failedJobs = await queueManager.getDeadLetterJobs(0, 10);
```

### Retry Failed Job

```javascript
await queueManager.retryDeadLetterJob('12345');
```

## Queue Statistics

```javascript
const stats = await queueManager.getAllQueueStats();

// {
//   WHATSAPP: {
//     counts: { waiting: 5, active: 2, completed: 1000, failed: 10 },
//     isPaused: false,
//   }
// }
```

## All Queue Configurations

| Queue | Concurrency | Timeout | Attempts |
|-------|-------------|---------|----------|
| order-processing | 5 | 2 min | 3 |
| whatsapp-messages | 10 | 30 sec | 5 |
| image-processing | 2 | 5 min | 3 |
| credit-score-calculation | 3 | 90 sec | 3 |
| order-routing | 3 | 60 sec | 3 |
| payment-reminders | 5 | 30 sec | 3 |
| report-generation | 1 | 10 min | 3 |

## Files

- `src/queues/productionQueueConfig.js` - Configuration
- `src/queues/queueManager.js` - Queue manager
- `src/queues/initializeQueues.js` - Initialization

## Full Documentation

See `QUEUE_PRODUCTION_CONFIGURATION.md` for complete documentation.
