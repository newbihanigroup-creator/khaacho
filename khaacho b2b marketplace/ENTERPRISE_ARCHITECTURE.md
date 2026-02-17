# 🏗️ Enterprise Architecture - Khaacho B2B Platform
## Scaling to 1M+ Orders/Month

---

## 1. SYSTEM ARCHITECTURE DIAGRAM

```
┌─────────────────────────────────────────────────────────────────────┐
│                         EXTERNAL LAYER                               │
├─────────────────────────────────────────────────────────────────────┤
│  CloudFlare CDN → WAF → DDoS Protection → Rate Limiting             │
└────────────────────────────┬────────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────────┐
│                      INGRESS LAYER (K8s)                             │
├─────────────────────────────────────────────────────────────────────┤
│  NGINX Ingress Controller                                            │
│  ├─ TLS Termination                                                  │
│  ├─ Request Routing                                                  │
│  ├─ Circuit Breaker (Istio)                                          │
│  └─ Rate Limiting (per IP/API Key)                                   │
└────────────────────────────┬────────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────────┐
│                    API GATEWAY LAYER                                 │
├─────────────────────────────────────────────────────────────────────┤
│  API Gateway Service (Stateless)                                     │
│  ├─ Authentication (JWT)                                             │
│  ├─ Authorization (RBAC)                                             │
│  ├─ Request Validation                                               │
│  ├─ API Versioning                                                   │
│  └─ Metrics Collection                                               │
│                                                                       │
│  Replicas: 3-20 (HPA based on CPU/Memory/RPS)                       │
└────────────────────────────┬────────────────────────────────────────┘
                             │
              ┌──────────────┴──────────────┐
              │                             │
┌─────────────▼──────────┐    ┌────────────▼─────────────┐
│   API SERVICE LAYER    │    │   WORKER SERVICE LAYER   │
│     (Stateless)        │    │   (Event Processors)     │
├────────────────────────┤    ├──────────────────────────┤
│ Order API (3-10 pods)  │    │ AI Worker (2-5 pods)     │
│ Auth API (2-5 pods)    │    │ Risk Worker (2-3 pods)   │
│ Product API (2-5 pods) │    │ Routing Worker (2-3)     │
│ Credit API (2-5 pods)  │    │ Analytics Worker (1-2)   │
│ Vendor API (2-5 pods)  │    │ Notification Worker (2)  │
│                        │    │                          │
│ Response: 202 Accepted │    │ Process: Async Jobs      │
│ Job ID: uuid           │    │ Retry: Exponential       │
└────────┬───────────────┘    └──────────┬───────────────┘
         │                               │
         │    ┌──────────────────────────┘
         │    │
┌────────▼────▼──────────────────────────────────────────────────────┐
│                    MESSAGE QUEUE LAYER                              │
├─────────────────────────────────────────────────────────────────────┤
│  Redis Cluster (3 masters + 3 replicas)                             │
│  ├─ Bull Queue (Job Processing)                                     │
│  ├─ Dead Letter Queue                                               │
│  ├─ Priority Queues (High/Normal/Low)                               │
│  └─ Rate Limiting Store                                             │
│                                                                      │
│  Alternative: Apache Kafka (for >10K orders/day)                    │
│  ├─ order.created topic (partitions: 10)                            │
│  ├─ order.validated topic                                           │
│  ├─ order.routed topic                                              │
│  └─ order.completed topic                                           │
└────────────────────────────┬────────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────────┐
│                    DATABASE LAYER                                    │
├─────────────────────────────────────────────────────────────────────┤
│  PostgreSQL 15 (Primary + Read Replicas)                            │
│  ├─ Primary (Write): 1 instance (vertical scaling)                  │
│  ├─ Read Replicas: 2-3 instances (horizontal scaling)               │
│  ├─ Connection Pooling: PgBouncer (transaction mode)                │
│  └─ Partitioning Strategy:                                          │
│      - orders: RANGE by created_at (monthly partitions)             │
│      - order_items: RANGE by order_id                               │
│      - analytics: TIME-SERIES (daily partitions, auto-drop >90d)    │
│                                                                      │
│  Redis Cache Layer                                                   │
│  ├─ Product catalog (TTL: 1h)                                       │
│  ├─ User sessions (TTL: 24h)                                        │
│  ├─ API rate limits (TTL: 1m)                                       │
│  └─ Hot data cache (LRU eviction)                                   │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                    AI AGENT ABSTRACTION LAYER                        │
├─────────────────────────────────────────────────────────────────────┤
│  AI Service (Isolated, Circuit Breaker Protected)                   │
│  ├─ OpenAI GPT-4 (Primary)                                          │
│  ├─ Anthropic Claude (Fallback)                                     │
│  ├─ Local LLM (Emergency fallback)                                  │
│  └─ Circuit Breaker:                                                │
│      - Failure threshold: 50%                                       │
│      - Timeout: 30s                                                 │
│      - Half-open retry: 60s                                         │
│                                                                      │
│  AI Agent Types:                                                     │
│  ├─ Order Parser Agent (text → structured data)                     │
│  ├─ Risk Assessment Agent (fraud detection)                         │
│  ├─ Routing Optimizer Agent (vendor selection)                      │
│  └─ Price Intelligence Agent (market analysis)                      │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                    OBSERVABILITY LAYER                               │
├─────────────────────────────────────────────────────────────────────┤
│  Metrics: Prometheus + Grafana                                      │
│  ├─ API latency (p50, p95, p99)                                     │
│  ├─ Queue depth & processing time                                   │
│  ├─ Database connection pool usage                                  │
│  ├─ Error rates by service                                          │
│  └─ Business metrics (orders/min, revenue/hour)                     │
│                                                                      │
│  Logging: ELK Stack (Elasticsearch + Logstash + Kibana)             │
│  ├─ Structured JSON logs                                            │
│  ├─ Correlation IDs (trace requests)                                │
│  ├─ Log levels: ERROR, WARN, INFO, DEBUG                            │
│  └─ Retention: 30 days (hot), 90 days (cold)                        │
│                                                                      │
│  Tracing: Jaeger (OpenTelemetry)                                    │
│  ├─ Distributed tracing across services                             │
│  ├─ Span duration analysis                                          │
│  └─ Bottleneck identification                                       │
│                                                                      │
│  Alerting: PagerDuty + Slack                                        │
│  ├─ P0: API down, DB unreachable                                    │
│  ├─ P1: High error rate (>5%), queue backlog                        │
│  └─ P2: Slow response time (>2s p95)                                │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                    EXTERNAL INTEGRATIONS                             │
├─────────────────────────────────────────────────────────────────────┤
│  ├─ WhatsApp Business API (Twilio)                                  │
│  ├─ Payment Gateway (Stripe/Razorpay)                               │
│  ├─ SMS Provider (Twilio)                                           │
│  ├─ Email Service (SendGrid)                                        │
│  ├─ Cloud Storage (AWS S3 / Google Cloud Storage)                   │
│  └─ AI Services (OpenAI, Anthropic, Google Vision)                  │
│                                                                      │
│  All with: Circuit Breaker + Retry + Timeout + Fallback             │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 2. FOLDER STRUCTURE (Enterprise-Grade)

```
khaacho-platform/
├── .github/
│   └── workflows/
│       ├── ci.yml                    # CI pipeline
│       ├── cd-staging.yml            # Deploy to staging
│       └── cd-production.yml         # Deploy to production
│
├── k8s/                              # Kubernetes manifests
│   ├── base/                         # Base configurations
│   │   ├── namespace.yaml
│   │   ├── configmap.yaml
│   │   ├── secrets.yaml
│   │   └── service-account.yaml
│   ├── api/                          # API service
│   │   ├── deployment.yaml
│   │   ├── service.yaml
│   │   ├── hpa.yaml                  # Horizontal Pod Autoscaler
│   │   ├── pdb.yaml                  # Pod Disruption Budget
│   │   └── ingress.yaml
│   ├── worker/                       # Worker service
│   │   ├── deployment.yaml
│   │   ├── hpa.yaml
│   │   └── pdb.yaml
│   ├── redis/
│   │   ├── statefulset.yaml
│   │   ├── service.yaml
│   │   └── pvc.yaml
│   ├── postgres/
│   │   ├── statefulset.yaml
│   │   ├── service.yaml
│   │   └── pvc.yaml
│   ├── monitoring/
│   │   ├── prometheus.yaml
│   │   ├── grafana.yaml
│   │   └── alertmanager.yaml
│   └── istio/                        # Service mesh
│       ├── virtual-service.yaml
│       ├── destination-rule.yaml
│       └── circuit-breaker.yaml
│
├── docker/
│   ├── Dockerfile.api                # API service image
│   ├── Dockerfile.worker             # Worker service image
│   ├── Dockerfile.migration          # DB migration image
│   └── docker-compose.yml            # Local development
│
├── src/
│   ├── api/                          # API Gateway (Stateless)
│   │   ├── server.js                 # Express app (no workers)
│   │   ├── routes/
│   │   │   ├── v1/
│   │   │   │   ├── orders.routes.js
│   │   │   │   ├── auth.routes.js
│   │   │   │   ├── products.routes.js
│   │   │   │   └── health.routes.js
│   │   │   └── index.js
│   │   ├── controllers/
│   │   │   ├── order.controller.js   # Returns 202 + Job ID
│   │   │   ├── auth.controller.js
│   │   │   └── product.controller.js
│   │   ├── middleware/
│   │   │   ├── auth.middleware.js
│   │   │   ├── ratelimit.middleware.js
│   │   │   ├── validation.middleware.js
│   │   │   └── circuitbreaker.middleware.js
│   │   └── validators/
│   │       └── order.validator.js
│   │
│   ├── workers/                      # Background Job Processors
│   │   ├── index.js                  # Worker entry point
│   │   ├── processors/
│   │   │   ├── order.processor.js    # Order creation logic
│   │   │   ├── ai.processor.js       # AI agent calls
│   │   │   ├── risk.processor.js     # Risk assessment
│   │   │   ├── routing.processor.js  # Vendor routing
│   │   │   └── notification.processor.js
│   │   └── handlers/
│   │       ├── retry.handler.js
│   │       └── deadletter.handler.js
│   │
│   ├── core/                         # Business Logic (Shared)
│   │   ├── services/
│   │   │   ├── order.service.js
│   │   │   ├── credit.service.js
│   │   │   ├── vendor.service.js
│   │   │   └── pricing.service.js
│   │   ├── repositories/
│   │   │   ├── order.repository.js
│   │   │   ├── user.repository.js
│   │   │   └── product.repository.js
│   │   └── domain/
│   │       ├── order.entity.js
│   │       └── user.entity.js
│   │
│   ├── infrastructure/
│   │   ├── ai/                       # AI Agent Abstraction
│   │   │   ├── agent.interface.js
│   │   │   ├── openai.agent.js
│   │   │   ├── claude.agent.js
│   │   │   ├── local.agent.js
│   │   │   ├── agent.factory.js
│   │   │   └── circuitbreaker.js
│   │   ├── queue/
│   │   │   ├── queue.manager.js
│   │   │   ├── bull.adapter.js
│   │   │   └── kafka.adapter.js
│   │   ├── cache/
│   │   │   ├── redis.client.js
│   │   │   └── cache.service.js
│   │   ├── database/
│   │   │   ├── prisma.client.js
│   │   │   ├── connection-pool.js
│   │   │   └── read-replica.js
│   │   └── external/
│   │       ├── whatsapp.client.js
│   │       ├── payment.client.js
│   │       └── storage.client.js
│   │
│   ├── shared/
│   │   ├── config/
│   │   │   ├── index.js
│   │   │   ├── database.config.js
│   │   │   ├── redis.config.js
│   │   │   └── ai.config.js
│   │   ├── utils/
│   │   │   ├── logger.js            # Winston structured logging
│   │   │   ├── metrics.js           # Prometheus metrics
│   │   │   ├── tracer.js            # OpenTelemetry
│   │   │   └── errors.js
│   │   ├── constants/
│   │   │   ├── queues.js
│   │   │   ├── events.js
│   │   │   └── status.js
│   │   └── types/
│   │       └── index.d.ts
│   │
│   └── migrations/                   # Prisma migrations
│       └── ...
│
├── scripts/
│   ├── db-migrate.sh
│   ├── db-partition.sql              # Partition creation
│   ├── load-test.js                  # k6 load testing
│   └── health-check.sh
│
├── tests/
│   ├── unit/
│   ├── integration/
│   ├── e2e/
│   └── load/
│
├── docs/
│   ├── API.md
│   ├── ARCHITECTURE.md
│   ├── DEPLOYMENT.md
│   └── RUNBOOK.md
│
├── .env.example
├── .dockerignore
├── .gitignore
├── package.json
├── tsconfig.json
├── prisma/
│   └── schema.prisma
└── README.md
```

---

## 3. DEPLOYMENT PLAN

### Phase 1: Infrastructure Setup (Week 1)

**Kubernetes Cluster**
```bash
# GKE (Google Kubernetes Engine) - Recommended
gcloud container clusters create khaacho-prod \
  --region us-central1 \
  --num-nodes 3 \
  --machine-type n2-standard-4 \
  --enable-autoscaling \
  --min-nodes 3 \
  --max-nodes 20 \
  --enable-autorepair \
  --enable-autoupgrade
