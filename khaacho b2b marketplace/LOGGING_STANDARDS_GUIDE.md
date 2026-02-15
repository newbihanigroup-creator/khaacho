# Logging Standards Guide

## Overview

Standardized structured logging across all services with consistent context, searchable fields, and production-grade observability.

## Standard Log Format

Every log entry includes:

```json
{
  "timestamp": "2026-02-14T10:30:00.000Z",
  "level": "info",
  "message": "Order created successfully",
  "environment": "production",
  "service": "khaacho-api",
  "version": "1.0.0",
  "hostname": "web-1",
  "pid": 12345,
  
  // Context (automatically added)
  "requestId": "abc-123-def-456",
  "orderId": "order-uuid",
  "userId": "user-uuid",
  "retailerId": "retailer-uuid",
  "vendorId": "vendor-uuid",
  
  // Queue context (for workers)
  "queueName": "order-processing",
  "jobId": "job-123",
  "jobName": "process-order",
  
  // Additional metadata
  "duration": 1234,
  "statusCode": 200,
  
  // Error details (for error level)
  "error": {
    "message": "Database connection failed",
    "code": "ECONNREFUSED",
    "stack": "Error: ...\n  at ..."
  },
  "stack": "full stack trace"
}
```

## Log Levels

### 1. INFO
- Successful operations
- Normal flow events
- Business events

```javascript
logger.info('Order created successfully', {
  orderId: 'uuid',
  total: 1000,
  itemCount: 5,
});
```

### 2. WARN
- Recoverable errors
- Deprecated features
- Performance issues
- Validation warnings

```javascript
logger.warn('Order validation warning', {
  orderId: 'uuid',
  issue: 'Low stock for item',
  itemId: 'item-uuid',
});
```

### 3. ERROR
- Failed operations
- Exceptions
- System errors
- **Always includes stack trace**

```javascript
logger.error('Order creation failed', {
  orderId: 'uuid',
  error: error.message,
  stack: error.stack,
  retailerId: 'retailer-uuid',
});
```

## Context Management

### HTTP Requests

Context is automatically set by middleware:

```javascript
// In server.js
const requestContextMiddleware = require('./middleware/requestContext');
app.use(requestContextMiddleware);

// Context includes:
// - requestId
// - userId
// - retailerId/vendorId
// - orderId (from params/body)
```

### Queue Jobs

Context is set by queue logger wrapper:

```javascript
const QueueLogger = require('./utils/queueLogger');

// Wrap processor
const wrappedProcessor = QueueLogger.wrapProcessor('order-processing', processor);

// Context includes:
// - queueName
// - jobId
// - orderId
// - attemptsMade
```

### Manual Context

Set context manually when needed:

```javascript
logger.setContext({
  orderId: 'uuid',
  operation: 'payment-processing',
});

// Or run with context
logger.runWithContext({ orderId: 'uuid' }, async () => {
  // All logs in this scope will include orderId
  logger.info('Processing payment');
});
```

## Searchable Logging

### Failed Orders

```javascript
// Log failed order
logger.logOrderFailure('Order creation failed', {
  orderId: 'uuid',
  retailerId: 'retailer-uuid',
  error: error.message,
  stack: error.stack,
  reason: 'Credit limit exceeded',
});

// Search logs
grep "order_failure" logs/orders-*.log
grep "orderId.*uuid" logs/orders-*.log
```

### Failed WhatsApp Messages

```javascript
// Log failed WhatsApp message
logger.logWhatsAppFailure('WhatsApp message delivery failed', {
  messageId: 'msg-uuid',
  recipient: '+1234567890',
  error: error.message,
  stack: error.stack,
  attemptsMade: 3,
});

// Search logs
grep "whatsapp_failure" logs/whatsapp-*.log
grep "recipient.*1234567890" logs/whatsapp-*.log
```

### OCR Failures

```javascript
// Log OCR failure
logger.logOCRFailure('OCR extraction failed', {
  uploadedOrderId: 'uuid',
  imageUrl: 'gs://bucket/image.jpg',
  error: error.message,
  stack: error.stack,
  attemptsMade: 2,
});

// Search logs
grep "ocr_failure" logs/combined-*.log
grep "uploadedOrderId.*uuid" logs/combined-*.log
```

## Usage Examples

### In Controllers

