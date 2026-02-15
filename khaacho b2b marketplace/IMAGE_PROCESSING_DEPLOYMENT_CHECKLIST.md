# Image Processing Feature - Deployment Checklist

## Pre-Deployment Checklist

### 1. Google Cloud Setup

- [ ] Create Google Cloud project
- [ ] Enable Cloud Storage API
- [ ] Enable Vision API
- [ ] Create GCS bucket (`khaacho-uploads`)
- [ ] Create service account with `storage.objectAdmin` role
- [ ] Download service account key JSON
- [ ] (Optional) Set bucket lifecycle policy for auto-deletion

### 2. Environment Variables

**Required for Render:**

```bash
# Google Cloud Storage
GCS_BUCKET_NAME=khaacho-uploads
GCS_PROJECT_ID=your-project-id
GCS_CREDENTIALS={"type":"service_account","project_id":"...","private_key":"...","client_email":"..."}

# Google Vision API (can use same credentials)
GOOGLE_CLOUD_PROJECT_ID=your-project-id
GOOGLE_CLOUD_CREDENTIALS={"type":"service_account","project_id":"...","private_key":"..."}

# OpenAI for item extraction
LLM_PROVIDER=openai
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini

# Product matching
PRODUCT_MATCH_THRESHOLD=0.7
```

### 3. Dependencies

- [ ] Verify `package.json` includes:
  - `@google-cloud/storage@^7.7.0`
  - `@google-cloud/vision@^5.3.4`
  - `multer@^1.4.5-lts.1`

### 4. Database

- [ ] Migration 026 applied (`uploaded_orders` table)
- [ ] Prisma schema includes `UploadedOrder` model
- [ ] Run `npx prisma generate`

### 5. Code Files

- [ ] `src/services/imageUpload.service.js` - GCS upload
- [ ] `src/services/orderImageProcessing.service.js` - OCR processing
- [ ] `src/services/itemExtraction.service.js` - LLM extraction
- [ ] `src/services/productNormalization.service.js` - Product matching
- [ ] `src/controllers/imageUpload.controller.js` - API endpoints
- [ ] `src/routes/imageUpload.routes.js` - Routes
- [ ] `src/queues/processors/imageProcessingProcessor.js` - Background worker

## Deployment Steps

### Step 1: Update Render Environment Variables

1. Go to Render dashboard
2. Select your service
3. Go to "Environment" tab
4. Add all required variables from section 2 above
5. Save changes

### Step 2: Deploy Code

```bash
# Commit changes
git add .
git commit -m "Add Google Cloud Storage image upload integration"
git push origin main
```

Render will automatically:
- Install dependencies
- Run `npx prisma generate`
- Run `npx prisma migrate deploy`
- Start the server

### Step 3: Verify Deployment

**Check Logs:**

```
✓ Google Cloud Storage initialized successfully
  bucket: khaacho-uploads
  projectId: your-project-id

✓ Queue manager initialized
  queues: IMAGE_PROCESSING, ...

✓ Server listening on port 10000
```

**Test Upload:**

```bash
curl -X POST https://your-app.onrender.com/api/orders/upload-image \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "image=@test-order.jpg"
```

**Expected Response:**

```json
{
  "success": true,
  "uploadedOrderId": "uuid-123",
  "imageUrl": "https://storage.googleapis.com/...",
  "status": "PROCESSING"
}
```

### Step 4: Monitor Processing

**Check Upload Status:**

```bash
curl https://your-app.onrender.com/api/orders/upload-image/uuid-123 \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Expected Statuses:**

1. `PROCESSING` - Initial upload
2. `COMPLETED` - Successfully processed
3. `FAILED` - Processing error
4. `PENDING_REVIEW` - Low confidence matches

## Post-Deployment Verification

### 1. Test Complete Workflow

- [ ] Upload image via API
- [ ] Verify file appears in GCS bucket
- [ ] Check background job processes
- [ ] Verify OCR text extraction
- [ ] Confirm item extraction
- [ ] Check product normalization
- [ ] Verify RFQ broadcasting

### 2. Check Logs

**Application Logs:**

```bash
# On Render
# Go to service → Logs tab
# Look for:
- "Image uploaded to GCS successfully"
- "Processing image order"
- "OCR text extraction completed"
- "Extracted N items from text"
- "Product normalization completed"
- "Broadcasting RFQs to vendors"
```

**GCS Logs (Optional):**

```bash
# Using gcloud CLI
gcloud logging read "resource.type=gcs_bucket AND resource.labels.bucket_name=khaacho-uploads" \
  --limit 50 \
  --format json