```

**Database Setup**
```sql
-- Create partitioned tables
CREATE TABLE orders (
    id UUID PRIMARY KEY,
    created_at TIMESTAMP NOT NULL,
    status VARCHAR(50),
    -- other columns
) PARTITION BY RANGE (created_at);

-- Create monthly partitions
CREATE TABLE orders_2024_01 PARTITION OF orders
    FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');

CREATE TABLE orders_2024_02 PARTITION OF orders
    FOR VALUES FROM ('2024-02-01') TO ('2024-03-01');

-- Auto-create partitions (pg_partman extension)
SELECT create_parent('public.orders', 'created_at', 'native', 'monthly');
```

**Redis Cluster**
```bash
# Deploy Redis Cluster (3 masters + 3 replicas)
helm install redis bitnami/redis-cluster \
  --set cluster.nodes=6 \
  --set cluster.replicas=1 \
  --set persistence.size=20Gi \
  --set resources.requests.memory=2Gi
```

### Phase 2: Application Deployment (Week 2)

**Build & Push Images**
```bash
# Build API image
docker build -f docker/Dockerfile.api -t gcr.io/khaacho/api:v1.0.0 .
docker push gcr.io/khaacho/api:v1.0.0

# Build Worker image
docker build -f docker/Dockerfile.worker -t gcr.io/khaacho/worker:v1.0.0 .
docker push gcr.io/khaacho/worker:v1.0.0
```

**Deploy to Kubernetes**
```bash
# Apply configurations
kubectl apply -f k8s/base/
kubectl apply -f k8s/api/
kubectl apply -f k8s/worker/
kubectl apply -f k8s/monitoring/
```

### Phase 3: Monitoring Setup (Week 2)

**Prometheus + Grafana**
```bash
# Install Prometheus Operator
helm install prometheus prometheus-community/kube-prometheus-stack \
  --set grafana.enabled=true \
  --set prometheus.prometheusSpec.retention=30d
