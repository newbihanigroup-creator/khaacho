# Startup Database Validation - Quick Start

## Overview

Your application has comprehensive startup validation that prevents it from starting with invalid configuration or inaccessible database.

## Validation Layers

### 1. Environment Variables (src/config/validateEnv.js)
- Validates all required environment variables exist
- Checks format and patterns (DATABASE_URL, API keys, etc.)
- Exits with code 1 if validation fails

### 2. Database URL Format (src/config/database.js)
- Validates DATABASE_URL format before Prisma client creation
- Ensures PostgreSQL connection string format
- Prevents invalid connection strings

### 3. Database Connectivity (src/server.js)
- Tests actual database connection with `SELECT 1` query
- Runs before Express server starts
- Provides clear troubleshooting steps on failure

### 4. Schema Validation (scripts/validate-startup.js)
- Checks Prisma schema exists
- Verifies migrations applied
- Validates critical tables exist

## Quick Commands

```bash
# Run full validation before deployment
npm run validate

# Start server (includes automatic validation)
npm start

# Test environment validation only
node test-env-validation.js
```

## Validation Script Output

```bash
$ npm run validate

🔍 Validating Startup Configuration...

📋 Checking Environment Variables...
  ✅ DATABASE_URL - OK
  ✅ JWT_SECRET - OK
  ✅ NODE_ENV - OK

📡 Testing Database Connection...
  ✅ Database connection successful
  ✅ Migrations applied (25 recent migrations found)

📋 Checking Critical Tables...
  ✅ User table exists
  ✅ Retailer table exists
  ✅ Vendor table exists
  ✅ Order table exists
  ✅ Product table exists

✅ VALIDATION PASSED
All checks passed! The application is ready to start.
```

## Startup Sequence

```
1. Load .env file
   ↓
2. Validate environment variables
   ↓ (FAIL: Exit with code 1)
3. Validate DATABASE_URL format
   ↓ (FAIL: Exit with code 1)
4. Test database connectivity
   ↓ (FAIL: Exit with code 1)
5. Initialize Prisma Client
   ↓
6. Start Express server
   ↓
7. ✅ App running
```

## Error Examples

### Missing DATABASE_URL
```
❌ STARTUP FAILED: DATABASE_URL environment variable is not set
Please set DATABASE_URL in your .env file
Example: DATABASE_URL="postgresql://user:password@localhost:5432/khaacho"
```

### Invalid Format
```
❌ FATAL ERROR: DATABASE_URL must be a PostgreSQL connection string
Current value does not start with postgresql://
Example: DATABASE_URL="postgresql://user:password@localhost:5432/khaacho"
```

### Connection Failed
```
❌ STARTUP FAILED: Cannot connect to database
Error: Connection refused

Please check:
1. DATABASE_URL is correct: SET
2. Database server is running
3. Database credentials are valid
4. Network connectivity to database
```

## Required Environment Variables

```bash
# Required (app won't start without these)
DATABASE_URL="postgresql://user:password@host:5432/khaacho"
JWT_SECRET="your-super-secret-jwt-key-min-32-characters"
NODE_ENV="production"
PORT="10000"
API_VERSION="v1"
```

## Optional Variables

```bash
# Optional (warnings only)
REDIS_URL="redis://host:6379"
REDIS_HOST="localhost"
REDIS_PORT="6379"
WHATSAPP_VERIFY_TOKEN="your-verify-token"
WHATSAPP_ACCESS_TOKEN="your-access-token"
OPENAI_API_KEY="sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
GOOGLE_APPLICATION_CREDENTIALS="./credentials.json"
```

## Deployment on Render

### Build Command
```bash
npm install && npx prisma generate && npx prisma migrate deploy
```

### Start Command
```bash
npm start
```

### Validation Flow
1. Render runs build command
2. Migrations applied
3. Start command runs
4. Environment validated
5. Database connectivity tested
6. Server starts (only if all checks pass)

## Troubleshooting

### App Won't Start

**Check validation output:**
```bash
npm run validate
```

**Common issues:**
- DATABASE_URL not set or incorrect format
- Database server not running
- Invalid credentials
- Network connectivity issues

### Database Connection Timeout

**Check DATABASE_URL:**
```bash
echo $DATABASE_URL
```

**Test connection manually:**
```bash
psql $DATABASE_URL -c "SELECT 1"
```

### Migrations Not Applied

**Run migrations:**
```bash
npx prisma migrate deploy
```

**Verify migrations:**
```bash
node scripts/verify-migrations.js
```

## Files

- `src/config/validateEnv.js` - Environment validation
- `src/config/database.js` - Database URL validation
- `src/server.js` - Connectivity test
- `scripts/validate-startup.js` - Full validation script
- `test-env-validation.js` - Test script

## Related Documentation

- [STARTUP_VALIDATION_COMPLETE.md](./STARTUP_VALIDATION_COMPLETE.md) - Complete implementation details
- [STARTUP_VALIDATION_GUIDE.md](./STARTUP_VALIDATION_GUIDE.md) - Comprehensive guide
- [.env.example](./.env.example) - Environment variables template

## Summary

✅ Multi-layer validation prevents invalid startup  
✅ Clear error messages with troubleshooting steps  
✅ Database connectivity tested before server starts  
✅ Validation script: `npm run validate`  
✅ Production-safe with graceful failure  

Your app will never start with invalid configuration!
