# 📏 File Size Management Guide

## Rule: Maximum 300 Lines Per File

This guide shows how to keep files under 300 lines while maintaining readability and functionality.

---

## 🎯 Why 300 Lines?

### Benefits
- ✅ Easy to understand at a glance
- ✅ AI tools can process entire file
- ✅ Faster to load and navigate
- ✅ Easier to test
- ✅ Encourages modular design
- ✅ Reduces merge conflicts

### What Counts
- Code lines
- Comments
- Blank lines
- Everything in the file

---

## 🔧 Strategies to Stay Under 300 Lines

### Strategy 1: Extract Helper Functions

#### ❌ Before (400 lines)
```javascript
// order.service.js (400 lines)
class OrderService {
  async createOrder(orderData) {
    // 50 lines of validation
    // 30 lines of calculation
    // 40 lines of database operations
    // 30 lines of notification logic
    // Total: 150+ lines in one function
  }
  
  async updateOrder(orderId, data) {
    // Another 100+ lines
  }
  
  // More methods...
}
```

#### ✅ After (Split into multiple files)
```javascript
// order.service.js (200 lines)
const orderValidation = require('./helpers/order.validation');
const orderCalculation = require('./helpers/order.calculation');
const orderNotification = require('./helpers/order.notification');

class OrderService {
  async createOrder(orderData) {
    // Use helpers
    orderValidation.validateOrderData(orderData);
    const totals = orderCalculation.calculateTotals(orderData.items);
    const order = await this.orderRepository.create(orderData);
    await orderNotification.sendConfirmation(order);
    return order;
  }
}

// helpers/order.validation.js (80 lines)
// helpers/order.calculation.js (60 lines)
// helpers/order.notification.js (70 lines)
```

---

### Strategy 2: Split by Responsibility

#### ❌ Before (500 lines)
```javascript
// user.service.js (500 lines)
class UserService {
  // User CRUD (100 lines)
  async createUser() {}
  async updateUser() {}
  async deleteUser() {}
  
  // Authentication (150 lines)
  async login() {}
  async logout() {}
  async refreshToken() {}
  
  // Profile management (100 lines)
  async updateProfile() {}
  async uploadAvatar() {}
  
  // Password management (150 lines)
  async changePassword() {}
  async resetPassword() {}
  async verifyEmail() {}
}
```

#### ✅ After (Split into focused services)
```javascript
// user.service.js (150 lines)
class UserService {
  async createUser() {}
  async updateUser() {}
  async deleteUser() {}
  async getUser() {}
}

// auth.service.js (200 lines)
class AuthService {
  async login() {}
  async logout() {}
  async refreshToken() {}
  async verifyToken() {}
}

// userProfile.service.js (120 lines)
class UserProfileService {
  async updateProfile() {}
  async uploadAvatar() {}
  async getProfile() {}
}

// password.service.js (180 lines)
class PasswordService {
  async changePassword() {}
  async resetPassword() {}
  async verifyEmail() {}
  async sendResetEmail() {}
}
```

---

### Strategy 3: Extract Constants and Config

#### ❌ Before
```javascript
// order.service.js (350 lines)
class OrderService {
  constructor() {
    // 50 lines of constants
    this.ORDER_STATUSES = {
      PENDING: 'PENDING',
      CONFIRMED: 'CONFIRMED',
      // ... 20 more statuses
    };
    
    this.STATUS_TRANSITIONS = {
      // ... 30 lines of transitions
    };
    
    this.VALIDATION_RULES = {
      // ... 20 lines of rules
    };
  }
  
  // Methods (250 lines)
}
```

#### ✅ After
```javascript
// order.service.js (200 lines)
const { ORDER_STATUS, ORDER_STATUS_TRANSITIONS } = require('../../shared/constants');
const orderValidationRules = require('./config/order.validation.rules');

class OrderService {
  constructor() {
    this.validationRules = orderValidationRules;
  }
  
  // Methods (180 lines)
}

// shared/constants/index.js
// config/order.validation.rules.js
```

---

### Strategy 4: Create Utility Modules

