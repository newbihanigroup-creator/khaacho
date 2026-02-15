# LLM Item Extraction Service Guide

## Overview

The LLM Item Extraction Service provides a dedicated function `extractItemsWithLLM(rawText)` that uses OpenAI API to extract structured grocery items from raw OCR text with strict JSON output format.

## Features

- **Strict JSON Output**: Returns only JSON array, no explanations
- **Structured Items**: Each item has name, quantity, unit, confidence
- **Unit Normalization**: Converts units to standard format (kg, g, l, ml, etc.)
- **Duplicate Removal**: Automatically removes duplicate items
- **Noise Filtering**: Ignores headers, footers, dates, totals, contact info
- **Confidence Scoring**: Each item includes confidence score (0-1)
- **Error Handling**: Structured errors with clear codes
- **Production Ready**: Timeout handling, retry-friendly, comprehensive logging

## API Reference

### Main Function: `extractItemsWithLLM(rawText)`

Extracts structured grocery items from raw text using OpenAI API.

**Parameters:**
- `rawText` (string, required) - Raw text extracted from image via OCR

**Returns:**
- `Promise<Array>` - Array of items with structure:
  ```javascript
  [
    {
      name: string,      // Product name (cleaned)
      quantity: number,  // Quantity (always > 0)
      unit: string|null, // Normalized unit or null
      confidence: number // Confidence score (0-1)
    }
  ]
  ```

**Throws:**
- Structured error with `code`, `message`, `details`, `timestamp`

**Example:**

```javascript
const llmItemExtractionService = require('./src/services/llmItemExtraction.service');

const rawText = `
Order from ABC Store
10kg rice
5L cooking oil
2 dozen eggs
`;

const items = await llmItemExtractionService.extractItemsWithLLM(rawText);

console.log(items);
// [
//   { name: 'Rice', quantity: 10, unit: 'kg', confidence: 0.95 },
//   { name: 'Cooking Oil', quantity: 5, unit: 'l', confidence: 0.92 },
//   { name: 'Eggs', quantity: 2, unit: 'dozen', confidence: 0.90 }
// ]
```

## System Prompt

The service uses a strict system prompt:

```
You are a grocery order extraction engine. Return STRICT JSON array.

Each object must contain:
- name (string)
- quantity (number)
- unit (string or null)
- confidence (0-1 float)

Rules:
- Normalize units (kg, g, l, ml, pieces, dozen, etc.)
- If unit missing → null
- Remove duplicates
- Ignore noise (headers, footers, dates, totals, phone numbers, addresses)
- Do not explain anything
- Return only JSON
```

## Unit Normalization

The service automatically normalizes units to standard formats:

| Input | Output |
|-------|--------|
| kilogram, kilograms, kilo, kilos | kg |
| gram, grams | g |
| liter, liters, litre, litres | l |
| milliliter, milliliters, millilitre, millilitres | ml |
| piece, pieces, pcs, pc | pieces |
| dozen, doz | dozen |
| bottle, bottles | bottle |
| packet, packets, pack, packs | packet |
| box, boxes | box |
| bag, bags | bag |

**Example:**

```javascript
// Input text: "10 kilograms rice, 5 litres oil"
// Output:
[
  { name: 'Rice', quantity: 10, unit: 'kg', confidence: 0.95 },
  { name: 'Oil', quantity: 5, unit: 'l', confidence: 0.92 }
]
```

## Duplicate Removal

Duplicates are identified by `name + unit` combination and automatically removed. When duplicates are found, the item with higher confidence is kept.

**Example:**

```javascript
// Input text:
// "Rice 10kg
//  Oil 5L
//  Rice 10kg"

// Output (duplicate removed):
[
  { name: 'Rice', quantity: 10, unit: 'kg', confidence: 0.95 },
  { name: 'Oil', quantity: 5, unit: 'l', confidence: 0.92 }
]
```

## Noise Filtering

The LLM automatically ignores:
- Headers and footers
- Dates and timestamps
- Phone numbers and addresses
- Invoice numbers
- Totals and subtotals
- Payment terms
- Delivery instructions
- Greetings and closings

**Example:**

