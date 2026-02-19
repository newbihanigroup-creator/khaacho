# 🤖 AI Ordering Assistant - Complete Design

## Executive Summary

An intelligent AI assistant that processes orders from multiple input types (text, images, voice) in multiple languages, with built-in error detection, repeat order suggestions, and graceful fallback handling.

**Key Features:**
- 📝 Text order extraction (English, Nepali, Hindi)
- 📸 Image OCR (handwritten lists, product photos)
- 🔄 Repeat order suggestions
- ⚠️ Mistake detection & correction
- 🌐 Multilingual support
- 🛡️ Fallback handling (3-tier)

**Cost:** $0.15-0.30 per 1,000 orders (using GPT-4o-mini)

---

## 1. MODEL ARCHITECTURE

### Primary Model: GPT-4o-mini
**Why GPT-4o-mini?**
- ✅ 10x cheaper than GPT-4 ($0.15 vs $1.50 per 1M tokens)
- ✅ Good enough for structured extraction
- ✅ Fast response time (<2s)
- ✅ Multilingual support built-in
- ✅ JSON mode for structured output

### Vision Model: GPT-4o (for images)
**Why GPT-4o?**
- ✅ Best OCR accuracy for handwritten text
- ✅ Understands product images
- ✅ Can read multiple languages
- ✅ $2.50 per 1M tokens (still affordable)

### Fallback Models
```
Tier 1: GPT-4o-mini (primary)
Tier 2: GPT-3.5-turbo (if GPT-4o-mini fails)
Tier 3: Rule-based parser (if all AI fails)
```

---

## 2. SYSTEM ARCHITECTURE

```
┌─────────────────────────────────────────────────────────┐
│                   INPUT LAYER                            │
├─────────────────────────────────────────────────────────┤
│  WhatsApp Message                                        │
│  ├─ Text: "10 kg rice, 5 liter oil"                    │
│  ├─ Image: Photo of handwritten list                    │
│  └─ Voice: Audio message (future)                       │
└────────────────┬────────────────────────────────────────┘
                 │
┌────────────────▼────────────────────────────────────────┐
│              PREPROCESSING LAYER                         │
├─────────────────────────────────────────────────────────┤
│  1. Detect input type (text/image/voice)               │
│  2. Detect language (English/Nepali/Hindi)             │
│  3. Load user context (past orders, preferences)        │
│  4. Fetch product catalog                               │
└────────────────┬────────────────────────────────────────┘
                 │
┌────────────────▼────────────────────────────────────────┐
│                 AI PROCESSING LAYER                      │
├─────────────────────────────────────────────────────────┤
│  ┌──────────────────────────────────────────────┐      │
│  │  Text Parser (GPT-4o-mini)                   │      │
│  │  ├─ Extract products & quantities            │      │
│  │  ├─ Normalize units                          │      │
│  │  └─ Match to catalog                         │      │
│  └──────────────────────────────────────────────┘      │
│                                                          │
│  ┌──────────────────────────────────────────────┐      │
│  │  Image Parser (GPT-4o)                       │      │
│  │  ├─ OCR handwritten text                     │      │
│  │  ├─ Recognize product images                 │      │
│  │  └─ Extract quantities                       │      │
│  └──────────────────────────────────────────────┘      │
│                                                          │
│  ┌──────────────────────────────────────────────┐      │
│  │  Mistake Detector (GPT-4o-mini)              │      │
│  │  ├─ Check unusual quantities                 │      │
│  │  ├─ Verify product combinations              │      │
│  │  └─ Flag suspicious orders                   │      │
│  └──────────────────────────────────────────────┘      │
│                                                          │
│  ┌──────────────────────────────────────────────┐      │
│  │  Repeat Order Suggester (GPT-4o-mini)        │      │
│  │  ├─ Analyze order history                    │      │
│  │  ├─ Detect patterns                          │      │
│  │  └─ Suggest missing items                    │      │
│  └──────────────────────────────────────────────┘      │
└────────────────┬────────────────────────────────────────┘
                 │
┌────────────────▼────────────────────────────────────────┐
│              VALIDATION LAYER                            │
├─────────────────────────────────────────────────────────┤
│  1. Verify products exist in catalog                    │
│  2. Check stock availability                            │
│  3. Validate quantities (min/max)                       │
│  4. Calculate total amount                              │
│  5. Apply business rules                                │
└────────────────┬────────────────────────────────────────┘
                 │
┌────────────────▼────────────────────────────────────────┐
│               OUTPUT LAYER                               │
├─────────────────────────────────────────────────────────┤
│  Structured Order JSON                                   │
│  {                                                       │
│    "items": [...],                                      │
│    "total": 5000,                                       │
│    "confidence": 0.95,                                  │
│    "warnings": [...],                                   │
│    "suggestions": [...]                                 │
│  }                                                       │
└─────────────────────────────────────────────────────────┘
```

