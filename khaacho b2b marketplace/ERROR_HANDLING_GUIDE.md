# Centralized Error Handling System

## Overview

Production-grade centralized error handling system for Express API that catches all errors, logs them securely, and returns safe JSON responses to clients.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Error Flow                                │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  Route Handler                                               │
│       │                                                       │
│       │ (wrapped with asyncHandler)                          │
│       │                                                       │
│       ├─▶ Error Thrown                                       │
│       │                                                       │
│       ├─▶ Error Handler Middleware                           │
│       │   ├─▶ Log full error (with stack trace)             │
│       │   ├─▶ Identify error type                           │
│       │   ├─▶ Map to user-friendly message                  │
│       │   └─▶ Return safe JSON response                     │
│       │                                                       │
│       └─▶ Client receives:                                   │
│           {                                                   │
│             success: false,                                   │
│             error: {                                          │
│               message: "User-friendly message",              │
│               code: "ERROR_CODE"                             │
│             }                                                 │
│           }                                                   │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

## Components

### 1. Error Classes (`src/shared/errors/`)

Base error class and specific error types:

```javascript
const { 
  AppError,           // Base class
  ValidationError,    // 400 - Validation failed
  NotFoundError,      // 404 - Resource not found
  UnauthorizedError,  // 401 - Authentication required
  ForbiddenError,     // 403 - Access forbidden
  ConflictError,      // 409 - Resource conflict
  BusinessLogicError, // 422 - Business rule violation
  DatabaseError,      // 500 - Database error
} = require('./src/shared/errors');
```

### 2. Async Handler (`src/shared/utils/asyncHandler.js`)

Wraps async route handlers to catch errors:

```javascript
const asyncHandler = require('./src/shared/utils/asyncHandler');

router.get('/orders', asyncHandler(async (req, res) => {
  const orders = await orderService.getAll();
  res.json(orders);
}));
```

### 3. Error Handler Middleware (`src/api/middleware/errorHandler.js`)

Centralized error handling middleware that:
- Catches all errors
- Logs full details (including stack traces) to logs
- Returns safe JSON responses
- Never exposes internal details to clients

## Response Format

All error responses follow this format:

```json
{
  "success": false,
  "error": {
    "message": "User-friendly error message",
    "code": "ERROR_CODE"
  }
}
```

**Note**: Stack traces, internal details, and sensitive information are NEVER included in responses.

## Supported Error Types

### 1. Operational Errors (AppError)

Errors that are expected and handled gracefully:

```javascript
// Validation error
throw new ValidationError('Email is required', { field: 'email' });

// Response: 400
{
  "success": false,
  "error": {
    "message": "Email is required",
    "code": "VALIDATION_ERROR"
  }
}
```

```javascript
// Not found error
throw new NotFoundError('Order', '12345');

// Response: 404
{
  "success": false,
  "error": {
    "message": "Order not found: 12345",
    "code": "NOT_FOUND"
  }
}
```

```javascript
// Unauthorized error
throw new UnauthorizedError('Invalid credentials');

// Response: 401
{
  "success": false,
  "error": {
    "message": "Invalid credentials",
    "code": "UNAUTHORIZED"
  }
}
```

### 2. Prisma Errors

Database errors are automatically mapped to user-friendly messages:

| Prisma Code | Status | Message | Code |
|-------------|--------|---------|------|
| P2002 | 409 | A record with this value already exists | DUPLICATE_ENTRY |
| P2025 | 404 | The requested record was not found | NOT_FOUND |
| P2003 | 400 | Invalid reference to related record | INVALID_REFERENCE |
| P2014 | 400 | Invalid relationship between records | INVALID_RELATION |
| P2011 | 400 | Required field is missing | MISSING_FIELD |
| P2000 | 400 | Value is too long for the field | VALUE_TOO_LONG |
| P1001 | 503 | Database connection failed | DATABASE_UNAVAILABLE |
| P1008 | 503 | Database connection timeout | DATABASE_TIMEOUT |

Example:

```javascript
// Prisma throws P2002 (unique constraint violation)
await prisma.user.create({
  data: { email: 'existing@example.com' }
});

// Response: 409
{
  "success": false,
  "error": {
    "message": "A record with this value already exists",
    "code": "DUPLICATE_ENTRY"
  }
}
```

### 3. Validation Errors

Supports express-validator and Joi:

```javascript
// Express-validator
const { validationResult } = require('express-validator');
const errors = validationResult(req);
if (!errors.isEmpty()) {
  throw errors; // Automatically handled
}

// Response: 400
{
  "success": false,
  "error": {
    "message": "Request validation failed",
    "code": "VALIDATION_ERROR"
  }
}
```

### 4. JWT Errors

Authentication token errors:

```javascript
// Invalid token
// Response: 401
{
  "success": false,
  "error": {
    "message": "Invalid authentication token",
    "code": "INVALID_TOKEN"
  }
}

// Expired token
// Response: 401
{
  "success": false,
  "error": {
    "message": "Authentication token has expired",
    "code": "TOKEN_EXPIRED"
  }
}
```

### 5. File Upload Errors (Multer)

File upload errors:

```javascript
// File too large
// Response: 400
{
  "success": false,
  "error": {
    "message": "File size exceeds the maximum allowed limit",
    "code": "FILE_TOO_LARGE"
  }
}
```

### 6. Unknown Errors

Unexpected errors (programming errors):

```javascript
// Any unexpected error
throw new Error('Something went wrong');

// Response: 500
{
  "success": false,
  "error": {
    "message": "An unexpected error occurred",
    "code": "INTERNAL_ERROR"
  }
}
```

**Important**: Stack traces are logged but NEVER sent to clients.

## Usage Examples

### Basic Route with Error Handling

```javascript
const asyncHandler = require('./src/shared/utils/asyncHandler');
const { NotFoundError } = require('./src/shared/errors');

router.get('/orders/:id', asyncHandler(async (req, res) => {
  const order = await orderService.getById(req.params.id);
  
  if (!order) {
    throw new NotFoundError('Order', req.params.id);
  }
  
  res.json({
    success: true,
    data: order,
  });
}));
```

### Validation Example

```javascript
const { ValidationError } = require('./src/shared/errors');

router.post('/orders', asyncHandler(async (req, res) => {
  const { items, deliveryAddress } = req.body;
  
  if (!items || items.length === 0) {
    throw new ValidationError('Order must contain at least one item');
  }
  
  if (!deliveryAddress) {
    throw new ValidationError('Delivery address is required');
  }
  
  const order = await orderService.create(req.body);
  
  res.status(201).json({
    success: true,
    data: order,
  });
}));
```

### Business Logic Error Example

```javascript
const { BusinessLogicError } = require('./src/shared/errors');

router.post('/orders/:id/cancel', asyncHandler(async (req, res) => {
  const order = await orderService.getById(req.params.id);
  
  if (order.status === 'DELIVERED') {
    throw new BusinessLogicError('Cannot cancel a delivered order');
  }
  
  await orderService.cancel(order.id);
  
  res.json({
    success: true,
    data: { message: 'Order cancelled successfully' },
  });
}));
```

### Database Error Example

```javascript
router.post('/users', asyncHandler(async (req, res) => {
  // Prisma will throw P2002 if email already exists
  const user = await prisma.user.create({
    data: req.body,
  });
  
  res.status(201).json({
    success: true,
    data: user,
  });
}));

// Automatically returns:
// 409 Conflict - "A record with this value already exists"
```

## Integration

### Server Setup

The error handler is already integrated in `src/server.js`:

```javascript
const { errorHandler, notFoundHandler } = require('./api/middleware/errorHandler');

// ... routes ...

// 404 handler (must be after all routes)
app.use(notFoundHandler);

// Error handler (must be last)
app.use(errorHandler);
```

### Route Setup

All routes should use `asyncHandler`:

```javascript
const asyncHandler = require('./src/shared/utils/asyncHandler');

// Wrap all async route handlers
router.get('/resource', asyncHandler(async (req, res) => {
  // Your code here
}));

router.post('/resource', asyncHandler(async (req, res) => {
  // Your code here
}));
```

## Logging

All errors are logged with full details:

```javascript
logger.error('Error occurred', {
  error: err.message,
  stack: err.stack,        // Full stack trace
  code: err.code,
  name: err.name,
  path: req.path,
  method: req.method,
  body: req.body,
  query: req.query,
  params: req.params,
  userId: req.user?.id,
  ip: req.ip,
  userAgent: req.get('user-agent'),
});
```

Logs are written to:
- `logs/error-YYYY-MM-DD.log` - Error logs
- `logs/combined-YYYY-MM-DD.log` - All logs

## Security

### What's Logged (Server-Side Only)

✅ Full error messages
✅ Stack traces
✅ Request details
✅ User information
✅ Internal error codes

