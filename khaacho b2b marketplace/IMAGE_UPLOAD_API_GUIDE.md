# Image Upload API Guide

## Overview

The Image Upload API allows retailers to upload order images (photos of order forms, receipts, handwritten notes) which are then processed using OCR to extract order information automatically.

## Architecture

```
Client → Upload Image → Google Cloud Storage (Private) → Create UploadedOrder → Background Job → OCR → Parse → Create Order
```

**Storage**: Google Cloud Storage with private files and signed URLs  
**OCR**: Google Vision API  
**Processing**: BullMQ background jobs

## Database Schema

### UploadedOrder Table

```sql
CREATE TABLE "uploaded_orders" (
  "id" TEXT PRIMARY KEY,
  "retailer_id" TEXT,
  "image_url" TEXT NOT NULL,
  "image_key" TEXT NOT NULL,
  "status" UploadedOrderStatus DEFAULT 'PROCESSING',
  "extracted_text" TEXT,
  "parsed_data" JSONB,
  "order_id" TEXT,
  "error_message" TEXT,
  "processed_at" TIMESTAMP,
  "created_at" TIMESTAMP DEFAULT NOW(),
  "updated_at" TIMESTAMP
);
```

### Status Enum

- `PROCESSING` - Image uploaded, OCR in progress
- `COMPLETED` - Order created successfully
- `FAILED` - Processing failed
- `PENDING_REVIEW` - Requires manual review

## API Endpoints

### 1. Upload Order Image

**Endpoint**: `POST /api/orders/upload-image`

**Authentication**: Required (Retailer, Admin, Operator)

**Content-Type**: `multipart/form-data`

**Request**:
```http
POST /api/orders/upload-image HTTP/1.1
Host: your-api.com
Authorization: Bearer <token>
Content-Type: multipart/form-data; boundary=----WebKitFormBoundary

------WebKitFormBoundary
Content-Disposition: form-data; name="image"; filename="order.jpg"
Content-Type: image/jpeg

<binary image data>
------WebKitFormBoundary--
```

**Optional Body Parameters**:
- `retailerId` (string) - For admin/operator to upload on behalf of retailer

**Response** (201 Created):
```json
{
  "success": true,
  "message": "Image uploaded successfully. Processing in background.",
  "data": {
    "uploadedOrderId": "uuid-123",
    "imageUrl": "https://storage.googleapis.com/khaacho-uploads/orders/...",
    "imageKey": "orders/1707825600000_abc123_order.jpg",
    "status": "PROCESSING"
  }
}
```

**Error Responses**:

400 Bad Request - No file provided:
```json
{
  "success": false,
  "message": "No image file provided"
}
```

400 Bad Request - Invalid file type:
```json
{
  "success": false,
  "message": "Invalid file type: application/pdf. Allowed: image/jpeg, image/jpg, image/png, image/webp"
}
```

413 Payload Too Large - File too large:
```json
{
  "success": false,
  "message": "File too large: 15728640 bytes. Max: 10485760 bytes"
}
```

503 Service Unavailable - Upload service not configured:
```json
{
  "success": false,
  "message": "Google Cloud Storage not initialized"
}
```

### 2. Get Uploaded Order Status

**Endpoint**: `GET /api/orders/upload-image/:id`