---

## 3. PROMPT ENGINEERING

### 3.1 Text Order Parser Prompt

```javascript
const TEXT_ORDER_PARSER_PROMPT = {
  system: `You are an expert order parser for a B2B wholesale marketplace in Nepal.

Your task: Extract products and quantities from customer messages.

Context:
- Customers are small shop owners ordering wholesale products
- Common products: rice, flour, oil, sugar, salt, spices, snacks
- Units: kg, liter, piece, box, packet, dozen
- Languages: English, Nepali (Devanagari), Hindi, Nepali-English mix

Rules:
1. Extract ALL products mentioned with quantities
2. Normalize units (e.g., "kilo" → "kg", "litre" → "liter")
3. Handle informal language (e.g., "tel" → "oil", "chamal" → "rice")
4. If quantity is missing, ask for clarification
5. If product is unclear, suggest closest match
6. Return JSON format only

Product Catalog (for reference):
${JSON.stringify(productCatalog, null, 2)}

Output Format:
{
  "items": [
    {
      "productName": "Rice",
      "quantity": 10,
      "unit": "kg",
      "confidence": 0.95,
      "matchedProductId": "uuid-123",
      "originalText": "10 kg chamal"
    }
  ],
  "clarifications": [
    "Did you mean 'cooking oil' or 'mustard oil'?"
  ],
  "language": "nepali-english-mix"
}`,

  user: (message, userHistory) => `
Customer Message:
"${message}"

Customer's Recent Orders (for context):
${JSON.stringify(userHistory, null, 2)}

Parse this order and return JSON.
`
};
```

### 3.2 Image OCR Parser Prompt

```javascript
const IMAGE_OCR_PARSER_PROMPT = {
  system: `You are an expert at reading handwritten shopping lists and product images.

Your task: Extract products and quantities from images.

Image Types:
1. Handwritten lists (in English, Nepali, or Hindi)
2. Product photos (identify product from image)
3. Printed invoices/receipts
4. WhatsApp screenshots

Rules:
1. Read ALL text visible in the image
2. Identify products even if handwriting is unclear
3. Extract quantities (numbers + units)
4. Handle multiple languages
5. If text is unclear, mark confidence as low
6. Return structured JSON

Output Format:
{
  "items": [
    {
      "productName": "Rice",
      "quantity": 25,
      "unit": "kg",
      "confidence": 0.85,
      "originalText": "25kg चामल",
      "location": "line 1"
    }
  ],
  "imageType": "handwritten_list",
  "language": "nepali",
  "readabilityScore": 0.8,
  "warnings": [
    "Line 3 is unclear - please confirm quantity"
  ]
}`,

  user: (imageUrl) => `
Analyze this image and extract the order:
[Image URL: ${imageUrl}]

Return JSON with all products found.
`
};
```

### 3.3 Mistake Detector Prompt

```javascript
const MISTAKE_DETECTOR_PROMPT = {
  system: `You are a quality control expert for B2B wholesale orders.

Your task: Detect potential mistakes in orders before processing.

Common Mistakes:
1. Unusual quantities (e.g., 1000 kg rice for a small shop)
2. Typos in numbers (e.g., "100" instead of "10")
3. Wrong units (e.g., "100 liter rice" - should be kg)
4. Duplicate items
5. Incompatible products (e.g., "liquid rice")
6. Suspiciously large orders for new customers

Context:
- Average small shop order: 50-200 kg total
- Average order value: NPR 5,000-20,000
- New customers: typically order <NPR 10,000 first time

Rules:
1. Flag orders that deviate significantly from customer's history
2. Check if quantities make sense for the product
3. Verify units are appropriate
4. Suggest corrections if mistake is obvious
5. Don't block orders - just warn

Output Format:
{
  "hasIssues": true,
  "confidence": 0.9,
  "issues": [
    {
      "type": "unusual_quantity",
      "severity": "high",
      "item": "Rice - 500 kg",
      "reason": "Customer usually orders 20-50 kg",
      "suggestion": "Did you mean 50 kg instead of 500 kg?"
    }
  ],
  "recommendation": "confirm_with_customer"
}`,

  user: (order, customerHistory) => `
