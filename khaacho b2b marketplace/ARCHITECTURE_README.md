# 🏗️ System Architecture Documentation

## Overview

This is a B2B ordering platform for Surkhet, Nepal, built with Node.js, Express, Prisma, and PostgreSQL. The system handles order management, credit control, WhatsApp integration, and AI-powered image order processing.

---

## 📁 Project Structure

```
khaacho-platform/
│
├── src/
│   ├── api/                          # HTTP Layer (Presentation)
│   │   ├── controllers/              # HTTP request/response handlers
│   │   │   ├── order.controller.js
│   │   │   ├── auth.controller.js
│   │   │   └── ...
│   │   ├── routes/                   # Route definitions
│   │   │   ├── order.routes.js
│   │   │   ├── auth.routes.js
│   │   │   └── index.js
│   │   └── middleware/               # Express middleware
│   │       ├── auth.js
│   │       ├── errorHandler.js
│   │       └── validators/
│   │
│   ├── core/                         # Business Logic Layer
│   │   ├── services/                 # Business logic
│   │   │   ├── order.service.js
│   │   │   ├── auth.service.js
│   │   │   └── ...
│   │   ├── repositories/             # Data access layer
│   │   │   ├── base.repository.js
│   │   │   ├── order.repository.js
│   │   │   └── ...
│   │   └── domain/                   # Domain models & types
│   │
│   ├── infrastructure/               # External Dependencies
│   │   ├── external/                 # Third-party integrations
│   │   │   ├── vision/              # Google Vision OCR
│   │   │   ├── openai/              # OpenAI LLM
│   │   │   ├── gcs/                 # Google Cloud Storage
│   │   │   └── twilio/              # WhatsApp
│   │   ├── queue/                   # Queue management
│   │   └── database/                # Database config
│   │
│   ├── workers/                      # Background job processors
│   │   ├── order.worker.js
│   │   ├── imageOrder.worker.js
│   │   └── ...
│   │
│   ├── shared/                       # Shared utilities
│   │   ├── constants/               # Application constants
│   │   ├── errors/                  # Error classes
│   │   ├── logger/                  # Logging
│   │   └── utils/                   # Utility functions
│   │
│   ├── config/                       # Configuration
│   └── server.js                     # Application entry point
│
├── prisma/                           # Database
│   ├── schema.prisma                # Database schema
│   └── migrations/                  # Database migrations
│
├── tests/                            # Test files
├── logs/                             # Application logs
└── docs/                             # Documentation

```

---

## 🎯 Architecture Layers

### 1. API Layer (`src/api/`)

**Purpose**: Handle HTTP requests and responses

**Components**:
- **Controllers**: Parse requests, call services, format responses
- **Routes**: Define API endpoints and middleware
- **Middleware**: Authentication, validation, error handling

**Rules**:
- ✅ Handle HTTP only
- ✅ Call service layer
- ✅ Format responses
- ❌ No business logic
- ❌ No database queries

**Example Flow**:
```
HTTP Request → Route → Middleware → Controller → Service → Response
```

---

### 2. Core Layer (`src/core/`)

**Purpose**: Business logic and data access

**Components**:
- **Services**: Business rules, validation, orchestration
- **Repositories**: Database queries (Prisma)
- **Domain**: Domain models and types

**Rules**:
- ✅ Business logic
- ✅ Validation
- ✅ Authorization
- ✅ Call repositories
- ❌ No HTTP handling
- ❌ No direct Prisma in services

**Example Flow**:
```
Service → Validate → Repository → Database → Process → Return
```

---

### 3. Infrastructure Layer (`src/infrastructure/`)

**Purpose**: External dependencies and integrations

**Components**:
- **External Services**: Third-party APIs (Vision, OpenAI, GCS, Twilio)
- **Queue**: Background job management (BullMQ + Redis)
- **Database**: Prisma client configuration

**Rules**:
- ✅ Third-party API calls
- ✅ Retry logic
- ✅ Error handling
- ❌ No business logic

---

### 4. Workers Layer (`src/workers/`)

**Purpose**: Background job processing

**Components**:
- Job processors for async tasks
- Use same services as controllers

**Rules**:
- ✅ Process background jobs
- ✅ Use service layer
- ✅ Independent from API
- ❌ No business logic duplication

---

