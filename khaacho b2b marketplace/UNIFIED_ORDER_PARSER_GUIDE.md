# Unified Order Parser - Complete Guide

## Overview

The Unified Order Parser is a single system that handles order parsing from multiple input sources (WhatsApp text and OCR extracted text), normalizes them into structured format, handles spelling mistakes and local variations, and provides confidence scoring with automatic clarification requests.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Input Sources                             │
│                                                              │
│         WhatsApp Text          OCR Extracted Text           │
│              ↓                         ↓                     │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│              Unified Order Parser Service                    │
│                                                              │
│  1. Text Cleaning & Normalization                           │
│     - Fix OCR errors (0il → oil)                            │
│     - Normalize whitespace                                   │
│     - Remove special characters                              │
│                                                              │
│  2. Item Extraction                                          │
│     - Parse multiple formats                                 │
│     - Extract: item, quantity, unit                          │
│                                                              │
│  3. Spelling Corrections                                     │
│     - Apply local variations (chamal → rice)                 │
│     - Fix common mistakes                                    │
│                                                              │
│  4. Product Matching                                         │
│     - Exact SKU match (100% confidence)                      │
│     - Product code match (95% confidence)                    │
│     - Fuzzy name match (60-90% confidence)                   │
│     - Partial SKU match (70% confidence)                     │
│                                                              │
│  5. Confidence Scoring                                       │
│     - Calculate per-item confidence (0-100)                  │
│     - Calculate overall confidence                           │
│     - Determine if clarification needed                      │
│                                                              │
│  6. Output Generation                                        │
│     - Structured items with product IDs                      │
│     - Clarification message (if confidence < 80%)            │
│     - Order summary with totals                              │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│                  Structured Output                           │
│                                                              │
│  {                                                           │
│    item: "Rice",                                             │
│    quantity: 10,                                             │
│    unit: "kg",                                               │
│    productId: "uuid",                                        │
│    productName: "Rice (Basmati)",                            │
│    sku: "RICE-1KG",                                          │
│    unitPrice: 50,                                            │
│    confidence: 95,                                           │
│    needsReview: false                                        │
│  }                                                           │
└─────────────────────────────────────────────────────────────┘
```

## Features

### 1. Multi-Source Input
- WhatsApp text messages
- OCR extracted text from images
- Unified processing pipeline

### 2. Format Support
Supports multiple input formats:

```
SKU x Quantity:        RICE-1KG x 10
Quantity x SKU:        10 x RICE-1KG
Quantity Product:      10 kg rice
Product Quantity:      rice 10 kg
Natural Language:      I need 10 bags of rice
```

### 3. Spelling Corrections
Handles local variations (Nepal context):

```
chamal → rice
daal → dal
tel → oil
chini → sugar
nun → salt
```

### 4. OCR Error Handling
Fixes common OCR mistakes:

```
0il → oil
r1ce → rice
5ugar → sugar
```

### 5. Unit Normalization
Standardizes units:

```
kilogram → kg
liters → L
pieces → pieces
packets → packet
```

### 6. Confidence Scoring
- **Auto-accept:** confidence >= 80%
- **Needs review:** confidence 50-79%
- **Reject:** confidence < 50%

### 7. Automatic Clarification
Generates clarification messages when confidence < 80%:

```
⚠️ Please confirm these items:

1. "chamal" → Rice (Basmati) (75% match)
   Qty: 10 kg
   Price: Rs.50

Reply:
• "CONFIRM" to proceed
• "CANCEL" to cancel
• Or send corrections
```

## API Usage

### Parse WhatsApp Order

```http
POST /api/parse/whatsapp
Authorization: Bearer <token>
Content-Type: application/json

{
  "rawText": "RICE-1KG x 10\nDAL-1KG x 5\nOIL-1L x 3",
  "retailerId": "uuid",
  "orderId": "uuid" // optional
}

Response:
{
  "success": true,
  "data": {
    "parsingId": "uuid",
    "source": "whatsapp",
    "items": [
      {
        "item": "rice",
        "quantity": 10,
        "unit": "kg",
        "productId": "uuid",
        "productName": "Rice (Basmati)",
        "sku": "RICE-1KG",
        "unitPrice": 50,
        "confidence": 100,
        "needsReview": false
      }
    ],
    "overallConfidence": 95,
    "needsClarification": false,
    "clarificationMessage": null,
    "summary": {
      "totalItems": 3,
      "matchedItems": 3,
      "unmatchedItems": 0,
      "subtotal": 1500,
      "tax": 195,
      "total": 1695
    }
  }
}
```

### Parse OCR Order

```http
POST /api/parse/ocr
Authorization: Bearer <token>
Content-Type: application/json