```javascript
// Input text:
// "ABC Store
//  Phone: +977-9800000000
//  Date: 2026-02-13
//  
//  10kg rice
//  5L oil
//  
//  Total: Rs. 1500
//  Thank you!"

// Output (noise filtered):
[
  { name: 'Rice', quantity: 10, unit: 'kg', confidence: 0.95 },
  { name: 'Oil', quantity: 5, unit: 'l', confidence: 0.92 }
]
```

## Error Codes

### `OPENAI_NOT_CONFIGURED`

OpenAI API key not set.

**Solution**: Set `OPENAI_API_KEY` environment variable

```javascript
{
  code: 'OPENAI_NOT_CONFIGURED',
  message: 'OpenAI API key not configured',
  details: { hint: 'Set OPENAI_API_KEY environment variable' },
  isLLMError: true,
  timestamp: '2026-02-13T10:00:00Z'
}
```

### `INVALID_INPUT`

Raw text is missing or invalid type.

**Solution**: Provide valid string

```javascript
{
  code: 'INVALID_INPUT',
  message: 'Raw text is required and must be a string',
  details: { rawText: null },
  isLLMError: true
}
```

### `INVALID_API_KEY`

OpenAI API key is invalid.

**Solution**: Check API key at https://platform.openai.com/api-keys

```javascript
{
  code: 'INVALID_API_KEY',
  message: 'Invalid OpenAI API key',
  details: { status: 401, error: {...} },
  isLLMError: true
}
```

### `RATE_LIMIT_EXCEEDED`

OpenAI API rate limit exceeded.

**Solution**: Wait and retry, or upgrade plan

```javascript
{
  code: 'RATE_LIMIT_EXCEEDED',
  message: 'OpenAI API rate limit exceeded',
  details: { status: 429, error: {...} },
  isLLMError: true
}
```

### `OPENAI_SERVICE_ERROR`

OpenAI service temporarily unavailable.

**Solution**: Retry with exponential backoff

```javascript
{
  code: 'OPENAI_SERVICE_ERROR',
  message: 'OpenAI service temporarily unavailable',
  details: { status: 503, error: {...} },
  isLLMError: true
}
```

### `REQUEST_TIMEOUT`

Request to OpenAI API timed out (30 seconds).

**Solution**: Retry or reduce text length

```javascript
{
  code: 'REQUEST_TIMEOUT',
  message: 'OpenAI API request timed out',
  details: { originalError: '...' },
  isLLMError: true
}
```

### `INVALID_JSON_RESPONSE`

Failed to parse OpenAI response as JSON.

**Solution**: Check model supports JSON mode, retry

```javascript
{
  code: 'INVALID_JSON_RESPONSE',
  message: 'Failed to parse OpenAI response as JSON',
  details: { originalError: '...' },
  isLLMError: true
}
```

### `EXTRACTION_FAILED`

Generic extraction failure.

**Solution**: Check logs for details, retry

## Configuration

### Environment Variables

```bash
# Required
OPENAI_API_KEY=sk-...

# Optional
OPENAI_MODEL=gpt-4o-mini  # Default: gpt-4o-mini
```

### Supported Models

- `gpt-4o-mini` (recommended) - Fast, cheap, good quality
- `gpt-4o` - Higher quality, more expensive
- `gpt-4-turbo` - Good balance
- `gpt-3.5-turbo` - Fastest, cheapest, lower quality

## Usage Examples

### Basic Usage

```javascript
const llmItemExtractionService = require('./src/services/llmItemExtraction.service');

async function extractItems(rawText) {
  try {
    const items = await llmItemExtractionService.extractItemsWithLLM(rawText);
    
    console.log(`Extracted ${items.length} items:`);
    items.forEach(item => {
      console.log(`- ${item.name}: ${item.quantity} ${item.unit || 'units'}`);
    });
    
    return items;
  } catch (error) {
    console.error('Extraction failed:', error.code, error.message);
    throw error;
  }
}
```

### With Error Handling

```javascript
async function safeExtraction(rawText) {
  try {
    return await llmItemExtractionService.extractItemsWithLLM(rawText);
  } catch (error) {
    switch (error.code) {
      case 'OPENAI_NOT_CONFIGURED':
        console.error('OpenAI not configured - using fallback');
        return []; // Use fallback extraction
      
      case 'RATE_LIMIT_EXCEEDED':
        console.error('Rate limit exceeded - retry later');
        throw error; // Propagate for retry logic
      
      case 'REQUEST_TIMEOUT':
        console.error('Request timeout - retry');
        throw error; // Propagate for retry logic
      
      default:
        console.error('Extraction failed:', error.message);
        return []; // Return empty array
    }
  }
}
```