```

**Custom Dashboards**
- API Performance (RPS, latency, errors)
- Queue Metrics (depth, processing time, failures)
- Database Metrics (connections, query time, replication lag)
- Business Metrics (orders/hour, revenue, conversion rate)

### Phase 4: Load Testing (Week 3)

**k6 Load Test**
```javascript
// scripts/load-test.js
import http from 'k6/http';
import { check, sleep } from 'k6';

export let options = {
  stages: [
    { duration: '5m', target: 100 },   // Ramp up
    { duration: '10m', target: 500 },  // Peak load
    { duration: '5m', target: 0 },     // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<2000'], // 95% under 2s
    http_req_failed: ['rate<0.01'],    // <1% errors
  },
};

export default function () {
  let response = http.post('https://api.khaacho.com/v1/orders', 
    JSON.stringify({
      vendorId: 'uuid',
      items: [{ productId: 'uuid', quantity: 10 }]
    }),
    { headers: { 'Content-Type': 'application/json' } }
  );
  
  check(response, {
    'status is 202': (r) => r.status === 202,
    'has job id': (r) => r.json('jobId') !== undefined,
  });
  
  sleep(1);
}
```

### Phase 5: Production Cutover (Week 4)

**Blue-Green Deployment**
1. Deploy new version (green)
2. Run smoke tests
3. Route 10% traffic to green
4. Monitor for 1 hour
5. Route 50% traffic
6. Monitor for 2 hours
7. Route 100% traffic
8. Keep blue for 24h rollback window

---

## 4. SCALING FORMULA

### Capacity Planning

**Orders per Month: 1,000,000**
- Orders per day: ~33,333
- Orders per hour: ~1,389
- Orders per minute: ~23
- Orders per second: ~0.4 (peak: 2-5 RPS)

### API Service Scaling

**Formula:**
```
Required Pods = (Target RPS × Response Time) / (CPU Cores × CPU Efficiency)

