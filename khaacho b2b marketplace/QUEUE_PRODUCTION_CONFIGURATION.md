# Production Queue Configuration Guide

## Overview

Production-grade Bull queue configuration with reliability features for distributed systems.

## Features

✅ Exponential backoff retry strategy (starts at 5 seconds)
✅ Failed job logging with full context
✅ Retry logging with backoff delays
✅ Dead letter queue for permanently failed jobs
✅ Worker-level error handling
✅ WhatsApp jobs never block API thread
✅ Rate limiting per queue
✅ Timeout protection
✅ Automatic job cleanup

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Queue System                              │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  API Request                                                 │
│       │                                                       │
│       ├─▶ Add Job to Queue (non-blocking)                   │
│       │                                                       │
│       └─▶ Return immediately                                 │
│                                                               │
│  Worker Process (separate thread)                            │
│       │                                                       │
│       ├─▶ Process Job                                        │
│       │   ├─▶ Success → Log completion                      │
│       │   └─▶ Failure → Retry with exponential backoff      │
│       │                                                       │
│       └─▶ After 3 attempts → Move to Dead Letter Queue      │
│                                                               │
│  Dead Letter Queue                                           │
│       │                                                       │
│       └─▶ Store permanently failed jobs for manual review   │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

## Configuration

### Default Job Options

All jobs include these settings:

```javascript
{
  attempts: 3,                    // Retry up to 3 times
  backoff: {
    type: 'exponential',
    delay: 5000,                  // Start at 5 seconds
  },
  removeOnComplete: {
    age: 24 * 3600,              // Keep for 24 hours
    count: 1000,                  // Keep last 1000 jobs
  },
  removeOnFail: false,            // Never auto-remove (for DLQ)
  timeout: 60000,                 // 60 second timeout
}
```

### Retry Schedule

With exponential backoff starting at 5 seconds:

| Attempt | Delay | Total Time |
|---------|-------|------------|
| 1 | 0s | 0s |
| 2 | 5s | 5s |
| 3 | 10s | 15s |

After 3 attempts, job moves to dead letter queue.

## Queue Configurations

### Order Processing Queue

High priority, medium concurrency:

```javascript
{
  name: 'order-processing',
  concurrency: 5,                 // Process 5 jobs simultaneously
  jobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
    timeout: 120000,              // 2 minutes
    priority: 1,                  // High priority
  },
  limiter: {
    max: 100,                     // Max 100 jobs
    duration: 60000,              // Per minute
  },
}
```

**Use Cases**:
- Order confirmation
- Vendor assignment
- Status updates
- Order completion
- Order cancellation

**Example**:

```javascript
const { queueManager } = require('./src/queues/queueManager');

// Add order processing job
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

### WhatsApp Messages Queue

High concurrency, rate limited:

```javascript
{
  name: 'whatsapp-messages',
  concurrency: 10,                // Process 10 messages simultaneously
  jobOptions: {
    attempts: 5,                  // More retries for external API
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
    timeout: 30000,               // 30 seconds
    priority: 2,                  // Medium-high priority
  },
  limiter: {
    max: 50,                      // Max 50 messages
    duration: 1000,               // Per second (rate limiting)
  },
}
```

**Use Cases**:
- Order confirmations
- Vendor notifications
- Delivery updates
- Payment reminders
- Balance inquiries

**Example**:

```javascript
const { queueManager } = require('./src/queues/queueManager');

// Add WhatsApp message job (non-blocking)
await queueManager.addJob(
  'WHATSAPP',
  'order-confirmation',
  {
    messageType: 'ORDER_CONFIRMATION',
    recipient: '+1234567890',
    data: {
      orderNumber: 'ORD-12345',
      total: 1500.00,
      items: [
        { name: 'Product A', quantity: 2, price: 750.00 }
      ],
    },
  },
  {
    // Optional: Prevent duplicate messages
    deduplicate: true,
    deduplicationKey: `order-confirmation-12345`,
  }
);