**Authentication**: Required

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "id": "uuid-123",
    "retailerId": "uuid-456",
    "imageUrl": "https://cloudinary.com/...",
    "imageKey": "khaacho/orders/order_1234567890_image.jpg",
    "status": "COMPLETED",
    "extractedText": "Order from: Sample Shop\nDate: 2026-02-13\n...",
    "parsedData": {
      "items": [
        {
          "productName": "Rice",
          "quantity": 10,
          "unit": "kg",
          "price": 500
        }
      ],
      "total": 1450,
      "confidence": 0.85
    },
    "orderId": "uuid-789",
    "order": {
      "id": "uuid-789",
      "orderNumber": "IMG1707825600000",
      "status": "PENDING",
      "total": "1450.00"
    },
    "retailer": {
      "id": "uuid-456",
      "shopName": "Sample Shop",
      "user": {
        "id": "uuid-111",
        "name": "John Doe",
        "phoneNumber": "+977-9800000000"
      }
    },
    "processedAt": "2026-02-13T10:30:00Z",
    "createdAt": "2026-02-13T10:25:00Z",
    "updatedAt": "2026-02-13T10:30:00Z"
  }
}
```

### 3. List Uploaded Orders

**Endpoint**: `GET /api/orders/upload-image`

**Authentication**: Required

**Query Parameters**:
- `page` (number, default: 1) - Page number
- `limit` (number, default: 20) - Items per page
- `status` (string) - Filter by status (PROCESSING, COMPLETED, FAILED, PENDING_REVIEW)
- `retailerId` (string) - Filter by retailer (admin/operator only)

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "uploadedOrders": [
      {
        "id": "uuid-123",
        "retailerId": "uuid-456",
        "imageUrl": "https://cloudinary.com/...",
        "status": "COMPLETED",
        "orderId": "uuid-789",
        "order": {
          "id": "uuid-789",
          "orderNumber": "IMG1707825600000",
          "status": "PENDING",
          "total": "1450.00"
        },
        "retailer": {
          "id": "uuid-456",
          "shopName": "Sample Shop",
          "retailerCode": "RET001"
        },
        "createdAt": "2026-02-13T10:25:00Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 45,
      "totalPages": 3
    }
  }
}
```

## Configuration

### Environment Variables

#### Google Cloud Storage (Required)

```bash
# GCS Bucket Configuration
GCS_BUCKET_NAME=khaacho-uploads
GCS_PROJECT_ID=your-project-id

# Authentication (choose one method)
# Method 1: Credentials JSON (recommended for Render)
GCS_CREDENTIALS='{"type":"service_account","project_id":"...","private_key":"...","client_email":"..."}'

# Method 2: Key file path (local development)
GCS_KEY_FILE=/path/to/service-account-key.json

# Method 3: Default credentials (Google Cloud Run)
# No additional config needed - uses default credentials
```

#### Google Vision API (for OCR)

```bash
GOOGLE_CLOUD_PROJECT_ID=your-project-id
GOOGLE_CLOUD_CREDENTIALS='{"type":"service_account","project_id":"...","private_key":"..."}'
```

#### LLM Configuration (for item extraction)

```bash
LLM_PROVIDER=openai
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini
```

## Setup Instructions

### 1. Install Dependencies

```bash
npm install multer @google-cloud/storage @google-cloud/vision
```

### 2. Run Database Migration

```bash
npx prisma migrate deploy
# Or manually:
psql $DATABASE_URL -f prisma/migrations/026_uploaded_orders.sql
```

### 3. Generate Prisma Client

```bash
npx prisma generate
```

### 4. Configure Google Cloud Storage

**Step 1: Create GCS Bucket**

```bash
# Using gcloud CLI
gcloud storage buckets create gs://khaacho-uploads \
  --location=us-central1 \
  --uniform-bucket-level-access
```

**Step 2: Create Service Account**

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

**Step 3: Add to Environment Variables**

```bash
# .env
GCS_BUCKET_NAME=khaacho-uploads
GCS_PROJECT_ID=your-project-id
GCS_CREDENTIALS='{"type":"service_account","project_id":"...","private_key":"..."}'
```

See [GCS_IMAGE_UPLOAD_GUIDE.md](./GCS_IMAGE_UPLOAD_GUIDE.md) for detailed setup instructions.

### 5. Start Server

```bash
npm start
```

## Usage Examples

### cURL Example

```bash
curl -X POST http://localhost:3000/api/orders/upload-image \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "image=@/path/to/order.jpg"
```

### JavaScript/Fetch Example

```javascript
const formData = new FormData();
formData.append('image', fileInput.files[0]);

const response = await fetch('/api/orders/upload-image', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`
  },
  body: formData
});

