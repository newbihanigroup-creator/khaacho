# Error Handling Quick Start

## Response Format

All errors return:

```json
{
  "success": false,
  "error": {
    "message": "User-friendly message",
    "code": "ERROR_CODE"
  }
}
```

**Stack traces are NEVER exposed to clients.**

## Usage

### 1. Wrap Async Handlers

```javascript
const asyncHandler = require('./src/shared/utils/asyncHandler');

router.get('/orders', asyncHandler(async (req, res) => {
  const orders = await orderService.getAll();
  res.json({ success: true, data: orders });
}));
```

### 2. Throw Specific Errors

```javascript
const { 
  ValidationError,    // 400
  NotFoundError,      // 404
  UnauthorizedError,  // 401
  BusinessLogicError, // 422
} = require('./src/shared/errors');

// Validation
if (!email) {
  throw new ValidationError('Email is required');
}

// Not found
if (!order) {
  throw new NotFoundError('Order', id);
}

// Unauthorized
if (!token) {
  throw new UnauthorizedError('Authentication required');
}

// Business logic
if (order.status === 'DELIVERED') {
  throw new BusinessLogicError('Cannot cancel delivered order');
}
```

## Automatic Error Handling

### Prisma Errors

Automatically handled:

| Error | Response |
|-------|----------|
| P2002 (Unique) | 409 - "A record with this value already exists" |
| P2025 (Not found) | 404 - "The requested record was not found" |
| P2003 (Foreign key) | 400 - "Invalid reference to related record" |

### JWT Errors

Automatically handled:

| Error | Response |
|-------|----------|
| JsonWebTokenError | 401 - "Invalid authentication token" |
| TokenExpiredError | 401 - "Authentication token has expired" |

### File Upload Errors

Automatically handled:

| Error | Response |
|-------|----------|
| LIMIT_FILE_SIZE | 400 - "File size exceeds the maximum allowed limit" |
| LIMIT_FILE_COUNT | 400 - "Too many files uploaded" |

## Example Route

```javascript
const asyncHandler = require('./src/shared/utils/asyncHandler');
const { NotFoundError, ValidationError } = require('./src/shared/errors');

router.post('/orders/:id/cancel', asyncHandler(async (req, res) => {
  // Validation
  if (!req.body.reason) {
    throw new ValidationError('Cancellation reason is required');
  }
  
  // Get order (Prisma errors handled automatically)
  const order = await prisma.order.findUnique({
    where: { id: req.params.id }
  });
  
  // Not found
  if (!order) {
    throw new NotFoundError('Order', req.params.id);
  }
  
  // Business logic
  if (order.status === 'DELIVERED') {
    throw new BusinessLogicError('Cannot cancel delivered order');
  }
  
  // Update order
  await orderService.cancel(order.id, req.body.reason);
  
  res.json({
    success: true,
    data: { message: 'Order cancelled successfully' }
  });
}));
```

## Error Codes

| Code | Status | Use Case |
|------|--------|----------|
| VALIDATION_ERROR | 400 | Invalid input |
| UNAUTHORIZED | 401 | Not authenticated |
| FORBIDDEN | 403 | Not authorized |
| NOT_FOUND | 404 | Resource not found |
| DUPLICATE_ENTRY | 409 | Already exists |
| BUSINESS_LOGIC_ERROR | 422 | Business rule violation |
| INTERNAL_ERROR | 500 | Unexpected error |

## Testing

```bash
# Run test suite
node test-error-handling.js

# Test specific endpoint
curl http://localhost:3001/test/app-error
```

## Security

✅ Stack traces logged server-side
✅ Only safe messages sent to clients
✅ No internal details exposed
✅ All errors logged with context

## Migration Checklist

- [ ] Import asyncHandler in routes
- [ ] Wrap all async handlers
- [ ] Replace res.status().json() with throw errors
- [ ] Use specific error types
- [ ] Test error scenarios

## Full Documentation

See `ERROR_HANDLING_GUIDE.md` for complete documentation.
