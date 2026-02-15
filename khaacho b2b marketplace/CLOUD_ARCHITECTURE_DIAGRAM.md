# Image Order Upload - Cloud Architecture

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                          CLIENT APPLICATION                          │
│                     (Mobile App / Web Browser)                       │
└────────────────────────────────┬────────────────────────────────────┘
                                 │
                                 │ HTTPS POST /api/orders/upload-image
                                 │ (multipart/form-data)
                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         CLOUD RUN API SERVICE                        │
│                    (Node.js + Express + Prisma)                      │
│                                                                       │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Controller: imageUpload.controller.js                       │   │
│  │  • Validate file (type, size, auth)                          │   │
│  │  • Call imageUpload.service.js                               │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                 │                                     │
│  ┌─────────────────────────────▼─────────────────────────────────┐ │
│  │  Service: imageUpload.service.js                              │ │
│  │  • Upload image to Cloud Storage                              │ │
│  │  • Create UploadedOrder (status: PROCESSING)                  │ │
│  │  • Push job to queue                                          │ │
│  └─────────────────────────────┬─────────────────────────────────┘ │
└─────────────────────────────────┼─────────────────────────────────────┘
                                  │
                    ┌─────────────┼─────────────┐
                    │             │             │
                    ▼             ▼             ▼
         ┌──────────────┐  ┌──────────┐  ┌──────────────┐
         │   CLOUD      │  │ CLOUD    │  │   CLOUD      │
         │   STORAGE    │  │ SQL      │  │   TASKS      │
         │              │  │(Postgres)│  │  or BullMQ   │
         │ • Images     │  │          │  │  (Redis)     │
         │ • Receipts   │  │ • Orders │  │              │
         │ • Documents  │  │ • Items  │  │ • Job Queue  │
         └──────────────┘  └──────────┘  └──────┬───────┘
                                                 │
                                                 │ Trigger Worker
                                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      CLOUD RUN WORKER SERVICE                        │
│                    (Background Job Processor)                        │
│                                                                       │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Processor: imageProcessingProcessor.js                      │   │
│  │                                                               │   │
│  │  Step 1: OCR Text Extraction                                 │   │
│  │  ┌────────────────────────────────────────────────────────┐ │   │
│  │  │ • Fetch image from Cloud Storage                       │ │   │
│  │  │ • Call Google Vision API                               │ │   │
│  │  │ • Extract raw text                                     │ │   │
│  │  │ • Store in UploadedOrder.extractedText                 │ │   │
│  │  └────────────────────────────────────────────────────────┘ │   │
│  │                          │                                    │   │
│  │  Step 2: LLM Item Extraction                                 │   │
│  │  ┌────────────────────────▼────────────────────────────────┐ │   │
│  │  │ • Call OpenAI API (GPT-4o-mini)                        │ │   │
│  │  │ • Extract structured items: {name, quantity, unit}     │ │   │
│  │  │ • Validate and clean data                              │ │   │
│  │  │ • Store in UploadedOrder.parsedData                    │ │   │
│  │  └────────────────────────┬────────────────────────────────┘ │   │
│  │                          │                                    │   │
│  │  Step 3: Product Normalization                               │   │
│  │  ┌────────────────────────▼────────────────────────────────┐ │   │
│  │  │ • Fuzzy match against Product catalog                  │ │   │
│  │  │ • Use Levenshtein distance algorithm                   │ │   │
│  │  │ • Assign confidence scores                             │ │   │
│  │  │ • Flag items needing review                            │ │   │
│  │  └────────────────────────┬────────────────────────────────┘ │   │
│  │                          │                                    │   │
│  │  Step 4: Find Matching Wholesalers                           │   │
│  │  ┌────────────────────────▼────────────────────────────────┐ │   │
│  │  │ • Query top 5 reliable suppliers per product           │ │   │
│  │  │ • Sort by reliability score                            │ │   │
│  │  │ • Check stock availability                             │ │   │
│  │  │ • Calculate optimal allocation                         │ │   │
│  │  └────────────────────────┬────────────────────────────────┘ │   │
│  │                          │                                    │   │
│  │  Step 5: Create RFQs                                         │   │
│  │  ┌────────────────────────▼────────────────────────────────┐ │   │
│  │  │ • Create OrderBroadcastLog records                     │ │   │
│  │  │ • Store vendor metadata                                │ │   │
│  │  │ • Link to UploadedOrder                                │ │   │
│  │  └────────────────────────┬────────────────────────────────┘ │   │
│  │                          │                                    │   │
│  │  Step 6: Notify Suppliers                                    │   │
│  │  ┌────────────────────────▼────────────────────────────────┐ │   │
│  │  │ • Send WhatsApp notifications                          │ │   │
│  │  │ • Send email notifications                             │ │   │
│  │  │ • Update notification status                           │ │   │
│  │  └────────────────────────┬────────────────────────────────┘ │   │
│  │                          │                                    │   │
│  │  ┌────────────────────────▼────────────────────────────────┐ │   │
│  │  │ Update UploadedOrder status:                           │ │   │
│  │  │ • COMPLETED (all items matched)                        │ │   │
│  │  │ • PENDING_REVIEW (some items need review)              │ │   │
│  │  │ • FAILED (processing error)                            │ │   │
│  │  └────────────────────────────────────────────────────────┘ │   │
│  └─────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  │ Update Database
                                  ▼
                          ┌──────────────┐
                          │  CLOUD SQL   │
                          │ (PostgreSQL) │
                          │              │
                          │ • Status     │
                          │ • Results    │
                          │ • RFQs       │
                          └──────────────┘
