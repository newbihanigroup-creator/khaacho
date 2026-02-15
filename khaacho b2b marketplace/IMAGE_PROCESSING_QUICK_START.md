# Image Processing Quick Start Guide

## Overview
Complete workflow for uploading order images, extracting text via OCR, and parsing structured items using AI.

## 🚀 Quick Setup

### 1. Install Dependencies
```bash
npm install
```

Already includes:
- multer (file upload)
- @aws-sdk/client-s3 or cloudinary (image storage)
- @google-cloud/vision (OCR)
- axios (OpenAI API)

### 2. Configure Environment Variables

```bash
# Copy example and edit
cp .env.example .env
```

**Required for Image Upload:**
```bash
# Choose S3 or Cloudinary
AWS_ACCESS_KEY_ID=your-key
AWS_SECRET_ACCESS_KEY=your-secret
AWS_REGION=us-east-1
AWS_S3_BUCKET=khaacho-uploads
```

**Required for OCR:**
```bash
GOOGLE_CLOUD_PROJECT_ID=your-project-id
GOOGLE_CLOUD_CREDENTIALS='{"type":"service_account",...}'
```

**Required for Item Extraction:**
```bash
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini
```

**Required for Product Matching:**
```bash
PRODUCT_MATCH_THRESHOLD=0.7  # 70% confidence threshold
```

### 3. Run Database Migration
```bash
npm run db:migrate
```

This creates the `UploadedOrder` table.

## 📋 Complete Workflow

### Step 1: Upload Image
```bash
POST /api/orders/upload-image
Content-Type: multipart/form-data

Fields:
- image: file (required)
- retailerId: string (required)
```

**Response:**
```json
{
  "success": true,
  "uploadedOrderId": "uuid",
  "imageUrl": "https://...",
  "status": "PROCESSING"
}
```

### Step 2: Background Processing (Automatic)

The system automatically:
1. ✅ Fetches image URL from database
2. ✅ Extracts text using Google Vision OCR
3. ✅ Stores raw text in database
4. ✅ Extracts structured items using OpenAI
5. ✅ Matches items against Product database (fuzzy matching)
6. ✅ Updates status to COMPLETED, PENDING_REVIEW, or FAILED

### Step 3: Check Status
```bash
GET /api/orders/upload-image/:uploadedOrderId
```

**Response (Processing):**
```json
{
  "success": true,
  "uploadedOrder": {
    "id": "uuid",
    "status": "PROCESSING",
    "imageUrl": "https://...",
    "extractedText": null,
    "parsedData": null
  }
}
```

**Response (Completed):**
```json
{
  "success": true,
  "uploadedOrder": {
    "id": "uuid",
    "status": "COMPLETED",
    "imageUrl": "https://...",
    "extractedText": "Order Items:\n1. Rice 10kg...",
    "parsedData": {
      "items": [
        {
          "name": "Rice",
          "quantity": 10,
          "unit": "kg"
        }
      ],
      "normalizedItems": [
        {
          "originalItem": { "name": "Rice", "quantity": 10, "unit": "kg" },
          "matched": true,
          "confidence": 0.85,
          "productId": "uuid",
          "productName": "Basmati Rice",
          "needsReview": false
        }
      ]
    }
  }
}
```

**Response (Needs Review):**
```json
{
  "success": true,
  "uploadedOrder": {
    "id": "uuid",
    "status": "PENDING_REVIEW",
    "parsedData": {
      "normalizedItems": [
        {
          "originalItem": { "name": "Unknown Product", "quantity": 1 },
          "matched": false,
          "confidence": 0,
          "needsReview": true,
          "reason": "No matching product found"
        }
      ],
      "needsReviewCount": 1
    }
  }
}
```

## 🧪 Testing

### Test Item Extraction
```bash
node test-item-extraction.js
```

Tests 7 different OCR text formats:
- Simple lists
- With prices and formatting
- Messy OCR with errors
- Mixed units
- Duplicates
- Real-world examples

