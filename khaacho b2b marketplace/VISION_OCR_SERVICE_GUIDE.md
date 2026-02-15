# Vision OCR Service Guide

## Overview

The Vision OCR Service provides a dedicated, production-ready interface for extracting text from images using Google Cloud Vision API. It handles GCS URIs, signed URLs, error handling, confidence scoring, and batch processing.

## Features

- **GCS URI Support**: Direct processing from `gs://bucket/file` URIs
- **Signed URL Support**: Works with HTTPS signed URLs
- **Structured Errors**: Clear error codes and detailed error information
- **Low Confidence Handling**: Detects and logs low-confidence OCR results
- **Batch Processing**: Process multiple images in parallel
- **Health Monitoring**: Service health status checks
- **Automatic Fallback**: Graceful handling when Vision API unavailable

## Architecture

```
Image in GCS
    ↓
runOCRFromGCS(imageUrl)
    ↓
Google Cloud Vision API
    ↓
Text Detection
    ↓
Confidence Calculation
    ↓
Return Plain Text
```

## API Reference

### Main Function: `runOCRFromGCS(imageUrl)`

Extracts text from an image stored in Google Cloud Storage.

**Parameters:**
- `imageUrl` (string, required) - GCS URI (`gs://bucket/file`) or HTTPS URL

**Returns:**
- `Promise<string>` - Extracted plain text

**Throws:**
- Structured error with `code`, `message`, `details`, and `timestamp`

**Example:**

```javascript
const visionOCRService = require('./src/services/visionOCR.service');

try {
  const text = await visionOCRService.runOCRFromGCS(
    'gs://khaacho-uploads/orders/1707825600000_abc123_order.jpg'
  );
  
  console.log('Extracted text:', text);
  console.log('Text length:', text.length);
} catch (error) {
  console.error('OCR failed:', error.code, error.message);
  console.error('Details:', error.details);
}
```

### Batch Function: `runBatchOCR(imageUrls)`

Process multiple images in parallel.

**Parameters:**
- `imageUrls` (string[], required) - Array of GCS URIs or HTTPS URLs

**Returns:**
- `Promise<Array>` - Array of results with success/failure status

**Example:**

```javascript
const results = await visionOCRService.runBatchOCR([
  'gs://khaacho-uploads/orders/order1.jpg',
  'gs://khaacho-uploads/orders/order2.jpg',
  'gs://khaacho-uploads/orders/order3.jpg',
]);

results.forEach(result => {
  if (result.success) {
    console.log(`✓ ${result.imageUrl}: ${result.textLength} chars`);
  } else {
    console.log(`✗ ${result.imageUrl}: ${result.error.code}`);
  }
});
```

### Health Check: `getHealthStatus()`

Get service initialization status.

**Returns:**
- Object with `initialized`, `service`, and `timestamp`

**Example:**

```javascript
const health = visionOCRService.getHealthStatus();
console.log('Vision API initialized:', health.initialized);
```

### URI Validation: `isValidGCSUri(uri)`

Validate GCS URI or HTTPS URL format.

**Parameters:**
- `uri` (string) - URI to validate

**Returns:**
- `boolean` - True if valid

**Example:**

```javascript
const isValid = visionOCRService.isValidGCSUri('gs://bucket/file.jpg');
console.log('Valid URI:', isValid); // true
```

## Error Codes

### `VISION_NOT_INITIALIZED`

Vision API client not initialized.

**Cause**: Missing credentials or configuration

**Solution**: Set `GOOGLE_CLOUD_CREDENTIALS` or `GOOGLE_CLOUD_KEY_FILE`

**Example:**

```javascript
{
  code: 'VISION_NOT_INITIALIZED',
  message: 'Google Cloud Vision client not initialized',
  details: { imageUrl: 'gs://...' },
  isOCRError: true,
  timestamp: '2026-02-13T10:00:00Z'
}
```

### `INVALID_IMAGE_URL`

Image URL is missing or invalid type.

**Cause**: Null, undefined, or non-string URL

**Solution**: Provide valid string URL

**Example:**

```javascript
{
  code: 'INVALID_IMAGE_URL',
  message: 'Image URL is required and must be a string',
  details: { imageUrl: null },
  isOCRError: true
}
```

### `INVALID_GCS_URI`

URI format is invalid.

**Cause**: Not a GCS URI or HTTPS URL

**Solution**: Use `gs://bucket/file` or `https://...` format