### 5. Shared Layer (`src/shared/`)

**Purpose**: Reusable utilities and helpers

**Components**:
- **Constants**: Application-wide constants
- **Errors**: Custom error classes
- **Logger**: Structured logging
- **Utils**: Helper functions

---

## 🔄 Request Flow

### Standard API Request

```
1. Client sends HTTP request
   ↓
2. Express routes to endpoint
   ↓
3. Middleware (auth, validation)
   ↓
4. Controller receives request
   - Parse parameters
   - Extract user info
   ↓
5. Controller calls Service
   - Pass data to service
   ↓
6. Service executes business logic
   - Validate data
   - Check authorization
   - Call repository
   ↓
7. Repository queries database
   - Execute Prisma query
   - Return data
   ↓
8. Service processes result
   - Apply business rules
   - Format data
   ↓
9. Controller formats response
   - Use ApiResponse helper
   - Send HTTP response
   ↓
10. Client receives response
```

### Background Job Flow

```
1. Job added to queue
   ↓
2. Worker picks up job
   ↓
3. Worker calls Service
   (Same service used by controllers)
   ↓
4. Service executes logic
   ↓
5. Worker logs result
   ↓
6. Job completed/failed
```

---

## 📝 Naming Conventions

### Files

**Pattern**: `{resource}.{type}.js`

**Examples**:
- `order.service.js` - Order business logic
- `order.controller.js` - Order HTTP handlers
- `order.repository.js` - Order database queries
- `order.routes.js` - Order API routes
- `order.worker.js` - Order background jobs

### Classes

**Pattern**: `{Resource}{Type}`

**Examples**:
- `OrderService` - Order service class
- `OrderController` - Order controller class
- `OrderRepository` - Order repository class

### Functions

**Pattern**: Verb + Noun + Context

**Examples**:
- `getOrderById()` - Retrieve order
- `createOrder()` - Create new order
- `updateOrderStatus()` - Update status
- `validateOrderData()` - Validate data
- `verifyOrderAccess()` - Check authorization

---

## 🗂️ Module Organization

Each module follows this structure:

```
{module}/
├── {module}.controller.js    # HTTP handlers
├── {module}.service.js        # Business logic
├── {module}.repository.js     # Database queries
├── {module}.routes.js         # API routes
└── {module}.worker.js         # Background jobs (if needed)
```

**Example - Order Module**:
```
order/
├── order.controller.js        # Handle order HTTP requests
├── order.service.js           # Order business logic
├── order.repository.js        # Order database queries
├── order.routes.js            # Order API endpoints
└── order.worker.js            # Order background processing
```

---

## 🎨 Code Style Guidelines

### 1. File Size Limit

**Maximum**: 300 lines per file

**If file exceeds 300 lines**:
- Extract helper functions to separate file
- Split into multiple focused files
- Create utility modules

### 2. Function Size Limit

**Maximum**: 30 lines per function

**If function exceeds 30 lines**:
- Extract helper functions
- Break into smaller pieces
- Each function should have single responsibility

### 3. Nesting Depth

**Maximum**: 3 levels of nesting

**Avoid**:
```javascript
if (condition1) {
  if (condition2) {
    if (condition3) {
      if (condition4) {  // Too deep!
        // code
      }
    }
  }
}
```

**Prefer**:
```javascript
// Early returns
if (!condition1) return;
if (!condition2) return;
if (!condition3) return;

// code
```

### 4. Comments

**Add comments for**:
- Business logic flow
- Complex algorithms
- Non-obvious decisions
- External API integrations

**Example**:
```javascript
/**
 * Creates a new order with validation
 * 
 * Business Flow:
 * 1. Validate order data
 * 2. Calculate totals
 * 3. Check credit limit
 * 4. Create order in database
 * 5. Send notifications
 */
async createOrder(orderData) {
  // Step 1: Validate order data
  this.validateOrderData(orderData);
  
  // Step 2: Calculate order totals
  const totals = this.calculateOrderTotals(orderData.items);
  
  // Step 3: Check retailer credit limit
  await this.checkCreditLimit(orderData.retailerId, totals.total);
  
  // Step 4: Create order in database (transaction)
  const order = await this.orderRepository.createWithItems(orderData);
  
  // Step 5: Send confirmation notifications
  await this.notificationService.sendOrderConfirmation(order);
  
  return order;
}
```

