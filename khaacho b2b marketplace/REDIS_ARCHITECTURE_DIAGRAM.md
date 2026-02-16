# Redis Architecture Diagram

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     SERVER STARTUP FLOW                         │
└─────────────────────────────────────────────────────────────────┘

1. Environment Validation (validateEnv.js)
   ↓
   ├─ DATABASE_URL ────→ Required ────→ Missing? → Exit(1)
   ├─ JWT_SECRET ──────→ Required ────→ Missing? → Exit(1)
   └─ REDIS_URL ───────→ Optional* ───→ Missing? → Warning
                         (*Required in prod)
   ↓
2. Database Connection Test
   ↓
   ├─ Success → Continue
   └─ Failure → Exit(1)
   ↓
3. Redis Connection Test (redis.js)
   ↓
   ├─ Success → redisAvailable = true
   └─ Failure → redisAvailable = false (Continue)
   ↓
4. Start Express Server
   ↓
5. Conditional Feature Initialization
   ↓
   if (redisAvailable) {
     ├─ Initialize Queues
     ├─ Start Workers
     └─ Enable Background Jobs
   } else {
     └─ Log Warning: "Running without Redis"
   }
```

## Redis Client Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    REDIS CLIENT (redis.js)                      │
└─────────────────────────────────────────────────────────────────┘

createRedisClient()
   ↓
   ├─ Configuration
   │  ├─ URL or Host/Port/Password
   │  ├─ Retry Strategy (exponential backoff)
   │  ├─ Max Retries: 10
   │  ├─ Timeouts: connect(10s), command(5s)
   │  └─ Keep-alive: 30s
   ↓
   ├─ Event Handlers
   │  ├─ 'connect'      → Log: Connecting...
   │  ├─ 'ready'        → Log: Connected, isConnected = true
   │  ├─ 'error'        → Log error (don't throw)
   │  ├─ 'close'        → Log: Connection closed
   │  ├─ 'reconnecting' → Log: Retrying...
   │  └─ 'end'          → Log: No more retries
   ↓
   └─ Return Client or null
```

## Retry Strategy Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    RETRY STRATEGY                               │
└─────────────────────────────────────────────────────────────────┘

Connection Attempt Failed
   ↓
   Check: attempts <= MAX_ATTEMPTS (10)?
   ↓
   ├─ YES → Calculate delay
   │         ↓
   │         delay = min(attempts × 50ms, 2000ms)
   │         ↓
   │         Attempt 1: 50ms
   │         Attempt 2: 100ms
   │         Attempt 3: 150ms
   │         Attempt 4: 200ms
   │         ...
   │         Attempt 10: 2000ms
   │         ↓
   │         Wait delay → Retry
   │
   └─ NO → Give up
            ↓
            Log: "Max attempts reached"
            ↓
            Return null
            ↓
            Server continues without Redis
```

## Environment Validation Flow

```
┌─────────────────────────────────────────────────────────────────┐
│              ENVIRONMENT VALIDATION (validateEnv.js)            │
└─────────────────────────────────────────────────────────────────┘

validateOrExit()
   ↓
   For each variable in ENV_SCHEMA:
   ↓
   ├─ Check if exists
   │  ├─ Missing + Required → Add to errors
   │  ├─ Missing + Optional → Add to warnings
   │  └─ Exists → Validate format
   │
   ├─ Validate type (string, number, etc.)
   ├─ Validate pattern (regex)
   ├─ Validate custom (validateRedisURL)
   └─ Validate constraints (minLength, allowedValues)
   ↓
   Display Results:
   ├─ ✅ Valid variables
   ├─ ⚠️  Warnings (non-blocking)
   ├─ ❌ Missing required (blocking)
   └─ ❌ Invalid format (blocking)
   ↓
   Check for critical errors:
   ├─ DATABASE_URL missing/invalid? → Exit(1)
   ├─ Only REDIS_URL issue? → Warning, Continue
   └─ Other errors? → Exit(1)
```

## Redis URL Validation Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                 REDIS URL VALIDATION                            │
└─────────────────────────────────────────────────────────────────┘

validateRedisURL(url)
   ↓
   ├─ Check: url exists and is string?
   │  └─ NO → Error: "Empty or not a string"
   ↓
   ├─ Check: starts with redis:// or rediss://?
   │  └─ NO → Error: "Invalid format"
   ↓
   ├─ Check: has content after protocol?
   │  └─ NO → Error: "Incomplete URL"
   ↓
   ├─ Check: valid structure?
   │  Pattern: [user:pass@]host[:port][/db][?options]
   │  └─ NO → Error: "Invalid structure"
   ↓
   ├─ Check: contains spaces?
   │  └─ YES → Error: "Contains spaces"
   ↓
   ├─ Check: localhost in production?
   │  └─ YES → Warning: "Using localhost in prod"
   ↓
   └─ Return: { valid: true }
```