```

---

## 🔄 Detailed Flow

### 1️⃣ Client Upload Request
```http
POST https://api.khaacho.com/api/orders/upload-image
Authorization: Bearer <JWT_TOKEN>
Content-Type: multipart/form-data

Body:
- image: file (max 10MB)
- retailerId: uuid (optional)
```

### 2️⃣ Cloud Run API Processing
```javascript
// Controller validates and routes
imageUpload.controller.js
  ↓
// Service handles upload
imageUpload.service.js
  ├─→ Upload to Cloud Storage
  ├─→ Create UploadedOrder (PROCESSING)
  └─→ Push job to queue
```

### 3️⃣ Cloud Storage
```
gs://khaacho-uploads/orders/
  ├─ 2026-02-13_order_abc123.jpg
  ├─ 2026-02-13_order_def456.jpg
  └─ ...
```

### 4️⃣ Cloud SQL Database
```sql
INSERT INTO uploaded_orders (
  id, retailer_id, image_url, image_key, status
) VALUES (
  'uuid', 'retailer-uuid', 
  'https://storage.googleapis.com/...', 
  'orders/2026-02-13_order_abc123.jpg',
  'PROCESSING'
);
```

### 5️⃣ Queue Job
```javascript
// Cloud Tasks or BullMQ
{
  queue: 'image-processing',
  payload: {
    uploadedOrderId: 'uuid',
    timestamp: '2026-02-13T...'
  },
  options: {
    attempts: 3,
    backoff: 'exponential'
  }
}
```

### 6️⃣ Worker Processing
```javascript
// imageProcessingProcessor.js
async function processImageOrder(job) {
  const { uploadedOrderId } = job.data;
  
  // Step 1: OCR
  const ocrResult = await googleVisionOCR(imageUrl);
  
  // Step 2: LLM Extraction
  const items = await openAIExtraction(ocrResult.text);
  
  // Step 3: Normalization
  const normalized = await normalizeProducts(items);
  
  // Step 4: Find Wholesalers
  const suppliers = await findTopSuppliers(normalized);
  
  // Step 5: Create RFQs
  const rfqs = await createRFQs(suppliers);
  
  // Step 6: Notify
  await notifySuppliers(rfqs);
  
  // Update status
  await updateStatus(uploadedOrderId, 'COMPLETED');
}
```

---

## 🌐 Google Cloud Services Used

### 1. Cloud Run (API Service)
```yaml
service: khaacho-api
runtime: nodejs18
instance_class: F2
min_instances: 1
max_instances: 10
cpu: 2
memory: 2Gi
env_variables:
  NODE_ENV: production
  DATABASE_URL: ${DATABASE_URL}
  REDIS_URL: ${REDIS_URL}