---

## 🔐 Security Layers

```
1. Rate Limiting
   - 100 requests per 15 minutes
   - Applied at route level

2. Authentication
   - JWT token validation
   - Required for protected routes

3. Authorization
   - Role-based access control
   - Checked in service layer

4. Input Validation
   - Request validation middleware
   - Business validation in services

5. SQL Injection Protection
   - Prisma ORM (parameterized queries)
   - No raw SQL

6. XSS Protection
   - Helmet middleware
   - Input sanitization

7. Error Handling
   - No sensitive data in errors
   - Structured error responses
```

---

## 📊 Data Flow Examples

### Example 1: Create Order

```javascript
// 1. Client Request
POST /api/v1/orders
Body: { retailerId, items, deliveryAddress }

// 2. Route
router.post('/', authenticate, authorize('RETAILER'), orderController.createOrder)

// 3. Controller (order.controller.js)
async createOrder(req, res) {
  const orderData = req.body;
  const order = await orderService.createOrder(orderData, req.user.id);
  return ApiResponse.success(res, order, 'Order created', 201);
}

// 4. Service (order.service.js)
async createOrder(orderData, userId) {
  // Validate
  this.validateOrderData(orderData);
  
  // Calculate
  const totals = this.calculateOrderTotals(orderData.items);
  
  // Create
  const order = await orderRepository.createWithItems({
    ...orderData,
    ...totals,
    status: ORDER_STATUS.PENDING
  });
  
  return order;
}

// 5. Repository (order.repository.js)
async createWithItems(orderData) {
  return await prisma.$transaction(async (tx) => {
    const order = await tx.order.create({ data: orderData });
    await tx.orderStatusLog.create({ data: { orderId: order.id } });
    return order;
  });
}

// 6. Response
{
  "success": true,
  "data": { "id": "123", "orderNumber": "ORD20260214001" },
  "message": "Order created"
}
```

### Example 2: Image Order Processing (Background)

```javascript
// 1. Upload Image
POST /api/v1/orders/upload-image
→ Image saved to GCS
→ Job added to queue

// 2. Worker Processes Job (imageOrder.worker.js)
async function processImageOrder(job) {
  const { uploadedOrderId } = job.data;
  
  // Use same service as API
  await imageOrderService.processImageOrder(uploadedOrderId);
}

// 3. Service Orchestrates Pipeline (imageOrder.service.js)
async processImageOrder(uploadedOrderId) {
  // Step 1: Extract text (Vision OCR)
  const text = await visionService.extractText(imageUrl);
  
  // Step 2: Extract items (OpenAI)
  const items = await openaiService.extractItems(text);
  
  // Step 3: Normalize products
  const normalized = await productService.normalizeItems(items);
  
  // Step 4: Broadcast RFQs
  await rfqService.broadcastRFQs(uploadedOrderId, normalized);
  
  // Step 5: Update status
  await uploadedOrderRepository.updateStatus(uploadedOrderId, 'COMPLETED');
}
```

---

## 🧪 Testing Strategy

### Unit Tests
- Test services with mocked repositories
- Test repositories with mocked Prisma
- Test utilities in isolation

### Integration Tests
- Test API endpoints
- Test database operations
- Test external service integrations

### Test File Naming
- `{module}.service.test.js`
- `{module}.controller.test.js`
- `{module}.repository.test.js`

---

## 🚀 Deployment Architecture

```
┌─────────────────────────────────────┐
│         Render.com Platform         │
├─────────────────────────────────────┤
│                                     │
│  ┌──────────────┐  ┌─────────────┐ │
│  │  Web Service │  │   Worker    │ │
│  │  (API)       │  │  Service    │ │
│  │  Port: 10000 │  │ (Jobs)      │ │
│  └──────┬───────┘  └──────┬──────┘ │
│         │                 │        │
│         └────────┬────────┘        │
│                  │                 │
│         ┌────────▼────────┐        │
│         │   PostgreSQL    │        │
│         │   (Database)    │        │
│         └─────────────────┘        │
│                                    │
│         ┌─────────────────┐        │
│         │      Redis      │        │
│         │  (Queue/Cache)  │        │
│         └─────────────────┘        │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│      Google Cloud Platform          │
├─────────────────────────────────────┤
│  • Cloud Storage (Images)           │
│  • Vision API (OCR)                 │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│           OpenAI                    │
├─────────────────────────────────────┤
│  • GPT-4o-mini (Item Extraction)    │
└─────────────────────────────────────┘
```