### Test Image Upload
```bash
node test-image-upload.js
```

Tests:
- File upload
- Status checking
- Error handling

### Test Complete Flow
```bash
node test-image-processing.js
```

Tests end-to-end:
- Upload → OCR → Extraction → Status

## 📊 API Endpoints

### Upload Image
```
POST /api/orders/upload-image
Authorization: Bearer <token>
Content-Type: multipart/form-data

Body:
- image: file (max 10MB, jpg/png)
- retailerId: string
```

### Get Upload Status
```
GET /api/orders/upload-image/:uploadedOrderId
Authorization: Bearer <token>
```

### List Uploads
```
GET /api/orders/upload-image
Authorization: Bearer <token>

Query params:
- retailerId: string (optional)
- status: PROCESSING|COMPLETED|FAILED (optional)
- page: number (default: 1)
- limit: number (default: 20)
```

## 🔧 Direct Function Usage

### Extract Items from Text
```javascript
const itemExtractionService = require('./src/services/itemExtraction.service');

const rawText = `Order Items:
1. Rice 10kg Rs.500
2. Oil 5L Rs.800
3. Sugar 2kg Rs.150`;

const items = await itemExtractionService.extractStructuredItems(rawText);

console.log(items);
// [
//   { name: "Rice", quantity: 10, unit: "kg" },
//   { name: "Oil", quantity: 5, unit: "L" },
//   { name: "Sugar", quantity: 2, unit: "kg" }
// ]
```

### Normalize Items Against Products
```javascript
const productNormalizationService = require('./src/services/productNormalization.service');

const result = await productNormalizationService.normalizeExtractedItems(uploadedOrderId);

console.log(`Matched: ${result.matchedItems}/${result.totalItems}`);
console.log(`Needs review: ${result.needsReview}`);

result.normalizedItems.forEach(item => {
  if (item.matched) {
    console.log(`✅ ${item.originalItem.name} → ${item.productName} (${Math.round(item.confidence * 100)}%)`);
  } else {
    console.log(`❌ ${item.originalItem.name} - ${item.reason}`);
  }
});
```

### Process Uploaded Order
```javascript
const orderImageProcessing = require('./src/services/orderImageProcessing.service');

const result = await orderImageProcessing.processUploadedOrder(uploadedOrderId);

console.log(result);
// {
//   success: true,
//   uploadedOrderId: "uuid",
//   rawText: "Order Items:\n...",
//   extractedData: {
//     items: [...],
//     confidence: 0.8
//   },
//   status: "COMPLETED"
// }
```

## 🎯 Features

### Image Upload
- ✅ Multipart file upload with multer
- ✅ File validation (type, size)
- ✅ S3 or Cloudinary storage
- ✅ Secure signed URLs
- ✅ Background processing queue

### OCR Extraction
- ✅ Google Vision API integration
- ✅ High accuracy text detection
- ✅ Fallback mechanism
- ✅ Raw text storage

### Item Extraction
- ✅ OpenAI GPT-4o-mini
- ✅ Structured JSON output
- ✅ Unit normalization (kg, L, pieces, etc.)
- ✅ Duplicate removal
- ✅ OCR error correction
- ✅ Confidence scoring

### Product Normalization
- ✅ Fuzzy matching (Levenshtein distance)
- ✅ Full-text search (PostgreSQL)
- ✅ Case-insensitive matching
- ✅ Confidence threshold (70% default)
- ✅ Alternative suggestions
- ✅ Review flagging for low confidence

### Error Handling
- ✅ Graceful failures
- ✅ Detailed error messages
- ✅ Status tracking
- ✅ Retry mechanisms

## 📈 Performance

- **Upload**: < 1 second
- **OCR**: 2-5 seconds (Google Vision)
- **Extraction**: 1-3 seconds (OpenAI)
- **Normalization**: 0.5-2 seconds (fuzzy matching)
- **Total**: 4-11 seconds end-to-end