```

### 2. Cloud Run (Worker Service)
```yaml
service: khaacho-worker
runtime: nodejs18
instance_class: F2
min_instances: 0
max_instances: 5
cpu: 2
memory: 4Gi
env_variables:
  NODE_ENV: production
  ENABLE_BACKGROUND_JOBS: true
```

### 3. Cloud Storage
```yaml
bucket: khaacho-uploads
location: us-central1
storage_class: STANDARD
lifecycle:
  - age: 90  # Delete after 90 days
```

### 4. Cloud SQL (PostgreSQL)
```yaml
instance: khaacho-db
tier: db-custom-2-7680  # 2 vCPU, 7.5GB RAM
database_version: POSTGRES_15
region: us-central1
backup:
  enabled: true
  start_time: "03:00"
```

### 5. Cloud Tasks (Queue)
```yaml
queue: image-processing
location: us-central1
rate_limits:
  max_dispatches_per_second: 10
  max_concurrent_dispatches: 5
retry_config:
  max_attempts: 3
  max_backoff: 3600s
```

### 6. Cloud Memorystore (Redis)
```yaml
instance: khaacho-redis
tier: BASIC
memory_size_gb: 1
region: us-central1
redis_version: REDIS_6_X
```

---

## 🔐 Security Configuration

### IAM Roles
```yaml
# API Service
- roles/cloudsql.client
- roles/storage.objectCreator
- roles/cloudtasks.enqueuer

# Worker Service
- roles/cloudsql.client
- roles/storage.objectViewer
- roles/cloudtasks.taskRunner

# Service Account
khaacho-api@project.iam.gserviceaccount.com
```

### VPC Connector
```yaml
name: khaacho-vpc-connector
network: default
ip_cidr_range: 10.8.0.0/28
region: us-central1
```

### Secrets Manager
```yaml
secrets:
  - DATABASE_URL
  - REDIS_URL
  - OPENAI_API_KEY
  - GOOGLE_CLOUD_CREDENTIALS
  - JWT_SECRET
```

---

## 📊 Monitoring & Logging

### Cloud Logging
```javascript
// Structured logs automatically sent to Cloud Logging
logger.info('Image processing started', {
  uploadedOrderId,
  severity: 'INFO',
  labels: {
    service: 'image-processing',
    environment: 'production'
  }
});
```

### Cloud Monitoring
```yaml
metrics:
  - image_upload_count
  - processing_duration
  - ocr_success_rate
  - llm_extraction_rate
  - normalization_accuracy
  - rfq_broadcast_count

alerts:
  - name: high_failure_rate
    condition: failure_rate > 10%
    notification: email, slack
  
  - name: slow_processing
    condition: avg_duration > 30s
    notification: email
```

### Cloud Trace
```javascript
// Automatic distributed tracing
const { trace } = require('@google-cloud/trace-agent');
trace.start();
```

---

## 🚀 Deployment Commands

### 1. Deploy API Service
```bash
gcloud run deploy khaacho-api \
  --source . \
  --region us-central1 \
  --platform managed \
  --allow-unauthenticated \
  --set-env-vars NODE_ENV=production \
  --set-secrets DATABASE_URL=DATABASE_URL:latest \
  --set-secrets REDIS_URL=REDIS_URL:latest \
  --vpc-connector khaacho-vpc-connector \
  --min-instances 1 \
  --max-instances 10 \
  --memory 2Gi \
  --cpu 2
```

### 2. Deploy Worker Service
```bash
gcloud run deploy khaacho-worker \
  --source . \
  --region us-central1 \
  --platform managed \
  --no-allow-unauthenticated \
  --set-env-vars NODE_ENV=production \
  --set-env-vars ENABLE_BACKGROUND_JOBS=true \
  --set-secrets DATABASE_URL=DATABASE_URL:latest \
  --set-secrets REDIS_URL=REDIS_URL:latest \
  --vpc-connector khaacho-vpc-connector \
  --min-instances 0 \
  --max-instances 5 \
  --memory 4Gi \
  --cpu 2
