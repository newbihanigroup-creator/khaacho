# Startup Validation Guide

## Overview

This guide explains how the Khaacho platform validates its configuration and database connectivity on startup, ensuring graceful failure if critical requirements are missing.

## Validation Flow

```
1. Load .env file
   ↓
2. Validate environment variables (src/config/index.js)
   ↓
3. Validate DATABASE_URL format (src/config/database.js)
   ↓
4. Run environment validator (src/utils/envValidator.js)
   ↓
5. Test database connectivity (src/server.js)
   ↓
6. Initialize Prisma Client
   ↓
7. Start Express server
```

## Validation Layers

### Layer 1: Environment Variable Validation

**File**: `src/config/index.js`

Validates required environment variables exist:
- `DATABASE_URL` - PostgreSQL connection string
- `JWT_SECRET` - JWT signing key

**Failure Behavior**: Throws error with detailed message, exits with code 1

**Error Message**:
```
╔════════════════════════════════════════════════════════════════╗
║                  CONFIGURATION ERROR                           ║
╚════════════════════════════════════════════════════════════════╝

Missing required environment variables: DATABASE_URL, JWT_SECRET

Required variables:
  - DATABASE_URL: PostgreSQL connection string
  - JWT_SECRET: Secret key for JWT tokens (min 32 characters)

Please check:
  1. .env file exists in project root
  2. All required variables are set
  3. No typos in variable names
```

### Layer 2: DATABASE_URL Format Validation

**File**: `src/config/database.js`

Validates DATABASE_URL format before creating Prisma client:
- Must start with `postgresql://` or `postgres://`
- Must be a valid connection string

**Failure Behavior**: Exits with code 1 before Prisma client creation

**Error Message**:
```
❌ FATAL ERROR: DATABASE_URL must be a PostgreSQL connection string
Current value does not start with postgresql:// or postgres://
Example: DATABASE_URL="postgresql://user:password@localhost:5432/khaacho"
```

### Layer 3: Environment Validator

**File**: `src/utils/envValidator.js`

Comprehensive validation of all environment variables:
- Type checking (string, number, boolean)
- Pattern matching (regex validation)
- Length validation (min/max)
- Allowed values validation
- Production-specific security checks

**Failure Behavior**: Throws error with list of all validation failures

**Validation Rules**:
```javascript
DATABASE_URL: {
  required: true,
  type: 'string',
  pattern: /^postgresql:\/\/.+/,
}

JWT_SECRET: {
  required: true,
  type: 'string',
  minLength: 32,
}

NODE_ENV: {
  required: true,
  allowedValues: ['development', 'production', 'test'],
}
```

### Layer 4: Database Connectivity Test

**File**: `src/server.js`

Tests actual database connectivity before starting server:
- Executes `SELECT 1` query
- Verifies Prisma can connect
- Validates credentials and network access

**Failure Behavior**: Exits with code 1 with troubleshooting guide

**Error Message**:
```
❌ STARTUP FAILED: Cannot connect to database
Error: Connection refused

Please check:
1. DATABASE_URL is correct: SET
2. Database server is running
3. Database credentials are valid
4. Network connectivity to database

DATABASE_URL format: postgresql://user:password@host:5432/database
```

## Manual Validation

### Run Validation Script

Before deploying, run the validation script:

```bash
npm run validate
```

This checks:
- ✅ All required environment variables
- ✅ DATABASE_URL format
- ✅ Database connectivity
- ✅ Migrations applied
- ✅ Critical tables exist
- ✅ Prisma schema configuration
- ⚠️  Optional variables (warnings only)

### Expected Output (Success)

```
🔍 Validating Startup Configuration...

📋 Checking Environment Variables...

  ✅ DATABASE_URL - OK
  ✅ JWT_SECRET - OK
  ✅ NODE_ENV - OK
  ✅ PORT - OK
  ✅ API_VERSION - OK

📋 Checking Redis Configuration...

  ✅ REDIS_URL - OK (using connection string)

📋 Checking Optional Variables...

  ✅ WHATSAPP_VERIFY_TOKEN - Set
  ✅ WHATSAPP_ACCESS_TOKEN - Set
  ✅ WHATSAPP_PHONE_NUMBER_ID - Set

📡 Testing Database Connection...

  ✅ Database connection successful
  ✅ Migrations applied (25 recent migrations found)

📋 Checking Critical Tables...

  ✅ User table exists
  ✅ Retailer table exists
  ✅ Vendor table exists
  ✅ Order table exists
  ✅ Product table exists

📋 Checking Prisma Configuration...

  ✅ prisma/schema.prisma exists
  ✅ Schema uses env("DATABASE_URL")
  ✅ Schema configured for PostgreSQL

======================================================================
VALIDATION SUMMARY
======================================================================

✅ VALIDATION PASSED

All checks passed! The application is ready to start.
```