Example:
- Target: 5 RPS (peak)
- Response time: 100ms (0.1s)
- CPU cores per pod: 2
- CPU efficiency: 0.7 (70%)

Required Pods = (5 × 0.1) / (2 × 0.7) = 0.36 ≈ 1 pod

With safety margin (3x): 3 pods minimum
With burst capacity (5x): 5 pods maximum
```

**HPA Configuration:**
```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: api-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: api
  minReplicas: 3
  maxReplicas: 20
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 80
  - type: Pods
    pods:
      metric:
        name: http_requests_per_second
      target:
        type: AverageValue
        averageValue: "100"
```

### Worker Service Scaling

**Formula:**
```
Required Workers = Queue Depth / (Processing Rate × Target Latency)

Example:
- Queue depth: 1000 jobs
- Processing rate: 10 jobs/min per worker
- Target latency: 5 minutes

Required Workers = 1000 / (10 × 5) = 20 workers

With safety margin: 25 workers
```

**Worker Types & Scaling:**
```yaml
AI Worker:
  - Processing time: 5-10s per job
  - Concurrency: 5 jobs per worker
  - Min replicas: 2
  - Max replicas: 10
  - Scale metric: Queue depth > 100

Risk Worker:
  - Processing time: 2-3s per job
  - Concurrency: 10 jobs per worker
  - Min replicas: 2
  - Max replicas: 5
  - Scale metric: Queue depth > 50

Routing Worker:
  - Processing time: 1-2s per job
  - Concurrency: 20 jobs per worker
  - Min replicas: 2
  - Max replicas: 5
  - Scale metric: Queue depth > 100
```

### Database Scaling

**Connection Pool Sizing:**
```
Max Connections = (CPU Cores × 2) + Effective Spindle Count

For 4 CPU cores: (4 × 2) + 1 = 9 connections per pod
For 10 API pods: 90 connections total
For 5 Worker pods: 45 connections total

Total: 135 connections (set max_connections = 200)
```

**Read Replica Strategy:**
```
Read traffic: 70%
Write traffic: 30%

Read replicas needed = (Total RPS × 0.7) / Replica Capacity
= (5 × 0.7) / 2 = 1.75 ≈ 2 replicas
```

### Redis Scaling

**Memory Calculation:**
```
Queue size: 10,000 jobs (peak)
Job size: 5 KB average
Total: 50 MB

Cache size: 100,000 products
Product size: 2 KB average
Total: 200 MB

Session size: 10,000 active users
Session size: 1 KB average
Total: 10 MB

Total memory needed: ~300 MB
With overhead (3x): 1 GB per node
Cluster: 3 nodes × 1 GB = 3 GB total
```

---

## 5. FAILURE HANDLING STRATEGY

### Circuit Breaker Pattern

**Implementation (using opossum):**
```javascript
// src/infrastructure/ai/circuitbreaker.js
const CircuitBreaker = require('opossum');

const options = {
  timeout: 30000,              // 30s timeout
  errorThresholdPercentage: 50, // Open at 50% failure
  resetTimeout: 60000,          // Try again after 60s
  rollingCountTimeout: 10000,   // 10s window
  rollingCountBuckets: 10,      // 10 buckets
  name: 'AI-Agent',
  fallback: fallbackFunction,   // Fallback logic
};

const breaker = new CircuitBreaker(aiAgentCall, options);

// Events
breaker.on('open', () => {
  logger.error('Circuit breaker opened for AI Agent');
  metrics.increment('circuit_breaker.open', { service: 'ai' });
});

breaker.on('halfOpen', () => {
  logger.warn('Circuit breaker half-open for AI Agent');
});

breaker.on('close', () => {
  logger.info('Circuit breaker closed for AI Agent');
});
```

### Retry Strategy

**Exponential Backoff with Jitter:**
```javascript
// src/infrastructure/queue/retry.strategy.js
class RetryStrategy {
  static calculateDelay(attemptNumber, baseDelay = 1000, maxDelay = 60000) {
    // Exponential: 1s, 2s, 4s, 8s, 16s, 32s, 60s
    const exponentialDelay = Math.min(
      baseDelay * Math.pow(2, attemptNumber - 1),
      maxDelay
    );
    
    // Add jitter (±25%)
    const jitter = exponentialDelay * 0.25 * (Math.random() - 0.5);
    
    return Math.floor(exponentialDelay + jitter);
  }
  
