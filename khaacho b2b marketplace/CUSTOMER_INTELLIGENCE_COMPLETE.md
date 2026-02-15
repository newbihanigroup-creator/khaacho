# Customer Intelligence Layer - Implementation Complete ✅

## Overview

Conversational intelligence system that remembers customer orders, suggests repeat orders, detects frequent buyers, and offers quick reorder options via WhatsApp.

## Features Implemented

### 1. Customer Memory
- ✅ Remembers all previous orders
- ✅ Tracks order history and patterns
- ✅ Calculates buying frequency
- ✅ Identifies favorite products
- ✅ Stores last order for quick reorder
- ✅ Automatic memory updates on each order

### 2. Repeat Order Suggestions
- ✅ "Order same as last week?" messages
- ✅ Automatic eligibility detection
- ✅ WhatsApp message integration
- ✅ Personalized suggestion timing
- ✅ Response tracking (YES/NO/MODIFY)

### 3. Frequent Buyer Detection
- ✅ Automatic classification: DAILY, WEEKLY, MONTHLY, OCCASIONAL
- ✅ Pattern analysis based on order frequency
- ✅ Consistency scoring
- ✅ Preferred order day/time detection
- ✅ Typical basket size calculation

### 4. Quick Reorder Option
- ✅ One-click reorder from last order
- ✅ Estimated total calculation
- ✅ Item list with quantities
- ✅ Conversational response handling
- ✅ Order creation from suggestion

### 5. Conversational Context
- ✅ Session management
- ✅ Intent tracking
- ✅ Conversation stage tracking
- ✅ Pending action management
- ✅ Auto-expiry after 30 minutes

### 6. Analytics & Metrics
- ✅ Suggestion acceptance rate
- ✅ Quick reorder conversion rate
- ✅ Customer engagement metrics
- ✅ Performance tracking
- ✅ Daily/hourly aggregation

## Database Schema

### Tables Created

1. **customer_memory** - Customer order history and patterns
   - Order statistics (count, value, frequency)
   - Buying behavior (frequency tier, preferred times)
   - Product preferences
   - Last order items for quick reorder

2. **conversation_context** - Active conversation tracking
   - Session management
   - Intent and stage tracking
   - Pending actions
   - Quick reorder context

3. **quick_reorder_suggestions** - Reorder suggestions sent
   - Suggestion details
   - Response tracking
   - Order creation tracking
   - Conversion metrics

4. **conversation_messages** - Message history
   - Inbound/outbound messages
   - Intent and entities
   - Delivery tracking

5. **customer_intelligence_metrics** - Performance metrics
   - Suggestion metrics
   - Conversion metrics
   - Engagement metrics

### Database Functions

- `update_customer_memory_after_order()` - Auto-update memory on order
- `calculate_frequency_tier()` - Classify buyer frequency
- `refresh_customer_memory_analytics()` - Recalculate all analytics

### Views

- `frequent_buyers_summary` - Frequent buyer list with predictions
- `quick_reorder_candidates` - Customers ready for reorder
- `intelligence_performance` - Daily performance metrics

## Buyer Classification

### Frequency Tiers

```
DAILY: Orders every 1-2 days
  - High-frequency buyers
  - Suggest reorder after 1-2 days

WEEKLY: Orders every 3-10 days
  - Regular buyers
  - Suggest reorder after 7 days

MONTHLY: Orders every 11-35 days
  - Periodic buyers
  - Suggest reorder after 30 days

OCCASIONAL: Orders less frequently
  - Irregular buyers
  - No automatic suggestions
```

## Quick Reorder Flow

### 1. Eligibility Check

System checks if customer is ready for reorder:
- Has previous orders
- Last order was X days ago (based on frequency)
- No recent suggestion sent (within 7 days)
- Customer is active

### 2. Suggestion Generation

Creates suggestion with:
- Last order items
- Current prices
- Estimated total
- Validity period (7 days)

### 3. WhatsApp Message

Sends personalized message:
```
Hi! 👋

It's been 7 days since your last order.

Would you like to order the same items again?

📦 Your last order:
• 5 kg Rice
• 2 kg Dal
• 12 pieces Coke

💰 Estimated total: ₹850.00

Reply:
✅ YES - to place this order
✏️ MODIFY - to change items
❌ NO - not now
```

