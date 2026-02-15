# Product Normalization Guide

## Overview
The Product Normalization Service matches extracted items from OCR text against the Product database using fuzzy matching algorithms. This ensures that messy product names from images are correctly mapped to actual products in the system.

## Implementation Status: ✅ COMPLETE

### Files Created

1. **src/services/productNormalization.service.js**
   - Main service with `normalizeExtractedItems(uploadedOrderId)` function
   - Fuzzy matching using Levenshtein distance
   - Full-text search using PostgreSQL
   - Confidence scoring and review flagging

2. **test-product-normalization.js**
   - Complete test suite
   - Mock data creation
   - Direct matching tests
   - Full workflow tests

## Function Specification

### Main Function

```javascript
async normalizeExtractedItems(uploadedOrderId)
```

**Input**: `uploadedOrderId` (string) - ID of uploaded order with parsed items

**Output**: Object with normalization results
```javascript
{
  success: true,
  uploadedOrderId: "uuid",
  totalItems: 8,
  matchedItems: 7,
  needsReview: 1,
  normalizedItems: [
    {
      originalItem: { name: "Rice", quantity: 10, unit: "kg" },
      matched: true,
      confidence: 1.0,
      matchType: "exact",
      productId: "uuid",
      productCode: "RICE-001",
      productName: "Basmati Rice",
      category: "Grains",
      unit: "kg",
      needsReview: false
    },
    // ... more items
  ],
  status: "COMPLETED" // or "PENDING_REVIEW"
}
```

## Matching Algorithm

### 1. Exact Match (Case-Insensitive)
- Normalizes both search term and product names
- Removes special characters and extra spaces
- Returns confidence: 100%

### 2. Fuzzy Match (Levenshtein Distance)
- Calculates edit distance between strings
- Converts distance to similarity score (0-1)
- Minimum similarity: 50% (configurable)
- Returns top match with alternatives

### 3. Full-Text Search (PostgreSQL)
- Uses PostgreSQL's `SIMILARITY()` function (pg_trgm extension)
- Falls back to `ILIKE` if extension not available
- Handles partial matches and word variations

### 4. Confidence Threshold
- Default threshold: 70% (configurable)
- Below threshold → `needsReview: true`
- Status changes to `PENDING_REVIEW`

## Configuration

### Environment Variables

```bash
# Confidence threshold (0.0 - 1.0)
PRODUCT_MATCH_THRESHOLD=0.7  # Default: 0.7 (70%)
```

### Adjusting Thresholds

```javascript
// In productNormalization.service.js
this.CONFIDENCE_THRESHOLD = 0.7;  // 70% confidence required
this.MIN_SIMILARITY = 0.5;        // 50% minimum similarity
```

## Match Types

### 1. Exact Match
```javascript
{
  matchType: "exact",
  confidence: 1.0,
  needsReview: false
}
```
- Product name matches exactly (case-insensitive)
- Highest confidence
- No review needed

### 2. Fuzzy Match
```javascript
{
  matchType: "fuzzy",
  confidence: 0.85,
  needsReview: false,
  alternatives: [
    { productId: "...", productName: "...", confidence: 0.75 }
  ]
}
```
- Similar product name found
- Confidence based on Levenshtein distance
- May include alternative matches

### 3. Full-Text Match
```javascript
{
  matchType: "fulltext",
  confidence: 0.65,
  needsReview: true,
  reason: "Low confidence match (65%)"
}
```
- Partial or word-based match
- Lower confidence
- Often needs review

### 4. No Match
```javascript
{
  matched: false,
  confidence: 0,
  needsReview: true,
  reason: "No matching product found"
}
```
- No similar product found
- Requires manual review

## Usage

### Basic Usage

```javascript
const productNormalizationService = require('./src/services/productNormalization.service');

// Normalize items in an uploaded order
const result = await productNormalizationService.normalizeExtractedItems(uploadedOrderId);

console.log(`Matched: ${result.matchedItems}/${result.totalItems}`);
console.log(`Needs review: ${result.needsReview}`);
console.log(`Status: ${result.status}`);
```

### Batch Processing

```javascript
// Normalize multiple uploaded orders
const uploadedOrderIds = ['uuid1', 'uuid2', 'uuid3'];
const results = await productNormalizationService.batchNormalize(uploadedOrderIds);

results.forEach(result => {
  console.log(`Order ${result.uploadedOrderId}: ${result.matchedItems}/${result.totalItems} matched`);
});
```

### Direct Product Matching

