# Order Validation - Quick Start Guide

## 🚀 Get Started in 5 Minutes

### Step 1: Run Database Migration
```bash
# Apply the migration
npx prisma migrate deploy

# Generate Prisma client
npx prisma generate
```

### Step 2: Add Routes to Main Router
Edit `src/routes/index.js`:
```javascript
const orderValidationRoutes = require('./orderValidation.routes');

// Add this line with other routes
router.use('/order-validation', orderValidationRoutes);
```

### Step 3: Use in Your Code

#### Basic Validation
```javascript
const orderValidationService = require('./src/services/orderValidation.service');
const Decimal = require('decimal.js');

// Validate before creating order
const validation = await orderValidationService.validateOrderCredit(
  retailerId,
  new Decimal(orderAmount)
);

if (!validation.isValid) {
  // Send rejection message
  await sendWhatsAppMessage(
    phoneNumber,
    validation.whatsappMessage
  );
  return;
}

// Create order
await createOrder(orderData);
```

#### Complete Integration
```javascript
async function processOrder(orderData) {
  // Validate and create atomically
  const result = await orderValidationService.validateAndCreateOrder(orderData);

  if (result.rejected) {
    // Order was rejected and logged
    await sendWhatsAppMessage(
      orderData.phoneNumber,
      result.validation.whatsappMessage
    );
    return { success: false };
  }

  // Validation passed - create order
  const order = await createOrder(orderData);
  return { success: true, order };
}
```

### Step 4: Test It
```bash
# Run test suite
node test-order-validation.js
```

### Step 5: View Rejected Orders
```bash
# Get rejected orders via API
curl http://localhost:3000/api/v1/order-validation/rejected \
  -H "Authorization: Bearer <token>"

# Or query database directly
psql $DATABASE_URL -c "SELECT * FROM rejected_orders WHERE is_reviewed = false;"
```

## 📋 Common Use Cases

### 1. WhatsApp Order Processing
```javascript
// In your WhatsApp webhook handler
const validation = await orderValidationService.validateOrderCredit(
  retailerId,
  new Decimal(total)
);

if (!validation.isValid) {
  await orderValidationService.logRejectedOrder(orderData, validation);
  await twilioService.sendMessage(from, validation.whatsappMessage);
  return;
}
```

### 2. Image Upload Order Processing
```javascript
// In your image processor
const validation = await orderValidationService.validateOrderCredit(
  retailerId,
  new Decimal(extractedTotal)
);

if (!validation.isValid) {
  await orderValidationService.logRejectedOrder(orderData, validation);
  await updateUploadStatus('FAILED', validation.message);
  return;
}
```

### 3. Admin Review Dashboard
```javascript
// Get pending reviews
const { rejectedOrders } = await orderValidationService.getRejectedOrders(
  { isReviewed: false },
  1,
  20
);

// Mark as reviewed
await orderValidationService.markAsReviewed(
  orderId,
  adminUserId,
  'Approved credit increase'
);
```

## 🔍 Validation Results

### Approved Order
```javascript
{
  isValid: true,
  reason: 'APPROVED',
  message: 'Order approved',
  availableCredit: '10000.00',
  requestedAmount: '5000.00',
  remainingCredit: '5000.00'
}
```

### Rejected Order
```javascript
{
  isValid: false,
  reason: 'CREDIT_LIMIT_EXCEEDED',
  message: 'Order exceeds available credit limit...',
  whatsappMessage: 'Order exceeds available credit limit. Your available credit is Rs.3000...',
  availableCredit: '3000.00',
  requestedAmount: '5000.00',
  shortfall: '2000.00'
}
```

## 📱 WhatsApp Messages

The service provides ready-to-send WhatsApp messages:

```javascript
// Credit limit exceeded
"Order exceeds available credit limit. Your available credit is Rs.3000. Please make a payment or reduce order amount."

// Account inactive
"Your account is inactive. Please contact admin for assistance."

// Account not approved
"Your account is pending approval. Please wait for admin confirmation."

// High risk
"Your account requires admin review. Please contact support for assistance."
```

## 🎯 Key Features

✅ Atomic transactions - No race conditions
✅ Credit limit validation - Real-time checks
✅ Rejected order logging - Full audit trail
✅ WhatsApp-safe messages - Clear, actionable
✅ Admin review system - Track and manage rejections
✅ Performance optimized - Fast validation
✅ Production ready - Error handling, logging

## 📊 Monitor Rejections

```javascript
// Get statistics
const stats = await fetch('/api/v1/order-validation/stats');

console.log(`Total Rejected: ${stats.totalRejected}`);
console.log(`Pending Review: ${stats.pendingReview}`);
console.log(`By Reason:`, stats.byReason);
```

## 🔧 Troubleshooting

### Validation always fails?
Check retailer credit:
```javascript
const retailer = await prisma.retailer.findUnique({
  where: { id: retailerId },
  select: { creditLimit, outstandingDebt, availableCredit }
});
console.log(retailer);
```

### Rejected orders not logging?
Check database:
```bash
psql $DATABASE_URL -c "SELECT COUNT(*) FROM rejected_orders;"
```

### WhatsApp messages not sending?
Check Twilio config:
```javascript
console.log('TWILIO_ACCOUNT_SID:', process.env.TWILIO_ACCOUNT_SID);
```

## 📚 Full Documentation

See `ORDER_VALIDATION_IMPLEMENTATION_COMPLETE.md` for:
- Complete API reference
- Integration examples
- Security considerations
- Performance optimization
- Monitoring & alerts

## ✅ You're Ready!

Start validating orders with credit limit checks now!
