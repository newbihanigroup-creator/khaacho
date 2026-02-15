# Google Cloud Storage Image Upload Guide

## Overview

The Image Upload Service now uses **Google Cloud Storage (GCS)** for storing order images with private access and signed URLs. This provides better security and integration with Google Vision API for OCR processing.

## Features

- **Private File Storage**: All uploaded images are stored as private (no public access)
- **Signed URLs**: Temporary access URLs with configurable expiration (default: 1 hour)
- **Automatic URL Refresh**: Signed URLs are refreshed when retrieving completed orders
- **File Validation**: CRC32C checksums ensure file integrity
- **Multiple Auth Methods**: Supports credentials JSON, key file path, or default credentials
- **Organized Storage**: Files stored in `orders/` folder with timestamp and random string

## Architecture

```
Client Upload
    ↓
Express API (multer)
    ↓
ImageUploadService.processImageUpload()
    ↓
Upload to GCS (private)
    ↓
Generate Signed URL (1 hour)
    ↓
Create UploadedOrder record
    ↓
Queue Background Processing
    ↓
Return uploadedOrderId
```

## Setup

### 1. Create GCS Bucket

```bash
# Using gcloud CLI
gcloud storage buckets create gs://khaacho-uploads \
  --location=us-central1 \
  --uniform-bucket-level-access

# Set lifecycle policy (optional - auto-delete old files)
gcloud storage buckets update gs://khaacho-uploads \
  --lifecycle-file=lifecycle.json
```

Example `lifecycle.json`:
```json
{
  "lifecycle": {
    "rule": [
      {
        "action": {"type": "Delete"},
        "condition": {"age": 90}
      }
    ]
  }
}
```

### 2. Create Service Account

```bash
# Create service account
gcloud iam service-accounts create khaacho-storage \
  --display-name="Khaacho Storage Service Account"

# Grant storage permissions
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
  --member="serviceAccount:khaacho-storage@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/storage.objectAdmin"

# Create and download key
gcloud iam service-accounts keys create gcs-key.json \
  --iam-account=khaacho-storage@YOUR_PROJECT_ID.iam.gserviceaccount.com
```

### 3. Configure Environment Variables

#### Option A: Credentials JSON (Recommended for Render)

```bash
# .env or Render environment variables
GCS_BUCKET_NAME=khaacho-uploads
GCS_PROJECT_ID=your-project-id
GCS_CREDENTIALS='{"type":"service_account","project_id":"your-project-id","private_key":"-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n","client_email":"khaacho-storage@your-project-id.iam.gserviceaccount.com"}'
```

#### Option B: Key File Path (Local Development)

```bash
# .env
GCS_BUCKET_NAME=khaacho-uploads
GCS_PROJECT_ID=your-project-id
GCS_KEY_FILE=/path/to/gcs-key.json
```

#### Option C: Default Credentials (Google Cloud Run)

```bash
# Only bucket name needed - uses default credentials
GCS_BUCKET_NAME=khaacho-uploads
```

### 4. Install Dependencies

```bash
npm install @google-cloud/storage
```

## API Endpoints

### Upload Image

```http
POST /api/orders/upload-image
Content-Type: multipart/form-data

Parameters:
- image: File (required) - JPEG, PNG, or WebP
- retailerId: Integer (optional)

Response:
{
  "success": true,
  "uploadedOrderId": 123,
  "imageUrl": "https://storage.googleapis.com/...",
  "imageKey": "orders/1234567890_abc123_order.jpg",
  "status": "PROCESSING"
}
```

### Get Upload Status

```http
GET /api/orders/upload-image/:uploadedOrderId

Response:
{
  "id": 123,
  "imageUrl": "https://storage.googleapis.com/...",
  "imageKey": "orders/1234567890_abc123_order.jpg",
  "status": "COMPLETED",
  "extractedText": "...",
  "orderId": 456,
  "createdAt": "2026-02-13T10:00:00Z",
  "processedAt": "2026-02-13T10:01:30Z"
}
```

### List Uploads

```http
GET /api/orders/upload-image?page=1&limit=20&status=COMPLETED

Response:
{
  "data": [...],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 100,
    "totalPages": 5
  }
}
```

## File Storage Structure

```
gs://khaacho-uploads/
└── orders/
    ├── 1707825600000_abc123def456_order1.jpg
    ├── 1707825601000_xyz789ghi012_order2.png
    └── 1707825602000_mno345pqr678_order3.jpg
```

**Filename Format**: `{timestamp}_{random}_{sanitized_original_name}`

## Security Features

### Private Files

All files are uploaded with `public: false`, meaning:
- No public URLs
- Access requires signed URLs
- Bucket-level permissions control access

### Signed URLs

Temporary access URLs with configurable expiration:

```javascript
// Generate signed URL (1 hour expiration)
const signedUrl = await imageUploadService.getSignedUrl(
  'orders/1234567890_abc123_order.jpg',
  60 // minutes
);
```

### Automatic URL Refresh

When retrieving completed orders, signed URLs are automatically refreshed:

```javascript
const uploadedOrder = await imageUploadService.getUploadedOrder(123);
// uploadedOrder.imageUrl contains fresh signed URL
```

### File Validation

- **Type Validation**: Only JPEG, PNG, WebP allowed
- **Size Validation**: Max 10MB
- **Integrity Check**: CRC32C checksum validation on upload

## Error Handling

### Common Errors

1. **GCS Not Initialized**
```
Error: Google Cloud Storage not initialized
Solution: Check GCS_BUCKET_NAME and credentials are set
```

2. **Invalid Credentials**
```
Error: Failed to parse GCS_CREDENTIALS
Solution: Ensure JSON is properly escaped in environment variable
```