```

### 3. Monitor Costs

**GCS Costs:**

- Go to Google Cloud Console
- Navigate to Billing → Reports
- Filter by Cloud Storage
- Set up budget alerts

**Expected Costs:**

- Storage: ~$0.020 per GB/month
- Operations: ~$0.05 per 10,000 operations
- Network: Free within same region

### 4. Performance Metrics

**Track:**

- Upload success rate
- Average processing time
- OCR accuracy
- Product match confidence
- RFQ broadcast success rate

## Troubleshooting

### Issue: "Google Cloud Storage not initialized"

**Check:**

1. `GCS_BUCKET_NAME` is set
2. `GCS_CREDENTIALS` is valid JSON
3. Service account has permissions
4. Bucket exists

**Fix:**

```bash
# Verify bucket exists
gcloud storage ls gs://khaacho-uploads

# Check service account permissions
gcloud projects get-iam-policy YOUR_PROJECT_ID \
  --flatten="bindings[].members" \
  --filter="bindings.members:serviceAccount:khaacho-storage@*"
```

### Issue: "Failed to parse GCS_CREDENTIALS"

**Check:**

- JSON is properly escaped
- No line breaks in private key
- All required fields present

**Fix:**

```bash
# Format credentials properly
cat gcs-key.json | jq -c . | pbcopy
# Paste into Render environment variable
```

### Issue: "Permission denied on bucket"

**Fix:**

```bash
# Grant storage.objectAdmin role
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
  --member="serviceAccount:khaacho-storage@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/storage.objectAdmin"
```

### Issue: "OCR extraction failed"

**Check:**

1. Vision API is enabled
2. Credentials have Vision API permissions
3. Image URL is accessible
4. Image format is supported

**Fix:**

```bash
# Enable Vision API
gcloud services enable vision.googleapis.com

# Grant Vision API permissions
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
  --member="serviceAccount:khaacho-storage@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/cloudvision.user"
```

### Issue: "LLM extraction failed"

**Check:**

1. `OPENAI_API_KEY` is set
2. API key is valid
3. Model name is correct
4. Account has credits

**Fix:**

- Verify API key at https://platform.openai.com/api-keys
- Check usage at https://platform.openai.com/usage
- Ensure model is available (gpt-4o-mini recommended)

### Issue: "Product matching low confidence"

**Possible Causes:**

- Product not in catalog
- OCR text quality poor
- Product name variations

**Solutions:**

1. Add more products to catalog
2. Improve image quality
3. Add product aliases/synonyms
4. Lower `PRODUCT_MATCH_THRESHOLD` (default: 0.7)

## Monitoring & Alerts

### Set Up Alerts

**GCS Bucket:**

```bash
# Set up budget alert
gcloud billing budgets create \
  --billing-account=YOUR_BILLING_ACCOUNT \
  --display-name="GCS Storage Alert" \
  --budget-amount=10 \
  --threshold-rule=percent=80
```

**Application Metrics:**

Monitor in Render dashboard:
- Request rate
- Error rate
- Response time
- Memory usage
- CPU usage

### Health Checks

**Endpoint:**

```bash
curl https://your-app.onrender.com/health
```

**Expected Response:**

```json
{
  "status": "healthy",
  "timestamp": "2026-02-13T10:00:00Z",
  "services": {
    "database": "connected",
    "redis": "connected",
    "gcs": "initialized"
  }
}
```

## Rollback Plan

### If Issues Occur

1. **Revert Code:**

```bash
git revert HEAD
git push origin main
```

2. **Disable Feature:**

```bash
# Remove GCS_BUCKET_NAME from environment
# Service will log warning but not crash
```

3. **Check Logs:**

```bash
# Identify error in Render logs
# Fix issue
# Redeploy
```

## Success Criteria

- [ ] Images upload successfully to GCS
- [ ] Files are private (no public access)
- [ ] Signed URLs work and expire correctly
- [ ] OCR extracts text from images
- [ ] LLM extracts structured items
- [ ] Products match against catalog
- [ ] RFQs broadcast to vendors
- [ ] Background jobs process without errors
- [ ] No increase in error rate
- [ ] Response times acceptable (<2s for upload)
- [ ] GCS costs within budget

## Documentation

- [GCS_IMAGE_UPLOAD_GUIDE.md](./GCS_IMAGE_UPLOAD_GUIDE.md)
- [IMAGE_UPLOAD_API_GUIDE.md](./IMAGE_UPLOAD_API_GUIDE.md)
- [ORDER_IMAGE_PROCESSING_GUIDE.md](./ORDER_IMAGE_PROCESSING_GUIDE.md)
- [IMAGE_PROCESSING_QUEUE_INTEGRATION.md](./IMAGE_PROCESSING_QUEUE_INTEGRATION.md)
- [GCS_INTEGRATION_COMPLETE.md](./GCS_INTEGRATION_COMPLETE.md)

## Support

**Google Cloud Support:**
- Documentation: https://cloud.google.com/storage/docs
- Support: https://cloud.google.com/support

**OpenAI Support:**
- Documentation: https://platform.openai.com/docs
- Support: https://help.openai.com

**Render Support:**
- Documentation: https://render.com/docs
- Support: https://render.com/support

---

**Status**: Ready for deployment ✅

**Last Updated**: 2026-02-13
