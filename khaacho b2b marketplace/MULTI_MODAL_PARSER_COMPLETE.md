# Multi-Modal Order Parser - Implementation Complete ✅

## Overview

Enhanced order parsing system that accepts multiple input types (text, voice, images), normalizes product names and units, and handles incomplete orders with automatic clarification.

## Features Implemented

### 1. Multi-Modal Input Support
- ✅ Text orders - Plain text parsing
- ✅ Voice messages - Transcribed voice (future-ready)
- ✅ Image orders - OCR output parsing
- ✅ Flexible parsing patterns
- ✅ Input type-specific processing

### 2. Product Name Normalization
- ✅ Alias system ("coke", "coca cola", "cola" → same product)
- ✅ Multiple alias types (common name, brand, misspelling, abbreviation)
- ✅ Confidence scoring
- ✅ Usage tracking and learning
- ✅ Automatic alias matching

### 3. Quantity Unit Detection
- ✅ Unit normalization (kg, kgs, kilogram → kg)
- ✅ Unit conversion (500 grams → 0.5 kg)
- ✅ Multiple unit types (weight, volume, count, package)
- ✅ 30+ unit variations supported
- ✅ Extensible unit system

### 4. Incomplete Order Handling
- ✅ Missing quantity detection
- ✅ Ambiguous product identification
- ✅ Invalid unit detection
- ✅ Automatic clarification questions
- ✅ Clarification response processing

### 5. Parsing Analytics
- ✅ Success rate tracking
- ✅ Confidence scoring
- ✅ Processing time monitoring
- ✅ Input type metrics
- ✅ Normalization statistics

## Database Schema

### Tables Created

1. **product_name_aliases** - Product name variations
   - Alias names and types
   - Confidence scores
   - Usage tracking
   - Multi-language support

2. **quantity_unit_mappings** - Unit variations
   - Standard units
   - Unit aliases
   - Conversion factors
   - Unit types

3. **order_parsing_sessions** - Parsing sessions
   - Input details
   - Parsed items
   - Clarifications
   - Final results

4. **parsing_clarifications** - Clarification tracking
   - Question types
   - Responses
   - Resolution data

5. **parsing_analytics** - Performance metrics
   - Input type counts
   - Success rates
   - Processing times

### Database Functions

- `normalize_product_name()` - Find product by alias
- `normalize_quantity_unit()` - Normalize unit
- `record_alias_usage()` - Track alias usage

### Views

- `parsing_success_rate` - Success metrics by date
- `most_used_aliases` - Popular aliases
- `clarification_patterns` - Common clarifications

## Parsing Patterns

### Text Patterns Supported

```
1. "product x quantity unit"
   rice x 5 kg

2. "quantity unit product"
   5 kg rice

3. "product - quantity unit"
   rice - 5 kg

4. "product : quantity unit"
   rice : 5 kg
```

### Unit Normalization

```
Weight:
  kg, kgs, kilogram, kilo → kg
  gm, gram, grams → kg (with conversion)

Volume:
  litre, liter, l → litre
  ml → litre (with conversion)

Count:
  piece, pieces, pc, pcs → piece
  item, items → piece

Package:
  packet, pack → packet
  carton → carton
  box, boxes → box
  dozen, doz → dozen (12x conversion)
```

## API Endpoints

### Parse Order

```
POST /api/v1/order-parser/parse

Body:
{
  "inputType": "TEXT|VOICE|IMAGE|OCR",
  "rawInput": "rice 5 kg\ndal 2 kg",
  "retailerId": "retailer-id",
  "inputMetadata": {}
}

Response:
{
  "success": true,
  "sessionId": "session-id",
  "items": [...],
  "confidence": 85.5,
  "needsClarification": false,
  "clarifications": [],
  "processingTime": 150
}
```

### Submit Clarifications

```
POST /api/v1/order-parser/sessions/:sessionId/clarify

Body:
{
  "responses": [
    {
      "itemIndex": 0,
      "type": "MISSING_QUANTITY",
      "answer": "5"
    }
  ]
}
```

### Get Session

```
GET /api/v1/order-parser/sessions/:sessionId
```

### Add Product Alias

```
POST /api/v1/order-parser/aliases

Body:
{
  "productId": "product-id",
  "aliasName": "coke",
  "aliasType": "COMMON_NAME"
}
```

## Usage Examples

### Parse Text Order

```javascript
const result = await multiModalOrderParserService.parseOrder({
  inputType: 'TEXT',
  rawInput: 'rice 5 kg\ndal 2 kg\ncoke x 12',
  retailerId: 'retailer-id',
});

console.log(result.items);
// [
//   { productName: 'rice', quantity: 5, unit: 'kg', ... },
//   { productName: 'dal', quantity: 2, unit: 'kg', ... },
//   { productName: 'coke', quantity: 12, unit: 'piece', ... }
// ]
```

### Handle Clarifications

