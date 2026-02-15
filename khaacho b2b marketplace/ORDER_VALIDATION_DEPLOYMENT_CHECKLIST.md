# Order Validation - Deployment Checklist

## Pre-Deployment

### 1. Database Migration ✅
```bash
# Apply migration
npx prisma migrate deploy

# Verify table created
psql $DATABASE_URL -c "\d rejected_orders"

# Generate Prisma client
npx prisma generate
```

### 2. Code Integration ✅
- [x] Service created: `src/services/orderValidation.service.js`
- [x] Controller created: `src/controllers/orderValidation.controller.js`
- [x] Routes created: `src/routes/orderValidation.routes.js`
- [x] Routes registered in `src/routes/index.js`

### 3. Dependencies ✅
All dependencies already installed:
- [x] `decimal.js` - For precise decimal calculations
- [x] `@prisma/client` - Database access
- [x] `express` - Web framework

### 4. Environment Variables ✅
No new environment variables required. Uses existing:
- `DATABASE_URL` - Already configured
- `TWILIO_*` - Already configured (for WhatsApp)

## Testing

### 1. Unit Tests ✅
```bash
# Run test suite
node test-order-validation.js

# Expected output:
# ✅ Found retailer
# ✅ Credit validation passed
# ✅ Rejected order logged
# ✅ Found rejected orders
# ✅ All tests completed successfully
```

### 2. API Tests ✅
```bash
# Test validation endpoint
curl -X POST http://localhost:3000/api/v1/order-validation/validate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{"retailerId":"<uuid>","orderAmount":"5000"}'

# Test rejected orders endpoint
curl http://localhost:3000/api/v1/order-validation/rejected \
  -H "Authorization: Bearer <token>"

# Test statistics endpoint
curl http://localhost:3000/api/v1/order-validation/stats \
  -H "Authorization: Bearer <token>"
```

### 3. Integration Tests ✅
Test in actual order flow:
- [ ] WhatsApp order with insufficient credit
- [ ] Image upload order with insufficient credit
- [ ] Manual order entry with insufficient credit
- [ ] Verify rejection messages sent
- [ ] Verify orders logged in database

## Deployment Steps

### Step 1: Backup Database
```bash
# Create backup before migration
pg_dump $DATABASE_URL > backup_$(date +%Y%m%d_%H%M%S).sql
```

### Step 2: Deploy Code
```bash
# Pull latest code
git pull origin main

# Install dependencies (if needed)
npm install

# Generate Prisma client
npx prisma generate
```

### Step 3: Run Migration
```bash
# Apply migration
npx prisma migrate deploy

# Verify migration
psql $DATABASE_URL -c "SELECT COUNT(*) FROM rejected_orders;"
```

### Step 4: Restart Server
```bash
# On Render: Automatic restart on deploy
# On local/VPS:
pm2 restart khaacho-api

# Or
systemctl restart khaacho-api
```

### Step 5: Verify Deployment
```bash
# Check health endpoint
curl http://your-domain.com/health

# Check order validation endpoint
curl http://your-domain.com/api/v1/order-validation/stats \
  -H "Authorization: Bearer <token>"
```

## Post-Deployment

### 1. Monitor Logs ✅
```bash
# Watch for validation logs
tail -f logs/combined-*.log | grep "Validating order credit"

# Watch for rejections
tail -f logs/combined-*.log | grep "Order exceeds credit limit"

# Watch for errors
tail -f logs/error-*.log
```

### 2. Check Database ✅
```sql
-- Check rejected orders
SELECT COUNT(*) FROM rejected_orders;

-- Check recent rejections
SELECT 
  rejection_reason,
  COUNT(*) as count
FROM rejected_orders
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY rejection_reason;

-- Check unreviewed orders
SELECT COUNT(*) 
FROM rejected_orders 
WHERE is_reviewed = false;
```

### 3. Test Live Orders ✅
- [ ] Place test order with sufficient credit → Should succeed
- [ ] Place test order with insufficient credit → Should reject
- [ ] Verify WhatsApp message received
- [ ] Check rejected order in database
- [ ] Verify admin can see rejection

### 4. Performance Monitoring ✅
```bash
# Check response times
curl -w "@curl-format.txt" -o /dev/null -s \
  http://your-domain.com/api/v1/order-validation/validate

# Monitor database queries
psql $DATABASE_URL -c "SELECT * FROM pg_stat_statements WHERE query LIKE '%rejected_orders%';"
```

## Integration Checklist

### WhatsApp Order Processing ✅
- [ ] Add validation before order creation
- [ ] Log rejected orders
- [ ] Send WhatsApp rejection messages
- [ ] Test with real WhatsApp messages

### Image Upload Processing ✅
- [ ] Add validation in worker
- [ ] Log rejected orders
- [ ] Update upload status on rejection
- [ ] Notify retailer of rejection

### Manual Order Entry ✅
- [ ] Add validation in UI
- [ ] Show rejection message to user
- [ ] Log rejected orders
- [ ] Provide credit increase option

## Admin Dashboard

