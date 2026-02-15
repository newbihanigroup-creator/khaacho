# 📖 Code Readability Guide

## Overview

This guide outlines the readability standards applied across the codebase to ensure maintainable, clean, and professional code.

---

## ✅ Readability Improvements Applied

### 1. Constants Instead of Magic Numbers

#### ❌ Before (Bad)
```javascript
if (file.size > 10485760) {
  throw new Error('File too large');
}

const skip = (page - 1) * 20;
```

#### ✅ After (Good)
```javascript
const { FILE_UPLOAD, PAGINATION } = require('../shared/constants');

if (file.size > FILE_UPLOAD.MAX_SIZE_BYTES) {
  throw new Error('File too large');
}

const skip = (page - 1) * PAGINATION.DEFAULT_LIMIT;
```

**Benefits:**
- Self-documenting code
- Easy to update values
- Prevents typos
- Centralized configuration

---

### 2. Clear Function Names

#### ❌ Before (Bad)
```javascript
async get(id) { }
async check(order, user) { }
async do(data) { }
```

#### ✅ After (Good)
```javascript
async getOrderById(orderId) { }
async verifyOrderAccess(order, userId, userRole) { }
async createOrderWithItems(orderData) { }
```

**Rules:**
- Use verbs for actions: `create`, `update`, `delete`, `validate`, `verify`
- Be specific: `getOrderById` not `get`
- Describe intent: `verifyOrderAccess` not `check`
- Avoid abbreviations: `calculateOrderTotals` not `calcTotals`

---

### 3. Maximum Function Length: 30 Lines

#### ❌ Before (Bad)
```javascript
async createOrder(data) {
  // 100+ lines of validation, calculation, database calls, logging
  // Hard to understand, test, and maintain
}
```

#### ✅ After (Good)
```javascript
async createOrder(orderData, userId, userRole) {
  this.validateOrderData(orderData);
  const orderTotals = this.calculateOrderTotals(orderData.items);
  const orderNumber = await this.generateUniqueOrderNumber();
  return await this.createOrderWithItems(orderData, orderNumber, orderTotals);
}

// Each helper function is < 30 lines
validateOrderData(orderData) { }
calculateOrderTotals(items) { }
generateUniqueOrderNumber() { }
createOrderWithItems(orderData, orderNumber, orderTotals) { }
```

**Benefits:**
- Easy to understand at a glance
- Each function has single responsibility
- Easy to test individually
- Easy to reuse

---

### 4. Extract Complex Logic into Helper Functions

#### ❌ Before (Bad)
```javascript
async getOrders(filters, userId, userRole) {
  const { page = 1, limit = 20 } = filters;
  const skip = (page - 1) * limit;
  
  let result;
  if (userRole === 'RETAILER') {
    result = await this.repo.findByRetailer(userId, { skip, take: limit });
  } else if (userRole === 'WHOLESALER') {
    result = await this.repo.findByWholesaler(userId, { skip, take: limit });
  } else {
    result = await this.repo.findMany({ skip, take: limit });
  }
  
  return {
    orders: result.items,
    pagination: { page, limit, total: result.total },
  };
}
```

#### ✅ After (Good)
```javascript
async getOrders(filters, userId, userRole) {
  const paginationParams = this.extractPaginationParams(filters);
  const queryFilters = this.extractQueryFilters(filters);
  
  const result = await this.fetchOrdersByRole(
    userRole,
    userId,
    filters,
    queryFilters,
    paginationParams
  );
  
  return this.formatOrdersResponse(result, paginationParams);
}

// Helper functions
extractPaginationParams(filters) { }
extractQueryFilters(filters) { }
fetchOrdersByRole(userRole, userId, filters, queryFilters, paginationParams) { }
formatOrdersResponse(result, paginationParams) { }
```

**Benefits:**
- Main function shows high-level flow
- Each helper has clear purpose
- Easy to test each piece
- Easy to modify individual parts

---

### 5. JSDoc Comments for Services

#### ❌ Before (Bad)
```javascript
class OrderService {
  async getOrderById(orderId, userId, userRole) {
    // No documentation
  }
}
```

