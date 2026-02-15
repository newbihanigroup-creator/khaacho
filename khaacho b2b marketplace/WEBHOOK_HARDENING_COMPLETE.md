# ✅ Webhook Hardening - Implementation Complete

## Status: PRODUCTION READY ✓

The WhatsApp webhook endpoint has been hardened with enterprise-grade security and reliability features.

## What Was Built

### Core Features
✅ Fast response (<2 seconds guaranteed)  
✅ Background queue processing  
✅ Signature validation (Twilio & Meta)  
✅ Duplicate message prevention  
✅ Replay attack protection  
✅ Rate limiting per phone number  
✅ Comprehensive logging and monitoring  
✅ Performance metrics tracking  

### Database Schema
✅ `webhook_messages` - Message deduplication and tracking  
✅ `webhook_signature_log` - Security audit trail  
✅ `webhook_rate_limits` - Rate limiting enforcement  
✅ `webhook_performance_metrics` - Performance monitoring  
✅ Views for statistics and monitoring  
✅ Functions for duplicate detection and rate limiting  

### Services
✅ `webhookSecurity.service.js` - Security and validation (300+ lines)  
✅ `hardenedWhatsapp.controller.js` - Hardened webhook endpoints (400+ lines)  
✅ `webhookMessageProcessor.js` - Background processing  

### Routes
✅ `/webhook` - Meta WhatsApp webhook (GET/POST)  
✅ `/twilio/webhook` - Twilio WhatsApp webhook (POST)  
✅ `/stats` - Webhook statistics (Admin only)  

## Quick Start

### 1. Run Migration
```bash
npx prisma migrate deploy
```

### 2. Update Routes
Add to `src/routes/index.js`:
```javascript
const hardenedWhatsappRoutes = require('./hardenedWhatsapp.routes');
router.use('/whatsapp-hardened', hardenedWhatsappRoutes);
```

### 3. Configure Queue Processor
Add to queue initialization:
```javascript
const { processWebhookMessage, processTwilioMessage } = require('./processors/webhookMessageProcessor');

queueManager.registerProcessor('whatsapp-messages', 'process-message', processWebhookMessage);
queueManager.registerProcessor('whatsapp-messages', 'process-twilio-message', processTwilioMessage);
```

### 4. Test Implementation
```bash
node test-hardened-webhook.js
```

## Security Features

### 1. Signature Validation

#### Twilio Signature
```javascript
// Validates HMAC-SHA1 signature
const isValid = await webhookSecurityService.validateSignature(
  'twilio',
  signature,
  url,
  body,
  authToken
);
```

#### Meta/WhatsApp Signature
```javascript
// Validates HMAC-SHA256 signature
const isValid = await webhookSecurityService.validateSignature(
  'meta',
  signature,
  url,
  body,
  appSecret
);
```

### 2. Duplicate Prevention

```javascript
// Check if message already processed
const isDuplicate = await webhookSecurityService.isDuplicate(messageId, 'whatsapp');

if (isDuplicate) {
  // Skip processing, return 200
  return res.sendStatus(200);
}
```

### 3. Rate Limiting

```javascript
// Check rate limit (100 requests per hour per phone)
const withinLimit = await webhookSecurityService.checkRateLimit('whatsapp', phoneNumber);

if (!withinLimit) {
  // Log and return 200 (don't trigger retries)
  return res.sendStatus(200);
}
```

### 4. Replay Attack Protection

```sql
-- Messages stored with timestamps
CREATE TABLE webhook_messages (
  message_id VARCHAR(255) UNIQUE,
  first_received_at TIMESTAMP,
  duplicate_count INTEGER,
  last_duplicate_at TIMESTAMP
);
```

## Performance Guarantees

### Response Time
```javascript
// Timeout ensures response within 2 seconds
const responseTimeout = setTimeout(() => {
  if (!res.headersSent) {
    res.sendStatus(200);
  }
}, 1800); // 1.8 seconds
```

### Background Processing
```javascript
// Queue job for heavy processing
const queueJobId = await queueManager.addJob('whatsapp-messages', 'process-message', {
  messageId,
  phoneNumber,
  messageText,
  timestamp,
});

// Respond immediately
return res.sendStatus(200);
```

## Webhook Flow

### Request Flow
```
1. Webhook receives request
   ↓
2. Set 2-second timeout
   ↓
3. Extract message data (fast)
   ↓
4. Check duplicate (database lookup)
   ↓ (if duplicate)
5. Return 200 immediately
   ↓ (if not duplicate)
6. Check rate limit (database lookup)
   ↓ (if exceeded)
7. Return 200 immediately
   ↓ (if within limit)
8. Record message (fast insert)
   ↓
9. Queue for background processing
   ↓
10. Return 200 (<2 seconds total)
```

