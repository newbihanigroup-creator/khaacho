# Render Native Node.js Deployment Guide

## ✅ Configuration Fixed for Render Native Deployment

Your app is now configured for **Render native Node.js deployment** (no Docker required).

---

## Files Updated

### 1. ✅ package.json
```json
{
  "scripts": {
    "start": "node src/server.js",
    "start:worker": "node src/server-worker.js",
    "build": "prisma generate",
    "postinstall": "prisma generate"
  },
  "engines": {
    "node": ">=18.0.0",
    "npm": ">=9.0.0"
  }
}
```

**Key Changes:**
- ✅ `start` script uses `node src/server.js`
- ✅ `postinstall` automatically generates Prisma Client
- ✅ Node version specified (18+)

### 2. ✅ src/config/index.js
```javascript
module.exports = {
  port: parseInt(process.env.PORT, 10) || 3000,
  // ... other config
};
```

**Key Features:**
- ✅ Reads `process.env.PORT` (Render provides this)
- ✅ Falls back to 3000 for local development

### 3. ✅ src/server.js
```javascript
const PORT = config.port; // Uses process.env.PORT
app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
});
```

**Key Features:**
- ✅ Listens on `process.env.PORT`
- ✅ Graceful shutdown handlers
- ✅ Health check endpoint at `/api/health`

### 4. ✅ render.yaml
```yaml
services:
  - type: web
    name: khaacho-api
    env: node  # Native Node.js (not Docker)
    buildCommand: npm install && npx prisma generate && npx prisma migrate deploy
    startCommand: npm start
    healthCheckPath: /api/health
```

**Key Changes:**
- ✅ `env: node` (not `env: docker`)
- ✅ No Dockerfile references
- ✅ Native npm commands
- ✅ **Migrations run automatically** during build

---

## Deployment Steps

### Option 1: Automatic Deployment (Recommended)

1. **Push to GitHub** (already done ✅)
   ```bash
   git push origin main
   ```

2. **Go to Render Dashboard**
   - Visit: https://dashboard.render.com
   - Click **"New +"** → **"Blueprint"**

3. **Connect Repository**
   - Select: `newbihanigroup-creator/khaacho`
   - Render will detect `render.yaml`

4. **Click "Apply"**
   - Render will automatically:
     - Create PostgreSQL database
     - Create Redis instance
     - Deploy web service
     - Deploy worker service
     - Run migrations
     - Start health checks

5. **Wait ~5 minutes**
   - Your app will be live!

### Option 2: Manual Deployment

1. **Create Web Service**
   - Go to Render Dashboard
   - Click **"New +"** → **"Web Service"**
   - Connect GitHub repository
   - Configure:
     - **Name**: khaacho-api
     - **Environment**: Node
     - **Build Command**: `npm install && npx prisma generate && npx prisma migrate deploy`
     - **Start Command**: `npm start`
     - **Health Check Path**: `/api/health`

2. **Create Database**
   - Click **"New +"** → **"PostgreSQL"**
   - Name: khaacho-db
   - Copy connection string

3. **Add Environment Variables**
   - In web service settings, add:
     ```
     NODE_ENV=production
     PORT=10000
     DATABASE_URL=<your-database-url>
     JWT_SECRET=<generate-random-string>
     ```

4. **Deploy**
   - Click "Manual Deploy" → "Deploy latest commit"

---

## Environment Variables

### Required Variables

```bash
# Application
NODE_ENV=production
PORT=10000  # Render provides this automatically

# Database (Render provides this when you link database)
DATABASE_URL=postgresql://user:password@host:5432/database

# JWT (generate a random string)
JWT_SECRET=your-super-secret-key-change-this

# API Version
API_VERSION=v1
```

### Optional Variables

```bash
# Redis (if using job queues)
REDIS_URL=redis://host:6379

# WhatsApp Integration
WHATSAPP_API_URL=https://graph.facebook.com/v18.0
WHATSAPP_PHONE_NUMBER_ID=your-phone-id
WHATSAPP_ACCESS_TOKEN=your-access-token
WHATSAPP_VERIFY_TOKEN=your-verify-token

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# Logging
LOG_LEVEL=info

# Features
ENABLE_METRICS=true
ENABLE_BACKGROUND_JOBS=false  # true for worker service
ASYNC_NOTIFICATIONS=true
```

---

## Database Migrations

### Automatic Migration on Deploy

Migrations run automatically during build:

```bash
npm install && npx prisma generate && npx prisma migrate deploy
```

This ensures:
1. All pending migrations are applied
2. Database schema is up to date
3. App starts with correct schema

### Verify Migrations After Deploy

```bash
# Run verification script
npm run db:migrate:verify
```

Expected output:
```
✅ Found 25 applied migrations in database
✅ All migrations verified successfully!
✅ Database schema is up to date
```

### Manual Migration (if needed)

If automatic migrations fail:

```bash
# In Render Shell (Dashboard → Service → Shell)
npx prisma migrate deploy

# Or connect locally
export DATABASE_URL="your-render-database-url"
npx prisma migrate deploy
```

### Troubleshooting Migrations

See detailed guide: [RUN_MIGRATIONS_ON_RENDER.md](./RUN_MIGRATIONS_ON_RENDER.md)

Common issues:
- **"relation does not exist"** → Migrations didn't run, check build logs
- **"Migration failed"** → Check migration SQL syntax
- **"Connection timeout"** → Verify DATABASE_URL is correct

---

## Verification

### 1. Check Deployment Status
- Go to Render Dashboard
- Check service logs
- Look for: `Server running on port 10000`

