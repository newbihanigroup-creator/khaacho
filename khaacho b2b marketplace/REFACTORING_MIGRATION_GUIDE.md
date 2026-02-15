# 🔄 Refactoring Migration Guide

## Overview

This guide explains how to migrate from the old architecture to the new clean, modular architecture.

## New Architecture

```
src/
├── api/                          # HTTP Layer
│   ├── controllers/              # Request/Response handlers
│   ├── routes/                   # Route definitions
│   └── middleware/               # Express middleware
│       ├── auth.js
│       ├── errorHandler.js
│       └── validators/
├── core/                         # Business Logic Layer
│   ├── services/                 # Business logic
│   ├── repositories/             # Data access
│   └── domain/                   # Domain models
├── infrastructure/               # External Dependencies
│   ├── external/                 # External services
│   │   ├── vision/              # Google Vision OCR
│   │   ├── openai/              # OpenAI LLM
│   │   ├── gcs/                 # Google Cloud Storage
│   │   └── twilio/              # WhatsApp
│   ├── queue/                   # Queue management
│   └── database/                # Database config
├── workers/                      # Background jobs
├── shared/                       # Shared utilities
│   ├── errors/                  # Error classes
│   ├── logger/                  # Logging
│   ├── utils/                   # Utilities
│   └── validators/              # Validation
└── config/                       # Configuration
```

## Migration Steps

### Step 1: Update Imports

#### Old Way
```javascript
const prisma = require('./config/database');
const logger = require('./utils/logger');
const ApiResponse = require('./utils/response');
```

#### New Way
```javascript
const prisma = require('./infrastructure/database');
const logger = require('./shared/logger');
const ApiResponse = require('./shared/utils/ApiResponse');
```

### Step 2: Refactor Controllers

#### Old Controller (❌ Bad)
```javascript
// src/controllers/order.controller.js
const prisma = require('../config/database');

class OrderController {
  async getOrder(req, res) {
    try {
      const { id } = req.params;
      
      // ❌ Direct database query in controller
      const order = await prisma.order.findUnique({
        where: { id },
        include: { items: true },
      });
      
      if (!order) {
        return res.status(404).json({ error: 'Order not found' });
      }
      
      // ❌ Business logic in controller
      if (req.user.role === 'RETAILER' && order.retailerId !== req.user.id) {
        return res.status(403).json({ error: 'Forbidden' });
      }
      
      res.json({ success: true, data: order });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
}
```

#### New Controller (✅ Good)
```javascript
// src/api/controllers/OrderController.js
const OrderService = require('../../core/services/OrderService');
const ApiResponse = require('../../shared/utils/ApiResponse');
const asyncHandler = require('../../shared/utils/asyncHandler');
const prisma = require('../../infrastructure/database');

class OrderController {
  constructor() {
    this.orderService = new OrderService(prisma);
  }

  // ✅ Clean: Only handles HTTP request/response
  getOrderById = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const userId = req.user.id;
    const userRole = req.user.role;

    // ✅ Delegate to service layer
    const order = await this.orderService.getOrderById(id, userId, userRole);

    return ApiResponse.success(res, order, 'Order retrieved successfully');
  });
}

module.exports = new OrderController();
```

### Step 3: Create Services

#### New Service (✅ Good)
```javascript
// src/core/services/OrderService.js
const OrderRepository = require('../repositories/OrderRepository');
const { NotFoundError, ForbiddenError } = require('../../shared/errors');
const logger = require('../../shared/logger');

class OrderService {
  constructor(prisma) {
    this.orderRepository = new OrderRepository(prisma);
  }

  async getOrderById(orderId, userId, userRole) {
    logger.info('Getting order by ID', { orderId, userId, userRole });

    // ✅ Use repository for data access
    const order = await this.orderRepository.findByIdWithDetails(orderId);

    if (!order) {
      throw new NotFoundError('Order', orderId);
    }

    // ✅ Business logic: Authorization check
    this.checkOrderAccess(order, userId, userRole);

    return order;
  }

  checkOrderAccess(order, userId, userRole) {
    if (userRole === 'ADMIN' || userRole === 'OPERATOR') {
      return;
    }

    if (userRole === 'RETAILER' && order.retailerId !== userId) {
      throw new ForbiddenError('You do not have access to this order');
    }
  }
}

module.exports = OrderService;
```

### Step 4: Create Repositories

#### New Repository (✅ Good)
```javascript
// src/core/repositories/OrderRepository.js
const BaseRepository = require('./BaseRepository');
const logger = require('../../shared/logger');
const { DatabaseError } = require('../../shared/errors');

class OrderRepository extends BaseRepository {
  constructor(prisma) {
    super(prisma, 'order');
  }

  // ✅ All Prisma queries live here
  async findByIdWithDetails(orderId) {
    try {
      return await this.model.findUnique({
        where: { id: orderId },
        include: {
          retailer: true,
          items: {
            include: {
              product: true,
              wholesaler: true,
            },
          },
        },
      });
    } catch (error) {
      logger.error('Order findByIdWithDetails error', { orderId, error: error.message });
      throw new DatabaseError('Failed to find order with details', { orderId });
    }
  }
}

module.exports = OrderRepository;
```

### Step 5: Move External Services

#### Old Way (❌ Bad)
```javascript
// src/services/visionOCR.service.js
// Mixed with business logic
```

#### New Way (✅ Good)
```javascript
// src/infrastructure/external/vision/VisionOCRService.js
// Pure external service integration
// No business logic
```

### Step 6: Update Routes

#### Old Routes (❌ Bad)
```javascript
const express = require('express');
const orderController = require('../controllers/order.controller');

router.get('/orders/:id', async (req, res) => {
  try {
    await orderController.getOrder(req, res);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

#### New Routes (✅ Good)
```javascript
// src/api/routes/order.routes.js
const express = require('express');
const OrderController = require('../controllers/OrderController');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