Current Order:
${JSON.stringify(order, null, 2)}

Customer History:
${JSON.stringify(customerHistory, null, 2)}

Analyze for potential mistakes and return JSON.
`
};
```

### 3.4 Repeat Order Suggester Prompt

```javascript
const REPEAT_ORDER_SUGGESTER_PROMPT = {
  system: `You are a smart assistant that helps customers remember items they usually order.

Your task: Suggest products the customer might have forgotten based on their order history.

Analysis:
1. Identify products customer orders regularly
2. Detect ordering patterns (e.g., every 2 weeks)
3. Notice if regular items are missing from current order
4. Suggest complementary products

Rules:
1. Only suggest items ordered at least 3 times before
2. Don't suggest if customer explicitly said "only these items"
3. Prioritize items ordered in last 3 orders
4. Consider time since last order
5. Be helpful, not pushy

Output Format:
{
  "suggestions": [
    {
      "productName": "Cooking Oil",
      "reason": "You usually order this every 2 weeks",
      "lastOrdered": "2024-01-15",
      "usualQuantity": "5 liter",
      "confidence": 0.85
    }
  ],
  "patterns": [
    "You typically order rice and oil together"
  ]
}`,

  user: (currentOrder, orderHistory) => `
Current Order:
${JSON.stringify(currentOrder, null, 2)}

Order History (last 10 orders):
${JSON.stringify(orderHistory, null, 2)}

Suggest items customer might have forgotten. Return JSON.
`
};
```

### 3.5 Multilingual Handler Prompt

```javascript
const MULTILINGUAL_HANDLER_PROMPT = {
  system: `You are a multilingual order parser for Nepal.

Supported Languages:
- English
- Nepali (Devanagari script)
- Hindi (Devanagari script)
- Nepali-English mix (Romanized Nepali)

Common Terms:
English → Nepali → Hindi
- Rice → चामल (chamal) → चावल (chawal)
- Oil → तेल (tel) → तेल (tel)
- Flour → पिठो (pitho) → आटा (aata)
- Sugar → चिनी (chini) → चीनी (cheeni)
- Salt → नुन (nun) → नमक (namak)

Rules:
1. Detect language automatically
2. Translate to English for processing
3. Keep original text for reference
4. Handle code-switching (mixing languages)
5. Understand informal spellings

Output Format:
{
  "detectedLanguage": "nepali-english-mix",
  "originalText": "10 kg chamal ra 5 liter tel",
  "translatedText": "10 kg rice and 5 liter oil",
  "items": [...]
}`,

  user: (message) => `
Parse this multilingual message:
"${message}"

Return JSON with language detection and translation.
`
};
```

---

## 4. IMPLEMENTATION CODE

### 4.1 Main Order Parser