const result = await response.json();
console.log('Uploaded Order ID:', result.data.uploadedOrderId);
```

### React Example

```jsx
function OrderImageUpload() {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState(null);

  const handleUpload = async () => {
    if (!file) return;

    setUploading(true);
    const formData = new FormData();
    formData.append('image', file);

    try {
      const response = await fetch('/api/orders/upload-image', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: formData
      });

      const data = await response.json();
      setResult(data);
    } catch (error) {
      console.error('Upload failed:', error);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      <input 
        type="file" 
        accept="image/*" 
        onChange={(e) => setFile(e.target.files[0])} 
      />
      <button onClick={handleUpload} disabled={uploading}>
        {uploading ? 'Uploading...' : 'Upload Order Image'}
      </button>
      {result && (
        <div>
          <p>Upload ID: {result.data.uploadedOrderId}</p>
          <p>Status: {result.data.status}</p>
        </div>
      )}
    </div>
  );
}
```

## Background Processing

### Image Processing Flow

1. **Upload** - Image uploaded to Cloudinary/S3
2. **Record Created** - UploadedOrder record created with status PROCESSING
3. **Job Queued** - Background job added to queue
4. **OCR** - Text extracted from image (placeholder - needs implementation)
5. **Parsing** - Order data parsed from text (placeholder - needs implementation)
6. **Order Creation** - Order created if parsing successful
7. **Status Update** - UploadedOrder status updated to COMPLETED/FAILED

### Implementing OCR

The implementation uses **Google Cloud Vision API** for OCR text extraction.

**Already Implemented** - See `src/services/orderImageProcessing.service.js`:

```javascript
const vision = require('@google-cloud/vision');
const client = new vision.ImageAnnotatorClient();

async function extractTextFromImage(imageUrl) {
  const [result] = await client.textDetection(imageUrl);
  return result.fullTextAnnotation?.text || '';
}
```

**Alternative Options**:

**Option 2: AWS Textract**

```bash
npm install @aws-sdk/client-textract
```

```javascript
const { TextractClient, DetectDocumentTextCommand } = require('@aws-sdk/client-textract');
const client = new TextractClient({ region: 'us-east-1' });

async function extractTextFromImage(imageUrl) {
  // Download image and convert to bytes
  const response = await fetch(imageUrl);
  const buffer = await response.arrayBuffer();
  
  const command = new DetectDocumentTextCommand({
    Document: { Bytes: Buffer.from(buffer) }
  });
  
  const result = await client.send(command);
  return result.Blocks
    .filter(b => b.BlockType === 'LINE')
    .map(b => b.Text)
    .join('\n');
}
```

**Option 3: Tesseract.js (Open Source)**

```bash
npm install tesseract.js
```

```javascript
const Tesseract = require('tesseract.js');

async function extractTextFromImage(imageUrl) {
  const { data: { text } } = await Tesseract.recognize(imageUrl, 'eng');
  return text;
}
```

## File Validation

### Allowed File Types

- `image/jpeg`
- `image/jpg`
- `image/png`
- `image/webp`

### File Size Limit

- Maximum: 10MB
- Configurable in `src/routes/imageUpload.routes.js`

### Validation Errors

The API validates:
1. File presence
2. File type (MIME type)
3. File size
4. Image dimensions (via Cloudinary transformation)

## Security Considerations

### Authentication

All endpoints require authentication. Retailers can only:
- Upload their own orders
- View their own uploaded orders

Admins/Operators can:
- Upload on behalf of any retailer
- View all uploaded orders

### File Upload Security

1. **MIME Type Validation** - Only images allowed
2. **File Size Limit** - Prevents DoS attacks (max 10MB)
3. **Memory Storage** - Files not saved to disk
4. **Private Cloud Storage** - Images stored privately in GCS
5. **Signed URLs** - Temporary access URLs with 1-hour expiration
6. **CRC32C Validation** - File integrity checks on upload

### Best Practices

1. Use HTTPS in production
2. Implement rate limiting on upload endpoint
3. Use private GCS buckets with signed URLs (already implemented)
4. Implement image compression to reduce storage costs
5. Set lifecycle policies to auto-delete old files
6. Monitor GCS costs and usage

## Monitoring

### Logs

All operations are logged:

```javascript
logger.info('Image upload request received', {
  filename: 'order.jpg',
  size: 1024000,
  retailerId: 'uuid-123'
});

