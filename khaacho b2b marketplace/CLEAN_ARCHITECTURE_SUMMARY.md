# 🏗️ Clean Architecture Implementation

## Overview

Your backend has been refactored into a clean, modular architecture with clear separation of concerns.

## Architecture Layers

```
┌─────────────────────────────────────────────────────────┐
│                    API LAYER (HTTP)                     │
│  Controllers → Routes → Middleware                      │
│  • Handle requests/responses only                       │
│  • No business logic                                    │
│  • No database queries                                  │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│              BUSINESS LOGIC LAYER (Core)                │
│  Services → Repositories                                │
│  • Business rules and validation                        │
│  • Authorization checks                                 │
│  • Orchestrate operations                               │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│           INFRASTRUCTURE LAYER (External)               │
│  Database → External Services → Queue                   │
│  • Prisma queries                                       │
│  • Third-party APIs                                     │
│  • Background jobs                                      │
└─────────────────────────────────────────────────────────┘
```

## New Folder Structure

```
src/
├── api/                              # HTTP Layer
│   ├── controllers/                  # Request/Response handlers
│   │   ├── OrderController.js        ✅ Example: Refactored
│   │   ├── AuthController.js
│   │   ├── ProductController.js
│   │   └── ...
│   ├── routes/                       # Route definitions
│   │   ├── order.routes.js           ✅ Example: Refactored
│   │   ├── auth.routes.js
│   │   └── index.js
│   └── middleware/                   # Express middleware
│       ├── auth.js
│       ├── errorHandler.js           ✅ New: Centralized
│       └── validators/
│           └── orderValidator.js
│
├── core/                             # Business Logic Layer
│   ├── services/                     # Business logic
│   │   ├── OrderService.js           ✅ Example: Refactored
│   │   ├── AuthService.js
│   │   ├── ProductService.js
│   │   └── ...
│   ├── repositories/                 # Data access layer
│   │   ├── BaseRepository.js         ✅ New: Base class
│   │   ├── OrderRepository.js        ✅ Example: Refactored
│   │   ├── UserRepository.js
│   │   └── ...
│   └── domain/                       # Domain models & types
│       └── types.js
│
├── infrastructure/                   # External Dependencies
│   ├── external/                     # External service integrations
│   │   ├── vision/
│   │   │   └── VisionOCRService.js   ✅ New: Clean integration
│   │   ├── openai/
│   │   │   └── OpenAIService.js      ✅ New: Clean integration
│   │   ├── gcs/
│   │   │   └── GCSService.js
│   │   ├── twilio/
│   │   │   └── TwilioService.js
│   │   └── email/
│   │       └── EmailService.js
│   ├── queue/                        # Queue management
│   │   ├── QueueManager.js
│   │   └── processors/
│   └── database/                     # Database config
│       └── index.js                  ✅ New: Centralized Prisma
│
├── workers/                          # Background job processors
│   ├── order.worker.js
│   ├── uploadedOrderProcessor.worker.js
│   ├── analytics.worker.js
│   └── ...
│
├── shared/                           # Shared utilities
│   ├── errors/                       # Error classes
│   │   ├── AppError.js               ✅ New: Base error
│   │   └── index.js                  ✅ New: All error types
│   ├── logger/                       # Logging
│   │   └── index.js                  ✅ New: Centralized logger
│   ├── utils/                        # Utility functions
│   │   ├── asyncHandler.js           ✅ New: Async wrapper
│   │   ├── ApiResponse.js            ✅ New: Standard responses
│   │   └── ...
│   └── validators/                   # Input validation
│       └── ...
│
└── config/                           # Configuration
    └── index.js
```

## Key Components

### 1. Error Handling

#### Error Classes
```javascript
// src/shared/errors/index.js
- AppError (base)
- ValidationError (400)
- NotFoundError (404)
- UnauthorizedError (401)
- ForbiddenError (403)
- ConflictError (409)
- BusinessLogicError (422)
- ExternalServiceError (502)
- DatabaseError (500)
```

#### Usage
```javascript
throw new NotFoundError('Order', orderId);
throw new ValidationError('Invalid email format');
throw new ForbiddenError('Access denied');
```

### 2. Async Handler

```javascript
// Automatically catches errors and passes to error middleware
router.get('/:id', asyncHandler(async (req, res) => {
  const order = await orderService.getOrderById(req.params.id);
  return ApiResponse.success(res, order);
}));
```

### 3. API Response

```javascript
// Success
ApiResponse.success(res, data, 'Success message', 200);

// Error
ApiResponse.error(res, 'Error message', 500, 'ERROR_CODE');

// Paginated
ApiResponse.paginated(res, items, pagination, 'Success');
```

### 4. Centralized Logger

```javascript
logger.info('Order created', { orderId, userId });
logger.error('Order creation failed', { error: error.message });
logger.warn('Low stock', { productId, quantity });
logger.debug('Debug info', { data });
```

### 5. Base Repository

```javascript
class OrderRepository extends BaseRepository {
  constructor(prisma) {
    super(prisma, 'order');
  }
  
  // Inherits: findById, findOne, findMany, create, update, delete, count, exists
  
  // Add custom methods
  async findByIdWithDetails(orderId) {
    // Custom query
  }
}
```

## Layer Responsibilities

### Controllers (api/controllers/)

**DO:**
- Parse request parameters
- Validate input (basic)
- Call service methods
- Format responses
- Handle HTTP status codes

**DON'T:**
- Business logic
- Database queries
- Complex validation
- Authorization logic