```javascript
// src/services/ai/orderParser.service.js
const OpenAI = require('openai');
const logger = require('../../utils/logger');
const metrics = require('../../utils/metrics');

class OrderParserService {
  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      timeout: 30000,
      maxRetries: 2,
    });
    
    this.primaryModel = 'gpt-4o-mini';
    this.visionModel = 'gpt-4o';
    this.fallbackModel = 'gpt-3.5-turbo';
  }

  /**
   * Parse order from text message
   */
  async parseTextOrder(message, userId) {
    const startTime = Date.now();
    
    try {
      // Get user context
      const userHistory = await this.getUserHistory(userId);
      const productCatalog = await this.getProductCatalog();
      
      // Build prompt
      const systemPrompt = this.buildTextParserPrompt(productCatalog);
      const userPrompt = this.buildUserPrompt(message, userHistory);
      
      // Call OpenAI
      const response = await this.openai.chat.completions.create({
        model: this.primaryModel,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.1, // Low temperature for consistency
        response_format: { type: 'json_object' },
        max_tokens: 1000,
      });
      
      const result = JSON.parse(response.choices[0].message.content);
      
      // Log metrics
      const duration = Date.now() - startTime;
      metrics.histogram('ai.parse_text.duration', duration);
      metrics.increment('ai.parse_text.success');
      
      logger.info('Text order parsed', {
        userId,
        itemCount: result.items?.length,
        duration,
        model: this.primaryModel,
      });
      
      return {
        success: true,
        data: result,
        confidence: this.calculateConfidence(result),
        model: this.primaryModel,
        tokensUsed: response.usage.total_tokens,
      };
      
    } catch (error) {
      logger.error('Text parsing failed', { error: error.message, userId });
      metrics.increment('ai.parse_text.error');
      
      // Try fallback
      return await this.fallbackTextParser(message, userId);
    }
  }

  /**
   * Parse order from image
   */
  async parseImageOrder(imageUrl, userId) {
    const startTime = Date.now();
    
    try {
      const response = await this.openai.chat.completions.create({
        model: this.visionModel,
        messages: [
          {
            role: 'system',
            content: IMAGE_OCR_PARSER_PROMPT.system
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Extract all products and quantities from this image:'
              },
              {
                type: 'image_url',
                image_url: { url: imageUrl }
              }
            ]
          }
        ],
        temperature: 0.1,
        response_format: { type: 'json_object' },
        max_tokens: 1500,
      });
      
      const result = JSON.parse(response.choices[0].message.content);
      
      const duration = Date.now() - startTime;
      metrics.histogram('ai.parse_image.duration', duration);
      metrics.increment('ai.parse_image.success');
      
      logger.info('Image order parsed', {
        userId,
        itemCount: result.items?.length,
        readabilityScore: result.readabilityScore,
        duration,
      });
      
      return {
        success: true,
        data: result,
        confidence: result.readabilityScore || 0.5,
        model: this.visionModel,
        tokensUsed: response.usage.total_tokens,
      };
      
    } catch (error) {
      logger.error('Image parsing failed', { error: error.message, userId });
      metrics.increment('ai.parse_image.error');
      
      // Try Google Vision API as fallback
      return await this.fallbackImageParser(imageUrl, userId);
    }
  }

  /**
   * Detect mistakes in order
   */
  async detectMistakes(order, userId) {
    try {
      const customerHistory = await this.getCustomerHistory(userId);
      
      const response = await this.openai.chat.completions.create({
        model: this.primaryModel,
        messages: [
          {
            role: 'system',
            content: MISTAKE_DETECTOR_PROMPT.system
          },
          {
            role: 'user',
            content: MISTAKE_DETECTOR_PROMPT.user(order, customerHistory)
          }
        ],
        temperature: 0.2,
        response_format: { type: 'json_object' },
        max_tokens: 800,
      });
      
      const result = JSON.parse(response.choices[0].message.content);
      
      metrics.increment('ai.detect_mistakes.success');
      
      return result;
      
    } catch (error) {
      logger.error('Mistake detection failed', { error: error.message });
      metrics.increment('ai.detect_mistakes.error');
      
      // Return safe default (no issues detected)
      return {
        hasIssues: false,
        confidence: 0,
        issues: [],
        recommendation: 'proceed'
      };
    }
  }

  /**
   * Suggest repeat orders
   */
  async suggestRepeatOrders(currentOrder, userId) {
    try {
      const orderHistory = await this.getOrderHistory(userId, 10);
      
      const response = await this.openai.chat.completions.create({
        model: this.primaryModel,
        messages: [
          {
            role: 'system',
            content: REPEAT_ORDER_SUGGESTER_PROMPT.system
          },
          {
            role: 'user',
            content: REPEAT_ORDER_SUGGESTER_PROMPT.user(currentOrder, orderHistory)
          }
        ],
        temperature: 0.3,
        response_format: { type: 'json_object' },
        max_tokens: 600,
      });
      
      const result = JSON.parse(response.choices[0].message.content);
      
      metrics.increment('ai.suggest_repeat.success');
      
      return result;
      
    } catch (error) {
      logger.error('Repeat order suggestion failed', { error: error.message });
      metrics.increment('ai.suggest_repeat.error');
      
      return {
        suggestions: [],
        patterns: []
      };
    }
  }

  /**
   * Fallback: Rule-based text parser
   */
  async fallbackTextParser(message, userId) {
    logger.warn('Using fallback text parser', { userId });
    
    try {
      // Simple regex-based extraction
      const items = [];
      const lines = message.split('\n');
      
      for (const line of lines) {
        // Match patterns like "10 kg rice" or "5 liter oil"
        const match = line.match(/(\d+)\s*(kg|kilo|liter|litre|piece|box|packet)\s+(.+)/i);
        
        if (match) {
          items.push({
            quantity: parseInt(match[1]),
            unit: this.normalizeUnit(match[2]),
            productName: match[3].trim(),
            confidence: 0.6,
            matchedProductId: null,
            originalText: line
          });
        }
      }
      
      return {
        success: true,
        data: {
          items,
          clarifications: items.length === 0 ? 
            ['Could not parse order. Please use format: "10 kg rice"'] : [],
          language: 'unknown'
        },
        confidence: 0.6,
        model: 'rule-based-fallback',
        tokensUsed: 0,
      };
      
    } catch (error) {
      logger.error('Fallback parser failed', { error: error.message });
      
      return {
        success: false,
        error: 'Could not parse order',
        data: null,
      };
    }
  }

  /**
   * Fallback: Google Vision API for OCR
   */
  async fallbackImageParser(imageUrl, userId) {
    logger.warn('Using Google Vision API fallback', { userId });
    
    try {
      const vision = require('@google-cloud/vision');
      const client = new vision.ImageAnnotatorClient();
      
      const [result] = await client.textDetection(imageUrl);
      const text = result.textAnnotations[0]?.description || '';
      
      // Parse extracted text using text parser
      return await this.parseTextOrder(text, userId);
      
    } catch (error) {
      logger.error('Google Vision fallback failed', { error: error.message });
      
      return {
        success: false,
        error: 'Could not read image',
        data: null,
      };
    }
  }

  /**
   * Helper: Calculate confidence score
   */
  calculateConfidence(result) {
    if (!result.items || result.items.length === 0) return 0;
    
    const avgConfidence = result.items.reduce((sum, item) => 
      sum + (item.confidence || 0), 0) / result.items.length;
    
    // Reduce confidence if there are clarifications needed
    const clarificationPenalty = result.clarifications?.length * 0.1 || 0;
    
    return Math.max(0, Math.min(1, avgConfidence - clarificationPenalty));
  }

  /**
   * Helper: Normalize units
   */
  normalizeUnit(unit) {
    const normalized = {
      'kilo': 'kg',
      'litre': 'liter',
      'pcs': 'piece',
      'pc': 'piece',
      'pkt': 'packet',
      'dz': 'dozen',
    };
    
    return normalized[unit.toLowerCase()] || unit.toLowerCase();
  }

  /**
   * Helper: Get user history
   */
  async getUserHistory(userId) {
    // Fetch last 5 orders
    const orders = await prisma.order.findMany({
      where: { buyerId: userId },
      include: { items: true },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });
    
    return orders;
  }

  /**
   * Helper: Get product catalog
   */
  async getProductCatalog() {
    // Fetch active products (cached)
    const cached = await redis.get('product:catalog');
    if (cached) return JSON.parse(cached);
    
    const products = await prisma.product.findMany({
      where: { status: 'ACTIVE' },
      select: {
        id: true,
        name: true,
        category: true,
        unit: true,
        price: true,
      },
    });
    
    await redis.setex('product:catalog', 3600, JSON.stringify(products));
    
    return products;
  }
}

module.exports = new OrderParserService();
```

