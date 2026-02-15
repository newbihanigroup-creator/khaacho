# AI Image Order Upload - Quick Start Guide

## 🚀 Quick Setup (5 minutes)

### 1. Install Dependencies
```bash
npm install @google-cloud/storage @google-cloud/vision multer
```

### 2. Set Environment Variables
```bash
# .env
GCS_BUCKET_NAME=khaacho-uploads
GCS_PROJECT_ID=your-project-id
GCS_CREDENTIALS='{"type":"service_account",...}'
GOOGLE_CLOUD_PROJECT_ID=your-project-id
GOOGLE_CLOUD_CREDENTIALS='{"type":"service_account",...}'
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini
```

### 3. Run Database Migration
```bash
npx prisma migrate deploy
```

### 4. Start Server
```bash
npm start
```

## 📤 Upload an Image

### cURL
```bash
curl -X POST http://localhost:3000/api/orders/upload-image \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "image=@order.jpg"
```

### JavaScript
```javascript
const formData = new FormData();
formData.append('image', fileInput.files[0]);

const response = await fetch('/api/orders/upload-image', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${token}` },
  body: formData
});

const result = await response.json();
console.log('Upload ID:', result.uploadedOrderId);
```

## 🔍 Check Status

```bash
curl http://localhost:3000/api/orders/upload-image/UPLOAD_ID \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## 🏗️ Architecture Flow

```
Upload Image → GCS → Queue Job → Worker
                                    ↓
                              1. OCR (Vision API)
                                    ↓
                              2. Extract Items (OpenAI)
                                    ↓
                              3. Normalize Products
                                    ↓
                              4. Rank Wholesalers
                                    ↓
                              5. Broadcast RFQs
                                    ↓
                              Status: COMPLETED
```

## 📊 Key Services

### 1. Upload Image
```javascript
const imageUploadService = require('./src/services/imageUpload.service');
await imageUploadService.processImageUpload(file, retailerId);
```

### 2. Run OCR
```javascript
const visionOCRService = require('./src/services/visionOCR.service');
const text = await visionOCRService.runOCRFromGCS('gs://bucket/file.jpg');
```

### 3. Extract Items
```javascript
const llmItemExtractionService = require('./src/services/llmItemExtraction.service');
const items = await llmItemExtractionService.extractItemsWithLLM(rawText);
```

### 4. Normalize Items
```javascript
const itemNormalizationService = require('./src/services/itemNormalization.service');
const result = await itemNormalizationService.normalizeItems(uploadedOrderId);
```

### 5. Rank Wholesalers
```javascript
const wholesalerRankingService = require('./src/services/wholesalerRanking.service');
const wholesalers = await wholesalerRankingService.getTopWholesalersForProduct(productId, 5);
```

### 6. Broadcast RFQs
```javascript
const rfqBroadcastService = require('./src/services/rfqBroadcast.service');
const result = await rfqBroadcastService.broadcastRFQs(uploadedOrderId);
```

### 7. Process Complete Order (Worker)
```javascript
const processUploadedOrder = require('./src/workers/uploadedOrderProcessor.worker');
const result = await processUploadedOrder({ data: { uploadedOrderId } });
```

## 🧪 Testing

```bash
# Test OCR
node test-vision-ocr.js

# Test LLM Extraction
node test-llm-extraction.js

# Test Normalization
node test-item-normalization.js

# Test Ranking
node test-wholesaler-ranking.js
```

## 🐛 Common Issues

### Issue: "VISION_NOT_INITIALIZED"
**Fix**: Set `GOOGLE_CLOUD_CREDENTIALS` environment variable

### Issue: "OPENAI_NOT_CONFIGURED"
**Fix**: Set `OPENAI_API_KEY` environment variable

### Issue: "No text detected"
**Fix**: Ensure image quality is good, try different image

### Issue: "No products matched"
**Fix**: Add products to catalog, check product names

## 💰 Cost Estimate

- **1,000 orders/month**: ~$0.55
- **10,000 orders/month**: ~$19
- **100,000 orders/month**: ~$198

## 📈 Performance

- **Upload**: 1-2 seconds
- **OCR**: 1-3 seconds
- **Extraction**: 1-3 seconds
- **Normalization**: 0.5-1 second
- **RFQ Broadcast**: 0.5-2 seconds
- **Total**: 4-11 seconds

## 🔐 Security

- ✅ Private file storage
- ✅ Signed URLs (1 hour expiration)
- ✅ JWT authentication
- ✅ File validation
- ✅ Rate limiting

## 📚 Documentation

- [Complete Implementation](./AI_IMAGE_ORDER_COMPLETE_IMPLEMENTATION.md)
- [GCS Setup](./GCS_IMAGE_UPLOAD_GUIDE.md)
- [Vision OCR](./VISION_OCR_SERVICE_GUIDE.md)
- [LLM Extraction](./LLM_ITEM_EXTRACTION_GUIDE.md)
- [Deployment](./IMAGE_PROCESSING_DEPLOYMENT_CHECKLIST.md)

## 🎯 Next Steps

1. ✅ Upload test image
2. ✅ Check processing status
3. ✅ Review extracted items
4. ✅ Verify RFQ broadcast
5. ✅ Monitor logs and costs

**Ready to process orders with AI!** 🚀
