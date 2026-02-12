# Render Environment Variables Configuration

## Complete list of environment variables to add in Render Dashboard

---

## 🔴 REQUIRED VARIABLES (Must Add)

### For WEB SERVICE (khaacho-api)

```bash
# Application Settings
NODE_ENV=production
PORT=10000
API_VERSION=v1

# Database (Auto-linked by Render Blueprint)
DATABASE_URL=<auto-linked-from-khaacho-db>

# Redis (Link after creating Redis service)
REDIS_URL=<link-to-khaacho-redis>

# JWT Authentication (Generate random string)
JWT_SECRET=<click-generate-value-in-render>
JWT_EXPIRES_IN=7d

# Feature Flags
ENABLE_BACKGROUND_JOBS=false
ENABLE_METRICS=true
ASYNC_NOTIFICATIONS=true

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# Logging
LOG_LEVEL=info
```

### For WORKER SERVICE (khaacho-worker)

```bash
# Application Settings
NODE_ENV=production
API_VERSION=v1

# Database (Auto-linked by Render Blueprint)
DATABASE_URL=<auto-linked-from-khaacho-db>

# Redis (Link after creating Redis service)
REDIS_URL=<link-to-khaacho-redis>

# JWT Authentication (Use same as web service)
JWT_SECRET=<same-as-web-service>

# Feature Flags
ENABLE_BACKGROUND_JOBS=true
ENABLE_METRICS=true

# Logging
LOG_LEVEL=info

# Worker Health Check
HEALTH_PORT=10001
```

---

## 🟡 OPTIONAL VARIABLES (Add when ready)

### WhatsApp Integration (Both Services)

```bash
# WhatsApp API Configuration
WHATSAPP_API_URL=https://graph.facebook.com/v18.0
WHATSAPP_PHONE_NUMBER_ID=your-phone-number-id-here
WHATSAPP_ACCESS_TOKEN=your-access-token-here
WHATSAPP_VERIFY_TOKEN=your-verify-token-here
WHATSAPP_ASYNC=true
```

**How to get WhatsApp credentials:**
1. Go to https://developers.facebook.com
2. Create a Business App
3. Add WhatsApp product
4. Get Phone Number ID and Access Token
5. Set up webhook with your Verify Token

### Database Connection Pool (Optional - has defaults)

```bash
DB_POOL_MIN=10
DB_POOL_MAX=50
DB_CONNECTION_TIMEOUT=10000
```

### Redis Configuration (Optional - has defaults)

```bash
REDIS_DB=0
```

### Logging Configuration (Optional - has defaults)

```bash
LOG_MAX_FILES=30d
LOG_MAX_SIZE=50m
```

### Performance Monitoring (Optional - has defaults)

```bash
METRICS_INTERVAL=60000
```

---

## 📋 Step-by-Step: How to Add Variables in Render

### Step 1: Add to Web Service (khaacho-api)

1. Go to https://dashboard.render.com
2. Click on **khaacho-api** service
3. Click **Environment** tab
4. Click **Add Environment Variable**
5. Add each variable:

**Auto-Generated Variables** (Render handles these):
- `DATABASE_URL` - Auto-linked when you use Blueprint
- `JWT_SECRET` - Click "Generate Value" button

**Manual Variables** (Copy-paste these):

| Key | Value | Notes |
|-----|-------|-------|
| `NODE_ENV` | `production` | Required |
| `PORT` | `10000` | Required |
| `API_VERSION` | `v1` | Required |
| `JWT_EXPIRES_IN` | `7d` | Required |
| `ENABLE_BACKGROUND_JOBS` | `false` | CRITICAL - must be false |
| `ENABLE_METRICS` | `true` | Recommended |
| `ASYNC_NOTIFICATIONS` | `true` | Recommended |
| `RATE_LIMIT_WINDOW_MS` | `900000` | Recommended |
| `RATE_LIMIT_MAX_REQUESTS` | `100` | Recommended |
| `LOG_LEVEL` | `info` | Recommended |

**Link Redis** (After creating Redis service):
1. Click **Add Environment Variable**
2. Key: `REDIS_URL`
3. Click **Link to service**
4. Select: `khaacho-redis`
5. Property: `connectionString`

### Step 2: Add to Worker Service (khaacho-worker)

1. Go to https://dashboard.render.com
2. Click on **khaacho-worker** service
3. Click **Environment** tab
4. Click **Add Environment Variable**
5. Add each variable:

**Auto-Generated Variables**:
- `DATABASE_URL` - Auto-linked when you use Blueprint
- `JWT_SECRET` - Click "Generate Value" (or copy from web service)

**Manual Variables**:

| Key | Value | Notes |
|-----|-------|-------|
| `NODE_ENV` | `production` | Required |
| `API_VERSION` | `v1` | Required |
| `ENABLE_BACKGROUND_JOBS` | `true` | CRITICAL - must be true |
| `ENABLE_METRICS` | `true` | Recommended |
| `LOG_LEVEL` | `info` | Recommended |
| `HEALTH_PORT` | `10001` | Required |

**Link Redis** (After creating Redis service):
1. Click **Add Environment Variable**
2. Key: `REDIS_URL`
3. Click **Link to service**
4. Select: `khaacho-redis`
5. Property: `connectionString`

---

## 🔐 Security Best Practices

### JWT_SECRET

**Generate a strong secret**:
```bash
# Option 1: Use Render's "Generate Value" button (recommended)
# Option 2: Generate locally
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

**Important**: Use the SAME `JWT_SECRET` for both web and worker services!

### WhatsApp Tokens

**Never commit these to Git!**
- Store in Render environment variables only
- Rotate tokens periodically
- Use different tokens for staging/production

### Database URL

**Render provides this automatically**
- Format: `postgresql://user:password@host:5432/database`
- Includes SSL by default
- Never share publicly