---

## 5. FALLBACK HANDLING (3-Tier System)

### Tier 1: Primary AI (GPT-4o-mini)
```javascript
async function parseOrder(message, userId) {
  try {
    // Try primary model
    const result = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [...],
      timeout: 30000,
    });
    
    return {
      success: true,
      data: result,
      tier: 1,
      model: 'gpt-4o-mini'
    };
    
  } catch (error) {
    logger.warn('Tier 1 failed, trying Tier 2', { error: error.message });
    return await tier2Fallback(message, userId);
  }
}
```

### Tier 2: Fallback AI (GPT-3.5-turbo)
```javascript
async function tier2Fallback(message, userId) {
  try {
    // Try cheaper/faster model
    const result = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [...],
      timeout: 20000,
    });
    
    metrics.increment('ai.fallback.tier2');
    
    return {
      success: true,
      data: result,
      tier: 2,
      model: 'gpt-3.5-turbo'
    };
    
  } catch (error) {
    logger.warn('Tier 2 failed, trying Tier 3', { error: error.message });
    return await tier3Fallback(message, userId);
  }
}
```

### Tier 3: Rule-Based Parser (No AI)
```javascript
async function tier3Fallback(message, userId) {
  logger.warn('Using rule-based fallback', { userId });
  metrics.increment('ai.fallback.tier3');
  
  try {
    const items = [];
    const lines = message.split('\n');
    
    // Regex patterns for common formats
    const patterns = [
      /(\d+)\s*(kg|kilo|kilogram)\s+(.+)/i,
      /(\d+)\s*(l|liter|litre)\s+(.+)/i,
      /(\d+)\s*(piece|pcs|pc)\s+(.+)/i,
      /(\d+)\s*(box|packet|pkt)\s+(.+)/i,
    ];
    
    for (const line of lines) {
      for (const pattern of patterns) {
        const match = line.match(pattern);
        if (match) {
          items.push({
            quantity: parseInt(match[1]),
            unit: normalizeUnit(match[2]),
            productName: match[3].trim(),
            confidence: 0.6,
            matchedProductId: await fuzzyMatchProduct(match[3]),
            originalText: line,
          });
          break;
        }
      }
    }
    
    if (items.length === 0) {
      // Last resort: ask user to reformat
      return {
        success: false,
        error: 'Could not parse order',
        suggestion: 'Please use format: "10 kg rice" (one item per line)',
        tier: 3,
      };
    }
    
    return {
      success: true,
      data: {
        items,
        clarifications: ['Parsed using basic rules - please verify'],
        language: 'unknown'
      },
      tier: 3,
      model: 'rule-based',
    };
    
  } catch (error) {
    logger.error('All tiers failed', { error: error.message });
    
    return {
      success: false,
      error: 'System error - please try again',
      tier: 3,
    };
  }
}
```

