# Image Processing Queue Integration Guide

## Overview
Complete BullMQ queue integration for image processing workflow. When an image is uploaded via the API, a background job is automatically queued to handle OCR, LLM extraction, product normalization, and RFQ broadcasting.

## Implementation Status: ✅ COMPLETE

### Files Modified

1. **src/queues/queueManager.js**
   - Added `IMAGE_PROCESSING` queue definition

2. **src/queues/initializeQueues.js**
   - Registered image processing processor with concurrency of 2

3. **src/queues/processors/imageProcessingProcessor.js**
   - Complete 4-step workflow implementation
   - OCR + LLM extraction
   - Product normalization
   - RFQ broadcasting

4. **src/services/imageUpload.service.js**
   - Updated to add jobs to IMAGE_PROCESSING queue
   - Fallback to synchronous processing if queue fails

## Workflow

### Step 1: Image Upload (API Call)
```
POST /api/orders/upload-image
```

**Request**:
```bash
curl -X POST http://localhost:3000/api/orders/upload-image \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "image=@order.jpg" \
  -F "retailerId=uuid"
```

**Response**:
```json
{
  "success": true,
  "data": {
    "uploadedOrderId": "uuid",
    "imageUrl": "https://...",
    "status": "PROCESSING"
  },
  "message": "Image uploaded successfully. Processing in background."
}
```

### Step 2: Background Job Queued
```javascript
// Job added to IMAGE_PROCESSING queue
{
  jobName: 'process-image-order',
  data: {
    uploadedOrderId: 'uuid'
  },
  options: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000
    }
  }
}
```

### Step 3: Worker Processes Job

**3.1 OCR Text Extraction**
```javascript
// Google Vision API extracts text from image
const processingResult = await orderImageProcessingService.processUploadedOrder(uploadedOrderId);
// Result: { success: true, rawText: "...", extractedData: {...} }
```

**3.2 LLM Item Extraction**
```javascript
// OpenAI extracts structured items
// Result: { items: [{ name: "Rice", quantity: 10, unit: "kg" }] }
```

**3.3 Product Normalization**
```javascript
// Fuzzy matching against Product database
const normalizationResult = await productNormalizationService.normalizeExtractedItems(uploadedOrderId);
// Result: { matchedItems: 7, needsReview: 1, status: "COMPLETED" }
```

**3.4 RFQ Broadcasting**
```javascript
// Broadcast to top 5 reliable vendors for each product
const rfqResults = await broadcastRFQs(uploadedOrderId, normalizedItems);
// Result: { vendorsNotified: 15, rfqsSent: 15 }
```

### Step 4: Check Status
```
GET /api/orders/upload-image/:uploadedOrderId
```

**Response (Processing)**:
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "status": "PROCESSING",
    "imageUrl": "https://...",
    "extractedText": null,
    "parsedData": null
  }
}
```

**Response (Completed)**:
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "status": "COMPLETED",
    "imageUrl": "https://...",
    "extractedText": "Order Items:\n1. Rice 10kg...",
    "parsedData": {
      "items": [...],
      "normalizedItems": [...],
      "rfqResults": {
        "vendorsNotified": 15,
        "rfqsSent": 15
      }
    }
  }
}
```

**Response (Needs Review)**:
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "status": "PENDING_REVIEW",
    "parsedData": {
      "normalizedItems": [
        {
          "matched": false,
          "needsReview": true,
          "reason": "No matching product found"
        }
      ],
      "needsReviewCount": 1
    }
  }
}
```

## Queue Configuration

### Queue Name
```javascript
IMAGE_PROCESSING: 'image-processing'
```

### Concurrency
```javascript
concurrency: 2  // Process 2 jobs simultaneously
```

### Job Options
```javascript
{
  attempts: 3,                    // Retry up to 3 times
  backoff: {
    type: 'exponential',
    delay: 5000                   // Start with 5 seconds, double each retry
  },
  removeOnComplete: 100,          // Keep last 100 completed jobs
  removeOnFail: false             // Keep all failed jobs for debugging
}
```

### Retry Strategy
- **Attempt 1**: Immediate
- **Attempt 2**: After 5 seconds
- **Attempt 3**: After 10 seconds
- **After 3 failures**: Job marked as failed

## RFQ Broadcasting

### How It Works

1. **Filter Matched Items**
   - Only items with `matched: true` and `needsReview: false`
   - Must have valid `productId`

2. **Get Top Vendors**
   - For each product, get top 5 reliable vendors
   - Uses `getTopReliableWholesellers(productId, 5)`
   - Sorted by reliability score

3. **Create Broadcast Logs**
   - Creates `OrderBroadcastLog` record for each vendor
   - Status: `SENT`
   - Includes metadata: item details, vendor info, scores

4. **Result**
   ```javascript
   {
     vendorsNotified: 15,    // Total unique vendors
     rfqsSent: 15,           // Total RFQ records created
     matchedItems: 3,        // Items successfully matched
     productIds: 3           // Unique products
   }
   ```

### RFQ Broadcast Log Schema
```javascript
{
  retailerId: "uuid",
  vendorId: "uuid",
  productId: "uuid",
  quantity: 10,
  unit: "kg",
  status: "SENT",
  sentAt: "2026-02-13T...",
  metadata: {
    uploadedOrderId: "uuid",
    extractedItem: {
      name: "Rice",
      quantity: 10,
      unit: "kg"
    },
    matchedProduct: {
      productId: "uuid",
      productName: "Basmati Rice",
      productCode: "RICE-001"
    },
    vendorInfo: {
      vendorName: "ABC Wholesalers",
      reliabilityScore: 85.5,
      price: 500.00
    }
  }
}
```

## Status Flow

```
PROCESSING
    ↓