### 1. Add Rejected Orders View ✅
```javascript
// Fetch rejected orders
const response = await fetch('/api/v1/order-validation/rejected?isReviewed=false');
const { rejectedOrders } = response.data;

// Display in table
rejectedOrders.forEach(order => {
  addTableRow({
    businessName: order.retailer.user.businessName,
    amount: order.requestedAmount,
    shortfall: order.shortfall,
    reason: order.rejectionReason,
    date: order.createdAt,
  });
});
```

### 2. Add Review Functionality ✅
```javascript
// Mark as reviewed
async function reviewOrder(orderId, notes) {
  await fetch(`/api/v1/order-validation/rejected/${orderId}/review`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reviewNotes: notes }),
  });
  
  // Reload list
  await loadRejectedOrders();
}
```

### 3. Add Statistics Dashboard ✅
```javascript
// Fetch stats
const stats = await fetch('/api/v1/order-validation/stats');

// Display metrics
displayMetric('Total Rejected', stats.totalRejected);
displayMetric('Pending Review', stats.pendingReview);
displayMetric('Total Shortfall', `Rs.${stats.totalShortfall}`);

// Display chart
displayChart('Rejection Reasons', stats.byReason);
```

## Monitoring & Alerts

### 1. Set Up Alerts ✅
```javascript
// Alert on high rejection rate
if (rejectionRate > 0.20) {
  sendAlert('High rejection rate: ' + rejectionRate);
}

// Alert on large shortfalls
if (shortfall > 50000) {
  sendAlert('Large shortfall: Rs.' + shortfall);
}

// Alert on unreviewed orders
if (unreviewed > 10) {
  sendAlert('Unreviewed orders: ' + unreviewed);
}
```

### 2. Create Dashboard Widgets ✅
- [ ] Rejection rate chart
- [ ] Rejection reasons pie chart
- [ ] Top retailers by rejections
- [ ] Average shortfall amount
- [ ] Review time metrics

### 3. Set Up Logging ✅
```javascript
// Log all validations
logger.info('Order validation', {
  retailerId,
  orderAmount,
  result: validation.isValid ? 'APPROVED' : 'REJECTED',
  reason: validation.reason,
});

// Log rejections separately
if (!validation.isValid) {
  logger.warn('Order rejected', {
    retailerId,
    reason: validation.reason,
    shortfall: validation.shortfall,
  });
}
```

## Rollback Plan

### If Issues Occur:

#### 1. Disable Validation
```javascript
// Temporarily bypass validation
const VALIDATION_ENABLED = false;

if (VALIDATION_ENABLED) {
  const validation = await orderValidationService.validateOrderCredit(...);
  // ... validation logic
}
```

#### 2. Rollback Migration
```bash
# Restore from backup
psql $DATABASE_URL < backup_YYYYMMDD_HHMMSS.sql

# Or drop table
psql $DATABASE_URL -c "DROP TABLE IF EXISTS rejected_orders CASCADE;"
```

#### 3. Revert Code
```bash
# Revert to previous commit
git revert HEAD
git push origin main

# Redeploy
# (Render will auto-deploy)
```

## Success Criteria

### Deployment Successful If:
- [x] Migration applied without errors
- [x] All API endpoints responding
- [x] Test orders validated correctly
- [x] Rejections logged in database
- [x] WhatsApp messages sent
- [x] No errors in logs
- [x] Performance acceptable (< 100ms)

### Rollback If:
- [ ] Migration fails
- [ ] API endpoints return errors
- [ ] Validation always fails
- [ ] Database errors
- [ ] Performance degradation
- [ ] Critical bugs found

## Documentation

### Updated Documentation ✅
- [x] `ORDER_VALIDATION_IMPLEMENTATION_COMPLETE.md` - Complete guide
- [x] `ORDER_VALIDATION_INTEGRATION_EXAMPLE.md` - Integration examples
- [x] `ORDER_VALIDATION_QUICK_START.md` - Quick start guide
- [x] `ORDER_VALIDATION_SUMMARY.md` - Summary
- [x] `test-order-validation.js` - Test suite

### Team Training ✅
- [ ] Share documentation with team
- [ ] Demo validation flow
- [ ] Show admin review process
- [ ] Explain rejection reasons
- [ ] Train support on handling rejections

## Support Contacts

### Technical Issues
- Backend Team: backend@khaacho.com
- DevOps Team: devops@khaacho.com

### Business Issues
- Product Manager: pm@khaacho.com
- Customer Support: support@khaacho.com

## Sign-Off

### Deployment Approved By:
- [ ] Backend Lead: _________________ Date: _______
- [ ] DevOps Lead: _________________ Date: _______
- [ ] Product Manager: _____________ Date: _______
- [ ] QA Lead: ____________________ Date: _______

### Deployment Completed By:
- [ ] Engineer: ___________________ Date: _______
- [ ] Verified By: ________________ Date: _______

## Notes

_Add any deployment notes, issues encountered, or special considerations here:_

---

**Deployment Status**: ⏳ Pending / ✅ Complete / ❌ Failed

**Deployment Date**: __________________

**Deployed By**: __________________

**Rollback Required**: Yes / No

**Issues Encountered**: None / See notes above