#### ✅ After (Good)
```javascript
/**
 * Order Service
 * Handles all business logic related to order operations
 * 
 * @class OrderService
 */
class OrderService {
  /**
   * Retrieves an order by its ID with authorization check
   * 
   * @param {string} orderId - The order ID to retrieve
   * @param {string} userId - The requesting user's ID
   * @param {string} userRole - The requesting user's role
   * @returns {Promise<Object>} The order with full details
   * @throws {NotFoundError} If order doesn't exist
   * @throws {ForbiddenError} If user doesn't have access
   */
  async getOrderById(orderId, userId, userRole) {
    // Implementation
  }
}
```

**Benefits:**
- Clear documentation
- IDE autocomplete support
- Type hints
- Error documentation
- Easy onboarding for new developers

---

### 6. Standardized Async/Await Usage

#### ❌ Before (Bad)
```javascript
// Mixed promises and async/await
function getOrder(id) {
  return prisma.order.findUnique({ where: { id } })
    .then(order => {
      if (!order) throw new Error('Not found');
      return order;
    })
    .catch(error => {
      console.log(error);
      throw error;
    });
}
```

#### ✅ After (Good)
```javascript
/**
 * Retrieves an order by ID
 */
async function getOrderById(orderId) {
  try {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
    });
    
    if (!order) {
      throw new NotFoundError('Order', orderId);
    }
    
    return order;
  } catch (error) {
    logger.error('Failed to retrieve order', { orderId, error: error.message });
    throw error;
  }
}
```

**Rules:**
- Always use `async/await` (no `.then()` chains)
- Use try/catch for error handling
- Use structured error classes
- Log errors with context

---

### 7. Use Logger Instead of console.log

#### ❌ Before (Bad)
```javascript
console.log('Creating order');
console.log('Order created:', order.id);
console.error('Error:', error);
```

#### ✅ After (Good)
```javascript
const logger = require('../shared/logger');

logger.info('Creating order', { userId, itemCount: items.length });
logger.info('Order created successfully', { orderId: order.id, orderNumber });
logger.error('Order creation failed', { userId, error: error.message, stack: error.stack });
```

**Benefits:**
- Structured logging
- Log levels (info, warn, error, debug)
- Searchable logs
- Context included
- Production-ready

---

### 8. Consistent Error Messages

#### ❌ Before (Bad)
```javascript
throw new Error('not found');
throw new Error('Order not found');
throw new Error('Cannot find order');
```

#### ✅ After (Good)
```javascript
const { NotFoundError } = require('../shared/errors');

throw new NotFoundError('Order', orderId);
// Message: "Order not found: 12345"
```

**Rules:**
- Use error classes
- Include resource type
- Include identifier
- Consistent format
- Include context in details

---

## 📋 Readability Checklist

### For Every Function

- [ ] Function name clearly describes what it does
- [ ] Function is less than 30 lines
- [ ] Complex logic extracted to helper functions
- [ ] Has JSDoc comment (for public methods)
- [ ] Uses constants instead of magic numbers
- [ ] Uses async/await (no .then() chains)
- [ ] Uses logger instead of console.log
- [ ] Uses error classes instead of Error()
- [ ] Has single responsibility
- [ ] Easy to understand at a glance

### For Every Service

- [ ] Class has JSDoc comment
- [ ] All public methods have JSDoc comments
- [ ] Private methods marked with @private
- [ ] Uses constants from shared/constants
- [ ] Uses logger for all logging
- [ ] Uses error classes for all errors
- [ ] Helper functions extracted
- [ ] No function > 30 lines

### For Every File

- [ ] Imports organized (external, internal, constants)
- [ ] No console.log statements
- [ ] No magic numbers
- [ ] No magic strings
- [ ] Consistent naming conventions
- [ ] Clear variable names
- [ ] Comments for complex logic only

---

## 🎯 Examples

### Example 1: Well-Structured Service Method

