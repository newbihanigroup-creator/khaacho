# 🎯 Avoiding Deep Nesting Guide

## Rule: Maximum 3 Levels of Nesting

Deep nesting makes code hard to read and understand. This guide shows how to write flat, readable code.

---

## ❌ The Problem: Deep Nesting

### Example of Bad Code (5+ levels)

```javascript
async function processOrder(orderId) {
  const order = await getOrder(orderId);
  
  if (order) {                                    // Level 1
    if (order.status === 'PENDING') {             // Level 2
      if (order.items && order.items.length > 0) { // Level 3
        for (const item of order.items) {         // Level 4
          if (item.quantity > 0) {                // Level 5
            if (item.product) {                   // Level 6
              // Finally do something!
              await processItem(item);
            }
          }
        }
      }
    }
  }
}
```

**Problems**:
- Hard to read
- Hard to understand
- Hard to test
- Hard to maintain
- Easy to introduce bugs

---

## ✅ Solution 1: Early Returns (Guard Clauses)

### Before (Deep Nesting)

```javascript
async function processOrder(orderId) {
  const order = await getOrder(orderId);
  
  if (order) {
    if (order.status === 'PENDING') {
      if (order.items && order.items.length > 0) {
        // Process order
        return await processItems(order.items);
      }
    }
  }
  
  return null;
}
```

### After (Early Returns)

```javascript
async function processOrder(orderId) {
  // Guard clause: Check order exists
  const order = await getOrder(orderId);
  if (!order) {
    return null;
  }
  
  // Guard clause: Check status
  if (order.status !== 'PENDING') {
    return null;
  }
  
  // Guard clause: Check items
  if (!order.items || order.items.length === 0) {
    return null;
  }
  
  // Main logic at top level
  return await processItems(order.items);
}
```

**Benefits**:
- ✅ Flat structure
- ✅ Easy to read
- ✅ Clear validation flow
- ✅ Main logic visible

---

## ✅ Solution 2: Extract Functions

### Before (Nested Logic)

```javascript
async function createOrder(orderData) {
  if (orderData) {
    if (orderData.items) {
      if (orderData.items.length > 0) {
        let total = 0;
        for (const item of orderData.items) {
          if (item.quantity > 0) {
            if (item.price > 0) {
              total += item.quantity * item.price;
            }
          }
        }
        
        if (total > 0) {
          const order = await saveOrder({
            ...orderData,
            total
          });
          return order;
        }
      }
    }
  }
  
  throw new Error('Invalid order data');
}
```

### After (Extracted Functions)

```javascript
async function createOrder(orderData) {
  // Validate at top level
  validateOrderData(orderData);
  
  // Calculate at top level
  const total = calculateOrderTotal(orderData.items);
  
  // Save at top level
  return await saveOrder({ ...orderData, total });
}

function validateOrderData(orderData) {
  if (!orderData) {
    throw new Error('Order data is required');
  }
  
  if (!orderData.items || orderData.items.length === 0) {
    throw new Error('Order must have items');
  }
}

function calculateOrderTotal(items) {
  return items
    .filter(item => item.quantity > 0 && item.price > 0)
    .reduce((sum, item) => sum + (item.quantity * item.price), 0);
}
```

**Benefits**:
- ✅ No nesting
- ✅ Each function has single purpose
- ✅ Easy to test
- ✅ Reusable functions

---

## ✅ Solution 3: Use Array Methods

### Before (Nested Loops)

```javascript
function findMatchingProducts(orders, productId) {
  const matches = [];
  
  if (orders) {
    for (const order of orders) {
      if (order.items) {
        for (const item of order.items) {
          if (item.productId === productId) {
            if (item.quantity > 0) {
              matches.push(item);
            }
          }
        }
      }
    }
  }
  
  return matches;
}
```

### After (Array Methods)

```javascript
function findMatchingProducts(orders, productId) {
  if (!orders) {
    return [];
  }
  
  return orders
    .flatMap(order => order.items || [])
    .filter(item => item.productId === productId && item.quantity > 0);
}
```

**Benefits**:
- ✅ No nesting
- ✅ Declarative
- ✅ Easier to read
- ✅ Functional style

---

## ✅ Solution 4: Invert Conditions

### Before (Nested Conditions)

```javascript
function canProcessOrder(order, user) {
  if (user) {
    if (user.role === 'ADMIN') {
      return true;
    } else {
      if (order.retailerId === user.id) {
        if (order.status === 'PENDING') {
          return true;
        }
      }
    }
  }
  
  return false;
}
```

### After (Inverted Conditions)

```javascript
function canProcessOrder(order, user) {
  // Early return for invalid cases
  if (!user) {
    return false;
  }
  
  // Admin can process any order
  if (user.role === 'ADMIN') {
    return true;
  }
  
  // Retailer can process their own pending orders
  return order.retailerId === user.id && order.status === 'PENDING';
}
```

**Benefits**:
- ✅ Flat structure
- ✅ Clear logic flow
- ✅ Easy to understand
- ✅ Easy to extend

---

## ✅ Solution 5: Use Logical Operators

### Before (Nested Ifs)

```javascript
function isValidOrder(order) {
  if (order) {
    if (order.items) {
      if (order.items.length > 0) {
        if (order.retailerId) {
          return true;
        }
      }
    }
  }
  
  return false;
}
```

### After (Logical Operators)

```javascript
function isValidOrder(order) {
  return !!(
    order &&
    order.items &&
    order.items.length > 0 &&
    order.retailerId
  );
}
```

