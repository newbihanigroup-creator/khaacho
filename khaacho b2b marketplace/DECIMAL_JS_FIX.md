# Fix: decimal.js Missing in Production

## Problem

Error on Render:
```
Error: Cannot find module 'decimal.js'
```

## Root Cause

The module `decimal.js` is listed in `package.json` dependencies, but Render production build is not finding it. This can happen due to:

1. **Package-lock.json out of sync** - Lock file doesn't match package.json
2. **Build cache issue** - Render cached old node_modules without decimal.js
3. **Inconsistent import patterns** - Some files use inline `require()` which can cause issues

## Solution

### 1. Verify decimal.js is in dependencies (✅ Already Done)

```json
{
  "dependencies": {
    "decimal.js": "^10.4.3"
  }
}
```

**Status**: ✅ Already in dependencies (correct location)

### 2. Regenerate package-lock.json

```bash
# Remove old lock file and node_modules
rm -rf node_modules package-lock.json

# Clean npm cache
npm cache clean --force

# Reinstall everything
npm install

# Verify decimal.js is installed
npm list decimal.js
```

Expected output:
```
khaacho-platform@1.0.0
└── decimal.js@10.4.3
```

### 3. Fix Import Pattern (Recommended)

**Current Problem**: Inline `require()` calls scattered throughout code

**Bad Pattern** (causes issues):
```javascript
// ❌ Inline require - can cause module resolution issues
const value = new (require('decimal.js'))(0);
```

**Good Pattern** (recommended):
```javascript
// ✅ Import at top of file
const Decimal = require('decimal.js');

// Then use it
const value = new Decimal(0);
```

### 4. Update Files with Inline Requires

Files that need fixing:
- `src/controllers/creditControl.controller.js`
- `src/services/creditLedger.service.js`
- `src/services/paymentProcessing.service.js`

**Example Fix for creditControl.controller.js**:

```javascript
// Add at top of file
const Decimal = require('decimal.js');

// Replace inline requires
// Before:
const creditUtilization = retailer.creditLimit.gt(0) ? 
  retailer.outstandingDebt.div(retailer.creditLimit).mul(100) : 
  new (require('decimal.js'))(0);

// After:
const creditUtilization = retailer.creditLimit.gt(0) ? 
  retailer.outstandingDebt.div(retailer.creditLimit).mul(100) : 
  new Decimal(0);
```

## Correct Import Syntax (CommonJS)

### ✅ Correct Way

```javascript
// At top of file
const Decimal = require('decimal.js');

// Usage examples
const zero = new Decimal(0);
const price = new Decimal('99.99');
const total = price.mul(quantity);
const percentage = value.div(total).mul(100);
```

### ❌ Incorrect Ways

```javascript
// Don't use inline require
const value = new (require('decimal.js'))(0); // ❌

// Don't use ES6 import in CommonJS
import Decimal from 'decimal.js'; // ❌ (only for ES modules)
```

## Why decimal.js Should Be a Dependency (Not devDependency)

**Answer**: `decimal.js` MUST be in `dependencies` (production dependencies)

**Reason**:
- Used in production code (services, controllers)
- Required at runtime for credit calculations
- Not a development tool (like nodemon, eslint)

**Rule**:
- `dependencies` = Required in production ✅
- `devDependencies` = Only needed for development (testing, linting, etc.)

## Exact npm Command

```bash
# Install decimal.js as production dependency
npm install decimal.js --save

# Or specify exact version
npm install decimal.js@10.4.3 --save
```

**Note**: `--save` adds to `dependencies` (default behavior in npm 5+)

## Render Deployment Fix

### Option 1: Clear Build Cache (Recommended)

1. Go to Render Dashboard
2. Select your service
3. Go to "Settings"
4. Click "Clear Build Cache"
5. Trigger manual deploy

### Option 2: Force Reinstall in Build Command

Update `render.yaml`:

```yaml
buildCommand: rm -rf node_modules && npm install && npx prisma generate && npx prisma migrate deploy
```

This forces fresh install on every build.

### Option 3: Commit Fresh package-lock.json

```bash
# Regenerate lock file
rm -rf node_modules package-lock.json
npm install

# Commit
git add package-lock.json
git commit -m "Regenerate package-lock.json to fix decimal.js"
git push origin main
```

## Verification Steps

### 1. Local Verification

```bash
# Check decimal.js is installed
npm list decimal.js

# Should show:
# khaacho-platform@1.0.0
# └── decimal.js@10.4.3

# Test import
node -e "const Decimal = require('decimal.js'); console.log(new Decimal(100));"

# Should output: 100
```

### 2. Production Verification (Render)

Check build logs for:
```
npm install
...
added 193 packages
```

Check that decimal.js is in the list.

### 3. Runtime Verification

Add to startup:
```javascript
// In src/server.js (temporary test)
try {
  const Decimal = require('decimal.js');
  logger.info('✅ decimal.js loaded successfully', { version: Decimal.version });
} catch (error) {
  logger.error('❌ decimal.js failed to load', { error: error.message });
}
```

## Quick Fix Commands

```bash
# 1. Clean and reinstall
rm -rf node_modules package-lock.json
npm cache clean --force
npm install

# 2. Verify installation
npm list decimal.js

# 3. Commit changes
git add package-lock.json
git commit -m "Fix: Regenerate package-lock.json for decimal.js"
git push origin main

# 4. Clear Render build cache
# (Do this in Render Dashboard → Settings → Clear Build Cache)

# 5. Redeploy
# (Render will auto-deploy on push, or trigger manual deploy)
```

## Prevention

### 1. Always Use Top-Level Imports

```javascript
// ✅ Good - at top of file
const Decimal = require('decimal.js');

// ❌ Bad - inline require
const value = new (require('decimal.js'))(0);
```

### 2. Keep package-lock.json in Git

```bash
# .gitignore should NOT include:
# package-lock.json  # ❌ Don't ignore this!

# package-lock.json ensures consistent installs
```

### 3. Test Production Build Locally

```bash
# Simulate production install
rm -rf node_modules
NODE_ENV=production npm install --production=false
npm start
```

## Summary

### ✅ What to Do

1. **Regenerate package-lock.json**:
   ```bash
   rm -rf node_modules package-lock.json
   npm install
   ```

2. **Commit and push**:
   ```bash
   git add package-lock.json
   git commit -m "Fix: Regenerate package-lock.json for decimal.js"
   git push origin main
   ```

3. **Clear Render build cache**:
   - Dashboard → Settings → Clear Build Cache

4. **Redeploy**:
   - Render will auto-deploy or trigger manual deploy

### ✅ Correct Usage

```javascript
// At top of file
const Decimal = require('decimal.js');

// Usage
const zero = new Decimal(0);
const price = new Decimal('99.99');
const total = price.mul(quantity);
```

### ✅ Location

- **dependencies** ✅ (production)
- **NOT devDependencies** ❌

### ✅ Import Pattern

- **CommonJS**: `const Decimal = require('decimal.js');` ✅
- **NOT ES6**: `import Decimal from 'decimal.js';` ❌ (unless using ES modules)

---

**Status**: decimal.js is already in dependencies, just need to regenerate package-lock.json and clear Render cache.