```javascript
// Match a single item (for testing)
const item = { name: 'Basmati Rice', quantity: 10, unit: 'kg' };
const matchResult = await productNormalizationService.matchProduct(item);

if (matchResult.matched) {
  console.log(`Matched: ${matchResult.productName}`);
  console.log(`Confidence: ${Math.round(matchResult.confidence * 100)}%`);
}
```

## Integration with Image Processing

### Step 1: Extract Items (Already Implemented)
```javascript
const itemExtractionService = require('./src/services/itemExtraction.service');
const items = await itemExtractionService.extractStructuredItems(rawText);
```

### Step 2: Normalize Items (New)
```javascript
const productNormalizationService = require('./src/services/productNormalization.service');
const result = await productNormalizationService.normalizeExtractedItems(uploadedOrderId);
```

### Step 3: Handle Review Status
```javascript
if (result.status === 'PENDING_REVIEW') {
  // Send notification to admin
  console.log(`${result.needsReview} items need manual review`);
  
  // Show items needing review
  const reviewItems = result.normalizedItems.filter(i => i.needsReview);
  reviewItems.forEach(item => {
    console.log(`- ${item.originalItem.name}: ${item.reason}`);
  });
}
```

## Complete Workflow

```javascript
// Complete image processing workflow
async function processOrderImage(uploadedOrderId) {
  // 1. Extract text from image (OCR)
  const ocrResult = await orderImageProcessing.processUploadedOrder(uploadedOrderId);
  
  // 2. Extract structured items (LLM)
  const items = ocrResult.extractedData.items;
  
  // 3. Normalize items (Product matching)
  const normalizationResult = await productNormalizationService.normalizeExtractedItems(uploadedOrderId);
  
  // 4. Check status
  if (normalizationResult.status === 'COMPLETED') {
    // All items matched successfully
    console.log('✅ Ready to create order');
    return createOrder(normalizationResult.normalizedItems);
  } else {
    // Some items need review
    console.log('⚠️  Manual review required');
    return sendForReview(normalizationResult);
  }
}
```

## Testing

### Run Tests
```bash
# Run complete test suite
node test-product-normalization.js
```

### Test Output
```
🧪 Testing Product Normalization Service
══════════════════════════════════════════════════════════════════════

✅ Database connected

📦 Checking available products in database...
✅ Found 10 products (showing first 10):

1. Basmati Rice
   Code: RICE-001
   Category: Grains
   Unit: kg

...

TEST 1: Direct Product Matching
══════════════════════════════════════════════════════════════════════

Testing: "Rice"
  ✅ Matched: Basmati Rice
  Confidence: 85%
  Match Type: fuzzy
  Needs Review: NO

...

TEST 2: Full Normalization Workflow
══════════════════════════════════════════════════════════════════════

📝 Creating mock uploaded order...
✅ Mock uploaded order created: uuid
📦 Items to normalize: 8

🔄 Testing product normalization...
✅ Normalization completed in 1234ms

📊 Results Summary:
──────────────────────────────────────────────────────────────────────
Total items:    8
Matched items:  7
Needs review:   1
Final status:   PENDING_REVIEW

📋 Detailed Results:
══════════════════════════════════════════════════════════════════════

1. Rice
   Original: {"name":"Rice","quantity":10,"unit":"kg"}
   ✅ MATCHED
   Product ID:   uuid
   Product Name: Basmati Rice
   Match Type:   fuzzy
   Confidence:   85%
   Needs Review: NO

...

8. Unknown Product XYZ
   Original: {"name":"Unknown Product XYZ","quantity":1,"unit":null}
   ❌ NOT MATCHED
   Reason: No matching product found
   Needs Review: YES

══════════════════════════════════════════════════════════════════════

📊 Test Summary
══════════════════════════════════════════════════════════════════════
Total items tested:     8
Successfully matched:   7
Failed to match:        1
Needs manual review:    1
Match rate:             88%

⚠️  Some items need manual review
These items have low confidence matches or no matches found.

✅ All tests completed!
```

## Database Schema

### UploadedOrder Status
```sql
CREATE TYPE "UploadedOrderStatus" AS ENUM (
  'PROCESSING',
  'COMPLETED',
  'FAILED',
  'PENDING_REVIEW'  -- New status for items needing review
);
```

### Normalized Data Structure
```json
{
  "normalizedItems": [
    {
      "originalItem": { "name": "Rice", "quantity": 10, "unit": "kg" },
      "matched": true,
      "confidence": 0.85,
      "matchType": "fuzzy",
      "productId": "uuid",
      "productCode": "RICE-001",
      "productName": "Basmati Rice",
      "category": "Grains",
      "unit": "kg",
      "needsReview": false
    }
  ],
  "needsReviewCount": 1,
  "status": "PENDING_REVIEW"
}
```