### Background Processing Flow
```
1. Job picked from queue
   ↓
2. Process message (can take minutes)
   ↓
3. Parse order items
   ↓
4. Match products
   ↓
5. Send confirmation
   ↓
6. Update message status
   ↓
7. Track metrics
```

## Monitoring

### Webhook Statistics
```bash
GET /api/v1/whatsapp-hardened/stats?source=whatsapp&hours=24
```

Response:
```json
{
  "success": true,
  "data": {
    "processing": [
      {
        "webhook_source": "whatsapp",
        "status": "completed",
        "message_count": 1000,
        "avg_response_time_ms": 150,
        "max_response_time_ms": 500,
        "total_duplicates": 50,
        "total_errors": 5
      }
    ],
    "security": [
      {
        "webhook_source": "whatsapp",
        "hour": "2026-02-14 10:00:00",
        "total_requests": 100,
        "valid_signatures": 98,
        "invalid_signatures": 2,
        "suspicious_requests": 0
      }
    ],
    "performance": [
      {
        "webhook_source": "whatsapp",
        "endpoint_path": "/webhook",
        "hour": "2026-02-14 10:00:00",
        "request_count": 100,
        "avg_response_time_ms": 150,
        "p95_response_time_ms": 300,
        "p99_response_time_ms": 450,
        "success_rate": 98.5
      }
    ]
  }
}
```

### Database Queries

#### Check Recent Messages
```sql
SELECT 
  message_id,
  webhook_source,
  phone_number,
  status,
  response_time_ms,
  duplicate_count,
  created_at
FROM webhook_messages
WHERE created_at >= NOW() - INTERVAL '1 hour'
ORDER BY created_at DESC
LIMIT 100;
```

#### Check Duplicates
```sql
SELECT 
  message_id,
  phone_number,
  duplicate_count,
  first_received_at,
  last_duplicate_at
FROM webhook_messages
WHERE duplicate_count > 0
ORDER BY duplicate_count DESC
LIMIT 50;
```

#### Check Rate Limits
```sql
SELECT * FROM webhook_rate_limit_stats
WHERE total_requests > 50
ORDER BY total_requests DESC;
```

#### Check Performance
```sql
SELECT * FROM webhook_performance_stats
WHERE webhook_source = 'whatsapp'
ORDER BY hour DESC
LIMIT 24;
```

#### Check Security
```sql
SELECT * FROM webhook_security_stats
WHERE webhook_source = 'whatsapp'
ORDER BY hour DESC
LIMIT 24;
```

## Configuration

### Environment Variables
```bash
# WhatsApp Configuration
WHATSAPP_VERIFY_TOKEN=your-verify-token
WHATSAPP_ACCESS_TOKEN=your-access-token
WHATSAPP_PHONE_NUMBER_ID=your-phone-id
WHATSAPP_APP_SECRET=your-app-secret

# Twilio Configuration
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your-auth-token
TWILIO_WHATSAPP_NUMBER=whatsapp:+14155238886
TWILIO_SKIP_VALIDATION=false  # Set to true for sandbox

# Rate Limiting
WEBHOOK_RATE_LIMIT_MAX=100  # Max requests per window
WEBHOOK_RATE_LIMIT_WINDOW=60  # Window in minutes
```

### Rate Limit Configuration
```javascript
// In webhookSecurity.service.js
this.rateLimits = {
  whatsapp: { maxRequests: 100, windowMinutes: 60 },
  twilio: { maxRequests: 100, windowMinutes: 60 },
  meta: { maxRequests: 100, windowMinutes: 60 },
};
```

## Error Handling

### Always Return 200
```javascript
// CRITICAL: Always return 200 to prevent retries
try {
  // Process webhook
} catch (error) {
  logger.error('Webhook error', { error });
  return res.sendStatus(200);  // Still return 200
}
```

### Retry Logic in Background
```javascript
// Background processor handles retries
const retryResult = await queueRetryService.trackJobFailure(job.id, error, attemptNumber);

if (retryResult.shouldRetry) {
  // Retry with exponential backoff
  throw error;
} else if (retryResult.shouldMoveToDLQ) {
  // Move to dead-letter queue
  await queueRetryService.moveToDeadLetterQueue(job.id);
}
```

## Testing

### Run Test Suite
```bash
node test-hardened-webhook.js
```

### Test Response Time
```bash
curl -X POST http://localhost:3000/api/v1/whatsapp-hardened/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "object": "whatsapp_business_account",
    "entry": [{
      "changes": [{
        "value": {
          "messages": [{
            "from": "+1234567890",
            "id": "test-msg-123",
            "text": { "body": "Test message" },
            "type": "text"
          }]
        }
      }]
    }]
  }' \
  -w "\nTime: %{time_total}s\n"
```