{
  "rawText": "Order #123\nDate: 2026-02-14\n\n1. Rice 10kg Rs.500\n2. Oil 5L Rs.800\n3. Sugar 2 kg\n\nTotal: Rs.1300",
  "retailerId": "uuid",
  "orderId": "uuid"
}
```

### Get Parsing Result

```http
GET /api/parse/:parsingId
Authorization: Bearer <token>

Response:
{
  "success": true,
  "data": {
    "id": "uuid",
    "source": "whatsapp",
    "rawText": "...",
    "extractedItems": {...},
    "normalizedItems": {...},
    "overallConfidence": 95,
    "needsClarification": false,
    "status": "COMPLETED",
    "createdAt": "2026-02-14T10:00:00Z"
  }
}
```

### Get Retailer History

```http
GET /api/parse/retailer/:retailerId?limit=20&offset=0&source=whatsapp
Authorization: Bearer <token>

Response:
{
  "success": true,
  "data": {
    "results": [...],
    "total": 50,
    "limit": 20,
    "offset": 0
  }
}
```

### Get Statistics

```http
GET /api/parse/statistics?retailerId=uuid&startDate=2026-01-01&endDate=2026-12-31
Authorization: Bearer <token>

Response:
{
  "success": true,
  "data": {
    "total": 100,
    "bySource": {
      "whatsapp": 60,
      "ocr": 40
    },
    "byStatus": {
      "COMPLETED": 80,
      "PENDING_REVIEW": 15,
      "FAILED": 5
    },
    "averageConfidence": 87.5,
    "needsClarification": 15,
    "clarificationRate": 15
  }
}
```

### Configuration

```http
GET /api/parse/configuration
PUT /api/parse/configuration/thresholds

Body:
{
  "thresholds": {
    "autoAccept": 85,
    "needsReview": 60,
    "reject": 50
  }
}
```

## Service Layer

### UnifiedOrderParserService

**Main Method:**

```javascript
const result = await unifiedOrderParser.parseOrder({
  source: 'whatsapp', // or 'ocr'
  rawText: 'RICE-1KG x 10',
  retailerId: 'uuid',
  orderId: 'uuid', // optional
});
```

**Configuration:**

```javascript
// Get configuration
const config = unifiedOrderParser.getConfiguration();

// Update thresholds
unifiedOrderParser.updateThresholds({
  autoAccept: 85,
  needsReview: 60,
});
```

## Database Schema

### order_parsing_log

Stores all parsing attempts with results:

```sql
CREATE TABLE order_parsing_log (
    id UUID PRIMARY KEY,
    source VARCHAR(20) NOT NULL, -- 'whatsapp' or 'ocr'
    raw_text TEXT NOT NULL,
    retailer_id UUID NOT NULL,
    order_id UUID,
    extracted_items JSONB NOT NULL,
    normalized_items JSONB NOT NULL,
    overall_confidence DECIMAL(5,2),
    needs_clarification BOOLEAN,
    status VARCHAR(50),
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);
```

## Confidence Calculation

### Per-Item Confidence

```javascript
confidence = baseConfidence * adjustments

Adjustments:
- Exact SKU match: 100%
- Product code match: 95%
- Fuzzy name match: 60-90% (from matcher)
- Partial SKU match: 70%
- Has unit: +5%
- OCR source: -5%
```

### Overall Confidence

```javascript
overallConfidence = average(itemConfidences)
```

### Clarification Logic

```javascript
if (overallConfidence < 80%) {
  needsClarification = true;
  generateClarificationMessage();
}
```

## Spelling Variations

### Nepal Context

```javascript
spellingVariations = {
  // Rice
  'chamal': 'rice',
  'chaamal': 'rice',
  'chawal': 'rice',
  'bhat': 'rice',
  
  // Dal
  'daal': 'dal',
  'dhal': 'dal',
  'lentil': 'dal',
  
  // Oil
  'tel': 'oil',
  'tail': 'oil',
  
  // Sugar
  'chini': 'sugar',
  'cheeni': 'sugar',
  
  // Salt
  'nun': 'salt',
  'noon': 'salt',
  'namak': 'salt',
}
```

### OCR Error Corrections

```javascript
ocrCorrections = {
  '0il': 'oil',
  'r1ce': 'rice',
  '5ugar': 'sugar',
  '0': 'o',
  '1': 'l',
  '5': 's',
}
```

## Integration Examples

### WhatsApp Webhook Integration

```javascript
// In WhatsApp webhook handler
const { message, from } = webhookData;

// Get retailer by phone number
const retailer = await getRetailerByPhone(from);

// Parse order
const result = await unifiedOrderParser.parseOrder({
  source: 'whatsapp',
  rawText: message,
  retailerId: retailer.id,
});

