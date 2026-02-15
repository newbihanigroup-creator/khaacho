# Logging Quick Start

## 🚀 Setup

### 1. Enable Request Context Middleware

```javascript
// src/server.js
const requestContextMiddleware = require('./middleware/requestContext');

// Add BEFORE routes
app.use(requestContextMiddleware);
```

### 2. Import Logger

```javascript
const logger = require('./shared/logger');
```

## 📝 Basic Usage

### Info Logs

```javascript
logger.info('Operation successful', {
  orderId: 'uuid',
  duration: 1234,
});
```

### Warning Logs

```javascript
logger.warn('Low stock detected', {
  productId: 'uuid',
  stock: 5,
});
```

### Error Logs

```javascript
logger.error('Operation failed', {
  error: error.message,
  stack: error.stack,
  orderId: 'uuid',
});
```

## 🎯 Searchable Logging

### Failed Orders

```javascript
logger.logOrderFailure('Order creation failed', {
  orderId: 'uuid',
  retailerId: 'retailer-uuid',
  error: error.message,
  stack: error.stack,
  reason: 'Credit limit exceeded',
});
```

**Search:**
```bash
grep "order_failure" logs/orders-*.log
```

### Failed WhatsApp Messages

```javascript
logger.logWhatsAppFailure('Message delivery failed', {
  messageId: 'msg-uuid',
  recipient: '+1234567890',
  error: error.message,
  stack: error.stack,
});
```

**Search:**
```bash
grep "whatsapp_failure" logs/whatsapp-*.log
```

### OCR Failures

```javascript
logger.logOCRFailure('OCR extraction failed', {
  uploadedOrderId: 'uuid',
  imageUrl: 'gs://bucket/image.jpg',
  error: error.message,
  stack: error.stack,
});
```

**Search:**
```bash
grep "ocr_failure" logs/combined-*.log
```

## 🔄 Context Management

### Set Context

```javascript
logger.setContext({
  orderId: 'uuid',
  operation: 'payment',
});

// All logs now include orderId
logger.info('Processing payment');
```

### Run with Context

```javascript
logger.runWithContext({ orderId: 'uuid' }, async () => {
  logger.info('Step 1');
  logger.info('Step 2');
  // All logs include orderId
});
```

## 🔧 Queue Jobs

### Wrap Processor

```javascript
const QueueLogger = require('./utils/queueLogger');

async function myProcessor(job) {
  // Your logic
}

module.exports = QueueLogger.wrapProcessor('my-queue', myProcessor);
```

### Log in Processor

```javascript
async function orderProcessor(job) {
  try {
    QueueLogger.logOrderProcessing('Processing order', {
      orderId: job.data.orderId,
    });
    
    // Process order
    
    QueueLogger.logOrderProcessing('Order processed', {
      orderId: job.data.orderId,
    });
  } catch (error) {
    QueueLogger.logOrderProcessingFailure(
      'Order processing failed',
      error,
      { orderId: job.data.orderId }
    );
    throw error;
  }
}
```

## 🔍 Search Examples

### By Order ID

```bash
grep "orderId.*abc-123" logs/orders-*.log | jq .
```

### By Request ID

```bash
grep "requestId.*xyz-789" logs/combined-*.log | jq .
```

### By Queue Name

```bash
grep "queueName.*order-processing" logs/combined-*.log | jq .
```

### Failed Operations

```bash
# Failed orders
grep "order_failure" logs/orders-*.log

# Failed WhatsApp
grep "whatsapp_failure" logs/whatsapp-*.log

# Failed OCR
grep "ocr_failure" logs/combined-*.log

# All failures
grep "failure" logs/error-*.log
```

### By Time

```bash
# Today's logs
cat logs/combined-$(date +%Y-%m-%d).log

# Last hour
cat logs/combined-$(date +%Y-%m-%d).log | \
  grep "$(date -u -d '1 hour ago' +%Y-%m-%dT%H)"
```

### Complex Queries

```bash
# Slow requests (> 5s)
cat logs/combined-*.log | jq 'select(.duration > 5000)'

# Errors with stack traces
grep "level.*error" logs/error-*.log | jq 'select(.stack != null)'

# Failed orders for retailer
grep "order_failure" logs/orders-*.log | \
  grep "retailerId.*retailer-uuid"
```

## 📊 Log Format

Every log includes:

```json
{
  "timestamp": "2026-02-14T10:30:00.000Z",
  "level": "info",
  "message": "Order created",
  "environment": "production",
  "requestId": "abc-123",
  "orderId": "order-uuid",
  "queueName": "order-processing",
  "userId": "user-uuid",
  "duration": 1234
}
```

## 📁 Log Files

```
logs/
  ├── combined-2026-02-14.log      # All logs
  ├── error-2026-02-14.log         # Errors only
  ├── orders-2026-02-14.log        # Order events
  ├── whatsapp-2026-02-14.log      # WhatsApp events
  ├── rejections-2026-02-14.log    # Warnings
  └── exceptions-2026-02-14.log    # Uncaught exceptions
```

## ✅ Best Practices

1. **Always include context**
   ```javascript
   logger.info('Order created', { orderId: 'uuid' });
   ```

2. **Use appropriate levels**
   ```javascript
   logger.error('Failed', { error, stack });
   ```

3. **Use searchable methods**
   ```javascript
   logger.logOrderFailure('Order failed', { orderId });
   ```

4. **Set context early**
   ```javascript
   logger.setContext({ orderId: 'uuid' });
   ```

5. **Include stack traces**
   ```javascript
   logger.error('Error', { error: error.message, stack: error.stack });
   ```

## 🆘 Troubleshooting

### No logs appearing

```bash
# Check directory
mkdir -p logs
chmod 755 logs

# Check log level
echo $LOG_LEVEL
```

### Context not working

```bash
# Ensure middleware is registered
# Check Node.js version >= 12.17
node --version
```

## 📚 Full Documentation

- Complete Guide: `LOGGING_STANDARDS_GUIDE.md`
- Search Examples: See guide
- API Reference: `src/shared/logger/index.js`