// API returns immediately (non-blocking)
// Message sent asynchronously by worker
```

### Image Processing Queue

Low concurrency (CPU-intensive):

```javascript
{
  name: 'image-processing',
  concurrency: 2,                 // Only 2 jobs simultaneously
  jobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
    timeout: 300000,              // 5 minutes
    priority: 3,                  // Medium priority
  },
  limiter: {
    max: 10,                      // Max 10 jobs
    duration: 60000,              // Per minute
  },
}
```

**Use Cases**:
- OCR processing
- Image optimization
- Thumbnail generation
- Vision API calls

## Event Logging

### Job Started

```javascript
logger.info('[whatsapp-messages] Job started', {
  jobId: '12345',
  jobName: 'order-confirmation',
  attempt: 1,
  maxAttempts: 5,
  data: { recipient: '+1234567890', ... },
});
```

### Job Completed

```javascript
logger.info('[whatsapp-messages] Job completed', {
  jobId: '12345',
  jobName: 'order-confirmation',
  duration: '1234ms',
  attempts: 1,
  result: { success: true, messageId: 'msg_123' },
});
```

### Job Failed (Will Retry)

```javascript
logger.error('[whatsapp-messages] Job failed', {
  jobId: '12345',
  jobName: 'order-confirmation',
  attempt: 1,
  maxAttempts: 5,
  isLastAttempt: false,
  error: 'API rate limit exceeded',
  stack: '...',
  data: { recipient: '+1234567890', ... },
});
```

### Job Retrying

```javascript
logger.warn('[whatsapp-messages] Job retrying', {
  jobId: '12345',
  jobName: 'order-confirmation',
  attempt: 2,
  maxAttempts: 5,
  backoffDelay: '5000ms',
  error: 'API rate limit exceeded',
});
```

### Job Moved to Dead Letter Queue

```javascript
logger.warn('[whatsapp-messages] Job moved to dead letter queue', {
  jobId: '12345',
  jobName: 'order-confirmation',
});
```

## Dead Letter Queue

### Purpose

Stores permanently failed jobs for manual review and retry.

### Features

- ✅ Stores all job details
- ✅ Includes failure reason and stack trace
- ✅ Tracks number of attempts
- ✅ Allows manual retry
- ✅ Never auto-removes jobs

### Job Data Structure

```javascript
{
  originalQueue: 'whatsapp-messages',
  originalJobId: '12345',
  originalJobName: 'order-confirmation',
  originalData: {
    messageType: 'ORDER_CONFIRMATION',
    recipient: '+1234567890',
    data: { ... },
  },
  failureReason: 'API rate limit exceeded',
  failureStack: '...',
  attempts: 5,
  failedAt: '2026-02-14T10:30:00.000Z',
}
```

### Viewing Failed Jobs

```javascript
const { queueManager } = require('./src/queues/queueManager');

// Get failed jobs from dead letter queue
const failedJobs = await queueManager.getDeadLetterJobs(0, 10);

failedJobs.forEach(job => {
  console.log('Failed Job:', {
    id: job.id,
    originalQueue: job.data.originalQueue,
    failureReason: job.data.failureReason,
    failedAt: job.data.failedAt,
  });
});
```

### Retrying Failed Jobs

```javascript
const { queueManager } = require('./src/queues/queueManager');

// Retry a job from dead letter queue
await queueManager.retryDeadLetterJob('12345');

// Job is re-added to original queue with fresh retry attempts
```

## Worker-Level Error Handling

All processors are wrapped with error handling:

```javascript
// Automatic wrapping
const wrappedProcessor = withErrorHandling(processor, queueName);

// Catches all errors
// Logs with full context
// Re-throws to trigger Bull's retry mechanism
```

### Example Processor

```javascript
async function whatsappProcessor(job) {
  try {
    // Process job
    const result = await whatsappService.sendMessage(job.data);
    
    // Log success
    logger.info('WhatsApp message sent', { result });
    
    return result;
  } catch (error) {
    // Error is caught by wrapper
    // Logged with full context
    // Re-thrown to trigger retry
    throw error;
  }
}
```

## Non-Blocking API

WhatsApp and other external API calls never block the API thread:

```javascript
// API endpoint
router.post('/orders/:id/confirm', async (req, res) => {
  // Update order in database
  await orderService.confirm(req.params.id);
  
  // Add WhatsApp notification to queue (non-blocking)
  await queueManager.addJob('WHATSAPP', 'order-confirmation', {
    messageType: 'ORDER_CONFIRMATION',
    recipient: order.retailer.phoneNumber,
    data: { orderNumber: order.orderNumber },
  });
  
  // Return immediately (don't wait for WhatsApp)
  res.json({
    success: true,
    message: 'Order confirmed',
  });
});