## 💰 Cost Estimates

### Google Vision API
- $1.50 per 1,000 images (first 1,000 free/month)
- Text detection: 1 unit per image

### OpenAI API (gpt-4o-mini)
- Input: $0.150 per 1M tokens
- Output: $0.600 per 1M tokens
- ~500-1000 tokens per extraction
- **Cost**: ~$0.0001-0.0003 per order

### S3 Storage
- $0.023 per GB/month
- $0.0004 per 1,000 GET requests
- Negligible for typical usage

## 🔒 Security

- ✅ JWT authentication required
- ✅ File type validation
- ✅ File size limits (10MB)
- ✅ Secure S3 signed URLs
- ✅ Retailer-scoped access
- ✅ Input sanitization

## 🐛 Troubleshooting

### Upload Fails
```bash
# Check file size
max size: 10MB

# Check file type
allowed: image/jpeg, image/png

# Check S3/Cloudinary config
AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_S3_BUCKET
```

### OCR Fails
```bash
# Check Google Vision config
GOOGLE_CLOUD_PROJECT_ID
GOOGLE_CLOUD_CREDENTIALS

# Check image quality
- Minimum 640x480 resolution
- Clear, well-lit images
- Readable text
```

### Extraction Fails
```bash
# Check OpenAI config
OPENAI_API_KEY=sk-...

# Check API status
https://status.openai.com/

# Check rate limits
Free tier: 3 RPM, 200 RPD
Paid tier: Higher limits
```

### Status Stuck on PROCESSING
```bash
# Check background jobs
ENABLE_BACKGROUND_JOBS=true
REDIS_URL=redis://...

# Check logs
tail -f logs/combined-*.log

# Manually trigger processing
node -e "
const service = require('./src/services/orderImageProcessing.service');
service.processUploadedOrder('uuid').then(console.log);
"
```

## 📚 Documentation

- **API Guide**: `IMAGE_UPLOAD_API_GUIDE.md`
- **Processing Guide**: `ORDER_IMAGE_PROCESSING_GUIDE.md`
- **Item Extraction**: `ITEM_EXTRACTION_IMPLEMENTATION.md`
- **Product Normalization**: `PRODUCT_NORMALIZATION_GUIDE.md`
- **Quick Start**: `IMAGE_PROCESSING_QUICK_START.md` (this file)

## 🎓 Examples

### cURL Upload
```bash
curl -X POST http://localhost:3000/api/orders/upload-image \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "image=@order.jpg" \
  -F "retailerId=uuid"
```

### JavaScript Upload
```javascript
const formData = new FormData();
formData.append('image', fileInput.files[0]);
formData.append('retailerId', retailerId);

const response = await fetch('/api/orders/upload-image', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`
  },
  body: formData
});

const result = await response.json();
console.log(result.uploadedOrderId);
```

### Poll for Completion
```javascript
async function waitForProcessing(uploadedOrderId) {
  while (true) {
    const response = await fetch(`/api/orders/upload-image/${uploadedOrderId}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    const { uploadedOrder } = await response.json();
    
    if (uploadedOrder.status === 'COMPLETED') {
      return uploadedOrder.parsedData;
    }
    
    if (uploadedOrder.status === 'FAILED') {
      throw new Error(uploadedOrder.errorMessage);
    }
    
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
}
```

## ✅ Checklist

Before going to production:

- [ ] Configure S3 or Cloudinary
- [ ] Set up Google Vision API
- [ ] Configure OpenAI API key
- [ ] Set product match threshold
- [ ] Run database migration
- [ ] Seed products in database
- [ ] Test upload endpoint
- [ ] Test extraction with sample images
- [ ] Test product matching accuracy
- [ ] Set up monitoring/alerts
- [ ] Configure rate limits
- [ ] Set up error tracking
- [ ] Document for team

---

**Status**: ✅ Ready for use
**Last Updated**: 2026-02-13
**Version**: 1.0.0
