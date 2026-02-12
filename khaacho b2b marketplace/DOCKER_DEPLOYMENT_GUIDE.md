# Docker Deployment Guide

## Files Added

✅ **Dockerfile** - Production-ready Docker image  
✅ **.dockerignore** - Exclude unnecessary files  
✅ **docker-compose.yml** - Local development setup  
✅ **render.yaml** - Updated for Docker deployment  
✅ **.gitignore** - Prevent committing sensitive files  

---

## Quick Start

### Option 1: Deploy to Render (Recommended)

Your repository is now configured for automatic Docker deployment on Render!

1. **Go to Render Dashboard**: https://dashboard.render.com
2. **Click "New +"** → **"Blueprint"**
3. **Connect your GitHub repository**: `newbihanigroup-creator/khaacho`
4. **Render will automatically**:
   - Detect `render.yaml`
   - Build Docker images
   - Deploy web service and worker
   - Create PostgreSQL database
   - Create Redis instance

**That's it!** Your app will be live in ~5 minutes.

### Option 2: Local Development with Docker

```bash
# Clone repository
git clone https://github.com/newbihanigroup-creator/khaacho.git
cd khaacho

# Create .env file
cp .env.example .env

# Start all services (PostgreSQL, Redis, App, Worker)
docker-compose up -d

# View logs
docker-compose logs -f app

# Stop services
docker-compose down
```

Your app will be available at: http://localhost:3000

### Option 3: Build and Run Docker Image Manually

```bash
# Build image
docker build -t khaacho-app .

# Run container
docker run -p 3000:3000 \
  -e DATABASE_URL="your-database-url" \
  -e NODE_ENV=production \
  khaacho-app
```

---

## What's Included

### Dockerfile Features

✅ **Multi-stage build** - Smaller image size  
✅ **Alpine Linux** - Lightweight base (< 100MB)  
✅ **Non-root user** - Security best practice  
✅ **Health checks** - Automatic container monitoring  
✅ **Prisma Client** - Pre-generated for performance  
✅ **Production dependencies only** - Faster builds  

### docker-compose.yml Services

1. **PostgreSQL** - Database (port 5432)
2. **Redis** - Job queue (port 6379)
3. **App** - Web server (port 3000)
4. **Worker** - Background jobs

### render.yaml Configuration

- **Web Service**: API server with health checks
- **Worker Service**: Background job processor
- **PostgreSQL Database**: Managed database
- **Redis**: Managed cache/queue
- **Auto-scaling**: Ready for production load

---

## Environment Variables

Required variables (set in Render dashboard or .env):

```bash
# Database
DATABASE_URL=postgresql://user:password@host:5432/database

# Redis (optional, for job queues)
REDIS_URL=redis://host:6379

# Application
NODE_ENV=production
PORT=3000

# JWT
JWT_SECRET=your-secret-key
JWT_EXPIRES_IN=7d

# WhatsApp (optional)
WHATSAPP_API_URL=https://graph.facebook.com/v17.0
WHATSAPP_PHONE_NUMBER_ID=your-phone-id
WHATSAPP_ACCESS_TOKEN=your-access-token
WHATSAPP_VERIFY_TOKEN=your-verify-token
```

---

## Deployment Steps

### Render Deployment (Automatic)

1. **Push to GitHub** ✅ (Already done!)
2. **Connect to Render**:
   - Go to https://dashboard.render.com
   - Click "New +" → "Blueprint"
   - Select your repository
   - Click "Apply"

3. **Render will automatically**:
   - Read `render.yaml`
   - Build Docker images
   - Deploy services
   - Run migrations
   - Start health checks

4. **Access your app**:
   - Web: `https://khaacho-api.onrender.com`
   - API: `https://khaacho-api.onrender.com/api/health`

### Manual Deployment

```bash
# 1. Build image
docker build -t khaacho-app .

# 2. Tag for registry
docker tag khaacho-app your-registry/khaacho-app:latest

# 3. Push to registry
docker push your-registry/khaacho-app:latest

# 4. Deploy to your server
docker pull your-registry/khaacho-app:latest
docker run -d -p 3000:3000 \
  --name khaacho-app \
  -e DATABASE_URL="$DATABASE_URL" \
  your-registry/khaacho-app:latest
```

---

## Database Migrations

### Automatic (Render)
Migrations run automatically on deployment via `render.yaml`.

### Manual
```bash
# Inside container
docker exec khaacho-app npx prisma migrate deploy

# Or via docker-compose
docker-compose exec app npx prisma migrate deploy
```

---

## Monitoring

### Health Check Endpoint
```bash
curl https://your-app.onrender.com/api/health
```

Response:
```json
{
  "status": "ok",
  "timestamp": "2026-02-12T10:00:00Z"
}
```

### Docker Health Check
```bash
# Check container health
docker ps

# View health check logs
docker inspect khaacho-app | grep Health -A 10
```

### Logs
```bash
# Docker Compose
docker-compose logs -f app

# Docker
docker logs -f khaacho-app

# Render
View logs in Render dashboard
```

---

## Scaling

### Render (Automatic)
- Upgrade plan in dashboard
- Auto-scaling available on paid plans

### Docker Compose (Manual)
```bash
# Scale workers
docker-compose up -d --scale worker=3
```

### Kubernetes (Advanced)
```bash
# Create deployment
kubectl create deployment khaacho --image=your-registry/khaacho-app

# Scale
kubectl scale deployment khaacho --replicas=3
```

---

## Troubleshooting

### Build Fails

**Error**: "Cannot find module"
```bash
# Solution: Clear cache and rebuild
docker-compose build --no-cache
```

**Error**: "Prisma Client not generated"
```bash
# Solution: Generate Prisma Client
docker-compose exec app npx prisma generate
```

### Container Won't Start

**Check logs**:
```bash
docker-compose logs app
```

**Common issues**:
1. Missing DATABASE_URL
2. Database not accessible
3. Port already in use

### Database Connection Issues

**Test connection**:
```bash
docker-compose exec app node -e "
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();
  prisma.\$connect()
    .then(() => console.log('✅ Connected'))
    .catch(e => console.error('❌ Error:', e));
"
```

---

## Performance Optimization

### Image Size
Current: ~150MB (Alpine + Node 18)

**Reduce further**:
```dockerfile
# Use distroless image
FROM gcr.io/distroless/nodejs18-debian11
```

### Build Time
Current: ~2-3 minutes

**Speed up**:
- Use Docker layer caching
- Pre-build base images
- Use BuildKit

### Runtime Performance
- Health checks every 30s
- Graceful shutdown with dumb-init
- Non-root user for security
- Production dependencies only

---

## Security

✅ **Non-root user** - Container runs as nodejs:nodejs  
✅ **No secrets in image** - Environment variables only  
✅ **Minimal base image** - Alpine Linux  
✅ **Health checks** - Automatic restart on failure  
✅ **Read-only filesystem** - Except /app/logs  

---

## Next Steps

1. ✅ **Deploy to Render** - Automatic with render.yaml
2. **Set up monitoring** - Use Render metrics or external tools
3. **Configure alerts** - Email/SMS on failures
4. **Set up CI/CD** - GitHub Actions for automated testing
5. **Add SSL** - Automatic with Render
6. **Configure domain** - Point your domain to Render

---

## Support

- **Documentation**: See all `*.md` files in repository
- **Issues**: https://github.com/newbihanigroup-creator/khaacho/issues
- **Render Docs**: https://render.com/docs

---

**Your app is now Docker-ready and deployable! 🚀**
