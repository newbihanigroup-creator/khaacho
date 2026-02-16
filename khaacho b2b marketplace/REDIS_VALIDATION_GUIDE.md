# Redis URL Validation Guide

## Overview

The environment validation system now includes robust Redis URL validation that:
- ✅ Validates Redis URL format strictly
- ✅ Allows optional Redis in development
- ✅ Requires Redis in production
- ✅ Prevents Render crash loops with clear error messages
- ✅ Supports all standard Redis URL formats

## Supported Redis URL Formats

### Basic Format
```bash
redis://localhost:6379
```

### With Authentication (username:password)
```bash
redis://default:mypassword@host:6379
```

### With Password Only
```bash
redis://:mypassword@host:6379
```

### With Database Selection
```bash
redis://localhost:6379/0
redis://:password@host:6379/1
```

### TLS/SSL Connection
```bash
rediss://host:6379
rediss://default:password@host:6379
```

### With Query Parameters
```bash
redis://localhost:6379?family=4
redis://host:6379?tls=true&family=6
```

## Environment-Based Behavior

### Development Mode (`NODE_ENV=development`)
- Redis is **optional**
- Missing Redis → ⚠️ Warning only, server continues
- Invalid Redis URL → ❌ Error, server exits
- Allows testing without Redis infrastructure

### Production Mode (`NODE_ENV=production`)
- Redis is **required**
- Missing Redis → ❌ Error, server exits
- Invalid Redis URL → ❌ Error, server exits
- Ensures all production features work correctly

## Validation Logic

```javascript
// src/config/validateEnv.js

const isProduction = process.env.NODE_ENV === 'production';

// Redis validation rules:
{
  name: 'REDIS_URL',
  description: 'Redis connection string',
  customValidator: validateRedisURL,
  required: false,              // Optional in development
  requiredInProduction: true,   // Required in production
}
```

## Error Messages

### Invalid Format
```
❌ Invalid Variables:
   ❌ REDIS_URL - REDIS_URL must start with redis:// or rediss://
      Received: http://localhost:6379...
      Example: redis://localhost:6379 or redis://user:pass@host:6379
```

### Missing in Production
```
❌ Missing Required Variables:
   ❌ REDIS_URL - Redis connection string
```

### Warning in Development
```
⚠️  Warnings (non-blocking):
   ⚠️  REDIS_URL: Redis connection string not configured (optional in development)
```

## Common Issues & Solutions

### Issue 1: Wrong Protocol
```bash
# ❌ Wrong
http://localhost:6379
tcp://localhost:6379

# ✅ Correct
redis://localhost:6379
```

### Issue 2: Spaces in URL
```bash
# ❌ Wrong
redis://localhost: 6379
redis:// localhost:6379

# ✅ Correct
redis://localhost:6379
```

### Issue 3: Incomplete URL
```bash
# ❌ Wrong
redis://
redis://localhost

# ✅ Correct
redis://localhost:6379
```

### Issue 4: Special Characters in Password
```bash
# If password contains special characters, URL-encode them
# Password: p@ss:word

# ❌ Wrong
redis://:p@ss:word@host:6379

# ✅ Correct
redis://:p%40ss%3Aword@host:6379
```

## Testing Validation

### Test Valid URLs
```bash
# Set valid Redis URL
export REDIS_URL="redis://localhost:6379"
npm start

# Expected: ✅ REDIS_URL configured and valid
```

### Test Invalid URLs
```bash
# Set invalid Redis URL
export REDIS_URL="http://localhost:6379"
npm start

# Expected: ❌ Error with clear message, process exits
```

### Test Missing in Development
```bash
# Unset Redis URL
unset REDIS_URL
export NODE_ENV=development
npm start

# Expected: ⚠️ Warning, server continues
```

### Test Missing in Production
```bash
# Unset Redis URL
unset REDIS_URL
export NODE_ENV=production
npm start

# Expected: ❌ Error, process exits
```

## Render Deployment

### Why This Prevents Crash Loops

1. **Clear Error Messages**: Render logs show exactly what's wrong
2. **Immediate Exit**: Process exits with code 1 before server starts
3. **No Retry Logic**: Validation happens once at startup
4. **Diagnostic Info**: Shows environment, Node version, platform

### Render Configuration

In your Render dashboard:

1. Go to Environment Variables
2. Add `REDIS_URL` with your Redis connection string
3. Format: `redis://red-xxxxx:6379` (Render internal Redis)
4. Or use external Redis: `redis://user:pass@external-host:6379`

### Render Redis Internal URL Format
```bash
# Render provides Redis in this format:
redis://red-xxxxxxxxxxxxx:6379

# Or with authentication:
redis://default:password@red-xxxxxxxxxxxxx:6379
```

## Integration Example

### server.js
```javascript
// CRITICAL: Validate environment BEFORE loading any modules
const { validateOrExit } = require('./config/validateEnv');
validateOrExit();

// Now safe to load other modules
const express = require('express');
const config = require('./config');
// ... rest of server setup
```

### Output on Success
```
======================================================================
STARTUP ENVIRONMENT VALIDATION (PRODUCTION)
======================================================================

✅ Configured and Valid:
   ✅ DATABASE_URL
   ✅ REDIS_URL

======================================================================
✅ STARTUP VALIDATION PASSED
======================================================================

📊 Summary: 2 configured, 0 warnings
```

### Output on Failure
```
======================================================================
STARTUP ENVIRONMENT VALIDATION (PRODUCTION)
======================================================================

❌ Invalid Variables:
   ❌ REDIS_URL - REDIS_URL must start with redis:// or rediss://
      Received: http://localhost:6379...
      Example: redis://localhost:6379 or redis://user:pass@host:6379

======================================================================
❌ STARTUP VALIDATION FAILED
======================================================================

🔍 Diagnostic Information:
   Environment: PRODUCTION
   Node Version: v18.17.0
   Platform: linux

📋 Action Required:
   1. Check your .env file or environment variables
   2. Compare with .env.example for reference
   3. Ensure all required variables are set correctly

🔧 Common Redis URL Formats:
   redis://localhost:6379
   redis://default:password@host:6379
   redis://:password@host:6379/0
   rediss://host:6379 (TLS)

💡 Tip: In development, Redis is optional. Set NODE_ENV=development
    In production, Redis is required for job queues and caching.
```

## Best Practices

1. **Always use redis:// or rediss:// protocol**
2. **URL-encode special characters in passwords**
3. **Use TLS (rediss://) in production when possible**
4. **Test validation locally before deploying**
5. **Check Render logs for validation output**
6. **Keep Redis URL in environment variables, never in code**

## Troubleshooting

### Server won't start on Render

1. Check Render logs for validation output
2. Verify REDIS_URL format in environment variables
3. Ensure NODE_ENV is set to "production"
4. Test Redis connection separately if needed

### Development mode issues

1. Set `NODE_ENV=development` explicitly
2. Redis warnings are normal in development
3. Server will start without Redis in development
4. Background jobs won't work without Redis

## Security Notes

- Never commit Redis URLs with passwords to git
- Use environment variables for all credentials
- Rotate Redis passwords regularly
- Use TLS (rediss://) for production connections
- Limit Redis access by IP when possible