// Check if clarification needed
if (result.needsClarification) {
  // Send clarification message
  await sendWhatsAppMessage(from, result.clarificationMessage);
} else {
  // Create order
  await createOrder(retailer.id, result.items);
  
  // Send confirmation
  await sendWhatsAppMessage(from, result.summary);
}
```

### OCR Pipeline Integration

```javascript
// After OCR extraction
const { extractedText, uploadedOrderId } = ocrResult;

// Get uploaded order
const uploadedOrder = await prisma.uploadedOrder.findUnique({
  where: { id: uploadedOrderId },
});

// Parse order
const result = await unifiedOrderParser.parseOrder({
  source: 'ocr',
  rawText: extractedText,
  retailerId: uploadedOrder.retailerId,
  orderId: uploadedOrderId,
});

// Update uploaded order
await prisma.uploadedOrder.update({
  where: { id: uploadedOrderId },
  data: {
    parsedData: result.items,
    status: result.needsClarification ? 'PENDING_REVIEW' : 'COMPLETED',
  },
});
```

## Testing

### Run Test Suite

```bash
node test-unified-order-parser.js
```

### Manual Testing

```bash
# Parse WhatsApp order
curl -X POST http://localhost:3000/api/parse/whatsapp \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "rawText": "RICE-1KG x 10\nDAL-1KG x 5",
    "retailerId": "uuid"
  }'

# Parse OCR order
curl -X POST http://localhost:3000/api/parse/ocr \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "rawText": "1. Rice 10kg\n2. Oil 5L",
    "retailerId": "uuid"
  }'

# Get statistics
curl http://localhost:3000/api/parse/statistics \
  -H "Authorization: Bearer <token>"
```

## Monitoring

### Key Metrics

```sql
-- Average confidence by source
SELECT 
  source,
  AVG(overall_confidence) as avg_confidence,
  COUNT(*) as total_parses
FROM order_parsing_log
GROUP BY source;

-- Clarification rate
SELECT 
  COUNT(CASE WHEN needs_clarification THEN 1 END)::float / COUNT(*) * 100 as clarification_rate
FROM order_parsing_log;

-- Success rate by source
SELECT 
  source,
  COUNT(CASE WHEN status = 'COMPLETED' THEN 1 END)::float / COUNT(*) * 100 as success_rate
FROM order_parsing_log
GROUP BY source;

-- Most common unmatched items
SELECT 
  jsonb_array_elements(normalized_items->'items')->>'item' as item,
  COUNT(*) as frequency
FROM order_parsing_log
WHERE jsonb_array_elements(normalized_items->'items')->>'productId' IS NULL
GROUP BY item
ORDER BY frequency DESC
LIMIT 10;
```

## Troubleshooting

### Low Confidence Scores

**Problem:** Items consistently get low confidence scores

**Solutions:**
1. Check product catalog completeness
2. Add more spelling variations
3. Improve product names in catalog
4. Lower confidence thresholds

### OCR Errors Not Fixed

**Problem:** OCR errors not being corrected

**Solutions:**
1. Add more OCR error patterns
2. Improve text cleaning logic
3. Use better OCR service
4. Pre-process images (resize, enhance)

### Items Not Matching

**Problem:** Valid items not matching products

**Solutions:**
1. Check product catalog
2. Add SKU aliases
3. Improve fuzzy matching
4. Add more spelling variations

### Too Many Clarifications

**Problem:** Too many orders need clarification

**Solutions:**
1. Lower autoAccept threshold (e.g., 75%)
2. Improve product matching
3. Add more spelling variations
4. Train users on proper format

## Performance Optimization

### Database Indexes

All necessary indexes created in migration:
- `idx_order_parsing_log_retailer_id`
- `idx_order_parsing_log_source`
- `idx_order_parsing_log_confidence`
- GIN indexes on JSONB columns

### Caching

Consider caching:
- Product catalog
- Spelling variations
- Common matches

### Batch Processing

For bulk parsing:

```javascript
const results = await Promise.all(
  orders.map(order => unifiedOrderParser.parseOrder(order))
);
```

## Future Enhancements

### ML-Based Matching

Replace rule-based matching with ML model:

```javascript
const mlModel = await loadModel('product-matcher');
const match = await mlModel.predict(itemText);
```

### Context-Aware Parsing

Use order history for better matching:

```javascript
const recentOrders = await getRecentOrders(retailerId);
const context = extractContext(recentOrders);
const result = await parseWithContext(text, context);
```

### Multi-Language Support

Add support for multiple languages:

```javascript
const language = detectLanguage(text);
const variations = getSpellingVariations(language);
```

### Adaptive Thresholds

Adjust thresholds based on performance:

```javascript
const performance = await analyzePerformance(retailerId);
const thresholds = calculateOptimalThresholds(performance);
```

## Support

For issues or questions:
1. Check logs: `logs/orders-*.log`
2. Run test suite: `node test-unified-order-parser.js`
3. Check database: Query `order_parsing_log` table
4. Review statistics: `GET /api/parse/statistics`