### Test Duplicate Prevention
```bash
# Send same message twice
MESSAGE_ID="test-duplicate-$(date +%s)"

curl -X POST http://localhost:3000/api/v1/whatsapp-hardened/webhook \
  -H "Content-Type: application/json" \
  -d "{\"entry\":[{\"changes\":[{\"value\":{\"messages\":[{\"id\":\"$MESSAGE_ID\",\"from\":\"+1234567890\",\"text\":{\"body\":\"Test\"}}]}}]}]}"

# Second request (should be detected as duplicate)
curl -X POST http://localhost:3000/api/v1/whatsapp-hardened/webhook \
  -H "Content-Type: application/json" \
  -d "{\"entry\":[{\"changes\":[{\"value\":{\"messages\":[{\"id\":\"$MESSAGE_ID\",\"from\":\"+1234567890\",\"text\":{\"body\":\"Test\"}}]}}]}]}"
```

## Deployment

### Render Configuration
```yaml
# render.yaml
services:
  - type: web
    name: khaacho-api
    env: node
    buildCommand: npm install && npx prisma generate && npx prisma migrate deploy
    startCommand: npm start
    envVars:
      - key: DATABASE_URL
        sync: false
      - key: WHATSAPP_VERIFY_TOKEN
        sync: false
      - key: WHATSAPP_ACCESS_TOKEN
        sync: false
      - key: TWILIO_AUTH_TOKEN
        sync: false
```

### Webhook URLs
```
Meta WhatsApp:
https://your-app.onrender.com/api/v1/whatsapp-hardened/webhook

Twilio WhatsApp:
https://your-app.onrender.com/api/v1/whatsapp-hardened/twilio/webhook
```

## Maintenance

### Cleanup Old Data
```javascript
// Run weekly
const result = await webhookSecurityService.cleanupOldData(30);
console.log('Cleaned up:', result);
```

### Monitor Performance
```sql
-- Check slow webhooks
SELECT 
  message_id,
  phone_number,
  response_time_ms,
  created_at
FROM webhook_messages
WHERE response_time_ms > 1000
ORDER BY response_time_ms DESC
LIMIT 50;
```

### Check Failed Messages
```sql
SELECT 
  message_id,
  phone_number,
  error_message,
  error_count,
  created_at
FROM webhook_messages
WHERE status = 'failed'
ORDER BY created_at DESC
LIMIT 100;
```

## Best Practices

### 1. Always Return 200
Never return error status codes from webhook endpoints. This prevents unnecessary retries.

### 2. Process in Background
Move all heavy processing to background queues. Webhook should only validate and queue.

### 3. Monitor Performance
Set up alerts for:
- Response time > 1.5 seconds
- Duplicate rate > 10%
- Error rate > 5%
- Rate limit violations

### 4. Regular Cleanup
Schedule weekly cleanup of old webhook data to prevent table bloat.

### 5. Security Monitoring
Review security logs daily for:
- Invalid signatures
- Suspicious patterns
- Replay attacks
- Rate limit violations

## Troubleshooting

### Slow Response Times
**Check**: Database query performance
```sql
SELECT * FROM webhook_messages WHERE response_time_ms > 1000;
```

**Solution**: Add indexes, optimize queries

### High Duplicate Rate
**Check**: Client retry behavior
```sql
SELECT phone_number, AVG(duplicate_count) FROM webhook_messages GROUP BY phone_number;
```

**Solution**: Investigate client configuration

### Rate Limit Violations
**Check**: Request patterns
```sql
SELECT * FROM webhook_rate_limit_stats WHERE times_blocked > 0;
```

**Solution**: Adjust rate limits or investigate abuse

## Files Created

1. `prisma/migrations/036_webhook_security.sql` - Database schema (500+ lines)
2. `src/services/webhookSecurity.service.js` - Security service (300+ lines)
3. `src/controllers/hardenedWhatsapp.controller.js` - Hardened controller (400+ lines)
4. `src/queues/processors/webhookMessageProcessor.js` - Background processor (200+ lines)
5. `src/routes/hardenedWhatsapp.routes.js` - Routes
6. `test-hardened-webhook.js` - Test suite (300+ lines)
7. `WEBHOOK_HARDENING_COMPLETE.md` - This documentation

## Summary

✅ Response time <2 seconds guaranteed  
✅ Background processing for heavy operations  
✅ Signature validation for security  
✅ Duplicate prevention with database tracking  
✅ Replay attack protection with message IDs  
✅ Rate limiting per phone number  
✅ Comprehensive monitoring and logging  
✅ Production-ready error handling  

**Your webhook endpoint is now enterprise-grade!** 🚀