#### ❌ Before
```javascript
// order.service.js (400 lines)
class OrderService {
  // Business logic (200 lines)
  
  // Utility functions (200 lines)
  formatOrderNumber(date, sequence) {
    // 20 lines
  }
  
  calculateTax(amount) {
    // 15 lines
  }
  
  formatCurrency(amount) {
    // 10 lines
  }
  
  generateInvoice(order) {
    // 50 lines
  }
  
  // More utilities...
}
```

#### ✅ After
```javascript
// order.service.js (200 lines)
const orderUtils = require('./utils/order.utils');
const invoiceGenerator = require('./utils/invoice.generator');

class OrderService {
  // Business logic only (180 lines)
  
  async createOrder(orderData) {
    const orderNumber = orderUtils.formatOrderNumber(new Date(), sequence);
    const tax = orderUtils.calculateTax(total);
    // ...
  }
}

// utils/order.utils.js (100 lines)
// utils/invoice.generator.js (80 lines)
```

---

### Strategy 5: Split Large Controllers

#### ❌ Before
```javascript
// order.controller.js (400 lines)
class OrderController {
  // CRUD operations (150 lines)
  async getOrder(req, res) {}
  async createOrder(req, res) {}
  async updateOrder(req, res) {}
  async deleteOrder(req, res) {}
  
  // Status management (100 lines)
  async updateStatus(req, res) {}
  async cancelOrder(req, res) {}
  async confirmOrder(req, res) {}
  
  // Reports (150 lines)
  async getOrderReport(req, res) {}
  async exportOrders(req, res) {}
  async getStatistics(req, res) {}
}
```

#### ✅ After
```javascript
// order.controller.js (200 lines)
class OrderController {
  async getOrder(req, res) {}
  async createOrder(req, res) {}
  async updateOrder(req, res) {}
  async deleteOrder(req, res) {}
}

// orderStatus.controller.js (150 lines)
class OrderStatusController {
  async updateStatus(req, res) {}
  async cancelOrder(req, res) {}
  async confirmOrder(req, res) {}
}

// orderReport.controller.js (180 lines)
class OrderReportController {
  async getOrderReport(req, res) {}
  async exportOrders(req, res) {}
  async getStatistics(req, res) {}
}
```

---

## 📁 File Organization Patterns

### Pattern 1: Main + Helpers

```
order/
├── order.service.js (200 lines)
└── helpers/
    ├── order.validation.js (80 lines)
    ├── order.calculation.js (60 lines)
    └── order.notification.js (70 lines)
```

### Pattern 2: Main + Utils

```
order/
├── order.service.js (200 lines)
└── utils/
    ├── order.utils.js (100 lines)
    ├── orderNumber.generator.js (50 lines)
    └── invoice.generator.js (80 lines)
```

### Pattern 3: Split by Feature

```
order/
├── order.service.js (200 lines) - CRUD
├── orderStatus.service.js (150 lines) - Status management
├── orderPayment.service.js (180 lines) - Payment handling
└── orderNotification.service.js (120 lines) - Notifications
```

### Pattern 4: Main + Config

```
order/
├── order.service.js (200 lines)
└── config/
    ├── order.constants.js (50 lines)
    ├── order.validation.rules.js (60 lines)
    └── order.status.transitions.js (40 lines)
```

---

## 🔍 Real Example: OrderService Refactoring

### Before (450 lines)