  static shouldRetry(error, attemptNumber, maxAttempts = 5) {
    // Don't retry validation errors
    if (error.code === 'VALIDATION_ERROR') return false;
    
    // Don't retry auth errors
    if (error.code === 'UNAUTHORIZED') return false;
    
    // Retry network/timeout errors
    if (error.code === 'ETIMEDOUT' || error.code === 'ECONNREFUSED') {
      return attemptNumber < maxAttempts;
    }
    
    // Retry 5xx errors
    if (error.statusCode >= 500) {
      return attemptNumber < maxAttempts;
    }
    
    return false;
  }
}
```

### Dead Letter Queue

**Configuration:**
```javascript
// src/infrastructure/queue/deadletter.js
const DLQ_CONFIG = {
  maxAttempts: 5,
  retentionDays: 30,
  alertThreshold: 100, // Alert if >100 jobs in DLQ
};

async function moveToDLQ(job, error) {
  await deadLetterQueue.add('failed-job', {
    originalQueue: job.queue.name,
    originalJobId: job.id,
    jobData: job.data,
    error: {
      message: error.message,
      stack: error.stack,
      code: error.code,
    },
    attempts: job.attemptsMade,
    failedAt: new Date(),
  });
  
  // Alert if threshold exceeded
  const dlqCount = await deadLetterQueue.count();
  if (dlqCount > DLQ_CONFIG.alertThreshold) {
    await alerting.send({
      severity: 'P1',
      title: 'Dead Letter Queue threshold exceeded',
      message: `${dlqCount} jobs in DLQ`,
    });
  }
}
```

### Database Failure Handling

**Connection Pool Exhaustion:**
```javascript
// src/infrastructure/database/connection-pool.js
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
  log: ['error', 'warn'],
});

// Health check
async function checkDatabaseHealth() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { healthy: true };
  } catch (error) {
    logger.error('Database health check failed', { error });
    return { healthy: false, error: error.message };
  }
}

// Graceful degradation
async function executeWithFallback(query, fallbackValue) {
  try {
    return await query();
  } catch (error) {
    if (error.code === 'P2024') { // Connection pool timeout
      logger.error('Connection pool exhausted', { error });
      metrics.increment('database.pool_exhausted');
      
      // Return cached value or default
      return fallbackValue;
    }
    throw error;
  }
}
```

**Read Replica Failover:**
```javascript
// src/infrastructure/database/read-replica.js
class DatabaseRouter {
  constructor() {
    this.primary = createPrismaClient(process.env.DATABASE_URL);
    this.replicas = [
      createPrismaClient(process.env.DATABASE_REPLICA_1_URL),
      createPrismaClient(process.env.DATABASE_REPLICA_2_URL),
    ];
    this.replicaIndex = 0;
  }
  
  async read(query) {
    const replica = this.getHealthyReplica();
    
    try {
      return await query(replica);
    } catch (error) {
      logger.warn('Replica query failed, falling back to primary', { error });
      return await query(this.primary);
    }
  }
  
  async write(query) {
    return await query(this.primary);
  }
  
  getHealthyReplica() {
    // Round-robin with health check
    const replica = this.replicas[this.replicaIndex];
    this.replicaIndex = (this.replicaIndex + 1) % this.replicas.length;
    return replica;
  }
}
```

### Cascading Failure Prevention

**Bulkhead Pattern:**
```javascript
// src/infrastructure/bulkhead.js
const { Semaphore } = require('async-mutex');

class BulkheadService {
  constructor() {
    this.semaphores = {
      ai: new Semaphore(10),        // Max 10 concurrent AI calls
      database: new Semaphore(50),  // Max 50 concurrent DB queries
      external: new Semaphore(20),  // Max 20 concurrent external API calls
    };
  }
  
  async execute(resource, fn) {
    const semaphore = this.semaphores[resource];
    
    if (!semaphore) {
      throw new Error(`Unknown resource: ${resource}`);
    }
    
    const [value, release] = await semaphore.acquire();
    
    try {
      return await fn();
    } finally {
      release();
    }
  }
}

// Usage
const bulkhead = new BulkheadService();

async function callAIAgent(data) {
  return await bulkhead.execute('ai', async () => {
    return await aiAgent.process(data);
  });
}
```

### Graceful Degradation

**Feature Flags:**
```javascript
// src/shared/config/features.js
const FEATURES = {
  AI_ORDER_PARSING: {
    enabled: process.env.FEATURE_AI_PARSING === 'true',
    fallback: 'manual',
  },
  RISK_ASSESSMENT: {
    enabled: process.env.FEATURE_RISK_ASSESSMENT === 'true',
    fallback: 'skip',
  },
  PRICE_INTELLIGENCE: {
    enabled: process.env.FEATURE_PRICE_INTELLIGENCE === 'true',
    fallback: 'static',
  },
};