## Feature Enablement Logic

```
┌─────────────────────────────────────────────────────────────────┐
│              CONDITIONAL FEATURE ENABLEMENT                     │
└─────────────────────────────────────────────────────────────────┘

Server Started
   ↓
   Check: redisAvailable?
   ↓
   ├─ TRUE (Redis Connected)
   │  ↓
   │  ├─ Initialize Queues
   │  │  ├─ WHATSAPP queue
   │  │  ├─ CREDIT_SCORE queue
   │  │  ├─ ORDER_ROUTING queue
   │  │  ├─ PAYMENT_REMINDERS queue
   │  │  └─ REPORT_GENERATION queue
   │  ↓
   │  ├─ Start Workers
   │  │  ├─ Credit Score Worker
   │  │  ├─ Risk Control Worker
   │  │  ├─ Order Routing Worker
   │  │  ├─ Vendor Performance Worker
   │  │  └─ Price Intelligence Worker
   │  ↓
   │  └─ Log: "All systems operational"
   │
   └─ FALSE (Redis Not Available)
      ↓
      ├─ Skip queue initialization
      ├─ Skip worker startup
      ├─ Log: "Running without Redis"
      ├─ Log: "Background jobs disabled"
      └─ Log: "Server running in synchronous mode"
```

## Error Handling Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    ERROR HANDLING                               │
└─────────────────────────────────────────────────────────────────┘

Redis Error Occurs
   ↓
   ├─ Connection Error
   │  ↓
   │  ├─ Log error details
   │  ├─ Trigger retry strategy
   │  └─ Don't throw (don't crash)
   │
   ├─ Command Error
   │  ↓
   │  ├─ Log error
   │  ├─ Return null (safeExecute)
   │  └─ Continue operation
   │
   └─ Timeout Error
      ↓
      ├─ Log timeout
      ├─ Trigger reconnect
      └─ Continue operation
```

## Graceful Shutdown Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                   GRACEFUL SHUTDOWN                             │
└─────────────────────────────────────────────────────────────────┘

SIGTERM or SIGINT Received
   ↓
   ├─ Log: "Shutting down gracefully"
   ↓
   ├─ Close Redis Connection
   │  ↓
   │  ├─ Try: client.quit()
   │  ├─ Catch: client.disconnect()
   │  └─ Log: "Redis closed"
   ↓
   ├─ Close Queue Connections
   │  └─ Log: "Queues closed"
   ↓
   ├─ Close Database Connection
   │  └─ Log: "Database closed"
   ↓
   └─ Exit(0)
```

## Component Interaction

```
┌─────────────────────────────────────────────────────────────────┐
│                  COMPONENT INTERACTION                          │
└─────────────────────────────────────────────────────────────────┘

┌──────────────┐
│  server.js   │
└──────┬───────┘
       │
       ├─→ validateEnv.js ──→ Validate all env vars
       │                      └─→ Exit if DATABASE_URL missing
       │
       ├─→ database.js ─────→ Test DB connection
       │                      └─→ Exit if connection fails
       │
       ├─→ redis.js ────────→ Test Redis connection
       │                      └─→ Continue if connection fails
       │
       ├─→ queueManager.js ─→ Initialize queues (if Redis OK)
       │
       └─→ workers/*.js ────→ Start workers (if Redis OK)
```

## Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                      DATA FLOW                                  │
└─────────────────────────────────────────────────────────────────┘

API Request
   ↓
   ├─ Synchronous Operations
   │  ├─ Database queries
   │  ├─ Business logic
   │  └─ Response to client
   │
   └─ Asynchronous Operations (if Redis available)
      ↓
      ├─ Add job to queue
      │  ↓
      │  └─→ Redis Queue
      │       ↓
      │       └─→ Worker picks up job
      │            ↓
      │            ├─ Process job
      │            ├─ Update database
      │            └─ Log result
      │
      └─ If Redis not available
         ↓
         └─ Log warning: "Background job skipped"
```

## Summary

This architecture ensures:

✅ **No Single Point of Failure** - Server runs without Redis  
✅ **Graceful Degradation** - Features disabled, not crashed  
✅ **Clear Error Handling** - Logs errors, doesn't throw  
✅ **Automatic Recovery** - Retry with exponential backoff  
✅ **Production Safety** - No crashes, clear diagnostics  

**Result:** Robust, production-ready system! 🚀