3. **Permission Denied**
```
Error: Permission denied on bucket
Solution: Verify service account has storage.objectAdmin role
```

4. **Bucket Not Found**
```
Error: Bucket not found
Solution: Create bucket or check GCS_BUCKET_NAME spelling
```

### Graceful Degradation

If GCS initialization fails:
- Service logs warning but doesn't crash
- Upload attempts will throw clear error messages
- Background processing continues for other features

## Testing

### Test Upload

```bash
curl -X POST http://localhost:3000/api/orders/upload-image \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -F "image=@test-order.jpg" \
  -F "retailerId=1"
```

### Test Script

```javascript
// test-gcs-upload.js
const fs = require('fs');
const FormData = require('form-data');
const axios = require('axios');

async function testUpload() {
  const form = new FormData();
  form.append('image', fs.createReadStream('test-order.jpg'));
  form.append('retailerId', '1');

  const response = await axios.post(
    'http://localhost:3000/api/orders/upload-image',
    form,
    {
      headers: {
        ...form.getHeaders(),
        'Authorization': 'Bearer YOUR_JWT_TOKEN'
      }
    }
  );

  console.log('Upload successful:', response.data);
  
  // Wait for processing
  await new Promise(resolve => setTimeout(resolve, 5000));
  
  // Check status
  const status = await axios.get(
    `http://localhost:3000/api/orders/upload-image/${response.data.uploadedOrderId}`,
    {
      headers: { 'Authorization': 'Bearer YOUR_JWT_TOKEN' }
    }
  );
  
  console.log('Processing status:', status.data);
}

testUpload().catch(console.error);
```

## Monitoring

### Check GCS Initialization

```javascript
// Logs on startup
logger.info('Google Cloud Storage initialized successfully', {
  bucket: 'khaacho-uploads',
  projectId: 'your-project-id'
});
```

### Upload Metrics

```javascript
// Each upload logs:
logger.info('Uploading file to GCS', {
  filename: 'orders/1234567890_abc123_order.jpg',
  mimetype: 'image/jpeg',
  size: 1234567,
  bucket: 'khaacho-uploads'
});

logger.info('File uploaded to GCS successfully', {
  filename: 'orders/1234567890_abc123_order.jpg',
  bucket: 'khaacho-uploads'
});
```

## Cost Optimization

### Storage Costs

- **Standard Storage**: ~$0.020 per GB/month
- **Operations**: ~$0.05 per 10,000 operations
- **Network Egress**: Free within same region

### Recommendations

1. **Use Lifecycle Policies**: Auto-delete old files after 90 days
2. **Same Region**: Deploy app and bucket in same region
3. **Signed URL Caching**: Cache signed URLs for their full duration
4. **Batch Operations**: Process multiple files in single job

### Example Costs (1000 orders/month)

- Storage (1000 images × 2MB × $0.020/GB): ~$0.04/month
- Upload operations (1000 × $0.05/10,000): ~$0.005/month
- Signed URL generation (1000 × $0.004/10,000): ~$0.0004/month

**Total**: ~$0.05/month for 1000 orders

## Migration from S3/Cloudinary

### Update Environment Variables

```bash
# Remove old variables
# AWS_ACCESS_KEY_ID
# AWS_SECRET_ACCESS_KEY
# AWS_S3_BUCKET
# CLOUDINARY_CLOUD_NAME
# CLOUDINARY_API_KEY
# CLOUDINARY_API_SECRET

# Add GCS variables
GCS_BUCKET_NAME=khaacho-uploads
GCS_PROJECT_ID=your-project-id
GCS_CREDENTIALS='{"type":"service_account",...}'
```

### Migrate Existing Files (Optional)

```bash
# Using gsutil
gsutil -m cp -r s3://old-bucket/* gs://khaacho-uploads/orders/

# Update database URLs
UPDATE uploaded_orders 
SET image_url = REPLACE(image_url, 's3.amazonaws.com/old-bucket', 'storage.googleapis.com/khaacho-uploads')
WHERE image_url LIKE '%s3.amazonaws.com%';
```

## Troubleshooting

### Issue: Signed URLs Expire Too Quickly

**Solution**: Increase expiration time when generating URLs

```javascript
const signedUrl = await imageUploadService.getSignedUrl(
  imageKey,
  240 // 4 hours instead of 1 hour
);
```

### Issue: Large Files Upload Slowly

**Solution**: Enable resumable uploads for files > 5MB

```javascript
await file.save(fileBuffer, {
  resumable: true,
  metadata: { contentType: mimetype }
});
```

### Issue: CORS Errors in Browser

**Solution**: Configure CORS on bucket

```bash
echo '[{"origin": ["*"], "method": ["GET"], "maxAgeSeconds": 3600}]' > cors.json
gcloud storage buckets update gs://khaacho-uploads --cors-file=cors.json
```

## Best Practices

1. **Use Private Files**: Never make order images public
2. **Short-Lived URLs**: Keep signed URL expiration under 24 hours
3. **Refresh URLs**: Always refresh signed URLs when serving to clients
4. **Validate Files**: Check file type and size before upload
5. **Monitor Costs**: Set up billing alerts in Google Cloud Console
6. **Backup Strategy**: Enable versioning or regular backups
7. **Access Logging**: Enable access logs for security auditing

## Related Documentation

- [Image Upload API Guide](./IMAGE_UPLOAD_API_GUIDE.md)
- [Order Image Processing Guide](./ORDER_IMAGE_PROCESSING_GUIDE.md)
- [Image Processing Queue Integration](./IMAGE_PROCESSING_QUEUE_INTEGRATION.md)
- [Google Cloud Storage Documentation](https://cloud.google.com/storage/docs)