**Benefits**:
- ✅ One line
- ✅ Clear conditions
- ✅ No nesting

---

## ✅ Solution 6: Strategy Pattern

### Before (Nested Switch/If)

```javascript
async function processPayment(order, paymentMethod) {
  if (paymentMethod === 'CREDIT_CARD') {
    if (order.total > 0) {
      if (order.creditCard) {
        if (order.creditCard.isValid) {
          // Process credit card
          return await processCreditCard(order);
        }
      }
    }
  } else if (paymentMethod === 'BANK_TRANSFER') {
    if (order.total > 0) {
      if (order.bankAccount) {
        // Process bank transfer
        return await processBankTransfer(order);
      }
    }
  } else if (paymentMethod === 'CASH') {
    // Process cash
    return await processCash(order);
  }
  
  throw new Error('Invalid payment method');
}
```

### After (Strategy Pattern)

```javascript
const paymentStrategies = {
  CREDIT_CARD: processCreditCard,
  BANK_TRANSFER: processBankTransfer,
  CASH: processCash,
};

async function processPayment(order, paymentMethod) {
  const strategy = paymentStrategies[paymentMethod];
  
  if (!strategy) {
    throw new Error('Invalid payment method');
  }
  
  return await strategy(order);
}

async function processCreditCard(order) {
  if (order.total <= 0) {
    throw new Error('Invalid amount');
  }
  
  if (!order.creditCard?.isValid) {
    throw new Error('Invalid credit card');
  }
  
  // Process payment
  return await chargeCreditCard(order);
}
```

**Benefits**:
- ✅ No nesting
- ✅ Easy to add new methods
- ✅ Each method isolated
- ✅ Easy to test

---

## 📋 Practical Examples

### Example 1: Order Validation

#### ❌ Before (4 levels)

```javascript
function validateOrder(order) {
  if (order) {
    if (order.items) {
      if (order.items.length > 0) {
        for (const item of order.items) {
          if (!item.productId) {
            throw new Error('Product ID required');
          }
        }
      } else {
        throw new Error('Order must have items');
      }
    } else {
      throw new Error('Items required');
    }
  } else {
    throw new Error('Order required');
  }
}
```

#### ✅ After (1 level)

```javascript
function validateOrder(order) {
  // Guard clauses
  if (!order) {
    throw new Error('Order required');
  }
  
  if (!order.items) {
    throw new Error('Items required');
  }
  
  if (order.items.length === 0) {
    throw new Error('Order must have items');
  }
  
  // Validate each item
  const invalidItem = order.items.find(item => !item.productId);
  if (invalidItem) {
    throw new Error('Product ID required');
  }
}
```

---

### Example 2: Authorization Check

#### ❌ Before (5 levels)

```javascript
function checkAccess(resource, user) {
  if (user) {
    if (user.role) {
      if (user.role === 'ADMIN') {
        return true;
      } else {
        if (resource.ownerId) {
          if (resource.ownerId === user.id) {
            return true;
          }
        }
      }
    }
  }
  
  return false;
}
```

#### ✅ After (1 level)

```javascript
function checkAccess(resource, user) {
  // No user = no access
  if (!user || !user.role) {
    return false;
  }
  
  // Admin has access to everything
  if (user.role === 'ADMIN') {
    return true;
  }
  
  // Owner has access to their resources
  return resource.ownerId === user.id;
}
```

---

### Example 3: Data Processing

#### ❌ Before (4 levels)

```javascript
function processOrders(orders) {
  const results = [];
  
  if (orders) {
    for (const order of orders) {
      if (order.status === 'PENDING') {
        if (order.items) {
          for (const item of order.items) {
            if (item.quantity > 0) {
              results.push(item);
            }
          }
        }
      }
    }
  }
  
  return results;
}
```

#### ✅ After (1 level)

```javascript
function processOrders(orders) {
  if (!orders) {
    return [];
  }
  
  return orders
    .filter(order => order.status === 'PENDING')
    .flatMap(order => order.items || [])
    .filter(item => item.quantity > 0);
}
```

---

## 🎯 Quick Rules

### Rule 1: Use Early Returns
```javascript
// Instead of: if (condition) { ... }
// Use: if (!condition) return;
```

### Rule 2: Extract Functions
```javascript
// Instead of: nested logic
// Use: separate functions
```

### Rule 3: Use Array Methods
```javascript
// Instead of: nested loops
// Use: map, filter, reduce, flatMap
```

### Rule 4: Invert Conditions
```javascript
// Instead of: if (a) { if (b) { ... } }
// Use: if (!a) return; if (!b) return;
```

### Rule 5: Use Logical Operators
```javascript
// Instead of: nested ifs
// Use: && and ||
```

---

## ✅ Checklist

Before committing code:

- [ ] No more than 3 levels of nesting
- [ ] Used early returns where possible
- [ ] Extracted complex logic to functions
- [ ] Used array methods instead of loops
- [ ] Inverted conditions for clarity
- [ ] Each function has single purpose

---

## 📊 Nesting Levels

| Levels | Status | Action |
|--------|--------|--------|
| 0-1 | ✅ Excellent | Keep it up |
| 2 | ✅ Good | Acceptable |
| 3 | ⚠️ Warning | Consider refactoring |
| 4+ | ❌ Bad | Must refactor |

---

**Rule**: Maximum 3 levels of nesting  
**Strategy**: Early returns, extract functions, use array methods  
**Result**: Flat, readable, maintainable code