```javascript
// order.service.js (450 lines)
const OrderRepository = require('../repositories/order.repository');

class OrderService {
  constructor(prisma) {
    this.orderRepository = new OrderRepository(prisma);
    
    // Constants (50 lines)
    this.ORDER_STATUSES = { /* ... */ };
    this.STATUS_TRANSITIONS = { /* ... */ };
    this.VALIDATION_RULES = { /* ... */ };
  }
  
  // CRUD operations (150 lines)
  async getOrderById(orderId, userId, userRole) { /* 30 lines */ }
  async getOrders(filters, userId, userRole) { /* 40 lines */ }
  async createOrder(orderData, userId, userRole) { /* 40 lines */ }
  async updateOrder(orderId, data, userId, userRole) { /* 40 lines */ }
  
  // Status management (100 lines)
  async updateOrderStatus(orderId, status, notes) { /* 30 lines */ }
  async cancelOrder(orderId, reason) { /* 30 lines */ }
  async confirmOrder(orderId) { /* 20 lines */ }
  async completeOrder(orderId) { /* 20 lines */ }
  
  // Validation (80 lines)
  validateOrderData(orderData) { /* 30 lines */ }
  validateStatusTransition(current, next) { /* 20 lines */ }
  validateOrderAccess(order, userId, userRole) { /* 30 lines */ }
  
  // Calculations (70 lines)
  calculateOrderTotals(items) { /* 20 lines */ }
  calculateTax(amount) { /* 15 lines */ }
  calculateDiscount(order) { /* 20 lines */ }
  applyPromotions(order) { /* 15 lines */ }
}
```

### After (Split into 250 lines + helpers)

```javascript
// order.service.js (250 lines)
const OrderRepository = require('../repositories/order.repository');
const { ORDER_STATUS, ORDER_STATUS_TRANSITIONS } = require('../../shared/constants');
const orderValidation = require('./helpers/order.validation');
const orderCalculation = require('./helpers/order.calculation');
const orderAuthorization = require('./helpers/order.authorization');

class OrderService {
  constructor(prisma) {
    this.orderRepository = new OrderRepository(prisma);
  }
  
  // CRUD operations (120 lines)
  async getOrderById(orderId, userId, userRole) {
    const order = await this.orderRepository.findByIdWithDetails(orderId);
    orderAuthorization.verifyAccess(order, userId, userRole);
    return order;
  }
  
  async createOrder(orderData, userId, userRole) {
    orderValidation.validateOrderData(orderData);
    const totals = orderCalculation.calculateOrderTotals(orderData.items);
    return await this.orderRepository.createWithItems(orderData, totals);
  }
  
  // Status management (80 lines)
  async updateOrderStatus(orderId, status, notes) {
    const order = await this.orderRepository.findById(orderId);
    orderValidation.validateStatusTransition(order.status, status);
    return await this.orderRepository.updateStatus(orderId, status, notes);
  }
  
  // Other methods (50 lines)
}

// helpers/order.validation.js (90 lines)
// helpers/order.calculation.js (70 lines)
// helpers/order.authorization.js (60 lines)
```

---

## ✅ Checklist for File Size Management

### Before Creating a File

- [ ] Will this file exceed 300 lines?
- [ ] Can I split responsibilities?
- [ ] Can I extract helpers?
- [ ] Can I move constants out?
- [ ] Can I create utility modules?

### When File Approaches 300 Lines

- [ ] Identify helper functions
- [ ] Extract validation logic
- [ ] Extract calculation logic
- [ ] Move constants to shared
- [ ] Create utility modules
- [ ] Split by feature if needed

### After Splitting

- [ ] Each file under 300 lines
- [ ] Clear file names
- [ ] Logical organization
- [ ] Easy to find code
- [ ] Maintains functionality

---

## 📊 File Size Targets

| File Type | Target Lines | Maximum Lines |
|-----------|--------------|---------------|
| Controller | 150-200 | 300 |
| Service | 200-250 | 300 |
| Repository | 150-200 | 300 |
| Worker | 100-150 | 300 |
| Utility | 50-100 | 200 |
| Helper | 50-100 | 200 |
| Constants | 50-100 | 200 |

---

## 🎯 Benefits Summary

### For AI Tools
- ✅ Can process entire file in context
- ✅ Easier to understand structure
- ✅ Faster analysis
- ✅ Better code suggestions

### For Developers
- ✅ Easier to navigate
- ✅ Faster to understand
- ✅ Easier to test
- ✅ Reduces cognitive load

### For Codebase
- ✅ More modular
- ✅ Better organized
- ✅ Easier to maintain
- ✅ Encourages reuse

---

**Rule**: Keep all files under 300 lines  
**Strategy**: Extract, split, organize  
**Result**: Clean, maintainable, AI-friendly code