### Expected Output (Failure)

```
🔍 Validating Startup Configuration...

📋 Checking Environment Variables...

  ❌ DATABASE_URL - MISSING (PostgreSQL connection string)
  ❌ JWT_SECRET - Too short (min 32 characters)
  ✅ NODE_ENV - OK

📡 Testing Database Connection...

  ❌ DATABASE_URL not set, skipping connection test

======================================================================
VALIDATION SUMMARY
======================================================================

❌ VALIDATION FAILED - Critical errors found

The application will NOT start successfully.
Please fix the errors above before deploying.
```

## Common Startup Errors

### Error 1: Missing DATABASE_URL

**Error**:
```
Missing required environment variables: DATABASE_URL
```

**Solution**:
```bash
# Add to .env file
DATABASE_URL="postgresql://user:password@localhost:5432/khaacho"
```

### Error 2: Invalid DATABASE_URL Format

**Error**:
```
DATABASE_URL must be a PostgreSQL connection string
```

**Solution**:
```bash
# Correct format
DATABASE_URL="postgresql://user:password@host:5432/database"

# NOT mysql:// or mongodb://
```

### Error 3: Database Connection Refused

**Error**:
```
Cannot connect to database
Error: Connection refused
```

**Solution**:
1. Check database server is running
2. Verify host and port are correct
3. Check firewall rules
4. Test connection: `psql $DATABASE_URL`

### Error 4: Authentication Failed

**Error**:
```
Cannot connect to database
Error: password authentication failed
```

**Solution**:
1. Verify username and password in DATABASE_URL
2. Check database user exists
3. Verify user has correct permissions

### Error 5: Database Does Not Exist

**Error**:
```
Cannot connect to database
Error: database "khaacho" does not exist
```

**Solution**:
```bash
# Create database
createdb khaacho

# Or in psql
CREATE DATABASE khaacho;
```

### Error 6: Missing Migrations

**Error**:
```
relation "users" does not exist
```

**Solution**:
```bash
# Apply migrations
npx prisma migrate deploy

# Verify migrations
npm run db:migrate:verify
```

### Error 7: Weak JWT Secret

**Error**:
```
JWT_SECRET appears to be weak or default value in production
```

**Solution**:
```bash
# Generate strong secret
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# Add to .env
JWT_SECRET=<generated-secret>
```

## Environment Variables Checklist

### Required (App Won't Start)

- [ ] `DATABASE_URL` - PostgreSQL connection string
- [ ] `JWT_SECRET` - Min 32 characters (64+ recommended for production)
- [ ] `NODE_ENV` - development, production, or test
- [ ] `PORT` - Server port (Render provides this automatically)
- [ ] `API_VERSION` - API version (e.g., v1)

### Optional (App Will Start, Features May Be Limited)

- [ ] `REDIS_URL` or (`REDIS_HOST` + `REDIS_PORT`) - For background jobs
- [ ] `WHATSAPP_VERIFY_TOKEN` - For WhatsApp webhook
- [ ] `WHATSAPP_ACCESS_TOKEN` - For WhatsApp API
- [ ] `WHATSAPP_PHONE_NUMBER_ID` - For WhatsApp messaging
- [ ] `RATE_LIMIT_WINDOW_MS` - Rate limiting window
- [ ] `RATE_LIMIT_MAX_REQUESTS` - Max requests per window
- [ ] `LOG_LEVEL` - Logging level (info, debug, error)

## Startup Sequence

### 1. Environment Loading

```javascript
require('dotenv').config();
```

Loads `.env` file into `process.env`

### 2. Config Validation

```javascript
const config = require('./config');
```

Validates required variables, throws if missing

### 3. Environment Validation