```javascript
// Parse incomplete order
const result = await multiModalOrderParserService.parseOrder({
  inputType: 'TEXT',
  rawInput: 'rice\ndal 2',
  retailerId: 'retailer-id',
});

if (result.needsClarification) {
  console.log(result.clarifications);
  // [
  //   { type: 'MISSING_QUANTITY', question: 'How many rice...', ... },
  //   { type: 'INVALID_UNIT', question: 'What unit for dal...', ... }
  // ]
  
  // Submit responses
  await multiModalOrderParserService.submitClarifications(
    result.sessionId,
    [
      { itemIndex: 0, type: 'MISSING_QUANTITY', answer: '5' },
      { itemIndex: 1, type: 'INVALID_UNIT', answer: 'kg' }
    ]
  );
}
```

### Parse OCR Output

```javascript
const result = await multiModalOrderParserService.parseOrder({
  inputType: 'OCR',
  rawInput: 'RICE | 10 | KG\nDAL | 5 | KG',
  retailerId: 'retailer-id',
  inputMetadata: { imageUrl: 'https://...' },
});
```

### Add Product Alias

```javascript
await multiModalOrderParserService.addProductAlias(
  'product-id',
  'coke',
  'COMMON_NAME'
);
```

## Product Normalization

### How It Works

1. User inputs "coke"
2. System searches product_name_aliases
3. Finds match: "coke" → Coca-Cola (confidence: 95%)
4. Returns normalized product
5. Records alias usage

### Alias Types

- **COMMON_NAME**: "coke" for Coca-Cola
- **BRAND_NAME**: "Pepsi" for Pepsi Cola
- **MISSPELLING**: "cocacola" for Coca-Cola
- **ABBREVIATION**: "CC" for Coca-Cola
- **LOCAL_NAME**: Regional variations

## Unit Conversion

### Examples

```
Input: "500 grams"
Output: 0.5 kg (conversion factor: 0.001)

Input: "2 dozen"
Output: 24 pieces (conversion factor: 12)

Input: "500 ml"
Output: 0.5 litre (conversion factor: 0.001)
```

## Clarification Types

### 1. MISSING_QUANTITY
```
Input: "rice"
Question: "How many rice do you need?"
```

### 2. AMBIGUOUS_PRODUCT
```
Input: "cola" (low confidence match)
Question: "Did you mean Coca-Cola? Please confirm..."
```

### 3. INVALID_UNIT
```
Input: "rice 5" (no unit)
Question: "What unit for rice? (kg, litre, packet, etc.)"
```

## Confidence Scoring

### Item Confidence

```
Base: 100
- No product match: -30
- No quantity: -20
- No unit: -10
- Low product confidence: average with product score

Final: Max(0, Min(100, calculated))
```

### Overall Confidence

```
Average item confidence - (clarifications × 10)
```

## Integration Points

### WhatsApp Orders

```javascript
// In WhatsApp service
const parseResult = await multiModalOrderParserService.parseOrder({
  inputType: 'TEXT',
  rawInput: messageText,
  retailerId: retailer.id,
});

if (parseResult.needsClarification) {
  // Send clarification questions via WhatsApp
  await sendClarificationQuestions(parseResult.clarifications);
} else {
  // Create order
  await createOrder(parseResult.items);
}
```

### Image Upload

```javascript
// After OCR processing
const parseResult = await multiModalOrderParserService.parseOrder({
  inputType: 'OCR',
  rawInput: ocrText,
  retailerId: retailer.id,
  inputMetadata: { imageUrl, ocrConfidence },
});
```

## Testing

Run the test suite:

```bash
node test-multi-modal-parser.js
```

## Files Created

### Database
- `prisma/migrations/042_enhanced_order_parsing.sql`

### Services
- `src/services/multiModalOrderParser.service.js`

### Controllers
- `src/controllers/multiModalOrderParser.controller.js`

### Routes
- `src/routes/multiModalOrderParser.routes.js`

### Tests
- `test-multi-modal-parser.js`

### Documentation
- `MULTI_MODAL_PARSER_COMPLETE.md`

## Deployment Checklist

- [ ] Apply database migration
- [ ] Add routes to main router
- [ ] Seed product aliases
- [ ] Test with real orders
- [ ] Monitor parsing success rate
- [ ] Add more aliases as needed

## Next Steps

1. Apply migration: `npx prisma migrate deploy`
2. Seed common product aliases
3. Test with various input formats
4. Monitor clarification patterns
5. Add more unit variations
6. Integrate with WhatsApp flow

## Benefits

### Accuracy
- Product name normalization reduces errors
- Unit conversion ensures consistency
- Confidence scoring highlights issues

### User Experience
- Accepts natural language input
- Handles typos and variations
- Automatic clarification for incomplete orders
- Multi-modal support (text, voice, images)

### Learning System
- Tracks alias usage
- Learns from corrections
- Improves over time
- Analytics for optimization

## Support

For issues or questions:
- Check logs: `logs/combined-*.log`
- View success rate: Query `parsing_success_rate` view
- Check aliases: Query `most_used_aliases` view
- Review clarifications: Query `clarification_patterns` view