---

## 🚀 Quick Copy-Paste Guide

### For Web Service (khaacho-api)

```
NODE_ENV=production
PORT=10000
API_VERSION=v1
JWT_EXPIRES_IN=7d
ENABLE_BACKGROUND_JOBS=false
ENABLE_METRICS=true
ASYNC_NOTIFICATIONS=true
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
LOG_LEVEL=info
```

### For Worker Service (khaacho-worker)

```
NODE_ENV=production
API_VERSION=v1
ENABLE_BACKGROUND_JOBS=true
ENABLE_METRICS=true
LOG_LEVEL=info
HEALTH_PORT=10001
```

---

## ✅ Verification Checklist

After adding all variables:

### Web Service
- [ ] `NODE_ENV` = production
- [ ] `PORT` = 10000
- [ ] `DATABASE_URL` is linked
- [ ] `REDIS_URL` is linked
- [ ] `JWT_SECRET` is generated
- [ ] `ENABLE_BACKGROUND_JOBS` = false (CRITICAL!)
- [ ] All other required variables added

### Worker Service
- [ ] `NODE_ENV` = production
- [ ] `DATABASE_URL` is linked
- [ ] `REDIS_URL` is linked
- [ ] `JWT_SECRET` is set (same as web)
- [ ] `ENABLE_BACKGROUND_JOBS` = true (CRITICAL!)
- [ ] `HEALTH_PORT` = 10001
- [ ] All other required variables added

---

## 🔍 How to Check Variables

### In Render Dashboard

1. Go to service (khaacho-api or khaacho-worker)
2. Click **Environment** tab
3. Verify all variables are present
4. Check linked services (DATABASE_URL, REDIS_URL)

### In Service Logs

After deployment, check logs for:
```
Environment validation passed ✅
Database connected ✅
Redis connected ✅
```

If you see errors like:
```
Missing required environment variables: JWT_SECRET
```
Go back and add the missing variable.

---

## 🐛 Troubleshooting

### Error: "Missing required environment variables"

**Solution**: Add the missing variable in Environment tab

### Error: "Database connection failed"

**Solution**: 
1. Check `DATABASE_URL` is linked to khaacho-db
2. Verify database is running
3. Check database plan hasn't expired

### Error: "Redis connection failed"

**Solution**:
1. Create Redis service if not created
2. Link `REDIS_URL` to khaacho-redis
3. Verify Redis service is running

### Error: "JWT_SECRET not set"

**Solution**:
1. Go to Environment tab
2. Add `JWT_SECRET`
3. Click "Generate Value" button
4. Save changes

### Web service running background jobs (slow)

**Solution**:
1. Check `ENABLE_BACKGROUND_JOBS` = false on web service
2. Check `ENABLE_BACKGROUND_JOBS` = true on worker service
3. Redeploy if needed

---

## 📝 Environment Variable Reference

### Complete List with Defaults

| Variable | Web Service | Worker Service | Default | Required |
|----------|-------------|----------------|---------|----------|
| `NODE_ENV` | ✅ | ✅ | development | Yes |
| `PORT` | ✅ | ❌ | 3000 | Yes (web) |
| `API_VERSION` | ✅ | ✅ | v1 | Yes |
| `DATABASE_URL` | ✅ | ✅ | - | Yes |
| `REDIS_URL` | ✅ | ✅ | - | Yes |
| `JWT_SECRET` | ✅ | ✅ | - | Yes |
| `JWT_EXPIRES_IN` | ✅ | ❌ | 7d | No |
| `ENABLE_BACKGROUND_JOBS` | ✅ false | ✅ true | true | Yes |
| `ENABLE_METRICS` | ✅ | ✅ | false | No |
| `ASYNC_NOTIFICATIONS` | ✅ | ❌ | false | No |
| `RATE_LIMIT_WINDOW_MS` | ✅ | ❌ | 900000 | No |
| `RATE_LIMIT_MAX_REQUESTS` | ✅ | ❌ | 100 | No |
| `LOG_LEVEL` | ✅ | ✅ | info | No |
| `HEALTH_PORT` | ❌ | ✅ | 10001 | Yes (worker) |
| `WHATSAPP_API_URL` | ✅ | ✅ | - | No |
| `WHATSAPP_PHONE_NUMBER_ID` | ✅ | ✅ | - | No |
| `WHATSAPP_ACCESS_TOKEN` | ✅ | ✅ | - | No |
| `WHATSAPP_VERIFY_TOKEN` | ✅ | ✅ | - | No |
| `WHATSAPP_ASYNC` | ✅ | ✅ | false | No |

---

## 🎯 Summary

**Minimum Required Variables**:

**Web Service**: 10 variables
- NODE_ENV, PORT, API_VERSION
- DATABASE_URL, REDIS_URL
- JWT_SECRET, JWT_EXPIRES_IN
- ENABLE_BACKGROUND_JOBS (false)
- ENABLE_METRICS, LOG_LEVEL

**Worker Service**: 7 variables
- NODE_ENV, API_VERSION
- DATABASE_URL, REDIS_URL
- JWT_SECRET
- ENABLE_BACKGROUND_JOBS (true)
- HEALTH_PORT

**Add WhatsApp variables when ready to enable WhatsApp integration.**

---

## 📞 Need Help?

If you're stuck:
1. Check Render service logs for specific error messages
2. Verify all required variables are set
3. Ensure REDIS_URL is linked (not manually entered)
4. Ensure DATABASE_URL is linked (not manually entered)
5. Check that JWT_SECRET is the same on both services

**Your deployment will work once all required variables are properly configured!** ✅