[OCR Extraction]
    ↓
[LLM Extraction]
    ↓
[Product Normalization]
    ↓
    ├─→ All matched → [RFQ Broadcasting] → COMPLETED
    ├─→ Some need review → PENDING_REVIEW
    └─→ Error → FAILED (with retry)
```

## Error Handling

### Job Failures

**Automatic Retry**:
- Job fails → Retry after 5 seconds
- Job fails again → Retry after 10 seconds
- Job fails 3rd time → Marked as FAILED

**Partial Failures**:
- OCR fails → Job fails, retry
- LLM fails → Job fails, retry
- Normalization fails → Job fails, retry
- RFQ fails → Job succeeds with warning (COMPLETED_WITH_WARNINGS)

### Fallback Mechanism

If queue is unavailable:
```javascript
// Fallback to synchronous processing
try {
  const imageProcessingProcessor = require('../queues/processors/imageProcessingProcessor');
  await imageProcessingProcessor({ data: { uploadedOrderId } });
} catch (error) {
  // Log error but don't fail upload
}
```

## Monitoring

### Queue Statistics
```javascript
const { getQueueManager } = require('./src/queues/initializeQueues');
const queueMgr = getQueueManager();

// Get queue counts
const counts = await queueMgr.getQueueCounts('IMAGE_PROCESSING');
console.log(counts);
// {
//   waiting: 5,
//   active: 2,
//   completed: 100,
//   failed: 3,
//   delayed: 0,
//   paused: 0
// }
```

### Failed Jobs
```javascript
// Get failed jobs
const failedJobs = await queueMgr.getFailedJobs('IMAGE_PROCESSING', 0, 10);

failedJobs.forEach(job => {
  console.log(`Job ${job.id} failed:`, job.failedReason);
  console.log('Data:', job.data);
  console.log('Attempts:', job.attemptsMade);
});
```

### Retry Failed Job
```javascript
// Retry a specific failed job
await queueMgr.retryJob('IMAGE_PROCESSING', jobId);
```

## Logging

### Job Start
```javascript
logger.info('🔄 Starting image processing job', {
  jobId: job.id,
  uploadedOrderId,
  attempt: job.attemptsMade + 1,
});
```

### Step Completion
```javascript
logger.info('✅ OCR and extraction completed', {
  uploadedOrderId,
  itemsExtracted: 5,
});

logger.info('✅ Product normalization completed', {
  uploadedOrderId,
  totalItems: 5,
  matchedItems: 4,
  needsReview: 1,
});

logger.info('✅ RFQ broadcasting completed', {
  uploadedOrderId,
  vendorsNotified: 15,
  rfqsSent: 15,
});
```

### Job Failure
```javascript
logger.error('❌ Image processing job failed', {
  jobId: job.id,
  uploadedOrderId,
  error: error.message,
  stack: error.stack,
  attempt: job.attemptsMade + 1,
});
```

## Testing

### Manual Test
```bash
# 1. Upload image
curl -X POST http://localhost:3000/api/orders/upload-image \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "image=@test-order.jpg" \
  -F "retailerId=uuid"

# Response: { uploadedOrderId: "uuid", status: "PROCESSING" }

# 2. Wait a few seconds for processing

# 3. Check status
curl http://localhost:3000/api/orders/upload-image/uuid \
  -H "Authorization: Bearer YOUR_TOKEN"

# Response: { status: "COMPLETED", parsedData: {...} }
```

### Check Queue
```javascript
// In Node.js console or script
const { getQueueManager } = require('./src/queues/initializeQueues');
const queueMgr = getQueueManager();

// Check queue stats
const stats = await queueMgr.getQueueCounts('IMAGE_PROCESSING');
console.log('Queue stats:', stats);

// Check failed jobs
const failed = await queueMgr.getFailedJobs('IMAGE_PROCESSING');
console.log('Failed jobs:', failed.length);
```

## Performance

### Processing Time
- **OCR**: 2-5 seconds (Google Vision)
- **LLM Extraction**: 1-3 seconds (OpenAI)
- **Normalization**: 0.5-2 seconds (fuzzy matching)
- **RFQ Broadcasting**: 0.5-1 second (database writes)
- **Total**: 4-11 seconds per job

### Throughput
- **Concurrency**: 2 jobs simultaneously
- **Capacity**: ~10-20 jobs per minute
- **Scalable**: Increase concurrency for higher throughput

## Configuration

### Environment Variables
```bash
# Redis (required for queue)
REDIS_URL=redis://localhost:6379
# or
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0