```javascript
/**
 * Creates a new order with validation and credit checks
 * 
 * @param {Object} orderData - Order data including items and delivery info
 * @param {string} userId - The creating user's ID
 * @param {string} userRole - The creating user's role
 * @returns {Promise<Object>} The created order
 * @throws {ValidationError} If order data is invalid
 */
async createOrder(orderData, userId, userRole) {
  logger.info('Creating new order', { userId, userRole, itemCount: orderData.items?.length });

  this.validateOrderData(orderData);
  const orderTotals = this.calculateOrderTotals(orderData.items);
  const orderNumber = await this.generateUniqueOrderNumber();
  const order = await this.createOrderWithItems(orderData, orderNumber, orderTotals);

  logger.info('Order created successfully', { orderId: order.id, orderNumber });

  return order;
}
```

**Why it's good:**
- Clear JSDoc documentation
- Descriptive function name
- Structured logging with context
- Extracted helper functions
- Less than 30 lines
- Single responsibility
- Easy to understand flow

### Example 2: Helper Function Extraction

```javascript
// Main function - shows high-level flow
async getOrders(filters, userId, userRole) {
  const paginationParams = this.extractPaginationParams(filters);
  const result = await this.fetchOrdersByRole(userRole, userId, paginationParams);
  return this.formatOrdersResponse(result, paginationParams);
}

// Helper 1 - Extract pagination
extractPaginationParams(filters) {
  const page = parseInt(filters.page) || PAGINATION.DEFAULT_PAGE;
  const limit = parseInt(filters.limit) || PAGINATION.DEFAULT_LIMIT;
  const skip = (page - 1) * limit;
  return { page, limit, skip };
}

// Helper 2 - Fetch by role
async fetchOrdersByRole(userRole, userId, paginationParams) {
  if (userRole === USER_ROLES.RETAILER) {
    return await this.fetchRetailerOrders(userId, paginationParams);
  }
  // ... other roles
}

// Helper 3 - Format response
formatOrdersResponse(result, paginationParams) {
  return {
    orders: result.items,
    pagination: {
      page: paginationParams.page,
      limit: paginationParams.limit,
      total: result.total,
    },
  };
}
```

### Example 3: Using Constants

```javascript
const {
  ORDER_STATUS,
  ORDER_STATUS_TRANSITIONS,
  CANCELLABLE_ORDER_STATUSES,
  USER_ROLES,
  ADMIN_ROLES,
} = require('../shared/constants');

// Instead of: if (status === 'PENDING')
if (status === ORDER_STATUS.PENDING) { }

// Instead of: const allowed = ['PENDING', 'CONFIRMED', 'PROCESSING']
const allowed = CANCELLABLE_ORDER_STATUSES;

// Instead of: if (role === 'ADMIN' || role === 'OPERATOR')
if (ADMIN_ROLES.includes(role)) { }
```

---

## 🚀 Migration Strategy

### Phase 1: Foundation (✅ Complete)
- [x] Create constants file
- [x] Refactor OrderService as example
- [x] Document patterns

### Phase 2: Service Layer
- [ ] Refactor all services following OrderService pattern
- [ ] Add JSDoc comments
- [ ] Extract helper functions
- [ ] Use constants
- [ ] Use logger

### Phase 3: Controllers & Routes
- [ ] Simplify controllers
- [ ] Add JSDoc comments
- [ ] Use constants

### Phase 4: Workers
- [ ] Refactor workers
- [ ] Use logger
- [ ] Extract helper functions

### Phase 5: Cleanup
- [ ] Remove all console.log
- [ ] Replace all magic numbers
- [ ] Verify all functions < 30 lines
- [ ] Add missing JSDoc comments

---

## 📚 Resources

- **Constants**: `src/shared/constants/index.js`
- **Logger**: `src/shared/logger/index.js`
- **Error Classes**: `src/shared/errors/index.js`
- **Example Service**: `src/core/services/OrderService.js`

---

## ✨ Benefits Summary

1. **Maintainability**: Easy to understand and modify
2. **Testability**: Small functions easy to test
3. **Debugging**: Clear logs with context
4. **Onboarding**: New developers understand quickly
5. **Consistency**: Same patterns everywhere
6. **Quality**: Professional, production-ready code

---

**Status**: OrderService refactored as reference implementation  
**Next**: Apply same patterns to all services
