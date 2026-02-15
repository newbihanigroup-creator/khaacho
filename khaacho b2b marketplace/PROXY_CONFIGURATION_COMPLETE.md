# Proxy Configuration - Implementation Complete ✅

## Overview
Fixed rate limiting to work correctly behind Render's reverse proxy by enabling trust proxy and using real client IPs.

## Changes Made

### 1. Enable Trust Proxy in `src/server.js`
```javascript
app.set('trust proxy', 1);
```

**Why this matters:**
- Render (and other reverse proxies) add `X-Forwarded-For` headers with the real client IP
- Without trust proxy, Express sees all requests coming from the proxy's IP
- With trust proxy enabled, Express reads the real client IP from headers
- Setting to `1` means trust only the first proxy (Render's proxy)

### 2. Extract Client IP Function in `src/middleware/security.js`
```javascript
function getClientIP(req) {
  return req.ip || req.connection.remoteAddress || 'unknown';
}
```

**How it works:**
- When trust proxy is enabled, `req.ip` contains the real client IP
- Express automatically parses `X-Forwarded-For` header
- Falls back to connection IP if header is missing

### 3. Update All Rate Limiters
Updated these rate limiters to use `getClientIP()`:
- `apiLimiter` - General API rate limiting (100 req/15min)
- `authLimiter` - Login attempts (5 req/15min)
- `webhookLimiter` - Webhook events (100 req/min)
- `adminLimiter` - Admin actions (30 req/min)

**Example:**
```javascript
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  keyGenerator: (req) => {
    return getClientIP(req);
  },
  handler: (req, res) => {
    const clientIP = getClientIP(req);
    logger.warn('Rate limit exceeded', {
      ip: clientIP,
      path: req.path,
      forwardedFor: req.headers['x-forwarded-for'],
    });
    // ...
  },
});
```

### 4. Update IP Whitelist/Blacklist Functions
Both `ipWhitelist()` and `ipBlacklist()` now use `getClientIP()` to check real client IPs.

## Security Considerations

### Trust Level
- Trust proxy set to `1` (trust only first proxy)
- Don't trust multiple proxy levels (prevents header spoofing)
- Only Render's proxy is trusted

### Header Validation
- Express validates `X-Forwarded-For` format
- Malformed headers are ignored
- Falls back to connection IP if headers are invalid

### Logging
All rate limit violations now log:
- Real client IP
- Original `X-Forwarded-For` header (for debugging)
- Request path and method

## Testing

### Local Development
```bash
# Without proxy (local testing)
curl http://localhost:3000/api/v1/health
# req.ip will be 127.0.0.1 or ::1
```

### Production (Behind Render)
```bash
# With proxy
curl https://your-app.onrender.com/api/v1/health
# req.ip will be the real client IP from X-Forwarded-For
```

### Verify Rate Limiting
```bash
# Make 101 requests in 15 minutes
for i in {1..101}; do
  curl https://your-app.onrender.com/api/v1/health
done
# Request 101 should return 429 Too Many Requests
```

## How It Works

### Request Flow
1. Client makes request to `https://your-app.onrender.com`
2. Render's proxy receives request
3. Proxy adds headers:
   - `X-Forwarded-For: <client-ip>`
   - `X-Forwarded-Proto: https`
   - `X-Forwarded-Host: your-app.onrender.com`
4. Proxy forwards to your app
5. Express reads headers (because trust proxy is enabled)
6. `req.ip` contains real client IP
7. Rate limiters use real IP for tracking

### Without Trust Proxy (Before)
```
Client IP: 203.0.113.45
Proxy IP: 10.0.0.1

req.ip = 10.0.0.1 (proxy IP)
❌ All clients appear to come from same IP
❌ Rate limiting doesn't work correctly
```

### With Trust Proxy (After)
```
Client IP: 203.0.113.45
Proxy IP: 10.0.0.1
X-Forwarded-For: 203.0.113.45

req.ip = 203.0.113.45 (real client IP)
✅ Each client has unique IP
✅ Rate limiting works correctly
```

## Configuration

### Environment Variables
No new environment variables needed. Configuration is automatic.

### Render Settings
No changes needed in Render dashboard. The proxy headers are added automatically.

## Verification Checklist

- [x] Trust proxy enabled in `src/server.js`
- [x] `getClientIP()` function created
- [x] All rate limiters use `keyGenerator` with `getClientIP()`
- [x] IP whitelist/blacklist use `getClientIP()`
- [x] Logging includes both `ip` and `forwardedFor` header
- [x] No syntax errors in modified files
- [x] Trust level set to 1 (not true or higher number)

## Files Modified

1. `src/server.js` - Added trust proxy configuration
2. `src/middleware/security.js` - Updated rate limiters and IP functions

## Next Steps

1. Deploy to Render
2. Monitor logs to verify real client IPs are being captured
3. Test rate limiting with multiple requests
4. Verify IP-based features work correctly

## References

- [Express Trust Proxy](https://expressjs.com/en/guide/behind-proxies.html)
- [Express Rate Limit](https://github.com/express-rate-limit/express-rate-limit)
- [Render Proxy Headers](https://render.com/docs/web-services#request-headers)