### Fallback Decision Tree
```
┌─────────────────┐
│  Parse Request  │
└────────┬────────┘
         │
    ┌────▼────┐
    │ Tier 1  │ GPT-4o-mini
    │ Success?│
    └────┬────┘
         │
    ┌────▼────┐
    │   No    │
    └────┬────┘
         │
    ┌────▼────┐
    │ Tier 2  │ GPT-3.5-turbo
    │ Success?│
    └────┬────┘
         │
    ┌────▼────┐
    │   No    │
    └────┬────┘
         │
    ┌────▼────┐
    │ Tier 3  │ Rule-based
    │ Success?│
    └────┬────┘
         │
    ┌────▼────┐
    │   No    │
    └────┬────┘
         │
    ┌────▼────────────┐
    │ Ask User to     │
    │ Reformat Message│
    └─────────────────┘
```

---

## 6. ERROR HANDLING & RECOVERY

### 6.1 Timeout Handling
```javascript
const TIMEOUTS = {
  tier1: 30000, // 30s for GPT-4o-mini
  tier2: 20000, // 20s for GPT-3.5-turbo
  tier3: 5000,  // 5s for rule-based
};

async function parseWithTimeout(fn, timeout, tier) {
  return Promise.race([
    fn(),
    new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Timeout')), timeout)
    )
  ]).catch(error => {
    logger.warn(`Tier ${tier} timeout`, { error: error.message });
    metrics.increment(`ai.timeout.tier${tier}`);
    throw error;
  });
}
```

### 6.2 Rate Limit Handling
```javascript
class RateLimitHandler {
  constructor() {
    this.queue = [];
    this.processing = false;
    this.maxRetries = 3;
    this.retryDelay = 1000; // 1s
  }
  
  async enqueue(request) {
    this.queue.push(request);
    
    if (!this.processing) {
      this.processQueue();
    }
    
    return request.promise;
  }
  
  async processQueue() {
    this.processing = true;
    
    while (this.queue.length > 0) {
      const request = this.queue.shift();
      
      try {
        const result = await this.executeWithRetry(request);
        request.resolve(result);
      } catch (error) {
        request.reject(error);
      }
      
      // Rate limit: 60 requests per minute
      await this.sleep(1000);
    }
    
    this.processing = false;
  }
  
  async executeWithRetry(request, attempt = 1) {
    try {
      return await request.fn();
    } catch (error) {
      if (error.status === 429 && attempt < this.maxRetries) {
        // Rate limited - wait and retry
        const delay = this.retryDelay * Math.pow(2, attempt);
        logger.warn(`Rate limited, retrying in ${delay}ms`, { attempt });
        
        await this.sleep(delay);
        return await this.executeWithRetry(request, attempt + 1);
      }
      
      throw error;
    }
  }
  
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
```

### 6.3 Invalid Response Handling
```javascript
function validateAIResponse(response) {
  try {
    const data = JSON.parse(response);
    
    // Check required fields
    if (!data.items || !Array.isArray(data.items)) {
      throw new Error('Missing items array');
    }
    
    // Validate each item
    for (const item of data.items) {
      if (!item.productName || !item.quantity) {
        throw new Error('Invalid item structure');
      }
      
      if (item.quantity <= 0 || item.quantity > 10000) {
        throw new Error('Invalid quantity');
      }
    }
    
    return { valid: true, data };
    
  } catch (error) {
    logger.error('Invalid AI response', { error: error.message, response });
    metrics.increment('ai.invalid_response');
    
    return { valid: false, error: error.message };
  }
}
```

