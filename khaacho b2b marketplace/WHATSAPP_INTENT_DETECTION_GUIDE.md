# WhatsApp Intent Detection System

Complete guide for the WhatsApp intent detection and conversation state management system.

## Overview

The WhatsApp Intent Detection System intelligently analyzes incoming WhatsApp messages to determine user intent and provide appropriate responses. It maintains conversation state per user and only sends help messages when intent is truly unclear.

## Features

### 1. Intent Detection
- **place_order**: User wants to place an order
- **order_status**: User wants to check order status
- **help**: User needs help/instructions
- **greeting**: User is greeting
- **unknown**: Intent unclear

### 2. Confidence Scoring
- Pattern-based detection with weighted scoring
- Confidence range: 0-100%
- Thresholds:
  - High (≥80%): Take action immediately
  - Medium (50-79%): Ask for clarification
  - Low (<50%): Send help message

### 3. Conversation State Management
- Per-user conversation tracking
- Context storage (last product, preferences, etc.)
- Pending action tracking (confirm order, etc.)
- Conversation metrics (message count, orders, help requests)

### 4. Smart Help System
- Only sends help if intent truly unclear
- Context-aware responses
- Different greetings for new vs returning users

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    WhatsApp Message                          │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│              Intent Detection Service                        │
│  • Pattern matching with confidence scoring                 │
│  • Get/create conversation state                            │
│  • Store intent log                                         │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                  Intent Routing                              │
│  • place_order → Parse & create order                       │
│  • order_status → Query order & send status                 │
│  • greeting → Send personalized greeting                    │
│  • help → Send help message                                 │
│  • unknown → Send help if confidence low                    │
└─────────────────────────────────────────────────────────────┘
```

## Database Schema

### whatsapp_conversations
Stores conversation state for each user.

```sql
CREATE TABLE whatsapp_conversations (
  id UUID PRIMARY KEY,
  phone_number VARCHAR(20) UNIQUE NOT NULL,
  retailer_id UUID REFERENCES retailers(id),
  
  -- Current state
  current_intent VARCHAR(50),
  last_message_at TIMESTAMP NOT NULL,
  last_intent_at TIMESTAMP,
  
  -- Context
  context JSONB DEFAULT '{}',
  pending_action VARCHAR(100),
  pending_order_data JSONB,
  
  -- Metrics
  message_count INTEGER DEFAULT 0,
  successful_orders INTEGER DEFAULT 0,
  failed_orders INTEGER DEFAULT 0,
  help_requests INTEGER DEFAULT 0,
  
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

### whatsapp_intent_log
Logs all intent detection results for analytics.

```sql
CREATE TABLE whatsapp_intent_log (
  id UUID PRIMARY KEY,
  conversation_id UUID REFERENCES whatsapp_conversations(id),
  phone_number VARCHAR(20) NOT NULL,
  
  -- Message
  message_text TEXT NOT NULL,
  message_id VARCHAR(255),
  
  -- Detection results
  detected_intent VARCHAR(50) NOT NULL,
  confidence_score INTEGER NOT NULL,
  alternative_intents JSONB DEFAULT '[]',
  
  -- Processing
  processing_time_ms INTEGER,
  matched_patterns JSONB DEFAULT '[]',
  
  -- Action
  action_taken VARCHAR(100),
  response_sent TEXT,
  
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

## Intent Detection Patterns

### Place Order Intent (Weight: 70-95)
```javascript
// High confidence patterns
'RICE-1KG x 10'           // 95% - SKU format
'10 x RICE-1KG'           // 95% - Quantity x SKU
'10 kg rice'              // 85% - Quantity + unit + product
'rice, dal, oil'          // 80% - Product names

// Medium confidence patterns
'I need rice'             // 75% - Natural language
'order rice'              // 70% - Order keyword
```

### Order Status Intent (Weight: 65-95)
```javascript
// High confidence patterns
'Order #ORD260100001'     // 95% - Order number
'ORD260100001'            // 95% - Order number only
'status of my order'      // 95% - Status query

// Medium confidence patterns
'where is my delivery'    // 70% - Delivery query
'when will it arrive'     // 65% - Timing query
```

### Help Intent (Weight: 60-95)
```javascript
// High confidence patterns
"I don't understand"      // 95% - Confusion
'help'                    // 90% - Direct help request
'how to order?'           // 85% - How-to question

// Medium confidence patterns
'what can you do?'        // 60% - Question mark
```

### Greeting Intent (Weight: 90-95)
```javascript
// High confidence patterns
'Hi'                      // 95% - Simple greeting
'Hello'                   // 95% - Simple greeting
'Namaste'                 // 95% - Local greeting
'Good morning'            // 95% - Time-based greeting
'Thanks'                  // 90% - Thank you
```

## API Endpoints

### Detect Intent (Testing)
```http
POST /api/whatsapp-intent/detect
Authorization: Bearer <token>

{
  "phoneNumber": "+9779800000000",
  "messageText": "I need 10 bags of rice",
  "messageId": "msg-123"
}

Response:
{
  "success": true,
  "data": {
    "intent": "place_order",
    "confidence": 85,
    "alternativeIntents": [
      { "intent": "help", "confidence": 45 }
    ],
    "matchedPatterns": [...],
    "shouldSendHelp": false,
    "conversationId": "uuid",
    "context": {},
    "duration": 45
  }
}
```

### Get Conversation
```http
GET /api/whatsapp-intent/conversation/:phoneNumber
Authorization: Bearer <token>

Response:
{
  "success": true,
  "data": {
    "id": "uuid",
    "phone_number": "+9779800000000",
    "retailer_id": "uuid",
    "current_intent": "place_order",
    "message_count": 15,
    "successful_orders": 3,
    "context": {
      "lastProduct": "RICE-1KG",
      "preferredVendor": "vendor-123"
    },
    "pending_action": "confirm_order",
    "pending_order_data": {...}
  }
}
```

### Update Context
```http
PUT /api/whatsapp-intent/conversation/:phoneNumber/context
Authorization: Bearer <token>

{
  "lastProduct": "RICE-1KG",
  "preferredVendor": "vendor-123",
  "deliveryAddress": "Kathmandu"
}

Response:
{
  "success": true,
  "data": {
    "context": {
      "lastProduct": "RICE-1KG",
      "preferredVendor": "vendor-123",
      "deliveryAddress": "Kathmandu"
    }
  }
}
```

### Set Pending Action
```http
POST /api/whatsapp-intent/conversation/:phoneNumber/pending-action
Authorization: Bearer <token>

{
  "action": "confirm_order",
  "data": {
    "items": [
      { "sku": "RICE-1KG", "quantity": 10 }
    ],
    "total": 1500
  }
}

Response:
{
  "success": true,
  "data": {
    "phoneNumber": "+9779800000000",
    "action": "confirm_order"
  }
}
```

### Get Intent Statistics
```http
GET /api/whatsapp-intent/statistics?days=7
Authorization: Bearer <token>

Response:
{
  "success": true,
  "data": {
    "statistics": [
      {
        "detected_intent": "place_order",
        "total_count": 150,
        "avg_confidence": 87,
        "min_confidence": 65,
        "max_confidence": 100,
        "avg_processing_time_ms": 45,
        "unique_users": 45
      },
      ...
    ],
    "days": 7
  }
}
```

### Get Active Conversations
```http
GET /api/whatsapp-intent/conversations/active?hours=24
Authorization: Bearer <token>

Response:
{
  "success": true,
  "data": {
    "conversations": [
      {
        "phone_number": "+9779800000000",
        "business_name": "ABC Store",
        "current_intent": "place_order",
        "message_count": 5,
        "successful_orders": 2,
        "hours_since_last_message": 0.5
      },
      ...
    ],
    "hoursThreshold": 24,
    "count": 15
  }
}
```

## Service Methods

### detectIntent(input)
Detect intent from WhatsApp message.

```javascript
const result = await intentDetectionService.detectIntent({
  phoneNumber: '+9779800000000',
  messageText: 'I need 10 bags of rice',
  messageId: 'msg-123'
});

// Returns:
{
  success: true,
  intent: 'place_order',
  confidence: 85,
  alternativeIntents: [...],
  matchedPatterns: [...],
  shouldSendHelp: false,
  conversationId: 'uuid',
  context: {},
  duration: 45
}
```

### getConversation(phoneNumber)
Get conversation state by phone number.

```javascript
const conversation = await intentDetectionService.getConversation(
  '+9779800000000'
);
```

### updateContext(phoneNumber, contextUpdates)
Update conversation context.

```javascript
await intentDetectionService.updateContext(
  '+9779800000000',
  {
    lastProduct: 'RICE-1KG',
    preferredVendor: 'vendor-123'
  }
);
```

### setPendingAction(phoneNumber, action, data)
Set pending action for user.

```javascript
await intentDetectionService.setPendingAction(
  '+9779800000000',
  'confirm_order',
  {
    items: [{ sku: 'RICE-1KG', quantity: 10 }],
    total: 1500
  }
);
```

### clearPendingAction(phoneNumber)
Clear pending action.

```javascript
await intentDetectionService.clearPendingAction('+9779800000000');
```

### incrementMetric(phoneNumber, metric)
Increment conversation metric.

```javascript
// Valid metrics: 'successful_orders', 'failed_orders', 'help_requests'
await intentDetectionService.incrementMetric(
  '+9779800000000',
  'successful_orders'
);
```

### getIntentStatistics(days)
Get intent detection statistics.

```javascript
const stats = await intentDetectionService.getIntentStatistics(7);
```

### getActiveConversations(hoursThreshold)
Get active conversations.

```javascript
const conversations = await intentDetectionService.getActiveConversations(24);
```

## Message Flow Examples

### Example 1: Place Order
```
User: "I need 10 bags of rice"

1. Intent Detection:
   - Detected: place_order (85% confidence)
   - Patterns matched: "need", "bags", "rice"

2. Order Processing:
   - Parse using unified order parser
   - Match products
   - Generate summary

3. Response:
   "📋 Order Summary:
   
   1. Rice 1kg
      Qty: 10 bags
      Price: Rs.150 × 10 = Rs.1500
   
   Subtotal: Rs.1500
   Tax (13%): Rs.195
   Total: Rs.1695
   
   ✅ Reply 'CONFIRM' to place order or 'CANCEL' to cancel."

4. State Update:
   - pending_action: 'confirm_order'
   - pending_order_data: {...}
```

### Example 2: Check Order Status
```
User: "Order #ORD260100001"

1. Intent Detection:
   - Detected: order_status (95% confidence)
   - Patterns matched: "Order #", order number format

2. Order Query:
   - Find order by number
   - Check ownership

3. Response:
   "📦 Order Status
   
   Order #: ORD260100001
   Status: DISPATCHED
   Vendor: ABC Wholesale
   Total: Rs.1695
   Created: 2026-02-10
   Confirmed: 2026-02-10
   Dispatched: 2026-02-11"
```

### Example 3: Greeting (New User)
```
User: "Hi"

1. Intent Detection:
   - Detected: greeting (95% confidence)
   - Patterns matched: "Hi"

2. Check History:
   - message_count: 0 (new user)

3. Response:
   "Hello! Welcome to Khaacho! 👋
   
   To place an order, send items like:
   • RICE-1KG x 10
   • 10 bags of rice
   
   Type 'help' for more options."
```

### Example 4: Greeting (Returning User)
```
User: "Hello"

1. Intent Detection:
   - Detected: greeting (95% confidence)
   - Patterns matched: "Hello"

2. Check History:
   - message_count: 15 (returning user)
   - successful_orders: 3

3. Response:
   "Hello again! 👋
   
   Ready to place an order? Send your items or type 'help' for instructions."
```

### Example 5: Help Request
```
User: "How do I place an order?"

1. Intent Detection:
   - Detected: help (85% confidence)
   - Patterns matched: "How do I", "?"

2. Response:
   "Welcome to Khaacho! 🛒
   
   I can help you with:
   
   📦 Place Order:
   Send items like:
   • RICE-1KG x 10
   • 10 bags of rice
   • Rice 10 kg
   
   📋 Check Order Status:
   • Order #ORD260100001
   • Status of my order
   • Where is my delivery?
   
   Need help? Just ask!"

3. Metric Update:
   - help_requests: +1
```

### Example 6: Unknown Intent (Low Confidence)
```
User: "xyz abc 123"

1. Intent Detection:
   - Detected: unknown (0% confidence)
   - No patterns matched
   - shouldSendHelp: true

2. Response:
   "Welcome to Khaacho! 🛒
   
   I can help you with:
   
   📦 Place Order:
   Send items like:
   • RICE-1KG x 10
   • 10 bags of rice
   
   📋 Check Order Status:
   • Order #ORD260100001
   
   Need help? Just ask!"
```

## Testing

Run the test script:

```bash
node test-whatsapp-intent-detection.js
```

The test script covers:
1. Intent detection for all intent types
2. Conversation state management
3. Context updates
4. Pending actions
5. Metrics tracking
6. Statistics queries
7. Message generation

## Performance

- Average intent detection time: 30-50ms
- Pattern matching: O(n) where n = number of patterns
- Database queries: Optimized with indexes
- Conversation lookup: <10ms (indexed by phone_number)

## Best Practices

### 1. Always Check Confidence
```javascript
if (intentResult.confidence >= 80) {
  // High confidence - take action
} else if (intentResult.confidence >= 50) {
  // Medium confidence - ask for clarification
} else {
  // Low confidence - send help
}
```

### 2. Use Conversation Context
```javascript
// Store user preferences
await intentDetectionService.updateContext(phoneNumber, {
  preferredVendor: 'vendor-123',
  deliveryAddress: 'Kathmandu'
});

// Use context in order processing
const context = conversation.context;
if (context.preferredVendor) {
  // Use preferred vendor
}
```

### 3. Track Pending Actions
```javascript
// Set pending action
await intentDetectionService.setPendingAction(
  phoneNumber,
  'confirm_order',
  orderData
);

// Later, check for pending action
if (conversation.pending_action === 'confirm_order') {
  // Process confirmation
  await processOrder(conversation.pending_order_data);
  await intentDetectionService.clearPendingAction(phoneNumber);
}
```

### 4. Monitor Metrics
```javascript
// Track successful orders
await intentDetectionService.incrementMetric(
  phoneNumber,
  'successful_orders'
);

// Get statistics
const stats = await intentDetectionService.getIntentStatistics(7);
console.log('Order intent accuracy:', stats.find(s => s.detected_intent === 'place_order'));
```

## Troubleshooting

### Issue: Low confidence scores
**Solution**: Add more patterns or adjust weights in `intentPatterns`

### Issue: Wrong intent detected
**Solution**: Check pattern order and weights, higher weight patterns should be more specific

### Issue: Conversation not found
**Solution**: Ensure phone number format is consistent (include country code)

### Issue: Context not persisting
**Solution**: Check database connection and ensure updates are awaited

## Future Enhancements

1. **ML-based Intent Detection**: Train model on historical data
2. **Multi-language Support**: Add patterns for Nepali language
3. **Intent Confidence Learning**: Adjust weights based on user feedback
4. **Conversation Analytics**: Track conversation flows and drop-off points
5. **Smart Suggestions**: Suggest products based on conversation history

## Related Documentation

- [Unified Order Parser Guide](./UNIFIED_ORDER_PARSER_GUIDE.md)
- [WhatsApp Integration Guide](./WHATSAPP_IMPLEMENTATION_SUMMARY.md)
- [Product Matcher Guide](./PRODUCT_NORMALIZATION_GUIDE.md)

## Support

For issues or questions:
1. Check logs in `logs/whatsapp-*.log`
2. Review intent detection logs in database
3. Test with `test-whatsapp-intent-detection.js`
4. Contact development team
