# Order Image Processing Guide

## Overview

The `processUploadedOrder` service function handles the complete workflow of extracting order information from uploaded images using Google Vision API for OCR and LLM (OpenAI/Anthropic/Gemini) for intelligent data extraction.

## Processing Flow

```
Upload Image → Google Vision OCR → Store Raw Text → LLM Extraction → Update Status
```

## Service Function

### `processUploadedOrder(uploadedOrderId)`

Main function that orchestrates the entire image processing workflow.

**Location**: `src/services/orderImageProcessing.service.js`

**Parameters**:
- `uploadedOrderId` (string) - UUID of the uploaded order to process

**Returns**:
```javascript
{
  success: true,
  uploadedOrderId: "uuid-123",
  rawText: "extracted text from image...",
  extractedData: {
    items: [...],
    total: 1450,
    confidence: 0.85
  },
  status: "COMPLETED" // or "FAILED"
}
```

## Processing Steps

### Step 1: Fetch Image URL from Database

```javascript
const uploadedOrder = await fetchUploadedOrder(uploadedOrderId);
```

**What it does**:
- Queries `uploaded_orders` table
- Includes retailer and user information
- Returns image URL and metadata

**Database Query**:
```sql
SELECT * FROM uploaded_orders 
WHERE id = 'uuid-123'
INCLUDE retailer, user
```

### Step 2: Call Google Vision API for OCR

```javascript
const rawText = await extractTextFromImage(uploadedOrder.imageUrl);
```

**What it does**:
- Calls Google Cloud Vision API `textDetection` method
- Extracts all text from the image
- Returns full text as string

**API Call**:
```javascript
const [result] = await visionClient.textDetection(imageUrl);
const fullText = result.textAnnotations[0].description;
```

**Example Output**:
```
Order from: Sample Shop
Date: 2026-02-13

Items:
1. Rice - 10kg - Rs. 500
2. Oil - 5L - Rs. 800
3. Sugar - 2kg - Rs. 150

Total: Rs. 1450
```

### Step 3: Store Raw Extracted Text

```javascript
await storeRawText(uploadedOrderId, rawText);
```

**What it does**:
- Updates `uploaded_orders.extractedText` field
- Stores complete OCR output for reference
- Enables manual review if needed

**Database Update**:
```sql
UPDATE uploaded_orders 
SET extracted_text = 'OCR text...',
    updated_at = NOW()
WHERE id = 'uuid-123'
```

### Step 4: Call LLM Extraction Function

```javascript
const extractedData = await extractOrderDataWithLLM(rawText, uploadedOrder);
```

**What it does**:
- Sends raw text to LLM (OpenAI/Anthropic/Gemini)
- Extracts structured order data
- Returns JSON with items, total, confidence

**LLM Providers Supported**:
1. **OpenAI GPT** (gpt-4o-mini, gpt-4, gpt-3.5-turbo)
2. **Anthropic Claude** (claude-3-haiku, claude-3-sonnet, claude-3-opus)
3. **Google Gemini** (gemini-pro, gemini-1.5-pro)
4. **Rule-based fallback** (regex patterns)

**Extraction Prompt**:
```
Extract order information from the following text and return it as JSON.

Text extracted from order image:
"""
[OCR text here]
"""

Context:
- Retailer: John Doe
- Shop: Sample Shop
- Phone: +977-9800000000

Extract the following information:
1. List of items with: productName, quantity, unit, price
2. Total amount
3. Order date
4. Special notes
5. Confidence score (0-1)

Return JSON in this exact format:
{
  "items": [...],
  "total": number,
  "orderDate": "YYYY-MM-DD",
  "notes": "string",
  "confidence": number
}
```

**Example Response**:
```json
{
  "items": [
    {
      "productName": "Rice",
      "quantity": 10,
      "unit": "kg",
      "price": 500
    },
    {
      "productName": "Oil",
      "quantity": 5,
      "unit": "L",
      "price": 800
    },
    {
      "productName": "Sugar",
      "quantity": 2,
      "unit": "kg",
      "price": 150
    }
  ],
  "total": 1450,
  "orderDate": "2026-02-13",
  "notes": null,
  "confidence": 0.85,
  "extractionMethod": "openai",
  "model": "gpt-4o-mini"
}
```

### Step 5: Update Status to COMPLETED or FAILED

```javascript
await updateOrderStatus(uploadedOrderId, extractedData);
```

**What it does**:
- Sets status to `COMPLETED` if items extracted
- Sets status to `FAILED` if no items found
- Stores parsed data in `parsedData` JSON field
- Records processing timestamp

**Status Logic**:
```javascript
const status = extractedData.items?.length > 0 ? 'COMPLETED' : 'FAILED';
```

**Database Update**:
```sql
UPDATE uploaded_orders 
SET status = 'COMPLETED',
    parsed_data = '{"items": [...], "total": 1450}',
    processed_at = NOW(),
    updated_at = NOW()
WHERE id = 'uuid-123'
```

## Configuration

### Environment Variables