```javascript
const { validateEnvironment } = require('./utils/envValidator');
validateEnvironment();
```

Comprehensive validation of all variables

### 4. Database Connection Test

```javascript
const prisma = require('./config/database');
await prisma.$queryRaw`SELECT 1`;
```

Tests actual connectivity before starting server

### 5. Server Start

```javascript
app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
});
```

Only starts if all validations pass

## Graceful Failure

The app is designed to fail fast and provide clear error messages:

### ✅ Good Failure Behavior

```
❌ STARTUP FAILED: Cannot connect to database
Error: Connection refused

Please check:
1. DATABASE_URL is correct: SET
2. Database server is running
3. Database credentials are valid
4. Network connectivity to database

DATABASE_URL format: postgresql://user:password@host:5432/database
```

### ❌ Bad Failure Behavior (What We Avoid)

```
Error: Cannot read property 'findMany' of undefined
  at Object.<anonymous> (/app/src/services/order.service.js:45:23)
  ...
```

## Testing Startup Validation

### Test 1: Missing DATABASE_URL

```bash
# Remove DATABASE_URL
unset DATABASE_URL

# Try to start
npm start

# Expected: Clear error message, exit code 1
```

### Test 2: Invalid DATABASE_URL Format

```bash
# Set invalid format
export DATABASE_URL="mysql://localhost/db"

# Try to start
npm start

# Expected: Format validation error, exit code 1
```

### Test 3: Database Not Running

```bash
# Stop database
sudo systemctl stop postgresql

# Try to start
npm start

# Expected: Connection error with troubleshooting guide
```

### Test 4: Weak JWT Secret

```bash
# Set weak secret
export JWT_SECRET="password"

# Try to start in production
NODE_ENV=production npm start

# Expected: Security warning or error
```

## Render Deployment

On Render, validation happens during:

1. **Build Phase**: Environment variables loaded from Render dashboard
2. **Start Phase**: Validation runs before server starts
3. **Health Check**: Render monitors `/api/health` endpoint

### Render-Specific Checks

```javascript
// PORT is provided by Render
const PORT = process.env.PORT || 3000;

// DATABASE_URL is provided by linked database
const DATABASE_URL = process.env.DATABASE_URL;
```

### Render Failure Behavior

If validation fails on Render:
1. Build logs show error message
2. Service marked as "Failed"
3. Previous version continues running (if exists)
4. No downtime for existing deployments

## Best Practices

### 1. Always Run Validation Before Deploy

```bash
npm run validate
```

### 2. Use .env.example as Template

```bash
cp .env.example .env
# Edit .env with your values
```

### 3. Never Commit .env to Git

```bash
# .gitignore already includes
.env
```

### 4. Use Strong Secrets in Production

```bash
# Generate strong JWT secret
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

### 5. Test Database Connection Locally

```bash
# Test connection
psql $DATABASE_URL -c "SELECT 1"
```

### 6. Monitor Startup Logs

```bash
# Check logs for validation messages
npm start | grep "validation"
```

## Quick Commands

```bash
# Validate configuration
npm run validate

# Test database connection
psql $DATABASE_URL -c "SELECT 1"

# Generate strong JWT secret
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# Check environment variables
env | grep -E "(DATABASE_URL|JWT_SECRET|NODE_ENV)"

# Verify migrations
npm run db:migrate:verify

# Apply migrations
npm run db:migrate:deploy
```

## Related Documentation

- [RUN_MIGRATIONS_ON_RENDER.md](./RUN_MIGRATIONS_ON_RENDER.md) - Migration guide
- [RENDER_NATIVE_DEPLOYMENT.md](./RENDER_NATIVE_DEPLOYMENT.md) - Deployment guide
- [RENDER_ENVIRONMENT_VARIABLES.md](./RENDER_ENVIRONMENT_VARIABLES.md) - Environment variables
- [.env.example](./.env.example) - Example environment file

## Summary

✅ Multi-layer validation ensures app fails gracefully  
✅ Clear error messages guide troubleshooting  
✅ DATABASE_URL validated before Prisma client creation  
✅ Database connectivity tested before server starts  
✅ Validation script available: `npm run validate`  
✅ Production-specific security checks  
✅ Comprehensive error messages with solutions  

**Your app will never start with invalid configuration!** 🛡️
