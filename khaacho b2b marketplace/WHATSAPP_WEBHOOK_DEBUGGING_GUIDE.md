# WhatsApp Webhook Debugging Guide

## Overview

This guide explains the structured logging added to the Twilio WhatsApp webhook to help debug why messages are being processed incorrectly.

## Logging Structure

All logs follow this format:
```
[EMOJI] [CATEGORY] Description: { structured data }
```

### Log Categories

- `[WEBHOOK]` - Main webhook processing flow
- `[PARSER]` - Order message parsing
- `[USER_CHECK]` - User lookup and validation
- `[VENDOR_RESPONSE_CHECK]` - Vendor action parsing
- `[CONFIRMATION_CHECK]` - Retailer confirmation parsing
- `[ORDER_PARSE]` - Order data extraction
- `[VENDOR_AVAILABILITY]` - Vendor stock checking
- `[USER_LOOKUP]` - Database user queries
- `[CREDIT_STATUS_CHECK]` - Credit limit validation
- `[DEFAULT_FALLBACK]` - Fallback message trigger

## Processing Flow with Logs

### Step 1: Message Received

```javascript
📨 [WEBHOOK] Incoming WhatsApp Message: {
  "step": "MESSAGE_RECEIVED",
  "phoneNumber": "+1234567890",
  "messageBody": "10kg rice",
  "messageLength": 9,
  "hasMedia": false,
  "timestamp": "2026-02-13T..."
}
```

**What to check:**
- Is `phoneNumber` correct?
- Is `messageBody` what you sent?
- Is `messageLength` > 0?

### Step 2: Help Command Check

```javascript
🔍 [WEBHOOK] Checking message type: {
  "step": "MESSAGE_TYPE_CHECK",
  "isHelpCommand": false,
  "trimmedBody": "10kg rice"
}
```

**What to check:**
- If `isHelpCommand: true`, webhook stops here and sends help message
- If `false`, processing continues

### Step 3: Vendor Response Check

```javascript
🔍 [WEBHOOK] Checking vendor response: {
  "step": "VENDOR_RESPONSE_CHECK",
  "isVendorResponse": false,
  "action": undefined
}
```

**What to check:**
- If `isVendorResponse: true`, message is treated as vendor action (ACCEPT/DECLINE)
- If `false`, processing continues

### Step 4: Retailer Confirmation Check

```javascript
🔍 [WEBHOOK] Checking retailer confirmation: {
  "step": "CONFIRMATION_CHECK",
  "isConfirmationResponse": false,
  "action": undefined
}
```

**What to check:**
- If `isConfirmationResponse: true`, message is treated as confirmation (CONFIRM/ISSUE/YES)
- If `false`, processing continues

### Step 5: Order Parsing (CRITICAL)

```javascript
🔍 [PARSER] Starting order message parsing: {
  "function": "parseOrderMessage",
  "message": "10kg rice",
  "messageType": "string",
  "messageLength": 9
}

🔍 [PARSER] Trimmed message: {
  "original": "10kg rice",
  "trimmed": "10kg rice",
  "length": 9
}

🔍 [PARSER] Regex match result: {
  "pattern": "/^(\\d+(?:\\.\\d+)?)\\s*([a-zA-Z]*)\\s*([a-zA-Z\\s]+)$/",
  "matched": true,
  "matchGroups": {
    "full": "10kg rice",
    "quantity": "10",
    "unit": "kg",
    "productName": "rice"
  }
}

✅ [PARSER] Order components extracted: {
  "quantity": 10,
  "unit": "kg",
  "productName": "rice",
  "isValidQuantity": true,
  "isValidProductName": true
}

✅ [PARSER] Valid order parsed: {
  "isOrder": true,
  "quantity": 10,
  "unit": "kg",
  "productName": "rice",
  "originalMessage": "10kg rice"
}
```

**What to check:**
- Is `matched: true`? If `false`, message doesn't match order pattern
- Are `matchGroups` correct?
- Is `isOrder: true`? If `false`, order parsing failed

**Common parsing failures:**
```javascript
❌ [PARSER] Message does not match order pattern: {
  "trimmedMessage": "hello",
  "pattern": "/^(\\d+(?:\\.\\d+)?)\\s*([a-zA-Z]*)\\s*([a-zA-Z\\s]+)$/",
  "examples": ["10kg rice", "5 coke", "2 oil"]
}
```

### Step 6: Order Processing