```

### 3. Create Cloud Tasks Queue
```bash
gcloud tasks queues create image-processing \
  --location us-central1 \
  --max-dispatches-per-second 10 \
  --max-concurrent-dispatches 5 \
  --max-attempts 3
```

### 4. Run Database Migration
```bash
# Connect to Cloud SQL
gcloud sql connect khaacho-db --user=postgres

# Run migration
npx prisma migrate deploy
```

---

## 💰 Cost Estimation

### Monthly Costs (Estimated)

| Service | Usage | Cost |
|---------|-------|------|
| Cloud Run (API) | 1M requests, 2GB RAM | $50 |
| Cloud Run (Worker) | 10K jobs, 4GB RAM | $30 |
| Cloud Storage | 100GB, 1M operations | $5 |
| Cloud SQL | db-custom-2-7680 | $150 |
| Cloud Tasks | 10K tasks | $0.40 |
| Cloud Memorystore | 1GB Redis | $35 |
| Google Vision API | 10K images | $15 |
| OpenAI API | 10K requests | $30 |
| **Total** | | **~$315/month** |

### Cost Optimization
- Use Cloud Run min-instances: 0 for worker
- Enable Cloud SQL automatic scaling
- Use Cloud Storage lifecycle policies
- Cache frequently accessed data in Redis
- Batch API calls where possible

---

## 🔧 Configuration Files

### cloudbuild.yaml
```yaml
steps:
  # Install dependencies
  - name: 'node:18'
    entrypoint: npm
    args: ['ci']
  
  # Run tests
  - name: 'node:18'
    entrypoint: npm
    args: ['test']
  
  # Build
  - name: 'node:18'
    entrypoint: npm
    args: ['run', 'build']
  
  # Deploy API
  - name: 'gcr.io/cloud-builders/gcloud'
    args:
      - 'run'
      - 'deploy'
      - 'khaacho-api'
      - '--source=.'
      - '--region=us-central1'
  
  # Deploy Worker
  - name: 'gcr.io/cloud-builders/gcloud'
    args:
      - 'run'
      - 'deploy'
      - 'khaacho-worker'
      - '--source=.'
      - '--region=us-central1'

timeout: 1200s
```

### app.yaml (Alternative: App Engine)
```yaml
runtime: nodejs18
instance_class: F2
automatic_scaling:
  min_instances: 1
  max_instances: 10
  target_cpu_utilization: 0.65

env_variables:
  NODE_ENV: production

vpc_access_connector:
  name: projects/PROJECT_ID/locations/us-central1/connectors/khaacho-vpc-connector
```

---

## ✅ Production Checklist

### Pre-Deployment
- [ ] Set up Google Cloud project
- [ ] Enable required APIs (Cloud Run, Cloud SQL, Cloud Storage, etc.)
- [ ] Create service accounts with proper IAM roles
- [ ] Set up VPC connector
- [ ] Configure Cloud SQL instance
- [ ] Create Cloud Storage bucket
- [ ] Set up Cloud Memorystore (Redis)
- [ ] Create Cloud Tasks queue
- [ ] Store secrets in Secret Manager
- [ ] Configure Cloud Monitoring alerts
- [ ] Set up Cloud Logging sinks

### Deployment
- [ ] Deploy API service to Cloud Run
- [ ] Deploy Worker service to Cloud Run
- [ ] Run database migrations
- [ ] Verify services are running
- [ ] Test image upload endpoint
- [ ] Test queue processing
- [ ] Verify Cloud Storage uploads
- [ ] Check Cloud SQL connections
- [ ] Monitor logs for errors

### Post-Deployment
- [ ] Set up custom domain
- [ ] Configure SSL certificate
- [ ] Enable Cloud CDN
- [ ] Set up backup policies
- [ ] Configure monitoring dashboards
- [ ] Test failure scenarios
- [ ] Document runbooks
- [ ] Train team on operations

---

**Architecture Status**: ✅ Production Ready  
**Last Updated**: 2026-02-13  
**Cloud Provider**: Google Cloud Platform  
**Region**: us-central1