### What's Sent to Clients

✅ User-friendly messages
✅ Error codes
❌ Stack traces
❌ Internal details
❌ Database structure
❌ File paths
❌ Environment variables

## Testing

### Run Test Suite

```bash
node test-error-handling.js
```

### Manual Testing

```bash
# Start test server
node test-error-handling.js

# In another terminal, test endpoints:
curl http://localhost:3001/test/app-error
curl http://localhost:3001/test/prisma-error
curl http://localhost:3001/test/unexpected-error
```

### Expected Test Results

All tests should pass:
- ✅ Correct status codes
- ✅ Correct error codes
- ✅ User-friendly messages
- ✅ No stack traces exposed
- ✅ Async errors caught

## Best Practices

### DO ✅

- Always use `asyncHandler` for async routes
- Throw specific error types (ValidationError, NotFoundError, etc.)
- Include helpful error messages
- Log errors with context
- Test error scenarios

### DON'T ❌

- Don't expose stack traces to clients
- Don't send internal error details
- Don't forget to wrap async handlers
- Don't use generic Error() for operational errors
- Don't ignore error logging

## Error Codes Reference

| Code | Status | Description |
|------|--------|-------------|
| VALIDATION_ERROR | 400 | Request validation failed |
| MISSING_FIELD | 400 | Required field is missing |
| INVALID_REFERENCE | 400 | Invalid reference to related record |
| INVALID_RELATION | 400 | Invalid relationship between records |
| VALUE_TOO_LONG | 400 | Value exceeds maximum length |
| FILE_TOO_LARGE | 400 | File size exceeds limit |
| TOO_MANY_FILES | 400 | Too many files uploaded |
| INVALID_JSON | 400 | Malformed JSON in request |
| UNAUTHORIZED | 401 | Authentication required |
| INVALID_TOKEN | 401 | Invalid authentication token |
| TOKEN_EXPIRED | 401 | Authentication token expired |
| FORBIDDEN | 403 | Access forbidden |
| NOT_FOUND | 404 | Resource not found |
| ROUTE_NOT_FOUND | 404 | API route not found |
| DUPLICATE_ENTRY | 409 | Record already exists |
| CONFLICT | 409 | Resource conflict |
| BUSINESS_LOGIC_ERROR | 422 | Business rule violation |
| INTERNAL_ERROR | 500 | Unexpected server error |
| DATABASE_ERROR | 500 | Database error |
| DATABASE_UNAVAILABLE | 503 | Database connection failed |
| DATABASE_TIMEOUT | 503 | Database connection timeout |

## Troubleshooting

### Errors Not Being Caught

**Problem**: Errors are not being caught by error handler

**Solution**: Ensure route handlers are wrapped with `asyncHandler`:

```javascript
// ❌ Wrong
router.get('/orders', async (req, res) => {
  // Errors won't be caught
});

// ✅ Correct
router.get('/orders', asyncHandler(async (req, res) => {
  // Errors will be caught
}));
```

### Stack Traces Exposed

**Problem**: Stack traces are visible in API responses

**Solution**: This should never happen. If it does:
1. Check NODE_ENV is set correctly
2. Verify error handler is last middleware
3. Check error handler code hasn't been modified

### Errors Not Logged

**Problem**: Errors are not appearing in logs

**Solution**: 
1. Check logger configuration
2. Verify logs directory exists
3. Check file permissions

## Migration Guide

### Updating Existing Routes

1. Import asyncHandler:
```javascript
const asyncHandler = require('./src/shared/utils/asyncHandler');
```

2. Wrap async handlers:
```javascript
// Before
router.get('/orders', async (req, res) => {
  const orders = await orderService.getAll();
  res.json(orders);
});

// After
router.get('/orders', asyncHandler(async (req, res) => {
  const orders = await orderService.getAll();
  res.json(orders);
}));
```

3. Use specific error types:
```javascript
// Before
if (!order) {
  return res.status(404).json({ error: 'Order not found' });
}

// After
if (!order) {
  throw new NotFoundError('Order', req.params.id);
}
```

## Summary

The centralized error handling system provides:

✅ Consistent error responses
✅ Secure error logging
✅ No stack trace exposure
✅ Automatic Prisma error handling
✅ Validation error support
✅ JWT error handling
✅ File upload error handling
✅ Async error catching
✅ Production-ready security

All errors are logged with full details server-side, but only safe, user-friendly messages are sent to clients.