```javascript
const logger = require('../shared/logger');

class OrderController {
  async createOrder(req, res) {
    try {
      // Context already set by middleware
      logger.info('Creating order', {
        retailerId: req.body.retailerId,
        itemCount: req.body.items.length,
      });
      
      const order = await orderService.create(req.body);
      
      logger.logOrder('Order created successfully', {
        orderId: order.id,
        total: order.total,
      });
      
      res.json({ success: true, order });
    } catch (error) {
      logger.logOrderFailure('Order creation failed', {
        error: error.message,
        stack: error.stack,
        retailerId: req.body.retailerId,
      });
      
      res.status(500).json({ error: error.message });
    }
  }
}
```

### In Services

```javascript
const logger = require('../shared/logger');

class OrderService {
  async create(orderData) {
    // Set order context
    const orderId = generateId();
    logger.setContext({ orderId });
    
    try {
      logger.info('Validating order', {
        itemCount: orderData.items.length,
      });
      
      // Validation logic
      
      logger.info('Creating order in database');
      const order = await prisma.order.create({ data: orderData });
      
      logger.logOrder('Order created', {
        orderId: order.id,
        status: order.status,
      });
      
      return order;
    } catch (error) {
      logger.logOrderFailure('Order creation failed', {
        error: error.message,
        stack: error.stack,
      });
      throw error;
    }
  }
}
```

### In Queue Processors

```javascript
const QueueLogger = require('../utils/queueLogger');

async function orderProcessingProcessor(job) {
  const { orderId } = job.data;
  
  try {
    QueueLogger.logOrderProcessing('Processing order', {
      orderId,
      status: 'started',
    });
    
    // Processing logic
    
    QueueLogger.logOrderProcessing('Order processed successfully', {
      orderId,
      status: 'completed',
    });
  } catch (error) {
    QueueLogger.logOrderProcessingFailure(
      'Order processing failed',
      error,
      { orderId }
    );
    throw error;
  }
}

// Wrap processor
module.exports = QueueLogger.wrapProcessor(
  'order-processing',
  orderProcessingProcessor
);
```

### In Workers

```javascript
const logger = require('../shared/logger');

async function processUploadedOrder(uploadedOrderId) {
  logger.runWithContext({ uploadedOrderId, queueName: 'image-processing' }, async () => {
    try {
      logger.logOCR('Starting OCR processing', {
        uploadedOrderId,
      });
      
      // OCR logic
      
      logger.logOCR('OCR completed', {
        uploadedOrderId,
        textLength: 1234,
      });
    } catch (error) {
      logger.logOCRFailure('OCR processing failed', {
        uploadedOrderId,
        error: error.message,
        stack: error.stack,
      });
      throw error;
    }
  });
}
```

## Log Files

### File Structure

```
logs/
  ├── combined-2026-02-14.log      # All logs
  ├── error-2026-02-14.log         # Errors only
  ├── orders-2026-02-14.log        # Order events
  ├── whatsapp-2026-02-14.log      # WhatsApp events
  ├── rejections-2026-02-14.log    # Warnings
  ├── exceptions-2026-02-14.log    # Uncaught exceptions
  └── .gitkeep
```

### Rotation

- Daily rotation
- 30 days retention
- Max 50MB per file
- Automatic compression

## Searching Logs

### By Request ID

```bash
# Find all logs for a request
grep "requestId.*abc-123" logs/combined-*.log

# With jq for JSON parsing
cat logs/combined-*.log | grep "requestId.*abc-123" | jq .
```

### By Order ID

```bash
# Find all logs for an order
grep "orderId.*order-uuid" logs/orders-*.log

# Failed orders only
grep "order_failure" logs/orders-*.log | jq .
```

### By Queue Name

```bash
# Find all logs for a queue
grep "queueName.*order-processing" logs/combined-*.log

# Failed jobs only
grep "queue_failure" logs/combined-*.log | jq .
```

### By Error Type

```bash
# All OCR failures
grep "ocr_failure" logs/combined-*.log

# All WhatsApp failures
grep "whatsapp_failure" logs/whatsapp-*.log

# All order failures
grep "order_failure" logs/orders-*.log
```

### By Environment

```bash
# Production logs only
grep "environment.*production" logs/combined-*.log

# Development logs only
grep "environment.*development" logs/combined-*.log
```

### By Time Range

```bash
# Logs from specific date
cat logs/combined-2026-02-14.log

# Logs from last hour
cat logs/combined-$(date +%Y-%m-%d).log | \
  grep "$(date -u -d '1 hour ago' +%Y-%m-%dT%H)"
```

