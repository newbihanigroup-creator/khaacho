# 🚀 Quick Start Guide - Enterprise Architecture

## Prerequisites

- Node.js 20+
- Docker & Docker Compose
- Git
- OpenAI API Key (optional, fallback available)

## Local Development (5 Minutes)

### 1. Clone & Install

```bash
git clone https://github.com/your-org/khaacho-platform.git
cd khaacho-platform
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
# Edit .env with your settings (DATABASE_URL, REDIS_URL, etc.)
```

### 3. Start Infrastructure

```bash
# Start PostgreSQL + Redis
docker-compose up -d postgres redis

# Wait for services to be healthy
docker-compose ps
```

### 4. Setup Database

```bash
# Run migrations
npx prisma migrate deploy

# Generate Prisma client
npx prisma generate

# (Optional) Seed data
npm run db:seed
```

### 5. Start Services

```bash
# Terminal 1: API Server
npm run dev:api

# Terminal 2: Worker Service
npm run dev:worker
```

### 6. Test the System

```bash
# Health check
curl http://localhost:3000/health

# Create order (returns 202 + job ID)
curl -X POST http://localhost:3000/api/v1/orders \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "vendorId": "uuid",
    "items": [
      { "productId": "uuid", "quantity": 10 }
    ]
  }'

# Check order status
curl http://localhost:3000/api/v1/orders/JOB_ID/status \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## Docker Compose (Full Stack)

```bash
# Start everything
docker-compose up -d

# View logs
docker-compose logs -f api
docker-compose logs -f worker

# Stop everything
docker-compose down
```

## Production Deployment

### Option 1: Kubernetes (Recommended)

```bash
# Build images
docker build -f docker/Dockerfile.api -t gcr.io/khaacho/api:v1.0.0 .
docker build -f docker/Dockerfile.worker -t gcr.io/khaacho/worker:v1.0.0 .

# Push to registry
docker push gcr.io/khaacho/api:v1.0.0
docker push gcr.io/khaacho/worker:v1.0.0

# Deploy to Kubernetes
kubectl apply -f k8s/base/
kubectl apply -f k8s/api/
kubectl apply -f k8s/worker/
kubectl apply -f k8s/istio/

# Verify
kubectl get pods -n khaacho
kubectl logs -f deployment/api -n khaacho
```

### Option 2: Render (Simple)

1. Connect GitHub repository
2. Create Web Service (API)
3. Create Worker Service
4. Add PostgreSQL database
5. Add Redis instance
6. Configure environment variables
7. Deploy

## Load Testing

```bash
# Install k6
brew install k6  # macOS
# or download from https://k6.io/

# Run load test
k6 run scripts/load-test.js

# With custom target
API_URL=https://api.khaacho.com k6 run scripts/load-test.js
```

## Monitoring

### Prometheus + Grafana

```bash
# Install Prometheus Operator
helm install prometheus prometheus-community/kube-prometheus-stack

# Access Grafana
kubectl port-forward svc/prometheus-grafana 3000:80 -n monitoring

# Login: admin / prom-operator
```

### Metrics Endpoint

```bash
# API metrics
curl http://localhost:3000/metrics

# Key metrics:
# - http_request_duration_ms
# - queue_job_duration_ms
# - database_query_duration_ms
# - ai_request_duration_ms
# - circuit_breaker_state
```

## Troubleshooting

### API won't start

```bash
# Check environment variables
node -e "require('./src-refactored/shared/config/validateEnv').validateOrExit()"

# Check database connection
npx prisma db pull

# Check Redis connection
redis-cli ping
```

### Worker not processing jobs

```bash
# Check Redis connection
redis-cli ping

# Check queue depth
redis-cli LLEN bull:ORDER_PROCESSING:wait

# View worker logs
docker-compose logs -f worker
```

### High latency

```bash
# Check database connections
SELECT count(*) FROM pg_stat_activity;

# Check Redis memory
redis-cli INFO memory

# Check queue backlog
redis-cli LLEN bull:ORDER_PROCESSING:wait
```

## Architecture Overview

```
┌─────────────┐
│   Client    │
└──────┬──────┘
       │
┌──────▼──────┐
│  API (3-20) │ ← Stateless, returns 202
└──────┬──────┘
       │
┌──────▼──────┐
│ Redis Queue │
└──────┬──────┘
       │
┌──────▼──────┐
│ Workers (5) │ ← Process jobs async
└──────┬──────┘
       │
┌──────▼──────┐
│  PostgreSQL │ ← Partitioned + replicas
└─────────────┘
```

## Key Features

✅ **Stateless API** - Horizontal scaling, zero downtime
✅ **Event-Driven Workers** - Async processing, retry logic
✅ **AI Agent Abstraction** - Multiple providers, circuit breaker
✅ **PostgreSQL Partitioning** - 10x faster queries
✅ **Circuit Breaker** - Prevents cascading failures
✅ **Observability** - Metrics, logs, traces
✅ **Auto-Scaling** - HPA based on CPU/Memory/RPS

## Performance Targets

| Metric | Target | Current |
|--------|--------|---------|
| API Response (p95) | <200ms | ~500ms |
| Order Processing | <60s | ~120s |
| Throughput | 5 RPS | 1 RPS |
| Error Rate | <0.1% | ~1% |
| Uptime | 99.9% | 95% |

## Next Steps

1. ✅ Local development working
2. ⬜ Review architecture docs
3. ⬜ Run load tests
4. ⬜ Deploy to staging
5. ⬜ Setup monitoring
6. ⬜ Production deployment

## Documentation

- **Architecture**: `ENTERPRISE_ARCHITECTURE.md`
- **Implementation**: `IMPLEMENTATION_GUIDE.md`
- **Summary**: `ENTERPRISE_REFACTOR_SUMMARY.md`
- **Deployment**: `DEPLOYMENT_CHECKLIST.md`

## Support

- GitHub Issues: https://github.com/your-org/khaacho-platform/issues
- Documentation: `/docs`
- Runbook: `/docs/RUNBOOK.md`

---

**Ready to scale to 1M+ orders/month!** 🚀