---

## 📦 Key Dependencies

### Production
- **express** - Web framework
- **@prisma/client** - Database ORM
- **bull** - Queue management
- **ioredis** - Redis client
- **winston** - Logging
- **helmet** - Security
- **jsonwebtoken** - Authentication
- **@google-cloud/vision** - OCR
- **@google-cloud/storage** - File storage
- **axios** - HTTP client (OpenAI)
- **twilio** - WhatsApp integration

### Development
- **nodemon** - Auto-restart
- **jest** - Testing (optional)

---

## 🔧 Environment Variables

### Required
```bash
NODE_ENV=production
PORT=10000
DATABASE_URL=postgresql://...
REDIS_URL=redis://...
JWT_SECRET=...
```

### Optional (Features)
```bash
# Google Cloud
GCS_BUCKET_NAME=...
GCS_CREDENTIALS=...
GOOGLE_CLOUD_CREDENTIALS=...

# OpenAI
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-4o-mini

# WhatsApp
WHATSAPP_ACCESS_TOKEN=...
WHATSAPP_PHONE_NUMBER_ID=...
```

---

## 📚 Documentation Files

### Architecture
- `ARCHITECTURE_README.md` - This file
- `ARCHITECTURE_DIAGRAM.md` - Visual diagrams
- `CLEAN_ARCHITECTURE_SUMMARY.md` - Architecture patterns

### Development
- `REFACTORING_MIGRATION_GUIDE.md` - Migration guide
- `CODE_READABILITY_GUIDE.md` - Code standards
- `ARCHITECTURE_USAGE_EXAMPLES.md` - Code examples

### Deployment
- `DEPLOYMENT_STATUS_SUMMARY.md` - Deployment guide
- `DEPLOY_NOW_CHECKLIST.md` - Deployment steps
- `RENDER_NATIVE_DEPLOYMENT.md` - Render setup

### Features
- `AI_IMAGE_ORDER_COMPLETE_IMPLEMENTATION.md` - Image processing
- `WHATSAPP_IMPLEMENTATION_SUMMARY.md` - WhatsApp integration
- `ANALYTICS_IMPLEMENTATION_SUMMARY.md` - Analytics system

---

## 🎯 Quick Start for AI Tools

### Understanding a Module

1. **Start with routes** (`{module}.routes.js`)
   - See available endpoints
   - Understand API structure

2. **Read controller** (`{module}.controller.js`)
   - See request/response handling
   - Understand parameters

3. **Read service** (`{module}.service.js`)
   - See business logic
   - Understand flow

4. **Read repository** (`{module}.repository.js`)
   - See database queries
   - Understand data access

### Adding a New Feature

1. **Create repository** - Database queries
2. **Create service** - Business logic
3. **Create controller** - HTTP handlers
4. **Create routes** - API endpoints
5. **Add tests** - Unit and integration tests

### Debugging

1. **Check logs** - `logs/` directory
2. **Check error handler** - `src/api/middleware/errorHandler.js`
3. **Check constants** - `src/shared/constants/index.js`
4. **Check service** - Business logic location

---

## 🔍 Common Patterns

### Pattern 1: CRUD Operations
```
Repository: findById, create, update, delete
Service: getById, create, update, delete (with validation)
Controller: HTTP handlers
Routes: GET, POST, PATCH, DELETE
```

### Pattern 2: Authorization
```
Controller: Extract user info from req.user
Service: Check access based on role
Throw ForbiddenError if unauthorized
```

### Pattern 3: Validation
```
Middleware: Basic input validation
Service: Business validation
Repository: Database constraints
```

### Pattern 4: Error Handling
```
Throw custom error (NotFoundError, ValidationError, etc.)
asyncHandler catches error
errorHandler middleware processes
Structured JSON response sent
```

---

## 📞 Support

- **Documentation**: See `docs/` directory
- **Examples**: See `ARCHITECTURE_USAGE_EXAMPLES.md`
- **Issues**: Check error logs in `logs/`

---

**Last Updated**: February 14, 2026  
**Version**: 2.0.0  
**Status**: Production Ready
