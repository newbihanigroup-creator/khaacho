/**
 * Multi-Modal Order Parser Service
 * 
 * Handles order parsing from multiple input types:
 * - Text orders
 * - Voice messages (future-ready)
 * - Image orders (OCR output)
 * 
 * Features:
 * - Product name normalization
 * - Quantity unit detection and conversion
 * - Incomplete order handling with automatic clarification
 */

const prisma = require('../config/database');
const logger = require('../shared/logger');
const { v4: uuidv4 } = require('uuid');

class MultiModalOrderParserService {
  constructor() {
    this.productAliasCache = new Map();
    this.unitMappingCache = new Map();
  }

  /**
   * Parse order from any input type
   */
  async parseOrder(input) {
    const {
      inputType, // TEXT, VOICE, IMAGE, OCR
      rawInput,
      retailerId,
      inputMetadata = {},
    } = input;

    const sessionId = uuidv4();
    const startTime = Date.now();

    try {
      logger.info('Starting order parsing', {
        sessionId,
        inputType,
        retailerId,
      });

      // Create parsing session
      const session = await prisma.orderParsingSessions.create({
        data: {
          sessionId,
          retailerId,
          inputType,
          rawInput,
          inputMetadata,
          status: 'PARSING',
          startedAt: new Date(),
        },
      });

      // Parse based on input type
      let parsedItems;
      
      switch (inputType) {
        case 'TEXT':
          parsedItems = await this.parseTextOrder(rawInput);
          break;
        case 'VOICE':
          parsedItems = await this.parseVoiceOrder(rawInput, inputMetadata);
          break;
        case 'IMAGE':
        case 'OCR':
          parsedItems = await this.parseImageOrder(rawInput, inputMetadata);
          break;
        default:
          throw new Error(`Unsupported input type: ${inputType}`);
      }

      // Normalize items
      const normalizedItems = await this.normalizeItems(parsedItems);

      // Check for clarifications needed
      const clarifications = await this.checkClarificationsNeeded(normalizedItems);

      // Calculate confidence
      const confidence = this.calculateConfidence(normalizedItems, clarifications);

      // Update session
      const processingTime = Date.now() - startTime;
      
      await prisma.orderParsingSessions.update({
        where: { id: session.id },
        data: {
          parsedItems,
          normalizedItems,
          confidenceScore: confidence,
          needsClarification: clarifications.length > 0,
          clarificationQuestions: clarifications,
          status: clarifications.length > 0 ? 'NEEDS_CLARIFICATION' : 'COMPLETED',
          processingTimeMs: processingTime,
          completedAt: clarifications.length === 0 ? new Date() : null,
          updatedAt: new Date(),
        },
      });

      // Record analytics
      await this.recordParsingAnalytics(inputType, true, confidence, processingTime);

      logger.info('Order parsing completed', {
        sessionId,
        itemCount: normalizedItems.length,
        confidence,
        needsClarification: clarifications.length > 0,
      });

      return {
        success: true,
        sessionId,
        items: normalizedItems,
        confidence,
        needsClarification: clarifications.length > 0,
        clarifications,
        processingTime,
      };
    } catch (error) {
      logger.error('Order parsing failed', {
        sessionId,
        inputType,
        error: error.message,
      });

      await this.recordParsingAnalytics(inputType, false, 0, Date.now() - startTime);

      throw error;
    }
  }

  /**
   * Parse text order
   */
  async parseTextOrder(text) {
    const items = [];
    const lines = text.split('\n').filter(line => line.trim());

    for (const line of lines) {
      const item = this.parseTextLine(line);
      if (item) {
        items.push(item);
      }
    }

    return items;
  }

  /**
   * Parse single text line
   */
  parseTextLine(line) {
    // Pattern: "product x quantity unit" or "quantity unit product"
    const patterns = [
      // "rice 5 kg" or "rice x 5 kg"
      /^(.+?)\s*[xX×]\s*(\d+(?:\.\d+)?)\s*([a-zA-Z]+)?\s*$/,
      // "5 kg rice"
      /^(\d+(?:\.\d+)?)\s*([a-zA-Z]+)?\s+(.+)$/,
      // "rice - 5 kg"
      /^(.+?)\s*[-:]\s*(\d+(?:\.\d+)?)\s*([a-zA-Z]+)?\s*$/,
    ];

    for (const pattern of patterns) {
      const match = line.trim().match(pattern);
      
      if (match) {
        let productName, quantity, unit;
        
        if (pattern.source.startsWith('^(.+?)')) {
          // Product first
          [, productName, quantity, unit] = match;
        } else {
          // Quantity first
          [, quantity, unit, productName] = match;
        }

        return {
          rawText: line,
          productName: productName?.trim(),
          quantity: parseFloat(quantity),
          unit: unit?.trim() || 'piece',
          confidence: 80,
        };
      }
    }

    // Fallback: treat as product name only
    return {
      rawText: line,
      productName: line.trim(),
      quantity: null,
      unit: null,
      confidence: 40,
    };
  }