// WhatsApp message sent asynchronously by worker
// API response time: ~50ms (not affected by WhatsApp API)
```

## Monitoring

### Queue Statistics

```javascript
const { queueManager } = require('./src/queues/queueManager');

// Get statistics for all queues
const stats = await queueManager.getAllQueueStats();

console.log(stats);
// {
//   WHATSAPP: {
//     name: 'whatsapp-messages',
//     counts: {
//       waiting: 5,
//       active: 2,
//       completed: 1000,
//       failed: 10,
//       delayed: 0,
//     },
//     isPaused: false,
//   },
//   ...
// }
```

### Failed Jobs

```javascript
// Get failed jobs for a specific queue
const failedJobs = await queueManager.getFailedJobs('WHATSAPP', 0, 10);

failedJobs.forEach(job => {
  console.log('Failed Job:', {
    id: job.id,
    name: job.name,
    attempts: job.attemptsMade,
    error: job.failedReason,
    data: job.data,
  });
});
```

## Best Practices

### DO ✅

- Use queues for all external API calls
- Use queues for CPU-intensive tasks
- Set appropriate timeouts
- Monitor dead letter queue
- Retry failed jobs manually after fixing issues
- Use deduplication for idempotent operations
- Set appropriate concurrency per queue

### DON'T ❌

- Don't block API responses waiting for queue jobs
- Don't set concurrency too high (causes resource exhaustion)
- Don't ignore dead letter queue
- Don't retry jobs without investigating failures
- Don't use queues for real-time operations
- Don't forget to handle errors in processors

## Troubleshooting

### Jobs Not Processing

**Problem**: Jobs stuck in waiting state

**Solution**:
1. Check Redis connection
2. Verify workers are running
3. Check queue is not paused
4. Review concurrency settings

```javascript
// Check queue status
const stats = await queueManager.getQueueCounts('WHATSAPP');
console.log(stats);

// Resume queue if paused
await queueManager.resumeQueue('WHATSAPP');
```

### Jobs Failing Repeatedly

**Problem**: Jobs moving to dead letter queue

**Solution**:
1. Check dead letter queue
2. Review failure reasons
3. Fix underlying issue
4. Retry jobs manually

```javascript
// Get failed jobs
const failedJobs = await queueManager.getDeadLetterJobs(0, 10);

// Review failures
failedJobs.forEach(job => {
  console.log('Failure:', job.data.failureReason);
});

// Fix issue, then retry
await queueManager.retryDeadLetterJob(jobId);
```

### High Memory Usage

**Problem**: Too many jobs in memory

**Solution**:
1. Reduce concurrency
2. Clean old jobs
3. Increase removeOnComplete settings

```javascript
// Clean old completed jobs
await queueManager.cleanQueue('WHATSAPP', 3600000, 'completed');

// Clean old failed jobs (after moving to DLQ)
await queueManager.cleanQueue('WHATSAPP', 3600000, 'failed');
```

## Configuration Files

- `src/queues/productionQueueConfig.js` - Production configuration
- `src/queues/queueManager.js` - Queue manager with DLQ
- `src/queues/initializeQueues.js` - Queue initialization
- `src/queues/processors/*.js` - Job processors

## Summary

The production queue configuration provides:

✅ Reliable job processing with retries
✅ Exponential backoff (5s, 10s, 20s)
✅ Comprehensive logging
✅ Dead letter queue for failed jobs
✅ Worker-level error handling
✅ Non-blocking API operations
✅ Rate limiting per queue
✅ Timeout protection
✅ Easy monitoring and debugging

All WhatsApp and external API calls are processed asynchronously, ensuring the API remains responsive.