```javascript
🔍 [WEBHOOK] Order parsing result: {
  "step": "ORDER_PARSE",
  "isOrder": true,
  "quantity": 10,
  "unit": "kg",
  "productName": "rice",
  "originalMessage": "10kg rice"
}

📦 [WEBHOOK] Valid order detected - processing order

🏪 [WEBHOOK] Vendor availability check: {
  "step": "VENDOR_AVAILABILITY",
  "productName": "rice",
  "quantity": 10,
  "availableVendorsCount": 3
}

✅ [WEBHOOK] Vendors available - proceeding with order creation
```

**What to check:**
- If `isOrder: false`, webhook skips to Step 7
- If `availableVendorsCount: 0`, alternative products are suggested
- If vendors available, order is created

### Step 7: New User Check

```javascript
🔍 [WEBHOOK] Not an order - checking if new user

🔍 [USER_CHECK] Checking if user is new: {
  "function": "isNewUser",
  "phoneNumber": "+1234567890"
}

👤 [USER_CHECK] User lookup result: {
  "phoneNumber": "+1234567890",
  "userFound": true,
  "userId": "uuid-123",
  "role": "RETAILER",
  "hasRetailerProfile": true,
  "retailerId": "uuid-456"
}

📊 [USER_CHECK] Order count check: {
  "phoneNumber": "+1234567890",
  "userId": "uuid-123",
  "retailerId": "uuid-456",
  "orderCount": 5,
  "isNewUser": false
}

👤 [WEBHOOK] User status check: {
  "step": "USER_STATUS_CHECK",
  "phoneNumber": "+1234567890",
  "isNewUser": false
}
```

**What to check:**
- If `userFound: false`, user doesn't exist in database → welcome message
- If `isNewUser: true`, user has no orders → welcome message
- If `isNewUser: false`, processing continues to Step 8

### Step 8: Credit Status Check

```javascript
🔍 [WEBHOOK] Existing user - checking credit status

👤 [WEBHOOK] User lookup result: {
  "step": "USER_LOOKUP",
  "phoneNumber": "+1234567890",
  "userFound": true,
  "userId": "uuid-123",
  "role": "RETAILER",
  "hasRetailerProfile": true,
  "retailerId": "uuid-456"
}

💳 [WEBHOOK] Credit status check: {
  "step": "CREDIT_STATUS_CHECK",
  "retailerId": "uuid-456",
  "isBlocked": false,
  "creditUtilization": "45.5",
  "creditAvailable": "54500"
}
```

**What to check:**
- If `isBlocked: true`, blocked message is sent
- If `creditUtilization >= 90`, warning message is sent
- If both `false`, processing continues to Step 9

### Step 9: Default Fallback (WHY HELP MESSAGE IS SENT)

```javascript
💬 [WEBHOOK] Sending default help message (fallback): {
  "step": "DEFAULT_FALLBACK",
  "reason": "No specific condition matched",
  "phoneNumber": "+1234567890",
  "messageBody": "hello"
}
```

**This is the problem!** The webhook reaches this point when:
1. Message is not "help"
2. Message is not a vendor response (ACCEPT/DECLINE)
3. Message is not a retailer confirmation (CONFIRM/ISSUE/YES)
4. **Message does not match order pattern** ← Most common reason
5. User is not new
6. User is not blocked
7. Credit utilization is < 90%

## Common Issues and Solutions

### Issue 1: Order Not Recognized

**Symptoms:**
```javascript
❌ [PARSER] Message does not match order pattern
💬 [WEBHOOK] Sending default help message (fallback)
```

**Cause:** Message doesn't match regex pattern `/^(\d+(?:\.\d+)?)\s*([a-zA-Z]*)\s*([a-zA-Z\s]+)$/`

**Valid formats:**
- `10kg rice` ✅
- `5 coke` ✅
- `2 oil` ✅
- `1.5kg sugar` ✅

**Invalid formats:**
- `rice 10kg` ❌ (quantity must be first)
- `I want 10kg rice` ❌ (extra words)
- `10` ❌ (no product name)
- `rice` ❌ (no quantity)

**Solution:** Update regex pattern or educate users on correct format

### Issue 2: User Not Found

**Symptoms:**
```javascript
👤 [USER_CHECK] User lookup result: {
  "userFound": false
}
👋 [WEBHOOK] New user detected - sending welcome message
```

**Cause:** Phone number not in database

**Solution:**
1. Check phone number format in database
2. Ensure user registration completed
3. Verify phone number matches exactly (including country code)

### Issue 3: Always Treated as New User