logger.info('Image uploaded successfully', {
  uploadedOrderId: 'uuid-456',
  imageUrl: 'https://...'
});

logger.error('Image processing failed', {
  uploadedOrderId: 'uuid-456',
  error: 'OCR service unavailable'
});
```

### Metrics to Track

- Upload success rate
- Processing time
- OCR accuracy
- Order creation rate
- Failed uploads by error type

## Troubleshooting

### Issue: "Google Cloud Storage not initialized"

**Solution**: Set GCS environment variables (GCS_BUCKET_NAME, GCS_CREDENTIALS or GCS_KEY_FILE)

### Issue: "Invalid file type"

**Solution**: Ensure file is JPEG, PNG, or WebP

### Issue: "File too large"

**Solution**: Compress image before upload (max 10MB)

### Issue: "Failed to parse GCS_CREDENTIALS"

**Solution**: Ensure JSON is properly escaped in environment variable

### Issue: "Permission denied on bucket"

**Solution**: Verify service account has storage.objectAdmin role

### Issue: "Signed URLs expire too quickly"

**Solution**: URLs are refreshed automatically when retrieving completed orders. For longer expiration, modify `getSignedUrl()` call in service.

See [GCS_IMAGE_UPLOAD_GUIDE.md](./GCS_IMAGE_UPLOAD_GUIDE.md) for detailed troubleshooting.

## Next Steps

1. ✅ Database migration applied
2. ✅ API endpoints created
3. ✅ Image upload service implemented with GCS
4. ✅ Google Vision OCR implemented
5. ✅ OpenAI item extraction implemented
6. ✅ Product normalization with fuzzy matching
7. ✅ Vendor ranking by reliability score
8. ✅ Background job processing with BullMQ
9. ⏳ Add manual review interface for PENDING_REVIEW orders
10. ⏳ Add webhook notifications for processing completion

## Related Documentation

- [GCS Image Upload Guide](./GCS_IMAGE_UPLOAD_GUIDE.md) - Detailed GCS setup and configuration
- [Order Image Processing Guide](./ORDER_IMAGE_PROCESSING_GUIDE.md) - OCR and LLM processing
- [Item Extraction Implementation](./ITEM_EXTRACTION_IMPLEMENTATION.md) - OpenAI item extraction
- [Product Normalization Guide](./PRODUCT_NORMALIZATION_GUIDE.md) - Fuzzy matching and product matching
- [Image Processing Queue Integration](./IMAGE_PROCESSING_QUEUE_INTEGRATION.md) - BullMQ integration
- [Prisma Schema](./prisma/schema.prisma)
- [Queue System](./REDIS_QUEUE_PRODUCTION_GUIDE.md)
- [API Documentation](./API_DOCUMENTATION.md)

## Summary

✅ POST /api/orders/upload-image endpoint created  
✅ Multipart image upload with multer  
✅ Google Cloud Storage with private files and signed URLs  
✅ UploadedOrder table with Prisma ORM  
✅ Background job processing with BullMQ  
✅ Google Vision OCR text extraction  
✅ OpenAI LLM item extraction  
✅ Product normalization with fuzzy matching  
✅ Vendor ranking by reliability score  
✅ RFQ broadcasting to top 5 vendors per product  
✅ Returns uploadedOrderId  
✅ Status tracking (PROCESSING, COMPLETED, FAILED, PENDING_REVIEW)  
✅ Authentication and authorization  
✅ File validation (type, size, integrity)  
✅ Comprehensive error handling  
✅ Automatic signed URL refresh  

**Production-ready! Configure GCS credentials and deploy.** 🚀
