# 📝 File Naming Guide for AI-Friendly Code

## Overview

This guide establishes predictable naming conventions that make the codebase easy for AI tools to understand and navigate.

---

## 🎯 Core Principle

**Pattern**: `{resource}.{type}.js`

This pattern makes it immediately clear:
- **What** the file handles (resource)
- **How** it handles it (type)

---

## 📁 File Types

### 1. Controllers (`*.controller.js`)

**Purpose**: HTTP request/response handling

**Naming**: `{resource}.controller.js`

**Examples**:
```
order.controller.js          # Order HTTP handlers
auth.controller.js           # Authentication handlers
product.controller.js        # Product HTTP handlers
user.controller.js           # User HTTP handlers
imageUpload.controller.js    # Image upload handlers
```

**Location**: `src/api/controllers/`

---

### 2. Services (`*.service.js`)

**Purpose**: Business logic

**Naming**: `{resource}.service.js`

**Examples**:
```
order.service.js             # Order business logic
auth.service.js              # Authentication logic
product.service.js           # Product business logic
credit.service.js            # Credit management logic
imageOrder.service.js        # Image order processing logic
```

**Location**: `src/core/services/`

---

### 3. Repositories (`*.repository.js`)

**Purpose**: Database access

**Naming**: `{resource}.repository.js`

**Examples**:
```
order.repository.js          # Order database queries
user.repository.js           # User database queries
product.repository.js        # Product database queries
base.repository.js           # Base repository class
```

**Location**: `src/core/repositories/`

---

### 4. Routes (`*.routes.js`)

**Purpose**: API endpoint definitions

**Naming**: `{resource}.routes.js`

**Examples**:
```
order.routes.js              # Order API endpoints
auth.routes.js               # Auth API endpoints
product.routes.js            # Product API endpoints
index.js                     # Main routes aggregator
```

**Location**: `src/api/routes/`

---

### 5. Workers (`*.worker.js`)

**Purpose**: Background job processing

**Naming**: `{resource}.worker.js`

**Examples**:
```
order.worker.js              # Order background jobs
imageOrder.worker.js         # Image order processing
analytics.worker.js          # Analytics jobs
creditScore.worker.js        # Credit score calculation
```

**Location**: `src/workers/`

---

### 6. Middleware (`*.js` or `*.middleware.js`)

**Purpose**: Express middleware

**Naming**: `{purpose}.js` or `{purpose}.middleware.js`

**Examples**:
```
auth.js                      # Authentication middleware
errorHandler.js              # Error handling middleware
validation.js                # Input validation
security.js                  # Security middleware
```

**Location**: `src/api/middleware/`

---

### 7. External Services

**Purpose**: Third-party integrations

**Naming**: `{ServiceName}Service.js` (PascalCase for external services)

**Examples**:
```
VisionOCRService.js          # Google Vision OCR
OpenAIService.js             # OpenAI integration
GCSService.js                # Google Cloud Storage
TwilioService.js             # Twilio/WhatsApp
```

**Location**: `src/infrastructure/external/{service}/`

---

### 8. Utilities

**Purpose**: Helper functions

**Naming**: `{purpose}.js`

**Examples**:
```
asyncHandler.js              # Async error wrapper
ApiResponse.js               # Response formatter
pagination.js                # Pagination helpers
dateUtils.js                 # Date utilities
```

**Location**: `src/shared/utils/`

---

### 9. Constants

**Purpose**: Application constants

**Naming**: `index.js` or `{category}.constants.js`

**Examples**:
```
index.js                     # All constants
http.constants.js            # HTTP status codes
order.constants.js           # Order-specific constants
```

**Location**: `src/shared/constants/`

---

### 10. Errors

**Purpose**: Custom error classes

**Naming**: `{ErrorType}.js` or `index.js`

**Examples**:
```
AppError.js                  # Base error class
index.js                     # All error exports
```

**Location**: `src/shared/errors/`

---

## 🗂️ Module Organization

### Standard Module Structure

```
{module}/
├── {module}.controller.js    # HTTP handlers
├── {module}.service.js        # Business logic
├── {module}.repository.js     # Database queries
├── {module}.routes.js         # API routes
└── {module}.worker.js         # Background jobs (optional)
```

### Example: Order Module

```
order/
├── order.controller.js        # OrderController class
├── order.service.js           # OrderService class
├── order.repository.js        # OrderRepository class
├── order.routes.js            # Express router
└── order.worker.js            # processOrder function
```

---

## 📋 Naming Rules

### Rule 1: Resource Name

Use singular form for resource name:
- ✅ `order.service.js` (not `orders.service.js`)
- ✅ `product.controller.js` (not `products.controller.js`)
- ✅ `user.repository.js` (not `users.repository.js`)

**Exception**: When resource is naturally plural
- ✅ `analytics.service.js`
- ✅ `metrics.service.js`

### Rule 2: Type Suffix