### 4. Response Handling

System recognizes:
- **YES/Y/OK/CONFIRM** → Create order automatically
- **NO/N/NOT NOW** → Mark as rejected
- **MODIFY/CHANGE/EDIT** → Start conversation to modify
- Other → Mark as ignored

### 5. Order Creation

If customer says YES:
- Create order with same items
- Use current prices
- Link to suggestion
- Send confirmation

## API Endpoints

### Customer Memory

```
GET /api/v1/customer-intelligence/memory/:retailerId

Response:
{
  "success": true,
  "data": {
    "retailerId": "uuid",
    "totalOrders": 15,
    "averageOrderValue": 850.50,
    "isFrequentBuyer": true,
    "orderFrequencyTier": "WEEKLY",
    "averageDaysBetweenOrders": 7.5,
    "lastOrderItems": [...],
    "quickReorderAvailable": true
  }
}
```

### Check Eligibility

```
GET /api/v1/customer-intelligence/quick-reorder/:retailerId/check

Response:
{
  "success": true,
  "data": {
    "eligible": true
  }
}
```

### Generate Suggestion

```
POST /api/v1/customer-intelligence/quick-reorder/:retailerId/generate

Body:
{
  "suggestionType": "LAST_ORDER"
}

Response:
{
  "success": true,
  "data": {
    "id": 123,
    "items": [...],
    "totalItems": 3,
    "estimatedTotal": 850.00,
    "lastOrderDate": "2026-02-08T10:00:00Z"
  }
}
```

### Send Suggestion

```
POST /api/v1/customer-intelligence/quick-reorder/:retailerId/send

Body:
{
  "phoneNumber": "+919876543210"
}

Response:
{
  "success": true,
  "data": {
    "suggestionId": 123,
    "message": "Hi! 👋..."
  }
}
```

### Handle Response

```
POST /api/v1/customer-intelligence/quick-reorder/suggestions/:id/respond

Body:
{
  "response": "YES"
}

Response:
{
  "success": true,
  "data": {
    "responseType": "ACCEPTED"
  }
}
```

### Create Order

```
POST /api/v1/customer-intelligence/quick-reorder/suggestions/:id/create-order

Response:
{
  "success": true,
  "data": {
    "orderId": "uuid"
  },
  "message": "Order created successfully"
}
```

### Get Frequent Buyers

```
GET /api/v1/customer-intelligence/frequent-buyers?limit=100&orderFrequencyTier=WEEKLY

Response:
{
  "success": true,
  "data": [
    {
      "retailerId": "uuid",
      "retailerName": "John's Store",
      "phoneNumber": "+919876543210",
      "totalOrders": 15,
      "orderFrequencyTier": "WEEKLY",
      "daysSinceLastOrder": 7.5,
      "predictedNextOrderDate": "2026-02-22T00:00:00Z",
      "quickReorderAvailable": true
    }
  ],
  "count": 1
}
```

### Get Statistics

```
GET /api/v1/customer-intelligence/statistics?startDate=2026-02-01&endDate=2026-02-15

Response:
{
  "success": true,
  "data": {
    "totalSuggestions": 150,
    "totalAccepted": 90,
    "totalRejected": 30,
    "totalQuickReorders": 85,
    "acceptanceRate": 60.0,
    "conversionRate": 94.4
  }
}
```

## Worker Jobs

### Quick Reorder Suggestions
- **Schedule**: Every 2 hours
- **Action**: Send suggestions to eligible customers
- **Rate Limit**: 2 seconds between messages
- **Batch Size**: 50 customers per run

### Analytics Refresh
- **Schedule**: Every 6 hours
- **Action**: Recalculate customer memory analytics
- **Updates**: Frequency tiers, favorite products, patterns

### Context Cleanup
- **Schedule**: Every hour
- **Action**: Deactivate expired conversation contexts
- **Timeout**: 30 minutes of inactivity

## Integration with WhatsApp

### In WhatsApp Service

