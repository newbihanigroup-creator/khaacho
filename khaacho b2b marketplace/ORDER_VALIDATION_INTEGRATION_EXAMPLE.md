# Order Validation Integration Example

## How to Integrate Order Validation in WhatsApp Order Processing

### Before Integration (Old Code)
```javascript
// ❌ Old way - No validation
async function processWhatsAppOrder(orderData) {
  // Directly create order without checking credit
  const order = await prisma.order.create({
    data: {
      retailerId: orderData.retailerId,
      total: orderData.total,
      // ... other fields
    },
  });
  
  return order;
}
```

### After Integration (New Code)
```javascript
// ✅ New way - With validation
const orderValidationService = require('./src/services/orderValidation.service');
const Decimal = require('decimal.js');

async function processWhatsAppOrder(orderData) {
  // Step 1: Validate credit before creating order
  const validation = await orderValidationService.validateOrderCredit(
    orderData.retailerId,
    new Decimal(orderData.total)
  );

  // Step 2: If validation fails, log rejection and send WhatsApp message
  if (!validation.isValid) {
    // Log rejected order for admin review
    await orderValidationService.logRejectedOrder(orderData, validation);
    
    // Send WhatsApp-safe rejection message
    await sendWhatsAppMessage(
      orderData.phoneNumber,
      validation.whatsappMessage
    );
    
    return {
      success: false,
      rejected: true,
      reason: validation.reason,
      message: validation.whatsappMessage,
    };
  }

  // Step 3: Validation passed - create order in transaction
  const order = await prisma.$transaction(async (tx) => {
    // Create order
    const newOrder = await tx.order.create({
      data: {
        retailerId: orderData.retailerId,
        total: orderData.total,
        // ... other fields
      },
    });

    // Update retailer outstanding debt
    await tx.retailer.update({
      where: { id: orderData.retailerId },
      data: {
        outstandingDebt: {
          increment: new Decimal(orderData.total),
        },
        availableCredit: {
          decrement: new Decimal(orderData.total),
        },
      },
    });

    return newOrder;
  });

  // Send success WhatsApp message
  await sendWhatsAppMessage(
    orderData.phoneNumber,
    `Order ${order.orderNumber} confirmed! Total: Rs.${order.total}`
  );

  return {
    success: true,
    rejected: false,
    order,
  };
}
```

## Complete Integration in Enhanced WhatsApp Controller

```javascript
// src/controllers/enhancedWhatsapp.controller.js

const orderValidationService = require('../services/orderValidation.service');
const Decimal = require('decimal.js');

async function handleIncomingOrder(req, res) {
  try {
    const { from, body } = req.body;

    // Parse order from WhatsApp message
    const orderData = await parseWhatsAppOrder(body, from);

    // CRITICAL: Validate credit before processing
    const validation = await orderValidationService.validateOrderCredit(
      orderData.retailerId,
      new Decimal(orderData.total)
    );

    // Handle rejection
    if (!validation.isValid) {
      // Log for admin review
      await orderValidationService.logRejectedOrder(
        {
          ...orderData,
          whatsappMessageId: req.body.MessageSid,
          phoneNumber: from,
        },
        validation
      );

      // Send rejection message
      await twilioService.sendMessage(
        from,
        validation.whatsappMessage
      );

      return res.status(200).json({
        success: false,
        rejected: true,
        reason: validation.reason,
      });
    }

    // Create order atomically
    const order = await atomicOrderCreationService.createOrder(orderData);

    // Send confirmation
    await twilioService.sendMessage(
      from,
      `✅ Order ${order.orderNumber} confirmed!\n\nTotal: Rs.${order.total}\nAvailable Credit: Rs.${validation.remainingCredit}\n\nThank you for your order!`
    );

    return res.status(200).json({
      success: true,
      order,
    });
  } catch (error) {
    logger.error('Error handling incoming order', { error: error.message });
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}
```

## Integration in Image Upload Order Processing

```javascript
// src/workers/uploadedOrderProcessor.worker.js

const orderValidationService = require('../services/orderValidation.service');
const Decimal = require('decimal.js');

async function processUploadedOrder(uploadedOrderId) {
  const uploadedOrder = await prisma.uploadedOrder.findUnique({
    where: { id: uploadedOrderId },
    include: { retailer: true },
  });

  // Extract order data from image
  const orderData = await extractOrderFromImage(uploadedOrder.imageUrl);

  // CRITICAL: Validate credit
  const validation = await orderValidationService.validateOrderCredit(
    uploadedOrder.retailerId,
    new Decimal(orderData.total)
  );

  // Handle rejection
  if (!validation.isValid) {
    // Log rejection
    await orderValidationService.logRejectedOrder(
      {
        ...orderData,
        retailerId: uploadedOrder.retailerId,
        uploadedOrderId: uploadedOrder.id,
      },
      validation
    );

    // Update uploaded order status
    await prisma.uploadedOrder.update({
      where: { id: uploadedOrderId },
      data: {
        status: 'FAILED',
        errorMessage: validation.message,
      },
    });

    // Notify retailer
    await notifyRetailer(
      uploadedOrder.retailer.user.phoneNumber,
      validation.whatsappMessage
    );

    return;
  }

  // Create order
  const order = await createOrderFromExtractedData(orderData);

  // Update uploaded order
  await prisma.uploadedOrder.update({
    where: { id: uploadedOrderId },
    data: {
      status: 'COMPLETED',
      orderId: order.id,
    },
  });
}
```