#### Google Vision API (Required for OCR)

```bash
# Google Cloud Project ID
GOOGLE_CLOUD_PROJECT_ID=your-project-id

# Google Cloud Credentials (JSON string)
GOOGLE_CLOUD_CREDENTIALS='{"type":"service_account","project_id":"...","private_key":"..."}'
```

#### LLM Provider (Choose one)

**Option 1: OpenAI (Recommended)**
```bash
LLM_PROVIDER=openai
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini  # or gpt-4, gpt-3.5-turbo
```

**Option 2: Anthropic Claude**
```bash
LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-3-haiku-20240307  # or claude-3-sonnet, claude-3-opus
```

**Option 3: Google Gemini**
```bash
LLM_PROVIDER=gemini
GEMINI_API_KEY=...
GEMINI_MODEL=gemini-pro  # or gemini-1.5-pro
```

**Option 4: Rule-based (No API key needed)**
```bash
LLM_PROVIDER=rules
# Uses regex patterns, no external API calls
```

## Setup Instructions

### 1. Install Dependencies

```bash
npm install @google-cloud/vision
```

### 2. Set Up Google Cloud Vision API

**Step 1: Create Google Cloud Project**
1. Go to https://console.cloud.google.com
2. Create new project or select existing
3. Enable Cloud Vision API

**Step 2: Create Service Account**
1. Go to IAM & Admin → Service Accounts
2. Create service account
3. Grant "Cloud Vision API User" role
4. Create JSON key

**Step 3: Add Credentials to .env**
```bash
GOOGLE_CLOUD_PROJECT_ID=your-project-id
GOOGLE_CLOUD_CREDENTIALS='{"type":"service_account","project_id":"your-project","private_key_id":"...","private_key":"-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n","client_email":"...@....iam.gserviceaccount.com","client_id":"...","auth_uri":"https://accounts.google.com/o/oauth2/auth","token_uri":"https://oauth2.googleapis.com/token","auth_provider_x509_cert_url":"https://www.googleapis.com/oauth2/v1/certs","client_x509_cert_url":"..."}'
```

### 3. Set Up LLM Provider

**For OpenAI:**
1. Go to https://platform.openai.com
2. Create API key
3. Add to .env:
```bash
LLM_PROVIDER=openai
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini
```

**For Anthropic:**
1. Go to https://console.anthropic.com
2. Create API key
3. Add to .env:
```bash
LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-3-haiku-20240307
```

**For Gemini:**
1. Go to https://makersuite.google.com/app/apikey
2. Create API key
3. Add to .env:
```bash
LLM_PROVIDER=gemini
GEMINI_API_KEY=...
GEMINI_MODEL=gemini-pro
```

### 4. Test the Service

```javascript
const orderImageProcessingService = require('./src/services/orderImageProcessing.service');

// Process an uploaded order
const result = await orderImageProcessingService.processUploadedOrder('uuid-123');

console.log('Status:', result.status);
console.log('Items:', result.extractedData.items);
console.log('Confidence:', result.extractedData.confidence);
```

## Usage Examples

### Example 1: Process Single Order

```javascript
const orderImageProcessingService = require('./src/services/orderImageProcessing.service');

async function processOrder(uploadedOrderId) {
  try {
    const result = await orderImageProcessingService.processUploadedOrder(uploadedOrderId);
    
    console.log('✅ Processing completed');
    console.log('Status:', result.status);
    console.log('Items found:', result.extractedData.items.length);
    console.log('Total:', result.extractedData.total);
    console.log('Confidence:', result.extractedData.confidence);
    
    return result;
  } catch (error) {
    console.error('❌ Processing failed:', error.message);
    throw error;
  }
}

processOrder('uuid-123');
```

### Example 2: Process All Pending Orders

```javascript
const prisma = require('./src/config/database');
const orderImageProcessingService = require('./src/services/orderImageProcessing.service');

async function processAllPending() {
  // Get all orders with PROCESSING status
  const pendingOrders = await prisma.uploadedOrder.findMany({
    where: { status: 'PROCESSING' },
    select: { id: true },
  });

  console.log(`Found ${pendingOrders.length} pending orders`);

  for (const order of pendingOrders) {
    try {
      await orderImageProcessingService.processUploadedOrder(order.id);
      console.log(`✅ Processed: ${order.id}`);
    } catch (error) {
      console.error(`❌ Failed: ${order.id}`, error.message);
    }
  }
}

processAllPending();
```

### Example 3: Retry Failed Orders

```javascript
async function retryFailedOrders() {
  const failedOrders = await prisma.uploadedOrder.findMany({
    where: { status: 'FAILED' },
    select: { id: true },
  });

  console.log(`Retrying ${failedOrders.length} failed orders`);

  for (const order of failedOrders) {
    // Reset status to PROCESSING
    await prisma.uploadedOrder.update({
      where: { id: order.id },
      data: { status: 'PROCESSING' },
    });

    // Reprocess
    await orderImageProcessingService.processUploadedOrder(order.id);
  }
}
```

## Error Handling