```javascript
// When customer sends message
const { retailerId, message } = incomingMessage;

// Get conversation context
const context = await customerIntelligenceService.getConversationContext(retailerId);

// Check if responding to quick reorder
if (context.reorderSuggestionSent && !context.reorderAccepted) {
  // Handle response
  const result = await customerIntelligenceService.handleQuickReorderResponse(
    context.suggestedReorder.id,
    message
  );
  
  if (result.responseType === 'ACCEPTED') {
    // Create order
    const order = await customerIntelligenceService.createOrderFromSuggestion(
      context.suggestedReorder.id
    );
    
    // Send confirmation
    await sendMessage(phoneNumber, `Order placed! Order ID: ${order.id}`);
  }
}

// Log message
await customerIntelligenceService.logMessage(
  context.sessionId,
  retailerId,
  'INBOUND',
  'TEXT',
  message
);
```

## Usage Examples

### Example 1: Check and Send Suggestion

```javascript
const retailerId = 'retailer-uuid';
const phoneNumber = '+919876543210';

// Check eligibility
const eligible = await customerIntelligenceService.shouldSuggestQuickReorder(retailerId);

if (eligible) {
  // Send suggestion
  const result = await customerIntelligenceService.sendQuickReorderSuggestion(
    retailerId,
    phoneNumber
  );
  
  console.log('Suggestion sent:', result.suggestionId);
}
```

### Example 2: Handle Customer Response

```javascript
// Customer replies "YES"
const suggestionId = 123;
const response = 'YES';

// Handle response
const result = await customerIntelligenceService.handleQuickReorderResponse(
  suggestionId,
  response
);

if (result.responseType === 'ACCEPTED') {
  // Create order
  const order = await customerIntelligenceService.createOrderFromSuggestion(suggestionId);
  console.log('Order created:', order.id);
}
```

### Example 3: Get Frequent Buyers

```javascript
// Get all weekly buyers
const buyers = await customerIntelligenceService.getFrequentBuyers({
  orderFrequencyTier: 'WEEKLY',
  limit: 50
});

console.log(`Found ${buyers.length} weekly buyers`);

// Send suggestions to all
for (const buyer of buyers) {
  await customerIntelligenceService.sendQuickReorderSuggestion(
    buyer.retailerId,
    buyer.phoneNumber
  );
}
```

## Performance Metrics

### Acceptance Rate
```
Acceptance Rate = (Accepted Suggestions / Total Suggestions) × 100
Target: > 50%
```

### Conversion Rate
```
Conversion Rate = (Orders Created / Accepted Suggestions) × 100
Target: > 80%
```

### Engagement Rate
```
Engagement Rate = (Responses / Suggestions Sent) × 100
Target: > 70%
```

## Testing

Run the test suite:

```bash
node test-customer-intelligence.js
```

## Files Created

### Database
- `prisma/migrations/043_customer_intelligence.sql`

### Services
- `src/services/customerIntelligence.service.js`

### Controllers
- `src/controllers/customerIntelligence.controller.js`

### Routes
- `src/routes/customerIntelligence.routes.js`

### Workers
- `src/workers/customerIntelligence.worker.js`

### Tests
- `test-customer-intelligence.js`

### Documentation
- `CUSTOMER_INTELLIGENCE_COMPLETE.md`

## Deployment Checklist

- [ ] Apply database migration
- [ ] Add routes to main router
- [ ] Start customer intelligence worker
- [ ] Test with real customers
- [ ] Monitor acceptance rates
- [ ] Adjust suggestion timing
- [ ] Review WhatsApp message templates

## Next Steps

1. Apply migration: `npx prisma migrate deploy`
2. Restart server: `npm start`
3. Test with sample customers
4. Monitor worker logs
5. Track acceptance rates
6. Optimize suggestion timing
7. A/B test message templates

## Benefits

### For Customers
- Convenient reordering
- Saves time typing orders
- Remembers preferences
- Personalized experience

### For Business
- Increased repeat orders
- Higher customer retention
- Reduced order friction
- Better engagement metrics
- Predictable revenue

## Support

For issues or questions:
- Check logs: `logs/combined-*.log`
- View frequent buyers: Query `frequent_buyers_summary` view
- Check candidates: Query `quick_reorder_candidates` view
- Review performance: Query `intelligence_performance` view