---

## 7. TESTING & VALIDATION

### 7.1 Test Cases

```javascript
const TEST_CASES = [
  // English
  {
    input: "10 kg rice, 5 liter oil, 2 kg sugar",
    expected: {
      items: [
        { productName: "Rice", quantity: 10, unit: "kg" },
        { productName: "Oil", quantity: 5, unit: "liter" },
        { productName: "Sugar", quantity: 2, unit: "kg" }
      ]
    }
  },
  
  // Nepali
  {
    input: "१० किलो चामल, ५ लिटर तेल",
    expected: {
      items: [
        { productName: "Rice", quantity: 10, unit: "kg" },
        { productName: "Oil", quantity: 5, unit: "liter" }
      ]
    }
  },
  
  // Mixed language
  {
    input: "10 kg chamal ra 5 liter tel",
    expected: {
      items: [
        { productName: "Rice", quantity: 10, unit: "kg" },
        { productName: "Oil", quantity: 5, unit: "liter" }
      ]
    }
  },
  
  // Informal
  {
    input: "rice 10kg\noil 5L\nsugar 2kilo",
    expected: {
      items: [
        { productName: "Rice", quantity: 10, unit: "kg" },
        { productName: "Oil", quantity: 5, unit: "liter" },
        { productName: "Sugar", quantity: 2, unit: "kg" }
      ]
    }
  },
  
  // Ambiguous (should ask for clarification)
  {
    input: "10 oil",
    expected: {
      clarifications: ["Did you mean 10 kg or 10 liter of oil?"]
    }
  },
];

// Run tests
async function runTests() {
  let passed = 0;
  let failed = 0;
  
  for (const test of TEST_CASES) {
    try {
      const result = await orderParser.parseTextOrder(test.input, 'test-user');
      
      if (validateResult(result.data, test.expected)) {
        passed++;
        console.log(`✅ PASS: ${test.input}`);
      } else {
        failed++;
        console.log(`❌ FAIL: ${test.input}`);
        console.log('Expected:', test.expected);
        console.log('Got:', result.data);
      }
    } catch (error) {
      failed++;
      console.log(`❌ ERROR: ${test.input}`, error.message);
    }
  }
  
  console.log(`\nResults: ${passed} passed, ${failed} failed`);
}
```

### 7.2 Accuracy Metrics

```javascript
class AccuracyTracker {
  async trackParsing(input, aiResult, userFeedback) {
    // Store for analysis
    await prisma.aiAccuracyLog.create({
      data: {
        input,
        aiResult: JSON.stringify(aiResult),
        userFeedback: JSON.stringify(userFeedback),
        wasCorrect: this.compareResults(aiResult, userFeedback),
        model: aiResult.model,
        confidence: aiResult.confidence,
        createdAt: new Date(),
      }
    });
    
    // Update metrics
    if (this.compareResults(aiResult, userFeedback)) {
      metrics.increment('ai.accuracy.correct');
    } else {
      metrics.increment('ai.accuracy.incorrect');
    }
  }
  
  async getAccuracyReport(days = 7) {
    const logs = await prisma.aiAccuracyLog.findMany({
      where: {
        createdAt: {
          gte: new Date(Date.now() - days * 24 * 60 * 60 * 1000)
        }
      }
    });
    
    const total = logs.length;
    const correct = logs.filter(log => log.wasCorrect).length;
    const accuracy = total > 0 ? (correct / total) * 100 : 0;
    
    return {
      total,
      correct,
      incorrect: total - correct,
      accuracy: accuracy.toFixed(2) + '%',
      byModel: this.groupByModel(logs),
      byLanguage: this.groupByLanguage(logs),
    };
  }
}
```

---

## 8. COST OPTIMIZATION

### 8.1 Token Usage Optimization

```javascript
// ❌ BAD: Sending entire product catalog every time
const systemPrompt = `
Product Catalog:
${JSON.stringify(allProducts)} // 10,000 tokens!
`;

// ✅ GOOD: Send only relevant products
const systemPrompt = `
Relevant Products (based on user history):
${JSON.stringify(relevantProducts.slice(0, 20))} // 500 tokens
`;
```

### 8.2 Caching Strategy