### Complex Queries

```bash
# Failed orders for specific retailer
grep "order_failure" logs/orders-*.log | \
  grep "retailerId.*retailer-uuid" | jq .

# WhatsApp failures with retry count
grep "whatsapp_failure" logs/whatsapp-*.log | \
  jq 'select(.attemptsMade >= 2)'

# Slow requests (> 5 seconds)
cat logs/combined-*.log | \
  jq 'select(.duration > 5000)'

# Errors with stack traces
grep "level.*error" logs/error-*.log | \
  jq 'select(.stack != null)'
```

## Log Aggregation

### Using ELK Stack

```javascript
// Logs are already in JSON format
// Configure Filebeat to ship to Elasticsearch

// filebeat.yml
filebeat.inputs:
  - type: log
    enabled: true
    paths:
      - /app/logs/*.log
    json.keys_under_root: true
    json.add_error_key: true

output.elasticsearch:
  hosts: ["elasticsearch:9200"]
```

### Using CloudWatch

```javascript
// Configure Winston CloudWatch transport
const CloudWatchTransport = require('winston-cloudwatch');

logger.add(new CloudWatchTransport({
  logGroupName: 'khaacho-api',
  logStreamName: `${environment}-${hostname}`,
  awsRegion: 'us-east-1',
}));
```

### Using Datadog

```javascript
// Configure Winston Datadog transport
const DatadogTransport = require('winston-datadog');

logger.add(new DatadogTransport({
  apiKey: process.env.DATADOG_API_KEY,
  service: 'khaacho-api',
  ddsource: 'nodejs',
  ddtags: `env:${environment}`,
}));
```

## Best Practices

### 1. Always Include Context

```javascript
// ❌ Bad
logger.info('Order created');

// ✅ Good
logger.info('Order created', {
  orderId: order.id,
  retailerId: order.retailerId,
  total: order.total,
});
```

### 2. Use Appropriate Log Levels

```javascript
// ❌ Bad
logger.info('Database connection failed');

// ✅ Good
logger.error('Database connection failed', {
  error: error.message,
  stack: error.stack,
});
```

### 3. Include Stack Traces for Errors

```javascript
// ❌ Bad
logger.error('Operation failed', {
  error: error.message,
});

// ✅ Good
logger.error('Operation failed', {
  error: error.message,
  stack: error.stack,
  code: error.code,
});
```

### 4. Use Searchable Methods

```javascript
// ❌ Bad
logger.error('Order failed');

// ✅ Good
logger.logOrderFailure('Order creation failed', {
  orderId: 'uuid',
  reason: 'Credit limit exceeded',
});
```

### 5. Set Context Early

```javascript
// ✅ Good
logger.setContext({ orderId: 'uuid' });

// All subsequent logs will include orderId
logger.info('Validating order');
logger.info('Creating order');
logger.info('Order created');
```

## Performance Considerations

1. **Async Logging**: Winston handles async writes
2. **Log Rotation**: Automatic daily rotation prevents disk issues
3. **Sampling**: Consider sampling in high-traffic scenarios
4. **Structured Data**: JSON format enables efficient parsing
5. **Context Storage**: AsyncLocalStorage has minimal overhead

## Monitoring Alerts

### Setup Alerts

```javascript
// Alert on high error rate
grep "level.*error" logs/error-*.log | wc -l

// Alert on failed orders
grep "order_failure" logs/orders-*.log | wc -l

// Alert on OCR failures
grep "ocr_failure" logs/combined-*.log | wc -l

// Alert on WhatsApp failures
grep "whatsapp_failure" logs/whatsapp-*.log | wc -l
```

## Troubleshooting

### No Logs Appearing

1. Check log directory exists: `mkdir -p logs`
2. Check permissions: `chmod 755 logs`
3. Check LOG_LEVEL: `echo $LOG_LEVEL`

### Context Not Appearing

1. Ensure middleware is registered
2. Check AsyncLocalStorage support (Node.js >= 12.17)
3. Verify context is set before logging

### Large Log Files

1. Check rotation settings
2. Reduce log level in production
3. Enable log sampling
4. Archive old logs

## Support

- Guide: `LOGGING_STANDARDS_GUIDE.md`
- Quick Start: `LOGGING_QUICK_START.md`
- Search Examples: See "Searching Logs" section
- Log Files: `logs/` directory