Always include type suffix:
- ✅ `order.service.js`
- ❌ `orderService.js`
- ❌ `order.js`

### Rule 3: Compound Names

Use camelCase for compound resource names:
- ✅ `imageUpload.controller.js`
- ✅ `creditScore.worker.js`
- ✅ `orderStatus.service.js`
- ❌ `image-upload.controller.js`
- ❌ `image_upload.controller.js`

### Rule 4: External Services

Use PascalCase for external service classes:
- ✅ `VisionOCRService.js`
- ✅ `OpenAIService.js`
- ✅ `GCSService.js`
- ❌ `visionOCR.service.js`
- ❌ `vision-ocr.service.js`

---

## 🔄 Migration from Old Names

### Controllers

```
Old → New
src/controllers/order.controller.js → src/api/controllers/order.controller.js
src/controllers/OrderController.js → src/api/controllers/order.controller.js
src/controllers/orders.js → src/api/controllers/order.controller.js
```

### Services

```
Old → New
src/services/orderService.js → src/core/services/order.service.js
src/services/order.js → src/core/services/order.service.js
src/services/visionOCR.service.js → src/infrastructure/external/vision/VisionOCRService.js
```

### Repositories

```
Old → New
src/repositories/OrderRepository.js → src/core/repositories/order.repository.js
src/repositories/order.js → src/core/repositories/order.repository.js
```

### Routes

```
Old → New
src/routes/order.js → src/api/routes/order.routes.js
src/routes/orders.js → src/api/routes/order.routes.js
```

### Workers

```
Old → New
src/workers/orderWorker.js → src/workers/order.worker.js
src/workers/order.js → src/workers/order.worker.js
```

---

## 📊 Complete Example

### Before (Inconsistent)

```
src/
├── controllers/
│   ├── OrderController.js
│   ├── auth.js
│   ├── products.controller.js
│   └── imageUploadController.js
├── services/
│   ├── orderService.js
│   ├── AuthService.js
│   ├── product.js
│   └── visionOCR.service.js
├── repositories/
│   ├── OrderRepo.js
│   ├── userRepository.js
│   └── products.js
└── routes/
    ├── orders.js
    ├── auth.routes.js
    └── product.js
```

### After (Consistent)

```
src/
├── api/
│   ├── controllers/
│   │   ├── order.controller.js
│   │   ├── auth.controller.js
│   │   ├── product.controller.js
│   │   └── imageUpload.controller.js
│   └── routes/
│       ├── order.routes.js
│       ├── auth.routes.js
│       ├── product.routes.js
│       └── imageUpload.routes.js
├── core/
│   ├── services/
│   │   ├── order.service.js
│   │   ├── auth.service.js
│   │   └── product.service.js
│   └── repositories/
│       ├── order.repository.js
│       ├── user.repository.js
│       └── product.repository.js
└── infrastructure/
    └── external/
        └── vision/
            └── VisionOCRService.js
```

---

## 🎯 Benefits for AI Tools

### 1. Predictable Structure

AI can easily find related files:
```
Looking for order logic?
- order.controller.js (HTTP)
- order.service.js (Business)
- order.repository.js (Database)
- order.routes.js (Routes)
- order.worker.js (Background)
```

### 2. Clear Responsibility

File name indicates purpose:
```
*.controller.js → HTTP handling
*.service.js → Business logic
*.repository.js → Database queries
*.routes.js → API endpoints
*.worker.js → Background jobs
```

### 3. Easy Navigation

Alphabetical sorting groups related files:
```
order.controller.js
order.repository.js
order.routes.js
order.service.js
order.worker.js
```

### 4. Consistent Imports

```javascript
// Always predictable
const orderService = require('../services/order.service');
const orderController = require('../controllers/order.controller');
const orderRepository = require('../repositories/order.repository');
```

---

## ✅ Checklist

When creating a new file:

- [ ] Use singular resource name
- [ ] Include type suffix (`.controller`, `.service`, etc.)
- [ ] Use camelCase for compound names
- [ ] Place in correct directory
- [ ] Follow class naming convention
- [ ] Export consistently

---

## 📚 Quick Reference

| Type | Pattern | Location | Example |
|------|---------|----------|---------|
| Controller | `{resource}.controller.js` | `src/api/controllers/` | `order.controller.js` |
| Service | `{resource}.service.js` | `src/core/services/` | `order.service.js` |
| Repository | `{resource}.repository.js` | `src/core/repositories/` | `order.repository.js` |
| Routes | `{resource}.routes.js` | `src/api/routes/` | `order.routes.js` |
| Worker | `{resource}.worker.js` | `src/workers/` | `order.worker.js` |
| External | `{Service}Service.js` | `src/infrastructure/external/` | `VisionOCRService.js` |
| Middleware | `{purpose}.js` | `src/api/middleware/` | `auth.js` |
| Utility | `{purpose}.js` | `src/shared/utils/` | `asyncHandler.js` |

---

**Status**: Standard established  
**Next**: Apply to all files systematically