**Symptoms:**
```javascript
📊 [USER_CHECK] Order count check: {
  "orderCount": 0,
  "isNewUser": true
}
```

**Cause:** User has no orders in database

**Solution:**
1. Check if orders are being created successfully
2. Verify `retailerId` is correct
3. Check if orders are in different status

### Issue 4: Vendor Inventory Service Missing

**Symptoms:**
```javascript
❌ [WEBHOOK] Fatal error processing message: {
  "error": "vendorInventoryService is not defined"
}
```

**Cause:** Missing import at top of file

**Solution:** Add to `src/services/twilio.service.js`:
```javascript
const vendorInventoryService = require('./vendorInventory.service');
```

## Viewing Logs in Production

### Render Logs

1. Go to Render Dashboard
2. Select your service (khaacho-api)
3. Click "Logs" tab
4. Filter by:
   - `[WEBHOOK]` - Main flow
   - `[PARSER]` - Order parsing
   - `[USER_CHECK]` - User lookup

### Log Levels

- `console.log()` - Structured debug logs (always visible)
- `logger.info()` - Info level (production)
- `logger.error()` - Error level (always visible)

### Example Log Search

Search for specific phone number:
```
grep "+1234567890" logs/combined-*.log
```

Search for parsing failures:
```
grep "does not match order pattern" logs/combined-*.log
```

Search for fallback triggers:
```
grep "DEFAULT_FALLBACK" logs/combined-*.log
```

## Testing Locally

### 1. Test Order Parsing

```javascript
// In Node.js REPL or test file
const twilioService = require('./src/services/twilio.service');

// Test valid orders
console.log(twilioService.parseOrderMessage('10kg rice'));
console.log(twilioService.parseOrderMessage('5 coke'));
console.log(twilioService.parseOrderMessage('2 oil'));

// Test invalid orders
console.log(twilioService.parseOrderMessage('hello'));
console.log(twilioService.parseOrderMessage('rice 10kg'));
```

### 2. Test Webhook Locally

```bash
# Use ngrok to expose local server
ngrok http 3000

# Update Twilio webhook URL to ngrok URL
# Send test message from WhatsApp
# Watch console logs
```

### 3. Simulate Webhook Request

```bash
curl -X POST http://localhost:3000/api/whatsapp/twilio/webhook \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "From=whatsapp:+1234567890" \
  -d "Body=10kg rice"
```

## Debugging Checklist

When default help message is sent, check logs for:

- [ ] Step 1: Message received correctly?
- [ ] Step 2: Not treated as help command?
- [ ] Step 3: Not treated as vendor response?
- [ ] Step 4: Not treated as retailer confirmation?
- [ ] Step 5: Order parsing - `isOrder: true`?
- [ ] Step 6: If order, vendors available?
- [ ] Step 7: User found in database?
- [ ] Step 8: User not blocked?
- [ ] Step 9: Credit utilization < 90%?

If all checks pass but still getting default message, check:
- [ ] Is `vendorInventoryService` imported?
- [ ] Is database connection working?
- [ ] Are there any errors in logs?

## Quick Fixes

### Fix 1: Update Order Pattern

If orders aren't being recognized, update regex in `parseOrderMessage`:

```javascript
// Current pattern (strict)
const orderPattern = /^(\d+(?:\.\d+)?)\s*([a-zA-Z]*)\s*([a-zA-Z\s]+)$/;

// More flexible pattern (allows extra words)
const orderPattern = /(\d+(?:\.\d+)?)\s*([a-zA-Z]*)\s*([a-zA-Z\s]+)/;
```

### Fix 2: Add Missing Import

Add to top of `src/services/twilio.service.js`:

```javascript
const vendorInventoryService = require('./vendorInventory.service');
```

### Fix 3: Skip Credit Check

If credit check is causing issues, wrap in try-catch (already done):

```javascript
try {
  const creditStatus = await creditControlService.getRetailerCreditStatus(...);
  // ... credit checks
} catch (creditError) {
  console.error('Credit check failed - continuing anyway');
  // Continue with normal flow
}
```

## Summary

The structured logging now shows:
1. ✅ Incoming message body
2. ✅ Parsed order result (quantity, unit, product)
3. ✅ Whether user is found in DB
4. ✅ Which branch of logic executes
5. ✅ Why fallback message is triggered

**Most common reason for default help message:**
- Message doesn't match order pattern in Step 5

**Check logs for:**
```
❌ [PARSER] Message does not match order pattern
```

This tells you exactly why the order wasn't recognized!