### 2. Test Health Endpoint
```bash
curl https://your-app.onrender.com/api/health
```

Expected response:
```json
{
  "status": "ok",
  "timestamp": "2026-02-12T10:00:00Z"
}
```

### 3. Test API
```bash
# Test a simple endpoint
curl https://your-app.onrender.com/api/v1/health
```

---

## Troubleshooting

### Issue: "Application failed to respond"

**Solution**: Check that your app listens on `process.env.PORT`

```javascript
// ✅ Correct
const PORT = process.env.PORT || 3000;
app.listen(PORT);

// ❌ Wrong
app.listen(3000); // Hardcoded port won't work on Render
```

### Issue: "Prisma Client not generated"

**Solution**: Add postinstall script

```json
{
  "scripts": {
    "postinstall": "prisma generate"
  }
}
```

### Issue: "Database connection failed"

**Solution**: Check DATABASE_URL format

```bash
# Correct format
DATABASE_URL=postgresql://user:password@host:5432/database?sslmode=require

# Add ?sslmode=require for Render PostgreSQL
```

### Issue: "Module not found"

**Solution**: Ensure all dependencies are in `dependencies` (not `devDependencies`)

```json
{
  "dependencies": {
    "prisma": "^5.8.0",  // ✅ In dependencies
    "@prisma/client": "^5.8.0"
  }
}
```

### Issue: "Build fails"

**Check logs**:
1. Go to Render Dashboard
2. Click on your service
3. View "Logs" tab
4. Look for error messages

**Common fixes**:
```bash
# Clear build cache
# In Render Dashboard: Settings → Clear Build Cache

# Verify Node version
node --version  # Should be 18+

# Test build locally
npm install
npx prisma generate
npm start
```

---

## Local Development

### Setup
```bash
# Clone repository
git clone https://github.com/newbihanigroup-creator/khaacho.git
cd khaacho

# Install dependencies
npm install

# Create .env file
cp .env.example .env

# Edit .env with your local settings
# DATABASE_URL=postgresql://localhost:5432/khaacho
# JWT_SECRET=local-dev-secret

# Generate Prisma Client
npx prisma generate

# Run migrations
npx prisma migrate deploy

# Start server
npm start
```

### Test Locally
```bash
# Server should start on port 3000
# Visit: http://localhost:3000

# Test health endpoint
curl http://localhost:3000/api/health
```

---

## Deployment Checklist

### Before Deployment
- [x] ✅ `package.json` has `start` script
- [x] ✅ Server listens on `process.env.PORT`
- [x] ✅ `postinstall` script generates Prisma Client
- [x] ✅ Node version specified in `engines`
- [x] ✅ `render.yaml` uses `env: node`
- [x] ✅ No Docker references in render.yaml
- [x] ✅ Health check endpoint exists
- [x] ✅ Environment variables configured

### After Deployment
- [ ] Check service logs for errors
- [ ] Test health endpoint
- [ ] Test API endpoints
- [ ] Verify database connection
- [ ] Check worker service (if using)
- [ ] Monitor performance
- [ ] Set up custom domain (optional)

---

## Monitoring

### View Logs
```bash
# In Render Dashboard
1. Go to your service
2. Click "Logs" tab
3. View real-time logs
```

### Metrics
- **Response Time**: Check in Render Dashboard
- **Error Rate**: Monitor logs for errors
- **Database Queries**: Check Prisma logs
- **Memory Usage**: View in Render metrics

### Alerts
Set up alerts in Render Dashboard:
- Service down
- High error rate
- High response time
- Database connection issues

---

## Scaling

### Vertical Scaling
- Upgrade plan in Render Dashboard
- Options: Starter → Standard → Pro

### Horizontal Scaling
- Add more instances (paid plans)
- Load balancing automatic

### Database Scaling
- Upgrade PostgreSQL plan
- Connection pooling enabled by default

---

## Cost Optimization

### Free Tier
- Web service: Free (with limitations)
- PostgreSQL: Free 90 days, then $7/month
- Redis: $10/month (optional)

### Recommendations
1. Start with Starter plan ($7/month)
2. Add Redis only if using job queues
3. Monitor usage and scale as needed
4. Use environment-based configs

---

## Security

### Best Practices
✅ **Environment Variables**: Never commit secrets  
✅ **HTTPS**: Automatic with Render  
✅ **Database SSL**: Enabled by default  
✅ **Rate Limiting**: Configured in app  
✅ **Helmet**: Security headers enabled  
✅ **CORS**: Configured for production  

### Secrets Management
```bash
# Generate strong JWT secret
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# Add to Render environment variables
# Never commit to Git
```

---

## Next Steps

1. ✅ **Deploy to Render** - Use Blueprint or manual setup
2. **Configure Domain** - Add custom domain in Render
3. **Set Up Monitoring** - Enable alerts
4. **Add SSL Certificate** - Automatic with Render
5. **Configure Backups** - Enable database backups
6. **Set Up CI/CD** - GitHub Actions (optional)

---

## Support

- **Render Docs**: https://render.com/docs
- **Render Community**: https://community.render.com
- **GitHub Issues**: https://github.com/newbihanigroup-creator/khaacho/issues

---

## Summary

Your app is now configured for **Render native Node.js deployment**:

✅ No Docker required  
✅ Native npm commands  
✅ Automatic Prisma Client generation  
✅ Correct PORT configuration  
✅ Health check endpoint  
✅ Production-ready  

**Deploy now**: https://dashboard.render.com

Your deployment should work perfectly! 🚀