async function processOrder(order) {
  let parsedOrder = order;
  
  if (FEATURES.AI_ORDER_PARSING.enabled) {
    try {
      parsedOrder = await aiAgent.parseOrder(order);
    } catch (error) {
      logger.warn('AI parsing failed, using manual fallback', { error });
      parsedOrder = await manualParser.parse(order);
    }
  }
  
  return parsedOrder;
}
```

---

## 6. SECURITY HARDENING CHECKLIST

### Infrastructure Security

- [ ] **Network Isolation**
  - VPC with private subnets for database/Redis
  - Public subnet only for load balancer
  - Network policies in Kubernetes
  - No direct internet access for workers

- [ ] **TLS/SSL Everywhere**
  - TLS 1.3 for all external connections
  - mTLS between services (Istio)
  - Certificate rotation (Let's Encrypt + cert-manager)
  - HSTS headers enabled

- [ ] **Secrets Management**
  - Kubernetes Secrets (encrypted at rest)
  - External Secrets Operator (AWS Secrets Manager / GCP Secret Manager)
  - No secrets in code or environment variables
  - Rotate secrets every 90 days

- [ ] **Access Control**
  - RBAC for Kubernetes
  - IAM roles for cloud resources
  - Principle of least privilege
  - Service accounts per service

### Application Security

- [ ] **Authentication & Authorization**
  - JWT with RS256 (asymmetric keys)
  - Token expiration: 15 minutes (access), 7 days (refresh)
  - API key rotation every 90 days
  - Multi-factor authentication for admin

- [ ] **Input Validation**
  - Validate all inputs (express-validator)
  - Sanitize user input (prevent XSS)
  - SQL injection prevention (Prisma ORM)
  - File upload validation (type, size, content)

- [ ] **Rate Limiting**
  - Per IP: 100 req/min
  - Per API key: 1000 req/min
  - Per user: 500 req/min
  - Distributed rate limiting (Redis)

- [ ] **CORS Configuration**
  - Whitelist allowed origins
  - Credentials: true only for trusted domains
  - Preflight cache: 24 hours

- [ ] **Security Headers**
  ```javascript
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "https:"],
      },
    },
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    },
    frameguard: { action: 'deny' },
    noSniff: true,
    xssFilter: true,
  })
  ```

### Data Security

- [ ] **Encryption**
  - At rest: Database encryption (AES-256)
  - In transit: TLS 1.3
  - PII encryption: Field-level encryption
  - Backup encryption

- [ ] **Data Privacy**
  - GDPR compliance (data retention, right to deletion)
  - PII masking in logs
  - Audit trail for data access
  - Data anonymization for analytics

- [ ] **Database Security**
  - Separate read/write users
  - Connection pooling with max limits
  - Query timeout: 30 seconds
  - Prepared statements only (no raw SQL)

### Monitoring & Incident Response

- [ ] **Security Monitoring**
  - Failed login attempts (>5 in 5 min → alert)
  - Unusual API patterns (spike detection)
  - Privilege escalation attempts
  - Data exfiltration detection

- [ ] **Audit Logging**
  - All authentication events
  - All authorization failures
  - All data modifications
  - All admin actions
  - Retention: 1 year

- [ ] **Incident Response Plan**
  - Security incident runbook
  - Escalation matrix
  - Communication plan
  - Post-mortem template

### Compliance

- [ ] **PCI DSS** (if handling payments)
  - No storage of CVV/CVC
  - Tokenize card numbers
  - Annual security audit

- [ ] **SOC 2 Type II**
  - Access controls
  - Change management
  - Incident response
  - Business continuity

- [ ] **GDPR**
  - Data processing agreement
  - Privacy policy
  - Cookie consent
  - Data portability

### Dependency Security

- [ ] **Vulnerability Scanning**
  - npm audit (CI/CD pipeline)
  - Snyk or Dependabot
  - Container image scanning (Trivy)
  - Weekly security updates

- [ ] **Supply Chain Security**
  - Lock file committed (package-lock.json)
  - Verify package signatures
  - Private npm registry for internal packages
  - SBOM (Software Bill of Materials)

---

## 7. IMPLEMENTATION CODE SAMPLES

### Stateless API Controller

```javascript
// src/api/controllers/order.controller.js
const { queueManager } = require('../../infrastructure/queue/queue.manager');
const { validateOrder } = require('../validators/order.validator');
const logger = require('../../shared/utils/logger');
const metrics = require('../../shared/utils/metrics');