**Example:**

```javascript
{
  code: 'INVALID_GCS_URI',
  message: 'Image URL must be a valid GCS URI (gs://bucket/file) or HTTPS URL',
  details: { imageUrl: 'http://...' },
  isOCRError: true
}
```

### `VISION_API_ERROR`

Vision API returned an error.

**Cause**: API-level error from Google Cloud

**Solution**: Check API error details

**Example:**

```javascript
{
  code: 'VISION_API_ERROR',
  message: 'Vision API returned an error',
  details: {
    imageUrl: 'gs://...',
    errorCode: 5,
    errorDetails: [...]
  },
  isOCRError: true
}
```

### `NOT_FOUND`

Image file not found in GCS.

**Cause**: File doesn't exist or wrong path

**Solution**: Verify file exists and path is correct

### `PERMISSION_DENIED`

Service account lacks permissions.

**Cause**: Missing Vision API or Storage permissions

**Solution**: Grant required roles to service account

### `RESOURCE_EXHAUSTED`

API quota exceeded.

**Cause**: Too many requests or quota limit reached

**Solution**: Wait or increase quota

### `UNAVAILABLE`

Vision API service unavailable.

**Cause**: Temporary service outage

**Solution**: Retry with exponential backoff

### `OCR_FAILED`

Generic OCR failure.

**Cause**: Unexpected error during processing

**Solution**: Check logs for details

## Configuration

### Environment Variables

```bash
# Required for Vision API
GOOGLE_CLOUD_PROJECT_ID=your-project-id

# Authentication (choose one method)
# Method 1: Credentials JSON (recommended for production)
GOOGLE_CLOUD_CREDENTIALS='{"type":"service_account","project_id":"...","private_key":"..."}'

# Method 2: Key file path (local development)
GOOGLE_CLOUD_KEY_FILE=/path/to/service-account-key.json

# Method 3: Default credentials (Google Cloud Run)
# No additional config needed
```

### Service Account Permissions

Required IAM roles:
- `roles/cloudvision.user` - Vision API access
- `roles/storage.objectViewer` - Read GCS files (if using GCS URIs)

```bash
# Grant Vision API permissions
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
  --member="serviceAccount:SERVICE_ACCOUNT@PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/cloudvision.user"

# Grant Storage read permissions
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
  --member="serviceAccount:SERVICE_ACCOUNT@PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/storage.objectViewer"
```

## Usage Examples

### Basic OCR

```javascript
const visionOCRService = require('./src/services/visionOCR.service');

async function extractText(imageUrl) {
  try {
    const text = await visionOCRService.runOCRFromGCS(imageUrl);
    
    if (text.length === 0) {
      console.log('No text detected in image');
      return null;
    }
    
    console.log('Extracted text:', text);
    return text;
  } catch (error) {
    console.error('OCR failed:', error.code, error.message);
    throw error;
  }
}

// Use with GCS URI
await extractText('gs://khaacho-uploads/orders/order.jpg');

// Use with signed URL
await extractText('https://storage.googleapis.com/khaacho-uploads/orders/order.jpg?...');
```

### Error Handling

```javascript
async function safeOCR(imageUrl) {
  try {
    return await visionOCRService.runOCRFromGCS(imageUrl);
  } catch (error) {
    switch (error.code) {
      case 'VISION_NOT_INITIALIZED':
        console.error('Vision API not configured');
        // Use fallback OCR or return error
        return null;
      
      case 'NOT_FOUND':
        console.error('Image not found:', imageUrl);
        return null;
      
      case 'PERMISSION_DENIED':
        console.error('Permission denied - check service account roles');
        throw error;
      
      case 'RESOURCE_EXHAUSTED':
        console.error('API quota exceeded - retry later');
        // Implement retry with backoff
        throw error;
      
      default:
        console.error('OCR failed:', error.message);
        throw error;
    }
  }
}
```

### Batch Processing