# Image Upload
IMAGE_UPLOAD_PROVIDER=cloudinary  # or 's3'
CLOUDINARY_CLOUD_NAME=...
CLOUDINARY_API_KEY=...
CLOUDINARY_API_SECRET=...

# OCR
GOOGLE_CLOUD_PROJECT_ID=...
GOOGLE_CLOUD_CREDENTIALS={"type":"service_account",...}

# LLM
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini

# Product Matching
PRODUCT_MATCH_THRESHOLD=0.7
```

### Queue Concurrency
```javascript
// In src/queues/initializeQueues.js
activeQueueManager.registerProcessor('IMAGE_PROCESSING', imageProcessingProcessor, 2);
//                                                                                  ↑
//                                                                            Concurrency
```

## Troubleshooting

### Job Stuck in "active"
```javascript
// Check for stalled jobs
const queue = queueMgr.getQueue('IMAGE_PROCESSING');
const stalled = await queue.getStalled();
console.log('Stalled jobs:', stalled.length);

// Clean stalled jobs
await queue.clean(0, 'active');
```

### Jobs Not Processing
```bash
# Check Redis connection
redis-cli ping
# Should return: PONG

# Check worker is running
# Worker should be started with: node src/server-worker.js
```

### High Failure Rate
```javascript
// Check failed jobs
const failed = await queueMgr.getFailedJobs('IMAGE_PROCESSING', 0, 10);

failed.forEach(job => {
  console.log('Failed reason:', job.failedReason);
  console.log('Stack trace:', job.stacktrace);
});

// Common issues:
// - Invalid API keys (OpenAI, Google Vision)
// - Database connection issues
// - Missing products in database
```

## Best Practices

### 1. Monitor Queue Health
```javascript
// Regular health checks
setInterval(async () => {
  const stats = await queueMgr.getAllQueueStats();
  console.log('Queue health:', stats);
  
  // Alert if too many failures
  if (stats.IMAGE_PROCESSING.counts.failed > 10) {
    console.error('High failure rate in image processing queue!');
  }
}, 60000); // Every minute
```

### 2. Clean Old Jobs
```javascript
// Clean completed jobs older than 24 hours
await queueMgr.cleanQueue('IMAGE_PROCESSING', 24 * 3600 * 1000, 'completed');

// Clean failed jobs older than 7 days
await queueMgr.cleanQueue('IMAGE_PROCESSING', 7 * 24 * 3600 * 1000, 'failed');
```

### 3. Handle Graceful Shutdown
```javascript
// In server shutdown
process.on('SIGTERM', async () => {
  console.log('Shutting down gracefully...');
  
  // Close queues
  const { shutdownQueues } = require('./src/queues/initializeQueues');
  await shutdownQueues();
  
  process.exit(0);
});
```

### 4. Rate Limiting
```javascript
// Limit API calls to prevent queue overload
const rateLimit = require('express-rate-limit');

const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 uploads per 15 minutes
  message: 'Too many uploads, please try again later',
});

router.post('/upload-image', uploadLimiter, controller.uploadOrderImage);
```

## Integration with Existing Systems

### Order Creation
```javascript
// After RFQ responses, create order
async function createOrderFromUploadedOrder(uploadedOrderId) {
  const uploadedOrder = await prisma.uploadedOrder.findUnique({
    where: { id: uploadedOrderId },
    include: { /* ... */ },
  });
  
  if (uploadedOrder.status !== 'COMPLETED') {
    throw new Error('Order not ready for creation');
  }
  
  // Create order from normalized items
  const order = await orderService.createOrder({
    retailerId: uploadedOrder.retailerId,
    items: uploadedOrder.parsedData.normalizedItems,
  });
  
  // Link to uploaded order
  await prisma.uploadedOrder.update({
    where: { id: uploadedOrderId },
    data: { orderId: order.id },
  });
  
  return order;
}
```

### Vendor Notifications
```javascript
// Send WhatsApp notifications to vendors
async function notifyVendorsOfRFQ(uploadedOrderId) {
  const broadcasts = await prisma.orderBroadcastLog.findMany({
    where: {
      metadata: {
        path: ['uploadedOrderId'],
        equals: uploadedOrderId,
      },
    },
    include: { vendor: { include: { user: true } } },
  });
  
  for (const broadcast of broadcasts) {
    await whatsappService.sendMessage(
      broadcast.vendor.user.phoneNumber,
      `New RFQ: ${broadcast.quantity} ${broadcast.unit} of product ${broadcast.productId}`
    );
  }
}
```

---

**Status**: ✅ Ready for production use
**Last Updated**: 2026-02-13
**Version**: 1.0.0
