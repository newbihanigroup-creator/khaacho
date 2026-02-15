# Customer Intelligence - Quick Start Guide

## What It Does

Automatically remembers customer orders and sends "Order same as last week?" messages via WhatsApp.

## Key Features

1. **Remembers Orders** - Tracks every customer's order history
2. **Suggests Repeats** - "Would you like to order the same items again?"
3. **Detects Frequent Buyers** - DAILY, WEEKLY, MONTHLY classification
4. **Quick Reorder** - One-click reorder with YES response

## Quick Example

### Customer Journey

**Day 1**: Customer orders rice, dal, coke
```
Order placed: 5kg rice, 2kg dal, 12 coke
System: ✅ Remembered in customer memory
```

**Day 8**: System sends WhatsApp message
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

**Customer replies**: "YES"
```
System: ✅ Order created automatically
System: Sends confirmation message
```

## API Usage

### Check if customer is ready for reorder

```bash
curl http://localhost:3000/api/v1/customer-intelligence/quick-reorder/RETAILER_ID/check
```

### Send quick reorder suggestion

```bash
curl -X POST http://localhost:3000/api/v1/customer-intelligence/quick-reorder/RETAILER_ID/send \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber": "+919876543210"}'
```

### Get frequent buyers

```bash
curl http://localhost:3000/api/v1/customer-intelligence/frequent-buyers?limit=10
```

## Buyer Classification

- **DAILY**: Orders every 1-2 days → Suggest after 1-2 days
- **WEEKLY**: Orders every 3-10 days → Suggest after 7 days
- **MONTHLY**: Orders every 11-35 days → Suggest after 30 days
- **OCCASIONAL**: Less frequent → No auto-suggestions

## Automatic Worker

Runs every 2 hours:
1. Finds customers ready for reorder
2. Sends WhatsApp suggestions
3. Tracks responses
4. Creates orders for "YES" responses

## Response Handling

System understands:
- **YES/Y/OK/CONFIRM** → Creates order automatically
- **NO/N/NOT NOW** → Marks as rejected
- **MODIFY/CHANGE** → Starts conversation to modify
- **Other** → Marks as ignored

## Metrics Tracked

- Suggestion acceptance rate
- Quick reorder conversion rate
- Customer engagement rate
- Average response time

## Testing

```bash
node test-customer-intelligence.js
```

## Deployment

1. Apply migration: `npx prisma migrate deploy`
2. Restart server: `npm start`
3. Worker starts automatically
4. Monitor logs for suggestions sent

## Integration Points

### With WhatsApp Service

```javascript
// In your WhatsApp message handler
const context = await customerIntelligenceService.getConversationContext(retailerId);

if (context.reorderSuggestionSent) {
  const result = await customerIntelligenceService.handleQuickReorderResponse(
    context.suggestedReorder.id,
    message
  );
  
  if (result.responseType === 'ACCEPTED') {
    await customerIntelligenceService.createOrderFromSuggestion(
      context.suggestedReorder.id
    );
  }
}
```

### With Order Service

```javascript
// After order creation
// Customer memory updates automatically via database trigger
```

## Monitoring

### View frequent buyers
```sql
SELECT * FROM frequent_buyers_summary LIMIT 10;
```

### View reorder candidates
```sql
SELECT * FROM quick_reorder_candidates WHERE ready_for_reorder = true;
```

### View performance
```sql
SELECT * FROM intelligence_performance ORDER BY metric_date DESC LIMIT 7;
```

## Configuration

### Adjust suggestion timing

Edit `src/services/customerIntelligence.service.js`:
```javascript
// Change session timeout (default: 30 minutes)
this.sessionTimeout = 30 * 60 * 1000;
```

Edit worker schedule in `src/workers/customerIntelligence.worker.js`:
```javascript
// Change from every 2 hours to every 4 hours
cron.schedule('0 */4 * * *', async () => {
  await this.sendQuickReorderSuggestions();
});
```

## Success Metrics

Target KPIs:
- **Acceptance Rate**: > 50%
- **Conversion Rate**: > 80%
- **Engagement Rate**: > 70%

## Common Use Cases

### 1. Daily Grocery Store
- Customers order daily
- Suggest same items next day
- High repeat rate

### 2. Weekly Restaurant Supply
- Customers order weekly
- Suggest every 7 days
- Predictable patterns

### 3. Monthly Bulk Orders
- Customers order monthly
- Suggest after 30 days
- Large order values

## Troubleshooting

### Suggestions not sending
- Check worker is running: Worker logs show "Quick reorder suggestion job"
- Verify customer eligibility: Query `quick_reorder_candidates` view
- Check recent suggestions: No duplicate within 7 days

### Orders not creating
- Verify suggestion exists
- Check customer response was "YES"
- Review order service logs

### Low acceptance rate
- Adjust suggestion timing
- Improve message template
- Check customer frequency classification

## Full Documentation

See `CUSTOMER_INTELLIGENCE_COMPLETE.md` for complete details.