class OrderController {
  async createOrder(req, res, next) {
    const startTime = Date.now();
    
    try {
      // Validate input
      const validationResult = validateOrder(req.body);
      if (!validationResult.valid) {
        return res.status(400).json({
          error: 'Validation failed',
          details: validationResult.errors,
        });
      }
      
      // Generate job ID
      const jobId = `order-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      // Enqueue job (async processing)
      await queueManager.addJob('ORDER_PROCESSING', 'create-order', {
        orderId: jobId,
        userId: req.user.id,
        data: req.body,
        metadata: {
          ip: req.ip,
          userAgent: req.get('user-agent'),
          timestamp: new Date().toISOString(),
        },
      }, {
        priority: req.body.priority || 'normal',
        attempts: 5,
        backoff: {
          type: 'exponential',
          delay: 1000,
        },
      });
      
      // Log and track metrics
      logger.info('Order enqueued', { jobId, userId: req.user.id });
      metrics.increment('orders.enqueued', { priority: req.body.priority });
      metrics.histogram('api.response_time', Date.now() - startTime, {
        endpoint: 'create_order',
      });
      
      // Return 202 Accepted immediately
      return res.status(202).json({
        message: 'Order accepted for processing',
        jobId,
        status: 'pending',
        statusUrl: `/api/v1/orders/${jobId}/status`,
        estimatedProcessingTime: '30-60 seconds',
      });
      
    } catch (error) {
      logger.error('Order creation failed', { error, userId: req.user.id });
      metrics.increment('orders.failed', { reason: error.code });
      next(error);
    }
  }
  
  async getOrderStatus(req, res, next) {
    try {
      const { jobId } = req.params;
      
      // Get job status from queue
      const job = await queueManager.getJob('ORDER_PROCESSING', jobId);
      
      if (!job) {
        return res.status(404).json({
          error: 'Order not found',
          jobId,
        });
      }
      
      const state = await job.getState();
      const progress = job.progress();
      
      return res.json({
        jobId,
        status: state,
        progress,
        data: state === 'completed' ? job.returnvalue : null,
        error: state === 'failed' ? job.failedReason : null,
      });
      
    } catch (error) {
      logger.error('Status check failed', { error, jobId: req.params.jobId });
      next(error);
    }
  }
}

module.exports = new OrderController();
```

### Worker Processor

```javascript
// src/workers/processors/order.processor.js
const prisma = require('../../infrastructure/database/prisma.client');
const aiAgent = require('../../infrastructure/ai/agent.factory');
const logger = require('../../shared/utils/logger');
const metrics = require('../../shared/utils/metrics');

class OrderProcessor {
  async process(job) {
    const { orderId, userId, data } = job.data;
    const startTime = Date.now();
    
    try {
      logger.info('Processing order', { orderId, userId });
      
      // Step 1: Parse order with AI (if enabled)
      job.progress(10);
      const parsedOrder = await this.parseOrder(data);
      
      // Step 2: Validate order
      job.progress(30);
      await this.validateOrder(parsedOrder);
      
      // Step 3: Risk assessment
      job.progress(50);
      const riskScore = await this.assessRisk(userId, parsedOrder);
      
      if (riskScore > 0.8) {
        throw new Error('Order rejected: High risk score');
      }
      
      // Step 4: Create order in database
      job.progress(70);
      const order = await prisma.order.create({
        data: {
          id: orderId,
          userId,
          status: 'PENDING',
          items: {
            create: parsedOrder.items,
          },
          metadata: {
            riskScore,
            processingTime: Date.now() - startTime,
          },
        },
        include: {
          items: true,
        },
      });
      
      // Step 5: Route to vendor
      job.progress(90);
      await this.routeToVendor(order);
      
      // Complete
      job.progress(100);
      
      const processingTime = Date.now() - startTime;
      logger.info('Order processed successfully', { 
        orderId, 
        processingTime,
      });
      metrics.histogram('order.processing_time', processingTime);
      metrics.increment('order.processed', { status: 'success' });
      
      return {
        orderId,
        status: 'completed',
        processingTime,
      };
      
    } catch (error) {
      logger.error('Order processing failed', { 
        orderId, 
        error: error.message,
        stack: error.stack,
      });
      metrics.increment('order.processed', { status: 'failed' });
      throw error;
    }
  }
  
  async parseOrder(data) {
    try {
      return await aiAgent.parseOrder(data);
    } catch (error) {
      logger.warn('AI parsing failed, using fallback', { error });
      return this.fallbackParser(data);
    }
  }
  
  async validateOrder(order) {
    // Validation logic
    if (!order.items || order.items.length === 0) {
      throw new Error('Order must have at least one item');
    }
    
    // Check product availability
    const productIds = order.items.map(item => item.productId);
    const products = await prisma.product.findMany({
      where: { id: { in: productIds } },
    });
    
    if (products.length !== productIds.length) {
      throw new Error('Some products not found');
    }
    
    return true;
  }
  
  async assessRisk(userId, order) {
    // Risk assessment logic
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { orders: true },
    });
    
    // Simple risk score (0-1)
    let riskScore = 0;
    
    // New user
    if (user.orders.length === 0) riskScore += 0.3;
    
    // Large order
    if (order.totalAmount > 10000) riskScore += 0.2;
    
    // Many items
    if (order.items.length > 50) riskScore += 0.1;
    
    return Math.min(riskScore, 1);
  }
  
  async routeToVendor(order) {
    // Vendor routing logic
    // This could be another queue job
    await queueManager.addJob('ORDER_ROUTING', 'route-order', {
      orderId: order.id,
    });
  }
  
  fallbackParser(data) {
    // Simple fallback parser
    return {
      items: data.items || [],
      totalAmount: data.totalAmount || 0,
    };
  }
}

module.exports = new OrderProcessor();
```

### AI Agent Abstraction

```javascript
// src/infrastructure/ai/agent.interface.js
class AIAgent {
  async parseOrder(data) {
    throw new Error('Not implemented');
  }
  
  async assessRisk(order) {
    throw new Error('Not implemented');
  }
  
  async optimizeRouting(order, vendors) {
    throw new Error('Not implemented');
  }
}

module.exports = AIAgent;
```

```javascript
// src/infrastructure/ai/openai.agent.js
const OpenAI = require('openai');
const AIAgent = require('./agent.interface');
const logger = require('../../shared/utils/logger');

class OpenAIAgent extends AIAgent {
  constructor() {
    super();
    this.client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      timeout: 30000,
      maxRetries: 3,
    });
  }
  
  async parseOrder(data) {
    try {
      const response = await this.client.chat.completions.create({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: 'You are an order parsing assistant. Extract structured data from order text.',
          },
          {
            role: 'user',
            content: JSON.stringify(data),
          },
        ],
        temperature: 0.1,
        max_tokens: 1000,
      });
      
      return JSON.parse(response.choices[0].message.content);
      
    } catch (error) {
      logger.error('OpenAI parsing failed', { error });
      throw error;
    }
  }
  
  async assessRisk(order) {
    // Risk assessment implementation
    try {
      const response = await this.client.chat.completions.create({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: 'You are a fraud detection assistant. Assess order risk (0-1).',
          },
          {
            role: 'user',
            content: JSON.stringify(order),
          },
        ],
        temperature: 0.1,
      });
      
      const result = JSON.parse(response.choices[0].message.content);
      return result.riskScore;
      
    } catch (error) {
      logger.error('OpenAI risk assessment failed', { error });
      throw error;
    }
  }
}

module.exports = OpenAIAgent;
```

```javascript
// src/infrastructure/ai/agent.factory.js
const OpenAIAgent = require('./openai.agent');
const ClaudeAgent = require('./claude.agent');
const LocalAgent = require('./local.agent');
const CircuitBreaker = require('opossum');
const logger = require('../../shared/utils/logger');

class AIAgentFactory {
  constructor() {
    this.agents = {
      openai: new OpenAIAgent(),
      claude: new ClaudeAgent(),
      local: new LocalAgent(),
    };
    
    this.primary = process.env.AI_AGENT_PRIMARY || 'openai';
    this.fallback = process.env.AI_AGENT_FALLBACK || 'local';
    
    // Wrap primary agent with circuit breaker
    this.breaker = new CircuitBreaker(
      async (method, ...args) => {
        return await this.agents[this.primary][method](...args);
      },
      {
        timeout: 30000,
        errorThresholdPercentage: 50,
        resetTimeout: 60000,
      }
    );
    
    this.breaker.on('open', () => {
      logger.error('AI agent circuit breaker opened', { agent: this.primary });
    });
    
    this.breaker.fallback(async (method, ...args) => {
      logger.warn('Using fallback AI agent', { 
        primary: this.primary, 
        fallback: this.fallback,
      });
      return await this.agents[this.fallback][method](...args);
    });
  }
  
  async parseOrder(data) {
    return await this.breaker.fire('parseOrder', data);
  }
  
  async assessRisk(order) {
    return await this.breaker.fire('assessRisk', order);
  }
  
  async optimizeRouting(order, vendors) {
    return await this.breaker.fire('optimizeRouting', order, vendors);
  }
}

module.exports = new AIAgentFactory();
```

### Circuit Breaker Middleware

```javascript
// src/api/middleware/circuitbreaker.middleware.js
const CircuitBreaker = require('opossum');
const logger = require('../../shared/utils/logger');
const metrics = require('../../shared/utils/metrics');

const breakers = new Map();

function createCircuitBreaker(name, fn, options = {}) {
  const defaultOptions = {
    timeout: 30000,
    errorThresholdPercentage: 50,
    resetTimeout: 60000,
    rollingCountTimeout: 10000,
    rollingCountBuckets: 10,
    name,
  };
  
  const breaker = new CircuitBreaker(fn, { ...defaultOptions, ...options });
  
  // Event handlers
  breaker.on('open', () => {
    logger.error(`Circuit breaker opened: ${name}`);
    metrics.increment('circuit_breaker.open', { service: name });
  });
  
  breaker.on('halfOpen', () => {
    logger.warn(`Circuit breaker half-open: ${name}`);
    metrics.increment('circuit_breaker.half_open', { service: name });
  });
  
  breaker.on('close', () => {
    logger.info(`Circuit breaker closed: ${name}`);
    metrics.increment('circuit_breaker.close', { service: name });
  });
  
  breaker.on('success', (result) => {
    metrics.increment('circuit_breaker.success', { service: name });
  });
  
  breaker.on('failure', (error) => {
    metrics.increment('circuit_breaker.failure', { service: name });
  });
  
  breaker.on('timeout', () => {
    metrics.increment('circuit_breaker.timeout', { service: name });
  });
  
  breakers.set(name, breaker);
  return breaker;
}

function getCircuitBreaker(name) {
  return breakers.get(name);
}

function circuitBreakerMiddleware(serviceName) {
  return async (req, res, next) => {
    const breaker = getCircuitBreaker(serviceName);
    
    if (!breaker) {
      return next();
    }
    
    // Check circuit breaker state
    if (breaker.opened) {
      return res.status(503).json({
        error: 'Service temporarily unavailable',
        message: `${serviceName} is currently experiencing issues`,
        retryAfter: Math.ceil(breaker.options.resetTimeout / 1000),
      });
    }
    
    next();
  };
}

module.exports = {
  createCircuitBreaker,
  getCircuitBreaker,
  circuitBreakerMiddleware,
};
```

---

## 8. DOCKER & KUBERNETES CONFIGURATION

### Dockerfile (Multi-stage Build)

```dockerfile
# docker/Dockerfile.api
FROM node:20-alpine AS base
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npx prisma generate
RUN npm run build

FROM node:20-alpine AS production
WORKDIR /app

# Security: Run as non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Copy dependencies
COPY --from=base --chown=nodejs:nodejs /app/node_modules ./node_modules

# Copy application
COPY --from=build --chown=nodejs:nodejs /app/dist ./dist
COPY --from=build --chown=nodejs:nodejs /app/prisma ./prisma
COPY --chown=nodejs:nodejs package*.json ./

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

USER nodejs
EXPOSE 3000

CMD ["node", "dist/api/server.js"]
```

```dockerfile
# docker/Dockerfile.worker
FROM node:20-alpine AS base
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npx prisma generate
RUN npm run build

FROM node:20-alpine AS production
WORKDIR /app

RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

COPY --from=base --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=build --chown=nodejs:nodejs /app/dist ./dist
COPY --from=build --chown=nodejs:nodejs /app/prisma ./prisma
COPY --chown=nodejs:nodejs package*.json ./

USER nodejs

CMD ["node", "dist/workers/index.js"]
```