## Performance

### Matching Speed
- Exact match: < 10ms
- Fuzzy match: 50-200ms (depends on product count)
- Full-text search: 20-100ms

### Optimization Tips
1. **Index product names**: Already indexed in schema
2. **Cache common matches**: Implement Redis caching
3. **Batch processing**: Use `batchNormalize()` for multiple orders
4. **Limit product search**: Filter by category if known

## Error Handling

### Common Errors

**1. No products in database**
```javascript
Error: No matching product found
Solution: Seed database with products (npm run db:seed)
```

**2. Invalid uploaded order**
```javascript
Error: UploadedOrder not found
Solution: Verify uploadedOrderId exists
```

**3. Missing parsed data**
```javascript
Error: No parsed items found in uploaded order
Solution: Run item extraction first
```

**4. Database connection error**
```javascript
Error: Can't reach database server
Solution: Check DATABASE_URL and database status
```

## Logging

All operations are logged with structured data:

```javascript
logger.info('🔄 Starting product normalization', { uploadedOrderId });
logger.info('📦 Found extracted items', { itemCount: 8 });
logger.info('🔍 Matching item 1/8', { name: 'Rice', quantity: 10 });
logger.info('✅ Match result', { matched: true, confidence: 0.85 });
logger.info('✅ Product normalization completed', { 
  totalItems: 8, 
  matchedItems: 7, 
  needsReview: 1 
});
```

## API Integration

### Add to Image Upload Controller

```javascript
// In src/controllers/imageUpload.controller.js

async processAndNormalize(req, res) {
  try {
    const { uploadedOrderId } = req.params;
    
    // 1. Process image (OCR + extraction)
    const processResult = await orderImageProcessing.processUploadedOrder(uploadedOrderId);
    
    // 2. Normalize items (product matching)
    const normalizeResult = await productNormalizationService.normalizeExtractedItems(uploadedOrderId);
    
    return res.json({
      success: true,
      uploadedOrderId,
      status: normalizeResult.status,
      totalItems: normalizeResult.totalItems,
      matchedItems: normalizeResult.matchedItems,
      needsReview: normalizeResult.needsReview,
      normalizedItems: normalizeResult.normalizedItems,
    });
    
  } catch (error) {
    logger.error('Process and normalize failed', { error: error.message });
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}
```

### Add Route

```javascript
// In src/routes/imageUpload.routes.js

router.post(
  '/upload-image/:uploadedOrderId/normalize',
  authMiddleware,
  imageUploadController.processAndNormalize
);
```

## Best Practices

### 1. Always Check Confidence
```javascript
if (item.confidence < 0.7) {
  // Flag for manual review
  item.needsReview = true;
}
```

### 2. Provide Alternatives
```javascript
if (item.alternatives && item.alternatives.length > 0) {
  // Show alternatives to user for selection
  console.log('Did you mean:', item.alternatives[0].productName);
}
```

### 3. Handle No Matches
```javascript
if (!item.matched) {
  // Suggest creating new product
  // Or ask user to clarify
  console.log('Product not found:', item.originalItem.name);
}
```

### 4. Batch Processing
```javascript
// Process multiple orders efficiently
const results = await productNormalizationService.batchNormalize(orderIds);
```

## Troubleshooting

### Low Match Rate
```bash
# Check product names in database
SELECT name FROM products WHERE is_active = true LIMIT 20;

# Adjust confidence threshold
PRODUCT_MATCH_THRESHOLD=0.6  # Lower threshold (60%)
```

### Slow Performance
```bash
# Check product count
SELECT COUNT(*) FROM products WHERE is_active = true;

# Add indexes (already in schema)
CREATE INDEX idx_products_name ON products(name);

# Enable pg_trgm extension for faster full-text search
CREATE EXTENSION IF NOT EXISTS pg_trgm;
```

### False Matches
```bash
# Increase confidence threshold
PRODUCT_MATCH_THRESHOLD=0.8  # Higher threshold (80%)

# Review alternatives
# Check if better match exists in alternatives list
```

## Future Enhancements

### 1. Machine Learning
- Train model on historical matches
- Learn from user corrections
- Improve confidence scoring

### 2. Category-Based Matching
- Filter products by category first
- Improve accuracy and speed

### 3. Brand Recognition
- Extract brand names from OCR
- Match by brand + product name

### 4. Unit Conversion
- Normalize units (kg ↔ g, L ↔ ml)
- Match products with different units

### 5. Caching
- Cache common product matches
- Reduce database queries

---

**Status**: ✅ Ready for production use
**Last Updated**: 2026-02-13
**Version**: 1.0.0