### With Retry Logic

```javascript
async function extractWithRetry(rawText, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await llmItemExtractionService.extractItemsWithLLM(rawText);
    } catch (error) {
      // Don't retry for permanent errors
      if (['OPENAI_NOT_CONFIGURED', 'INVALID_INPUT', 'INVALID_API_KEY'].includes(error.code)) {
        throw error;
      }
      
      // Retry for transient errors
      if (attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 1000;
        console.log(`Retry ${attempt}/${maxRetries} after ${delay}ms`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        throw error;
      }
    }
  }
}
```

### Filter by Confidence

```javascript
async function extractHighConfidenceItems(rawText, minConfidence = 0.7) {
  const items = await llmItemExtractionService.extractItemsWithLLM(rawText);
  
  const highConfidence = items.filter(item => item.confidence >= minConfidence);
  const lowConfidence = items.filter(item => item.confidence < minConfidence);
  
  console.log(`High confidence: ${highConfidence.length}`);
  console.log(`Low confidence: ${lowConfidence.length} (needs review)`);
  
  return {
    highConfidence,
    lowConfidence,
  };
}
```

### Integration with OCR

```javascript
const visionOCRService = require('./visionOCR.service');
const llmItemExtractionService = require('./llmItemExtraction.service');

async function processOrderImage(imageUrl) {
  // Step 1: Extract text from image
  const rawText = await visionOCRService.runOCRFromGCS(imageUrl);
  
  if (!rawText || rawText.length === 0) {
    throw new Error('No text detected in image');
  }
  
  // Step 2: Extract structured items
  const items = await llmItemExtractionService.extractItemsWithLLM(rawText);
  
  if (items.length === 0) {
    throw new Error('No items extracted from text');
  }
  
  return {
    rawText,
    items,
    itemCount: items.length,
  };
}
```

## Testing

### Run Test Suite

```bash
# Set environment variables
export OPENAI_API_KEY=sk-...
export OPENAI_MODEL=gpt-4o-mini

# Run tests
node test-llm-extraction.js
```

### Test Cases

1. ✓ Health status check
2. ✓ Invalid input handling
3. ✓ Empty text handling
4. ✓ Simple grocery list
5. ✓ Complex order with noise
6. ✓ Messy handwritten-style text
7. ✓ Items without units
8. ✓ Duplicate item removal
9. ✓ Mixed unit normalization
10. ✓ Real-world example

### Manual Testing

```bash
node -e "
const service = require('./src/services/llmItemExtraction.service');
const text = '10kg rice\n5L oil\n2 dozen eggs';
service.extractItemsWithLLM(text)
  .then(items => console.log(JSON.stringify(items, null, 2)))
  .catch(err => console.error(err.code, err.message));
"
```

## Performance

### Latency

- **Average**: 1-3 seconds per extraction
- **Depends on**: Text length, model, API load

### Cost (OpenAI API)

**gpt-4o-mini pricing** (as of 2024):
- Input: $0.150 per 1M tokens
- Output: $0.600 per 1M tokens

**Example costs**:
- 1,000 extractions/month: ~$0.50
- 10,000 extractions/month: ~$5.00
- 100,000 extractions/month: ~$50.00

### Optimization Tips

1. **Use gpt-4o-mini**: 10x cheaper than gpt-4, good quality
2. **Reduce text length**: Trim unnecessary content before extraction
3. **Batch processing**: Process multiple orders in parallel
4. **Cache results**: Don't re-extract same text
5. **Set low temperature**: 0.1 for consistent results

## Monitoring

### Logs

```javascript
// Start
logger.info('Starting LLM item extraction', {
  textLength: 1234,
  model: 'gpt-4o-mini'
});

// Success
logger.info('LLM item extraction completed', {
  itemsExtracted: 5,
  model: 'gpt-4o-mini',
  duration: 1523,
  tokensUsed: 234
});

// Error
logger.error('LLM extraction failed', {
  errorCode: 'RATE_LIMIT_EXCEEDED',
  errorMessage: 'Rate limit exceeded',
  duration: 234
});
```