```javascript
async function processOrderImages(orderIds) {
  // Get image URLs from database
  const orders = await prisma.uploadedOrder.findMany({
    where: { id: { in: orderIds } },
    select: { id: true, imageKey: true },
  });

  // Build GCS URIs
  const imageUrls = orders.map(
    order => `gs://khaacho-uploads/${order.imageKey}`
  );

  // Process in batch
  const results = await visionOCRService.runBatchOCR(imageUrls);

  // Update database with results
  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    const order = orders[i];

    if (result.success) {
      await prisma.uploadedOrder.update({
        where: { id: order.id },
        data: {
          extractedText: result.text,
          status: 'TEXT_EXTRACTED',
        },
      });
    } else {
      await prisma.uploadedOrder.update({
        where: { id: order.id },
        data: {
          status: 'FAILED',
          errorMessage: `OCR failed: ${result.error.code}`,
        },
      });
    }
  }

  return results;
}
```

### With Retry Logic

```javascript
async function ocrWithRetry(imageUrl, maxRetries = 3) {
  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const text = await visionOCRService.runOCRFromGCS(imageUrl);
      return text;
    } catch (error) {
      lastError = error;

      // Don't retry for certain errors
      if (['INVALID_IMAGE_URL', 'INVALID_GCS_URI', 'NOT_FOUND'].includes(error.code)) {
        throw error;
      }

      // Retry for transient errors
      if (attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 1000; // Exponential backoff
        console.log(`Retry ${attempt}/${maxRetries} after ${delay}ms`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
}
```

## Low Confidence Handling

The service automatically detects and logs low-confidence OCR results:

```javascript
const text = await visionOCRService.runOCRFromGCS(imageUrl);

// Check logs for confidence warnings:
// "Low confidence OCR result: confidence=0.45, textLength=123"
```

**Handling Low Confidence:**

1. **Manual Review**: Flag for human review
2. **Re-process**: Try with different image preprocessing
3. **Alternative OCR**: Use different OCR service
4. **User Confirmation**: Ask user to verify extracted text

## Performance

### Latency

- **Single image**: 1-3 seconds (depends on image size and complexity)
- **Batch processing**: Parallel execution reduces total time

### Optimization Tips

1. **Use GCS URIs**: Faster than signed URLs (no additional HTTP request)
2. **Batch Processing**: Process multiple images in parallel
3. **Image Quality**: Higher quality images = faster and more accurate OCR
4. **Image Size**: Resize large images before upload (max 10MB recommended)

### Cost

**Vision API Pricing** (as of 2024):
- First 1,000 units/month: Free
- 1,001 - 5,000,000 units: $1.50 per 1,000 units
- 5,000,001+ units: $0.60 per 1,000 units

**Example Costs:**
- 1,000 orders/month: Free
- 10,000 orders/month: ~$13.50
- 100,000 orders/month: ~$148.50

## Testing

### Run Test Suite

```bash
# Set environment variables
export GOOGLE_CLOUD_PROJECT_ID=your-project-id
export GOOGLE_CLOUD_CREDENTIALS='{"type":"service_account",...}'

# Run tests
node test-vision-ocr.js
```

### Test Cases

1. ✓ URI validation
2. ✓ Health status check
3. ✓ Missing URL error
4. ✓ Empty URL error
5. ✓ Invalid URI format error
6. ✓ Valid GCS URI processing
7. ✓ Valid HTTPS URL processing
8. ✓ Batch OCR processing

### Manual Testing

```bash
# Test with actual image
node -e "
const visionOCRService = require('./src/services/visionOCR.service');
visionOCRService.runOCRFromGCS('gs://khaacho-uploads/orders/test.jpg')
  .then(text => console.log('Text:', text))
  .catch(err => console.error('Error:', err.code, err.message));
"
```

## Monitoring

### Logs

The service logs all operations:

```javascript
// Initialization
logger.info('Google Cloud Vision client initialized successfully', {
  projectId: 'your-project-id'
});

// OCR start
logger.info('Starting OCR text extraction', {
  imageUrl: 'gs://...',
  uriType: 'gcs'
});

// Low confidence warning
logger.warn('Low confidence OCR result', {
  imageUrl: 'gs://...',
  confidence: 0.45,
  textLength: 123
});

// Success
logger.info('OCR text extraction completed', {
  imageUrl: 'gs://...',
  textLength: 1234,
  confidence: 0.92,
  duration: 1523
});

// Error
logger.error('OCR extraction failed', {
  imageUrl: 'gs://...',
  errorCode: 'NOT_FOUND',
  errorMessage: 'Image not found',
  duration: 234
});
```

### Metrics to Track

- OCR success rate
- Average processing time
- Average confidence score
- Error rate by error code
- API quota usage

## Troubleshooting

### Issue: "VISION_NOT_INITIALIZED"

**Check:**
1. Environment variables are set
2. Credentials JSON is valid
3. Service account exists

**Fix:**
```bash
# Verify credentials
echo $GOOGLE_CLOUD_CREDENTIALS | jq .

# Test authentication
gcloud auth activate-service-account --key-file=gcs-key.json
```

### Issue: "PERMISSION_DENIED"

**Check:**
1. Service account has Vision API role
2. Vision API is enabled
3. Service account has Storage read permissions (for GCS URIs)

**Fix:**
```bash
# Enable Vision API
gcloud services enable vision.googleapis.com

# Grant permissions
gcloud projects add-iam-policy-binding PROJECT_ID \
  --member="serviceAccount:SERVICE_ACCOUNT@PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/cloudvision.user"
```

### Issue: "RESOURCE_EXHAUSTED"

**Check:**
1. API quota limits
2. Request rate

**Fix:**
- Wait for quota reset
- Request quota increase
- Implement rate limiting

### Issue: Low Confidence Results

**Possible Causes:**
- Poor image quality
- Handwritten text
- Complex layouts
- Non-standard fonts

**Solutions:**
1. Improve image quality before upload
2. Use image preprocessing (rotation, contrast)
3. Try different OCR service for handwritten text
4. Flag for manual review

## Integration

### With Image Upload Service

```javascript
// src/services/imageUpload.service.js
const visionOCRService = require('./visionOCR.service');

async function processImageUpload(file, retailerId) {
  // Upload to GCS
  const uploadResult = await this.uploadToGCS(file.buffer, file.originalname, file.mimetype);
  
  // Create database record
  const uploadedOrder = await this.createUploadedOrder(
    uploadResult.url,
    uploadResult.key,
    retailerId
  );
  
  // Extract text immediately (or queue for background processing)
  try {
    const gcsUri = `gs://${uploadResult.bucket}/${uploadResult.key}`;
    const text = await visionOCRService.runOCRFromGCS(gcsUri);
    
    await prisma.uploadedOrder.update({
      where: { id: uploadedOrder.id },
      data: { extractedText: text }
    });
  } catch (error) {
    logger.error('Immediate OCR failed, will retry in background', {
      uploadedOrderId: uploadedOrder.id,
      error: error.code
    });
  }
  
  return uploadedOrder;
}
```

### With Background Queue

```javascript
// src/queues/processors/imageProcessingProcessor.js
const visionOCRService = require('../../services/visionOCR.service');

async function processImageOrder(job) {
  const { uploadedOrderId } = job.data;
  
  // Get uploaded order
  const order = await prisma.uploadedOrder.findUnique({
    where: { id: uploadedOrderId }
  });
  
  // Build GCS URI from imageKey
  const gcsUri = `gs://${process.env.GCS_BUCKET_NAME}/${order.imageKey}`;
  
  // Extract text
  const text = await visionOCRService.runOCRFromGCS(gcsUri);
  
  // Continue with item extraction, normalization, etc.
  // ...
}
```

## Best Practices

1. **Use GCS URIs**: Faster and more reliable than signed URLs
2. **Validate Input**: Always validate image URLs before processing
3. **Handle Errors**: Implement proper error handling for all error codes
4. **Log Everything**: Log all operations for debugging and monitoring
5. **Batch When Possible**: Use batch processing for multiple images
6. **Monitor Confidence**: Track and handle low-confidence results
7. **Implement Retries**: Retry transient errors with exponential backoff
8. **Track Costs**: Monitor API usage and costs
9. **Cache Results**: Cache extracted text to avoid re-processing
10. **Test Thoroughly**: Test with various image types and qualities

## Related Documentation

- [GCS Image Upload Guide](./GCS_IMAGE_UPLOAD_GUIDE.md)
- [Order Image Processing Guide](./ORDER_IMAGE_PROCESSING_GUIDE.md)
- [Image Processing Queue Integration](./IMAGE_PROCESSING_QUEUE_INTEGRATION.md)
- [Google Cloud Vision API Documentation](https://cloud.google.com/vision/docs)

## Summary

✅ Dedicated OCR service with clean API  
✅ GCS URI and HTTPS URL support  
✅ Structured error handling with clear codes  
✅ Low confidence detection and logging  
✅ Batch processing capability  
✅ Health monitoring  
✅ Comprehensive logging  
✅ Production-ready with retry logic  
✅ Full test coverage  

**Ready to use in production!** 🚀