  /**
   * Parse voice order (future-ready)
   */
  async parseVoiceOrder(audioText, metadata) {
    // For now, treat transcribed voice as text
    // Future: Add voice-specific processing (filler words, speech patterns)
    
    logger.info('Parsing voice order', { metadata });
    
    // Clean up common speech patterns
    let cleanedText = audioText
      .replace(/\b(um|uh|like|you know)\b/gi, '')
      .replace(/\s+/g, ' ')
      .trim();

    return await this.parseTextOrder(cleanedText);
  }

  /**
   * Parse image order (OCR output)
   */
  async parseImageOrder(ocrText, metadata) {
    logger.info('Parsing image order', { metadata });

    // OCR text often has formatting issues
    let cleanedText = ocrText
      .replace(/[|]/g, '') // Remove table borders
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();

    return await this.parseTextOrder(cleanedText);
  }

  /**
   * Normalize items (product names and units)
   */
  async normalizeItems(items) {
    const normalized = [];

    for (const item of items) {
      const normalizedItem = await this.normalizeItem(item);
      normalized.push(normalizedItem);
    }

    return normalized;
  }

  /**
   * Normalize single item
   */
  async normalizeItem(item) {
    const normalized = { ...item };

    // Normalize product name
    if (item.productName) {
      const productMatch = await this.normalizeProductName(item.productName);
      
      if (productMatch) {
        normalized.productId = productMatch.product_id;
        normalized.normalizedProductName = productMatch.product_name;
        normalized.aliasUsed = productMatch.alias_used;
        normalized.productConfidence = parseFloat(productMatch.confidence);
        
        // Record alias usage
        await this.recordAliasUsage(productMatch.alias_used);
      } else {
        normalized.productId = null;
        normalized.normalizedProductName = item.productName;
        normalized.productConfidence = 30;
      }
    }

    // Normalize unit
    if (item.unit) {
      const unitMatch = await this.normalizeUnit(item.unit);
      
      if (unitMatch) {
        normalized.standardUnit = unitMatch.standard_unit;
        normalized.unitType = unitMatch.unit_type;
        normalized.conversionFactor = parseFloat(unitMatch.conversion_factor);
        normalized.normalizedQuantity = item.quantity * normalized.conversionFactor;
      } else {
        normalized.standardUnit = item.unit;
        normalized.normalizedQuantity = item.quantity;
      }
    }

    // Update overall confidence
    normalized.confidence = this.calculateItemConfidence(normalized);

    return normalized;
  }

  /**
   * Normalize product name using aliases
   */
  async normalizeProductName(productName) {
    // Check cache
    const cacheKey = productName.toLowerCase();
    if (this.productAliasCache.has(cacheKey)) {
      return this.productAliasCache.get(cacheKey);
    }

    try {
      const result = await prisma.$queryRaw`
        SELECT * FROM normalize_product_name(${productName})
      `;

      const match = result[0] || null;
      
      // Cache result
      if (match) {
        this.productAliasCache.set(cacheKey, match);
      }

      return match;
    } catch (error) {
      logger.error('Failed to normalize product name', {
        productName,
        error: error.message,
      });
      return null;
    }
  }

  /**
   * Normalize quantity unit
   */
  async normalizeUnit(unit) {
    // Check cache
    const cacheKey = unit.toLowerCase();
    if (this.unitMappingCache.has(cacheKey)) {
      return this.unitMappingCache.get(cacheKey);
    }

    try {
      const result = await prisma.$queryRaw`
        SELECT * FROM normalize_quantity_unit(${unit})
      `;

      const match = result[0] || null;
      
      // Cache result
      if (match) {
        this.unitMappingCache.set(cacheKey, match);
      }

      return match;
    } catch (error) {
      logger.error('Failed to normalize unit', {
        unit,
        error: error.message,
      });
      return null;
    }
  }

  /**
   * Record alias usage
   */
  async recordAliasUsage(aliasName) {
    try {
      await prisma.$queryRaw`
        SELECT record_alias_usage(${aliasName})
      `;
    } catch (error) {
      logger.error('Failed to record alias usage', {
        aliasName,
        error: error.message,
      });
    }
  }

  /**
   * Check if clarifications are needed
   */
  async checkClarificationsNeeded(items) {
    const clarifications = [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i];

      // Missing quantity
      if (!item.quantity || item.quantity <= 0) {
        clarifications.push({
          type: 'MISSING_QUANTITY',
          itemIndex: i,
          question: `How many ${item.normalizedProductName || item.productName} do you need?`,
          context: { item },
        });
      }

      // Ambiguous product (low confidence)
      if (!item.productId || item.productConfidence < 60) {
        clarifications.push({
          type: 'AMBIGUOUS_PRODUCT',
          itemIndex: i,
          question: `Did you mean "${item.normalizedProductName || item.productName}"? Please confirm or provide the correct product name.`,
          context: { item },
        });
      }

      // Invalid or missing unit
      if (!item.standardUnit && item.quantity) {
        clarifications.push({
          type: 'INVALID_UNIT',
          itemIndex: i,
          question: `What unit for ${item.normalizedProductName || item.productName}? (kg, litre, packet, etc.)`,
          context: { item },
        });
      }
    }