// ✅ Clean routes with asyncHandler
router.get(
  '/:id',
  authenticate,
  OrderController.getOrderById
);

module.exports = router;
```

### Step 7: Use Error Classes

#### Old Way (❌ Bad)
```javascript
if (!order) {
  return res.status(404).json({ error: 'Order not found' });
}
```

#### New Way (✅ Good)
```javascript
const { NotFoundError } = require('../../shared/errors');

if (!order) {
  throw new NotFoundError('Order', orderId);
}
```

### Step 8: Update Workers

#### Old Worker (❌ Bad)
```javascript
// src/workers/order.worker.js
const prisma = require('../config/database');

async function processOrder(orderId) {
  // ❌ Direct database queries
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  // ❌ Business logic in worker
}
```

#### New Worker (✅ Good)
```javascript
// src/workers/order.worker.js
const OrderService = require('../core/services/OrderService');
const prisma = require('../infrastructure/database');
const logger = require('../shared/logger');

const orderService = new OrderService(prisma);

async function processOrder(job) {
  const { orderId } = job.data;
  
  logger.info('Processing order', { orderId, jobId: job.id });
  
  // ✅ Use service layer
  await orderService.processOrder(orderId);
  
  logger.info('Order processed', { orderId });
}

module.exports = processOrder;
```

## Complete Example: Order Module

### File Structure
```
src/
├── api/
│   ├── controllers/
│   │   └── OrderController.js          ✅ HTTP handling only
│   ├── routes/
│   │   └── order.routes.js             ✅ Route definitions
│   └── middleware/
│       └── validators/
│           └── orderValidator.js       ✅ Input validation
├── core/
│   ├── services/
│   │   └── OrderService.js             ✅ Business logic
│   └── repositories/
│       └── OrderRepository.js          ✅ Database queries
└── workers/
    └── order.worker.js                 ✅ Background processing
```

## Benefits of New Architecture

### 1. Separation of Concerns
- Controllers: HTTP only
- Services: Business logic only
- Repositories: Database only
- External: Third-party APIs only

### 2. Testability
```javascript
// Easy to test service without HTTP
const orderService = new OrderService(mockPrisma);
const order = await orderService.getOrderById('123', 'user1', 'RETAILER');
```

### 3. Reusability
```javascript
// Same service used in controller and worker
const orderService = new OrderService(prisma);

// In controller
await orderService.createOrder(data);

// In worker
await orderService.processOrder(orderId);
```

### 4. Maintainability
- Clear file structure
- Easy to find code
- Consistent patterns
- Less duplication

### 5. Scalability
- Workers independent from API
- Services can be extracted to microservices
- Easy to add new features

## Migration Checklist

### For Each Module:

- [ ] Create Repository (extends BaseRepository)
  - [ ] Move all Prisma queries here
  - [ ] Add custom query methods
  - [ ] Handle database errors

- [ ] Create Service
  - [ ] Move business logic here
  - [ ] Use repository for data access
  - [ ] Add validation
  - [ ] Add authorization checks
  - [ ] Use error classes

- [ ] Refactor Controller
  - [ ] Remove business logic
  - [ ] Remove database queries
  - [ ] Call service methods only
  - [ ] Use ApiResponse
  - [ ] Use asyncHandler

- [ ] Update Routes
  - [ ] Use new controller
  - [ ] Add middleware
  - [ ] Remove try-catch (use asyncHandler)

- [ ] Update Workers
  - [ ] Use service layer
  - [ ] Remove direct database access
  - [ ] Add proper logging

- [ ] Move External Services
  - [ ] Move to infrastructure/external/
  - [ ] Remove business logic
  - [ ] Add error handling
  - [ ] Add retry logic

## Common Patterns

### Pattern 1: CRUD Operations
```javascript
// Repository
async findById(id) { /* Prisma query */ }
async create(data) { /* Prisma query */ }
async update(id, data) { /* Prisma query */ }
async delete(id) { /* Prisma query */ }

// Service
async getById(id, userId, userRole) {
  const item = await this.repository.findById(id);
  this.checkAccess(item, userId, userRole);
  return item;
}

// Controller
getById = asyncHandler(async (req, res) => {
  const item = await this.service.getById(req.params.id, req.user.id, req.user.role);
  return ApiResponse.success(res, item);
});
```

### Pattern 2: List with Pagination
```javascript
// Repository
async findMany(options) {
  const [items, total] = await Promise.all([
    this.model.findMany({ ...options }),
    this.model.count({ where: options.where }),
  ]);
  return { items, total };
}

// Service
async getList(filters, userId, userRole) {
  const where = this.buildWhereClause(filters, userId, userRole);
  return await this.repository.findMany({ where, ...filters });
}

// Controller
getList = asyncHandler(async (req, res) => {
  const result = await this.service.getList(req.query, req.user.id, req.user.role);
  return ApiResponse.paginated(res, result.items, result.pagination);
});
```

### Pattern 3: Create with Validation
```javascript
// Service
async create(data, userId, userRole) {
  this.validateData(data);
  this.checkPermissions(userId, userRole);
  return await this.repository.create(data);
}

// Controller
create = asyncHandler(async (req, res) => {
  const item = await this.service.create(req.body, req.user.id, req.user.role);
  return ApiResponse.success(res, item, 'Created successfully', 201);
});
```

## Next Steps

1. Start with one module (Order - already done)
2. Test thoroughly
3. Migrate other modules one by one
4. Update documentation
5. Train team on new patterns

## Questions?

Refer to the refactored Order module as the reference implementation.