### Common Errors

**1. Google Vision API Error**
```
Error: Google Vision API not configured
```
**Solution**: Set `GOOGLE_CLOUD_PROJECT_ID` and `GOOGLE_CLOUD_CREDENTIALS`

**2. LLM API Error**
```
Error: OpenAI API key not configured
```
**Solution**: Set `OPENAI_API_KEY` or choose different `LLM_PROVIDER`

**3. No Text Detected**
```
Status: FAILED
Error: No text detected in image
```
**Solution**: Check image quality, ensure text is readable

**4. Invalid JSON Response**
```
Error: Failed to parse LLM response
```
**Solution**: LLM returned invalid JSON, will fallback to rule-based extraction

### Fallback Mechanisms

The service includes multiple fallback layers:

1. **Google Vision fails** → Use placeholder OCR
2. **LLM fails** → Use rule-based extraction
3. **Rule-based fails** → Mark as FAILED with error message

## Monitoring

### Logs

All processing steps are logged:

```javascript
logger.info('🔄 Starting order image processing', { uploadedOrderId });
logger.info('✅ Step 1: Fetched uploaded order', { imageUrl });
logger.info('✅ Step 2: Text extracted from image', { textLength });
logger.info('✅ Step 3: Raw text stored in database');
logger.info('✅ Step 4: Order data extracted with LLM', { itemsCount });
logger.info('✅ Step 5: Order status updated', { status });
```

### Metrics to Track

- OCR success rate
- LLM extraction accuracy
- Processing time per image
- Confidence score distribution
- Failed orders by error type

## Cost Optimization

### Google Vision API Pricing

- First 1,000 units/month: Free
- 1,001 - 5,000,000 units: $1.50 per 1,000 units
- 5,000,001+ units: $0.60 per 1,000 units

**Optimization tips**:
- Cache OCR results
- Batch process images
- Use image preprocessing to improve quality

### LLM API Pricing

**OpenAI GPT-4o-mini** (Recommended):
- Input: $0.15 per 1M tokens
- Output: $0.60 per 1M tokens
- ~$0.001 per order

**Anthropic Claude-3-Haiku**:
- Input: $0.25 per 1M tokens
- Output: $1.25 per 1M tokens
- ~$0.002 per order

**Google Gemini Pro**:
- Free tier: 60 requests/minute
- Paid: $0.50 per 1M tokens

**Cost per 1000 orders**:
- Google Vision: ~$1.50
- LLM (GPT-4o-mini): ~$1.00
- **Total: ~$2.50 per 1000 orders**

## Testing

### Test Script

```bash
node test-image-processing.js
```

### Manual Testing

```javascript
// Test with specific uploaded order
const result = await orderImageProcessingService.processUploadedOrder('uuid-123');

// Check result
console.log('Raw Text:', result.rawText);
console.log('Extracted Items:', result.extractedData.items);
console.log('Confidence:', result.extractedData.confidence);
console.log('Status:', result.status);
```

## Troubleshooting

### Issue: "Google Vision API not configured"

**Check**:
```bash
echo $GOOGLE_CLOUD_PROJECT_ID
echo $GOOGLE_CLOUD_CREDENTIALS
```

**Solution**: Set environment variables correctly

### Issue: "No text detected in image"

**Possible causes**:
- Image quality too low
- Text too small
- Image format not supported
- Image URL inaccessible

**Solution**: 
- Improve image quality
- Ensure image is publicly accessible
- Check image format (JPEG, PNG, WebP)

### Issue: "LLM extraction failed"

**Check logs for**:
- API key validity
- Rate limits
- Invalid response format

**Solution**:
- Verify API key
- Check rate limits
- Service will fallback to rule-based extraction

## Next Steps

1. ✅ Google Vision OCR implemented
2. ✅ LLM extraction implemented (OpenAI/Anthropic/Gemini)
3. ✅ Raw text storage
4. ✅ Status updates
5. ⏳ Implement order creation from extracted data
6. ⏳ Add manual review interface
7. ⏳ Implement product matching
8. ⏳ Add confidence threshold configuration
9. ⏳ Implement batch processing
10. ⏳ Add webhook notifications

## Related Documentation

- [Image Upload API Guide](./IMAGE_UPLOAD_API_GUIDE.md)
- [Google Vision API Docs](https://cloud.google.com/vision/docs)
- [OpenAI API Docs](https://platform.openai.com/docs)
- [Anthropic API Docs](https://docs.anthropic.com)

## Summary

✅ `processUploadedOrder(uploadedOrderId)` function created  
✅ Step 1: Fetch image URL from DB  
✅ Step 2: Google Vision API OCR  
✅ Step 3: Store raw text in `extractedText` field  
✅ Step 4: LLM extraction (OpenAI/Anthropic/Gemini)  
✅ Step 5: Update status to COMPLETED/FAILED  
✅ Multiple LLM providers supported  
✅ Fallback mechanisms included  
✅ Comprehensive error handling  
✅ Structured logging  

**Ready to process order images with AI! 🚀**
