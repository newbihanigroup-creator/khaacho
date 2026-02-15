# 📋 Quick Reference Card

## AI-Friendly Code Standards

---

## 📝 File Naming

```
{resource}.{type}.js
```

| Type | Pattern | Example |
|------|---------|---------|
| Controller | `{resource}.controller.js` | `order.controller.js` |
| Service | `{resource}.service.js` | `order.service.js` |
| Repository | `{resource}.repository.js` | `order.repository.js` |
| Routes | `{resource}.routes.js` | `order.routes.js` |
| Worker | `{resource}.worker.js` | `order.worker.js` |

---

## 📏 Size Limits

| Item | Limit |
|------|-------|
| File | 300 lines |
| Function | 30 lines |
| Nesting | 3 levels |

---

## 🗂️ File Locations

```
src/
├── api/
│   ├── controllers/     # *.controller.js
│   ├── routes/          # *.routes.js
│   └── middleware/      # *.js
├── core/
│   ├── services/        # *.service.js
│   └── repositories/    # *.repository.js
├── infrastructure/
│   └── external/        # *Service.js
├── workers/             # *.worker.js
└── shared/
    ├── constants/       # index.js
    ├── errors/          # *.js
    ├── logger/          # index.js
    └── utils/           # *.js
```

---

## 🎯 Layer Responsibilities

| Layer | Responsibility | What to Do | What NOT to Do |
|-------|----------------|------------|----------------|
| **Controller** | HTTP handling | Parse request, call service, format response | Business logic, database queries |
| **Service** | Business logic | Validate, authorize, orchestrate | HTTP handling, direct Prisma |
| **Repository** | Database access | Prisma queries only | Business logic, HTTP handling |
| **Worker** | Background jobs | Process jobs, use services | Duplicate business logic |

---

## 📖 Documentation

### JSDoc Template

```javascript
/**
 * Brief description of what function does
 * 
 * @param {Type} paramName - Parameter description
 * @returns {Promise<Type>} Return value description
 * @throws {ErrorType} When error occurs
 */
async functionName(paramName) {
  // Implementation
}
```

### Business Flow Template

```javascript
/**
 * Function description
 * 
 * Business Flow:
 * 1. First step
 * 2. Second step
 * 3. Third step
 */
async functionName() {
  // Step 1: First step
  doFirstStep();
  
  // Step 2: Second step
  doSecondStep();
  
  // Step 3: Third step
  doThirdStep();
}
```

---

## 🚫 Avoid Deep Nesting

### ❌ Bad (4+ levels)

```javascript
if (a) {
  if (b) {
    if (c) {
      if (d) {
        // Too deep!
      }
    }
  }
}
```

### ✅ Good (Early returns)

```javascript
if (!a) return;
if (!b) return;
if (!c) return;
if (!d) return;

// Main logic
```

---

## 📦 Module Structure

```
{module}/
├── {module}.controller.js
├── {module}.service.js
├── {module}.repository.js
├── {module}.routes.js
└── {module}.worker.js
```

---

## 🔄 Request Flow

```
Client
  ↓
Route
  ↓
Middleware (auth, validation)
  ↓
Controller (parse request)
  ↓
Service (business logic)
  ↓
Repository (database)
  ↓
Database
```

---

## 🎨 Code Style

### Constants

```javascript
const { ORDER_STATUS, USER_ROLES } = require('../shared/constants');

// Use constants
if (status === ORDER_STATUS.PENDING) { }
```

### Early Returns

```javascript
// Instead of nested ifs
if (!data) return;
if (!data.items) return;

// Main logic
```

### Array Methods

```javascript
// Instead of loops
const results = items
  .filter(item => item.active)
  .map(item => item.name);
```

### Logging

```javascript
const logger = require('../shared/logger');

logger.info('Action performed', { userId, orderId });
logger.error('Action failed', { error: error.message });
```

### Errors

```javascript
const { NotFoundError, ValidationError } = require('../shared/errors');

throw new NotFoundError('Order', orderId);
throw new ValidationError('Invalid email');
```

---

## ✅ Checklist

### Before Committing

- [ ] File name follows pattern
- [ ] File under 300 lines
- [ ] Functions under 30 lines
- [ ] Nesting max 3 levels
- [ ] JSDoc comments added
- [ ] Business flow commented
- [ ] Uses constants
- [ ] Uses logger
- [ ] Uses error classes
- [ ] No console.log

---

## 📚 Documentation Links

| Topic | Document |
|-------|----------|
| Architecture | `ARCHITECTURE_README.md` |
| File Naming | `FILE_NAMING_GUIDE.md` |
| File Size | `FILE_SIZE_MANAGEMENT.md` |
| Nesting | `AVOID_DEEP_NESTING.md` |
| Readability | `CODE_READABILITY_GUIDE.md` |
| Examples | `ARCHITECTURE_USAGE_EXAMPLES.md` |
| Summary | `AI_FRIENDLY_CODE_SUMMARY.md` |

---

## 🔍 Finding Code

| Need | Look For |
|------|----------|
| HTTP handlers | `{resource}.controller.js` |
| Business logic | `{resource}.service.js` |
| Database queries | `{resource}.repository.js` |
| API endpoints | `{resource}.routes.js` |
| Background jobs | `{resource}.worker.js` |
| Constants | `src/shared/constants/index.js` |
| Errors | `src/shared/errors/index.js` |

---

## 🎯 Quick Tips

1. **Naming**: Always use `{resource}.{type}.js`
2. **Size**: Keep files under 300 lines
3. **Functions**: Keep under 30 lines
4. **Nesting**: Max 3 levels
5. **Comments**: Explain business flow
6. **Documentation**: Add JSDoc
7. **Constants**: No magic numbers
8. **Logging**: Use logger, not console
9. **Errors**: Use error classes
10. **Consistency**: Follow patterns

---

**Print this card and keep it handy!**