## API Endpoints

### 1. Validate Order Credit
```bash
POST /api/v1/order-validation/validate
Content-Type: application/json
Authorization: Bearer <token>

{
  "retailerId": "uuid",
  "orderAmount": "5000.00"
}

# Response (Success)
{
  "success": true,
  "data": {
    "isValid": true,
    "reason": "APPROVED",
    "message": "Order approved",
    "availableCredit": "10000.00",
    "requestedAmount": "5000.00",
    "remainingCredit": "5000.00",
    "canProceed": true
  }
}

# Response (Rejected)
{
  "success": true,
  "data": {
    "isValid": false,
    "reason": "CREDIT_LIMIT_EXCEEDED",
    "message": "Order exceeds available credit limit...",
    "whatsappMessage": "Order exceeds available credit limit. Your available credit is Rs.3000...",
    "availableCredit": "3000.00",
    "requestedAmount": "5000.00",
    "shortfall": "2000.00",
    "canProceed": false
  }
}
```

### 2. Get Rejected Orders
```bash
GET /api/v1/order-validation/rejected?page=1&limit=20&isReviewed=false
Authorization: Bearer <token>

# Response
{
  "success": true,
  "data": {
    "rejectedOrders": [
      {
        "id": "uuid",
        "retailerId": "uuid",
        "rejectionReason": "CREDIT_LIMIT_EXCEEDED",
        "rejectionMessage": "Order exceeds available credit limit...",
        "requestedAmount": "5000.00",
        "availableCredit": "3000.00",
        "shortfall": "2000.00",
        "isReviewed": false,
        "createdAt": "2026-02-14T10:00:00Z",
        "retailer": {
          "shopName": "ABC Store",
          "user": {
            "businessName": "ABC Trading",
            "phoneNumber": "+1234567890"
          }
        }
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 15,
      "totalPages": 1
    }
  }
}
```

### 3. Mark as Reviewed
```bash
PUT /api/v1/order-validation/rejected/:id/review
Content-Type: application/json
Authorization: Bearer <token>

{
  "reviewNotes": "Approved credit limit increase to Rs.20000"
}

# Response
{
  "success": true,
  "message": "Rejected order marked as reviewed",
  "data": {
    "id": "uuid",
    "isReviewed": true,
    "reviewedAt": "2026-02-14T11:00:00Z",
    "reviewedBy": "admin_user_id",
    "reviewNotes": "Approved credit limit increase to Rs.20000"
  }
}
```

### 4. Get Rejection Statistics
```bash
GET /api/v1/order-validation/stats?startDate=2026-02-01&endDate=2026-02-14
Authorization: Bearer <token>

# Response
{
  "success": true,
  "data": {
    "totalRejected": 45,
    "reviewedCount": 30,
    "pendingReview": 15,
    "totalRequestedAmount": "125000.00",
    "totalShortfall": "45000.00",
    "byReason": [
      {
        "reason": "CREDIT_LIMIT_EXCEEDED",
        "count": 35
      },
      {
        "reason": "ACCOUNT_INACTIVE",
        "count": 5
      },
      {
        "reason": "HIGH_RISK_ACCOUNT",
        "count": 5
      }
    ]
  }
}
```

## WhatsApp Message Examples

### Credit Limit Exceeded
```
Order exceeds available credit limit. Your available credit is Rs.3000. Please make a payment or reduce order amount.
```

### Account Inactive
```
Your account is inactive. Please contact admin for assistance.
```

### Account Not Approved
```
Your account is pending approval. Please wait for admin confirmation.
```

### High Risk Account
```
Your account requires admin review. Please contact support for assistance.
```

## Admin Dashboard Integration

```javascript
// Admin dashboard component
async function loadRejectedOrders() {
  const response = await fetch('/api/v1/order-validation/rejected?isReviewed=false');
  const data = await response.json();
  
  // Display rejected orders
  data.data.rejectedOrders.forEach(order => {
    displayRejectedOrder({
      businessName: order.retailer.user.businessName,
      requestedAmount: order.requestedAmount,
      availableCredit: order.availableCredit,
      shortfall: order.shortfall,
      reason: order.rejectionReason,
      createdAt: order.createdAt,
    });
  });
}

async function reviewRejectedOrder(orderId, notes) {
  await fetch(`/api/v1/order-validation/rejected/${orderId}/review`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reviewNotes: notes }),
  });
  
  // Reload list
  await loadRejectedOrders();
}
```

## Testing

Run the test file:
```bash
node test-order-validation.js
```

This will test:
1. ✅ Credit validation within limit
2. ✅ Credit validation exceeding limit
3. ✅ Logging rejected orders
4. ✅ Retrieving rejected orders
5. ✅ Atomic validation and creation
6. ✅ Marking orders as reviewed
7. ✅ WhatsApp-safe messages