```javascript
// Cache parsed results for duplicate messages
async function parseWithCache(message, userId) {
  const cacheKey = `parse:${userId}:${hashMessage(message)}`;
  
  // Check cache
  const cached = await redis.get(cacheKey);
  if (cached) {
    metrics.increment('ai.cache.hit');
    return JSON.parse(cached);
  }
  
  // Parse with AI
  const result = await orderParser.parseTextOrder(message, userId);
  
  // Cache for 1 hour
  await redis.setex(cacheKey, 3600, JSON.stringify(result));
  metrics.increment('ai.cache.miss');
  
  return result;
}
```

### 8.3 Batch Processing

```javascript
// Process multiple orders in one API call
async function batchParse(messages) {
  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: 'Parse multiple orders. Return array of results.'
      },
      {
        role: 'user',
        content: JSON.stringify(messages)
      }
    ]
  });
  
  return JSON.parse(response.choices[0].message.content);
}
```

### 8.4 Cost Tracking

```javascript
class CostTracker {
  async trackUsage(model, tokensUsed, operation) {
    const costs = {
      'gpt-4o-mini': 0.15 / 1000000,      // $0.15 per 1M tokens
      'gpt-4o': 2.50 / 1000000,            // $2.50 per 1M tokens
      'gpt-3.5-turbo': 0.50 / 1000000,    // $0.50 per 1M tokens
    };
    
    const cost = tokensUsed * costs[model];
    
    await prisma.aiCostLog.create({
      data: {
        model,
        tokensUsed,
        cost,
        operation,
        createdAt: new Date(),
      }
    });
    
    metrics.histogram('ai.cost', cost, { model, operation });
  }
  
  async getDailyCost() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const logs = await prisma.aiCostLog.findMany({
      where: { createdAt: { gte: today } }
    });
    
    const totalCost = logs.reduce((sum, log) => sum + log.cost, 0);
    const totalTokens = logs.reduce((sum, log) => sum + log.tokensUsed, 0);
    
    return {
      date: today.toISOString().split('T')[0],
      totalCost: totalCost.toFixed(4),
      totalTokens,
      byModel: this.groupByModel(logs),
      byOperation: this.groupByOperation(logs),
    };
  }
}
```

---

## 9. MONITORING & ALERTS

### 9.1 Key Metrics

```javascript
// Track these metrics
metrics.histogram('ai.parse_text.duration', duration);
metrics.histogram('ai.parse_image.duration', duration);
metrics.increment('ai.parse_text.success');
metrics.increment('ai.parse_text.error');
metrics.increment('ai.fallback.tier2');
metrics.increment('ai.fallback.tier3');
metrics.histogram('ai.confidence', confidence);
metrics.histogram('ai.cost', cost);
metrics.increment('ai.cache.hit');
metrics.increment('ai.cache.miss');
```

### 9.2 Alerts

```javascript
// Alert if error rate > 5%
if (errorRate > 0.05) {
  await alerting.send({
    severity: 'P1',
    title: 'High AI Error Rate',
    message: `AI parsing error rate: ${(errorRate * 100).toFixed(2)}%`,
    details: {
      errorRate,
      totalRequests,
      failedRequests,
    }
  });
}

// Alert if cost > budget
if (dailyCost > DAILY_BUDGET) {
  await alerting.send({
    severity: 'P2',
    title: 'AI Cost Budget Exceeded',
    message: `Daily cost: $${dailyCost.toFixed(2)} (budget: $${DAILY_BUDGET})`,
  });
}

// Alert if confidence < 0.7
if (avgConfidence < 0.7) {
  await alerting.send({
    severity: 'P2',
    title: 'Low AI Confidence',
    message: `Average confidence: ${(avgConfidence * 100).toFixed(2)}%`,
  });
}
```

---

## 10. SUMMARY

### Key Features Implemented
✅ Text order extraction (multilingual)
✅ Image OCR (handwritten + printed)
✅ Mistake detection
✅ Repeat order suggestions
✅ 3-tier fallback system
✅ Cost optimization
✅ Accuracy tracking
✅ Error handling

### Cost Estimate
- **Text parsing**: $0.15 per 1,000 orders
- **Image parsing**: $0.30 per 1,000 orders
- **Total**: $0.20-0.30 per 1,000 orders (mixed)

### Performance Targets
- **Accuracy**: >95% for text, >90% for images
- **Response time**: <2s for text, <5s for images
- **Availability**: 99.9% (with fallbacks)

### Next Steps
1. Implement core parser service
2. Add multilingual support
3. Train on real customer data
4. Monitor accuracy metrics
5. Optimize prompts based on feedback
6. Add voice input support (future)

**Ready to build an intelligent AI ordering assistant!** 🤖