### Metrics to Track

- Extraction success rate
- Average items per extraction
- Average confidence score
- Processing time
- Token usage
- Error rate by error code
- Cost per extraction

## Troubleshooting

### Issue: "OPENAI_NOT_CONFIGURED"

**Check**: `OPENAI_API_KEY` environment variable

**Fix**:
```bash
export OPENAI_API_KEY=sk-...
```

### Issue: "INVALID_API_KEY"

**Check**: API key validity at https://platform.openai.com/api-keys

**Fix**: Generate new API key

### Issue: "RATE_LIMIT_EXCEEDED"

**Check**: API usage at https://platform.openai.com/usage

**Fix**:
- Wait for rate limit reset
- Upgrade to higher tier
- Implement rate limiting in your app

### Issue: Low Quality Extractions

**Possible Causes**:
- Poor OCR text quality
- Unusual format
- Non-English text

**Solutions**:
1. Improve OCR quality
2. Add examples to prompt
3. Use gpt-4o instead of gpt-4o-mini
4. Preprocess text before extraction

### Issue: Missing Items

**Possible Causes**:
- Items in unusual format
- Very messy text
- Non-standard units

**Solutions**:
1. Check raw text quality
2. Add more context to prompt
3. Use higher quality model
4. Implement fallback extraction

## Best Practices

1. **Validate Input**: Always check raw text is not empty
2. **Handle Errors**: Implement proper error handling for all error codes
3. **Use Retries**: Retry transient errors with exponential backoff
4. **Filter by Confidence**: Flag low-confidence items for review
5. **Log Everything**: Log all operations for debugging
6. **Monitor Costs**: Track token usage and costs
7. **Cache Results**: Don't re-extract same text
8. **Set Timeouts**: Use 30-second timeout (already implemented)
9. **Test Thoroughly**: Test with various text formats
10. **Use Latest Model**: Keep model updated for best results

## Integration Examples

### With Image Processing Pipeline

```javascript
// src/queues/processors/imageProcessingProcessor.js
const visionOCRService = require('../../services/visionOCR.service');
const llmItemExtractionService = require('../../services/llmItemExtraction.service');

async function processImageOrder(job) {
  const { uploadedOrderId } = job.data;
  
  // Get order
  const order = await prisma.uploadedOrder.findUnique({
    where: { id: uploadedOrderId }
  });
  
  // Step 1: OCR
  const gcsUri = `gs://${process.env.GCS_BUCKET_NAME}/${order.imageKey}`;
  const rawText = await visionOCRService.runOCRFromGCS(gcsUri);
  
  // Step 2: Extract items
  const items = await llmItemExtractionService.extractItemsWithLLM(rawText);
  
  // Step 3: Continue with normalization...
  // ...
}
```

### With Confidence-Based Workflow

```javascript
async function processWithConfidenceCheck(rawText) {
  const items = await llmItemExtractionService.extractItemsWithLLM(rawText);
  
  const highConfidence = items.filter(i => i.confidence >= 0.8);
  const mediumConfidence = items.filter(i => i.confidence >= 0.5 && i.confidence < 0.8);
  const lowConfidence = items.filter(i => i.confidence < 0.5);
  
  // Auto-process high confidence
  for (const item of highConfidence) {
    await createOrderItem(item);
  }
  
  // Flag medium confidence for quick review
  for (const item of mediumConfidence) {
    await flagForReview(item, 'medium');
  }
  
  // Flag low confidence for detailed review
  for (const item of lowConfidence) {
    await flagForReview(item, 'low');
  }
}
```

## Related Documentation

- [Vision OCR Service Guide](./VISION_OCR_SERVICE_GUIDE.md)
- [Product Normalization Guide](./PRODUCT_NORMALIZATION_GUIDE.md)
- [Order Image Processing Guide](./ORDER_IMAGE_PROCESSING_GUIDE.md)
- [OpenAI API Documentation](https://platform.openai.com/docs)

## Summary

✅ Dedicated LLM extraction function  
✅ Strict JSON output format  
✅ Structured items with confidence  
✅ Unit normalization  
✅ Duplicate removal  
✅ Noise filtering  
✅ Structured error handling  
✅ Production-ready  
✅ Full test coverage  
✅ Comprehensive logging  

**Ready to extract grocery items from text!** 🚀