    return clarifications;
  }

  /**
   * Calculate item confidence
   */
  calculateItemConfidence(item) {
    let confidence = 100;

    // Reduce confidence for missing data
    if (!item.productId) confidence -= 30;
    if (!item.quantity) confidence -= 20;
    if (!item.standardUnit) confidence -= 10;

    // Factor in product confidence
    if (item.productConfidence) {
      confidence = (confidence + item.productConfidence) / 2;
    }

    return Math.max(0, Math.min(100, confidence));
  }

  /**
   * Calculate overall confidence
   */
  calculateConfidence(items, clarifications) {
    if (items.length === 0) return 0;

    const avgItemConfidence = items.reduce((sum, item) => sum + item.confidence, 0) / items.length;
    
    // Reduce confidence based on clarifications needed
    const clarificationPenalty = clarifications.length * 10;
    
    return Math.max(0, Math.min(100, avgItemConfidence - clarificationPenalty));
  }

  /**
   * Submit clarification responses
   */
  async submitClarifications(sessionId, responses) {
    try {
      const session = await prisma.orderParsingSessions.findUnique({
        where: { sessionId },
      });

      if (!session) {
        throw new Error('Session not found');
      }

      // Update items based on responses
      const updatedItems = await this.applyClarifications(
        session.normalizedItems,
        session.clarificationQuestions,
        responses
      );

      // Recalculate confidence
      const confidence = this.calculateConfidence(updatedItems, []);

      // Update session
      await prisma.orderParsingSessions.update({
        where: { id: session.id },
        data: {
          clarificationResponses: responses,
          clarificationCount: session.clarificationCount + 1,
          normalizedItems: updatedItems,
          confidenceScore: confidence,
          needsClarification: false,
          status: 'COMPLETED',
          completedAt: new Date(),
          updatedAt: new Date(),
        },
      });

      logger.info('Clarifications applied', {
        sessionId,
        responseCount: responses.length,
        newConfidence: confidence,
      });

      return {
        success: true,
        items: updatedItems,
        confidence,
      };
    } catch (error) {
      logger.error('Failed to submit clarifications', {
        sessionId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Apply clarification responses to items
   */
  async applyClarifications(items, questions, responses) {
    const updated = [...items];

    for (const response of responses) {
      const question = questions.find(q => q.itemIndex === response.itemIndex);
      
      if (!question) continue;

      const item = updated[response.itemIndex];

      switch (question.type) {
        case 'MISSING_QUANTITY':
          item.quantity = parseFloat(response.answer);
          item.normalizedQuantity = item.quantity * (item.conversionFactor || 1);
          break;

        case 'AMBIGUOUS_PRODUCT':
          // Re-normalize with confirmed name
          const normalized = await this.normalizeItem({
            ...item,
            productName: response.answer,
          });
          Object.assign(item, normalized);
          break;

        case 'INVALID_UNIT':
          const unitMatch = await this.normalizeUnit(response.answer);
          if (unitMatch) {
            item.standardUnit = unitMatch.standard_unit;
            item.unitType = unitMatch.unit_type;
            item.conversionFactor = parseFloat(unitMatch.conversion_factor);
            item.normalizedQuantity = item.quantity * item.conversionFactor;
          }
          break;
      }

      // Recalculate item confidence
      item.confidence = this.calculateItemConfidence(item);
    }

    return updated;
  }

  /**
   * Record parsing analytics
   */
  async recordParsingAnalytics(inputType, success, confidence, processingTime) {
    try {
      const now = new Date();
      const hourBucket = new Date(now);
      hourBucket.setMinutes(0, 0, 0);

      const inputTypeField = `${inputType.toLowerCase()}Orders`;
      const successField = success ? 'successfulParses' : 'failedParses';

      await prisma.parsingAnalytics.upsert({
        where: { hourBucket },
        create: {
          metricTimestamp: now,
          hourBucket,
          [inputTypeField]: 1,
          [successField]: 1,
          avgConfidenceScore: confidence,
          avgProcessingTimeMs: processingTime,
        },
        update: {
          [inputTypeField]: { increment: 1 },
          [successField]: { increment: 1 },
        },
      });
    } catch (error) {
      logger.error('Failed to record parsing analytics', {
        error: error.message,
      });
    }
  }

  /**
   * Get parsing session
   */
  async getSession(sessionId) {
    return await prisma.orderParsingSessions.findUnique({
      where: { sessionId },
    });
  }

  /**
   * Add product alias
   */
  async addProductAlias(productId, aliasName, aliasType = 'COMMON_NAME') {
    try {
      const alias = await prisma.productNameAliases.create({
        data: {
          productId,
          aliasName,
          aliasType,
          confidenceScore: 100,
          isActive: true,
          verified: true,
        },
      });

      // Clear cache
      this.productAliasCache.delete(aliasName.toLowerCase());

      logger.info('Product alias added', {
        productId,
        aliasName,
        aliasType,
      });

      return alias;
    } catch (error) {
      logger.error('Failed to add product alias', {
        productId,
        aliasName,
        error: error.message,
      });
      throw error;
    }
  }
}

module.exports = new MultiModalOrderParserService();