**Example:**
```javascript
class OrderController {
  getOrderById = asyncHandler(async (req, res) => {
    const order = await this.orderService.getOrderById(
      req.params.id,
      req.user.id,
      req.user.role
    );
    return ApiResponse.success(res, order);
  });
}
```

### Services (core/services/)

**DO:**
- Business logic
- Validation
- Authorization
- Orchestrate operations
- Call repositories
- Call external services
- Transaction management

**DON'T:**
- HTTP handling
- Direct Prisma queries
- Response formatting

**Example:**
```javascript
class OrderService {
  async getOrderById(orderId, userId, userRole) {
    const order = await this.orderRepository.findByIdWithDetails(orderId);
    
    if (!order) {
      throw new NotFoundError('Order', orderId);
    }
    
    this.checkOrderAccess(order, userId, userRole);
    
    return order;
  }
}
```

### Repositories (core/repositories/)

**DO:**
- ALL Prisma queries
- Data access abstraction
- Query optimization
- Return domain models

**DON'T:**
- Business logic
- Authorization
- Validation
- HTTP handling

**Example:**
```javascript
class OrderRepository extends BaseRepository {
  async findByIdWithDetails(orderId) {
    return await this.model.findUnique({
      where: { id: orderId },
      include: { items: true, retailer: true },
    });
  }
}
```

### External Services (infrastructure/external/)

**DO:**
- Third-party API calls
- Retry logic
- Error handling
- Rate limiting
- Configuration

**DON'T:**
- Business logic
- Database queries
- HTTP request handling

**Example:**
```javascript
class VisionOCRService {
  async extractTextFromGCS(gcsUri) {
    const [result] = await this.client.textDetection(gcsUri);
    return {
      text: result.textAnnotations[0].description,
      confidence: this.calculateConfidence(result),
    };
  }
}
```

## Request Flow

```
1. HTTP Request
   ↓
2. Route (api/routes/)
   ↓
3. Middleware (auth, validation)
   ↓
4. Controller (api/controllers/)
   - Parse request
   - Call service
   ↓
5. Service (core/services/)
   - Business logic
   - Validation
   - Authorization
   - Call repository
   ↓
6. Repository (core/repositories/)
   - Prisma query
   - Return data
   ↓
7. Service
   - Process data
   - Return to controller
   ↓
8. Controller
   - Format response
   - Send HTTP response
```

## Error Flow

```
1. Error thrown anywhere
   ↓
2. asyncHandler catches it
   ↓
3. Passes to errorHandler middleware
   ↓
4. errorHandler processes error
   - Operational errors (AppError) → Send error response
   - Prisma errors → Convert and send
   - Unexpected errors → Log and send generic error
   ↓
5. HTTP error response sent
```

## Benefits

### 1. Maintainability
- Clear structure
- Easy to find code
- Consistent patterns
- Less duplication

### 2. Testability
- Each layer can be tested independently
- Easy to mock dependencies
- No HTTP needed for service tests

### 3. Scalability
- Workers independent from API
- Services can be extracted to microservices
- Easy to add new features

### 4. Readability
- Clear separation of concerns
- Self-documenting structure
- Consistent naming

### 5. Reusability
- Services used in controllers and workers
- Repositories shared across services
- External services centralized

## Migration Status

### ✅ Completed
- [x] Error handling system
- [x] Async handler wrapper
- [x] API response formatter
- [x] Centralized logger
- [x] Base repository class
- [x] Order module (complete example)
- [x] External services structure
- [x] Database configuration

### 📝 To Do
- [ ] Migrate remaining controllers
- [ ] Migrate remaining services
- [ ] Create remaining repositories
- [ ] Update all routes
- [ ] Update all workers
- [ ] Add input validators
- [ ] Update tests

## Next Steps

1. **Review the Order module** - Complete refactored example
2. **Follow the migration guide** - Step-by-step instructions
3. **Migrate one module at a time** - Start with simple modules
4. **Test thoroughly** - Ensure functionality unchanged
5. **Update documentation** - Keep docs in sync

## Files Created

### Core Architecture
- `src/shared/errors/AppError.js` - Base error class
- `src/shared/errors/index.js` - All error types
- `src/shared/utils/asyncHandler.js` - Async wrapper
- `src/shared/utils/ApiResponse.js` - Response formatter
- `src/shared/logger/index.js` - Centralized logger
- `src/api/middleware/errorHandler.js` - Error middleware

### Data Layer
- `src/core/repositories/BaseRepository.js` - Base repository
- `src/core/repositories/OrderRepository.js` - Order repository
- `src/infrastructure/database/index.js` - Prisma client

### Business Layer
- `src/core/services/OrderService.js` - Order service

### API Layer
- `src/api/controllers/OrderController.js` - Order controller
- `src/api/routes/order.routes.js` - Order routes

### External Services
- `src/infrastructure/external/vision/VisionOCRService.js` - Vision OCR
- `src/infrastructure/external/openai/OpenAIService.js` - OpenAI

### Documentation
- `REFACTORING_PLAN.md` - Architecture overview
- `REFACTORING_MIGRATION_GUIDE.md` - Migration instructions
- `CLEAN_ARCHITECTURE_SUMMARY.md` - This file

## Reference Implementation

The **Order module** is fully refactored and serves as the reference implementation:

- Controller: `src/api/controllers/OrderController.js`
- Service: `src/core/services/OrderService.js`
- Repository: `src/core/repositories/OrderRepository.js`
- Routes: `src/api/routes/order.routes.js`

Use this as a template for refactoring other modules.

---

**Status**: ✅ Architecture implemented, Order module refactored  
**Next**: Migrate remaining modules following the pattern
