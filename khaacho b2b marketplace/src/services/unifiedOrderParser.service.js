const prisma = require('../config/database');
const logger = require('../shared/logger');
const productMatcher = require('./productMatcher.service');

/**
 * Unified Order Parser Service
 * 
 * Handles order parsing from multiple input sources:
 * - WhatsApp text messages
 * - OCR extracted text from images
 * 
 * Features:
 * - Normalizes inputs into structured format
 * - Handles spelling mistakes and local variations
 * - Confidence scoring (0-100)
 * - Asks clarification only if confidence < 80%
 * - Stores raw input and parsed output
 */

class UnifiedOrderParserService {
  constructor() {
    // Confidence thresholds
    this.thresholds = {
      autoAccept: 80, // Auto-accept if confidence >= 80%
      needsReview: 50, // Needs review if confidence >= 50% and < 80%
      reject: 50, // Reject if confidence < 50%
    };

    // Common spelling variations and local terms (Nepal context)
    this.spellingVariations = {
      // Rice variations
      'chamal': 'rice',
      'chaamal': 'rice',
      'chawal': 'rice',
      'bhat': 'rice',
      
      // Dal variations
      'daal': 'dal',
      'dhal': 'dal',
      'lentil': 'dal',
      'lentils': 'dal',
      
      // Oil variations
      'tel': 'oil',
      'tail': 'oil',
      '0il': 'oil', // OCR error
      
      // Sugar variations
      'chini': 'sugar',
      'cheeni': 'sugar',
      
      // Salt variations
      'nun': 'salt',
      'noon': 'salt',
      'namak': 'salt',
      
      // Common OCR errors
      '0': 'o',
      '1': 'l',
      '5': 's',
    };

    // Unit normalization
    this.unitMap = {
      'kilogram': 'kg',
      'kilograms': 'kg',
      'kgs': 'kg',
      'kilo': 'kg',
      'gram': 'g',
      'grams': 'g',
      'gms': 'g',
      'liter': 'L',
      'liters': 'L',
      'litre': 'L',
      'litres': 'L',
      'milliliter': 'ml',
      'milliliters': 'ml',
      'piece': 'pieces',
      'pcs': 'pieces',
      'pc': 'pieces',
      'packet': 'packet',
      'packets': 'packet',
      'pack': 'packet',
      'bottle': 'bottle',
      'bottles': 'bottle',
      'bag': 'bag',
      'bags': 'bag',
      'box': 'box',
      'boxes': 'box',
    };
  }

  /**
   * Parse order from any input source
   * @param {Object} input - Input data
   * @param {string} input.source - 'whatsapp' or 'ocr'
   * @param {string} input.rawText - Raw input text
   * @param {string} input.retailerId - Retailer ID
   * @param {string} input.orderId - Optional order ID for tracking
   * @returns {Promise<Object>} - Parsed result
   */
  async parseOrder(input) {
    const { source, rawText, retailerId, orderId } = input;
    const startTime = Date.now();

    logger.setContext({ source, retailerId, orderId });
    logger.info('Starting unified order parsing', {
      source,
      retailerId,
      orderId,
      textLength: rawText?.length,
    });

    try {
      // Validate input
      this.validateInput(input);

      // Step 1: Extract items from raw text
      const extractedItems = await this.extractItems(rawText, source);

      logger.info('Items extracted', {
        source,
        itemCount: extractedItems.length,
      });

      // Step 2: Normalize and match each item
      const normalizedItems = [];
      for (const extracted of extractedItems) {
        const normalized = await this.normalizeItem(extracted, retailerId);
        normalizedItems.push(normalized);
      }

      // Step 3: Calculate overall confidence
      const overallConfidence = this.calculateOverallConfidence(normalizedItems);

      // Step 4: Determine if clarification needed
      const needsClarification = overallConfidence < this.thresholds.autoAccept;

      // Step 5: Store parsing result
      const parsingResult = await this.storeParsingResult({
        source,
        rawText,
        retailerId,
        orderId,
        extractedItems,
        normalizedItems,
        overallConfidence,
        needsClarification,
      });

      const duration = Date.now() - startTime;

      logger.info('Order parsing completed', {
        source,
        retailerId,
        orderId,
        itemCount: normalizedItems.length,
        overallConfidence,
        needsClarification,
        duration,
      });

      return {
        success: true,
        parsingId: parsingResult.id,
        source,
        items: normalizedItems,
        overallConfidence,
        needsClarification,
        clarificationMessage: needsClarification
          ? this.generateClarificationMessage(normalizedItems)
          : null,
        summary: this.generateSummary(normalizedItems),
        duration,
      };
    } catch (error) {
      const duration = Date.now() - startTime;

      logger.error('Order parsing failed', {
        source,
        retailerId,
        orderId,
        error: error.message,
        stack: error.stack,
        duration,
      });

      throw error;
    }
  }

  /**
   * Validate input parameters
   */
  validateInput(input) {
    if (!input.source || !['whatsapp', 'ocr'].includes(input.source)) {
      throw new Error('Invalid source. Must be "whatsapp" or "ocr"');
    }

    if (!input.rawText || typeof input.rawText !== 'string') {
      throw new Error('Invalid rawText. Must be a non-empty string');
    }

    if (!input.retailerId) {
      throw new Error('retailerId is required');
    }
  }

  /**
   * Extract items from raw text
   */
  async extractItems(rawText, source) {
    // Clean and normalize text
    const cleanedText = this.cleanText(rawText);

    // Split into lines
    const lines = cleanedText
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0);

    const extractedItems = [];

    for (const line of lines) {
      // Skip non-order lines
      if (this.isNonOrderLine(line)) {
        continue;
      }

      // Try to parse line
      const parsed = this.parseLine(line, source);

      if (parsed) {
        extractedItems.push(parsed);
      }
    }

    return extractedItems;
  }

  /**
   * Clean and normalize text
   */
  cleanText(text) {
    // Fix common OCR errors
    let cleaned = text;

    // Replace common OCR mistakes
    cleaned = cleaned.replace(/0il/gi, 'oil');
    cleaned = cleaned.replace(/\b1\b/g, 'l'); // Standalone 1 -> l
    cleaned = cleaned.replace(/\b5\b/g, 's'); // Standalone 5 -> s

    // Normalize whitespace
    cleaned = cleaned.replace(/\s+/g, ' ');

    // Remove special characters except basic punctuation
    cleaned = cleaned.replace(/[^\w\s\n.,:;-]/g, '');

    return cleaned.trim();
  }

  /**
   * Check if line is non-order content
   */
  isNonOrderLine(line) {
    const nonOrderPatterns = [
      /^(hi|hello|hey|namaste|namaskar)/i,
      /^(thanks|thank you|dhanyabad)/i,
      /^(order|invoice|bill|receipt)/i,
      /^(date|time|total|subtotal|tax)/i,
      /^(customer|retailer|vendor|supplier)/i,
      /^(address|phone|email)/i,
      /^\d{4}-\d{2}-\d{2}/, // Dates
      /^rs\.?\s*\d+/i, // Prices only
    ];

    return nonOrderPatterns.some(pattern => pattern.test(line));
  }

  /**
   * Parse a single line into item
   */
  parseLine(line, source) {
    // Try different parsing patterns
    const patterns = [
      this.parseSkuQuantityFormat,
      this.parseQuantitySkuFormat,
      this.parseQuantityProductFormat,
      this.parseProductQuantityFormat,
      this.parseNaturalLanguageFormat,
    ];

    for (const pattern of patterns) {
      const result = pattern.call(this, line);
      if (result) {
        return {
          ...result,
          rawLine: line,
          source,
        };
      }
    }

    return null;
  }

  /**
   * Parse: SKU x Quantity (RICE-1KG x 10)
   */
  parseSkuQuantityFormat(line) {
    const pattern = /^([A-Z0-9-]+)\s*[xX×]\s*(\d+(?:\.\d+)?)$/i;
    const match = line.match(pattern);

    if (!match) return null;

    return {
      item: match[1].trim(),
      quantity: parseFloat(match[2]),
      unit: null,
      format: 'sku_quantity',
    };
  }

  /**
   * Parse: Quantity x SKU (10 x RICE-1KG)
   */
  parseQuantitySkuFormat(line) {
    const pattern = /^(\d+(?:\.\d+)?)\s*[xX×]\s*([A-Z0-9-]+)$/i;
    const match = line.match(pattern);

    if (!match) return null;

    return {
      item: match[2].trim(),
      quantity: parseFloat(match[1]),
      unit: null,
      format: 'quantity_sku',
    };
  }

  /**
   * Parse: Quantity Unit Product (10 kg rice)
   */
  parseQuantityProductFormat(line) {
    const pattern = /^(\d+(?:\.\d+)?)\s*([a-z]+)?\s+(.+)$/i;
    const match = line.match(pattern);

    if (!match) return null;

    const quantity = parseFloat(match[1]);
    const possibleUnit = match[2]?.toLowerCase();
    const product = match[3].trim();

    // Check if possibleUnit is actually a unit
    const unit = this.normalizeUnit(possibleUnit);

    return {
      item: product,
      quantity,
      unit,
      format: 'quantity_product',
    };
  }

  /**
   * Parse: Product Quantity Unit (rice 10 kg)
   */
  parseProductQuantityFormat(line) {
    const pattern = /^(.+?)\s+(\d+(?:\.\d+)?)\s*([a-z]+)?$/i;
    const match = line.match(pattern);

    if (!match) return null;

    const product = match[1].trim();
    const quantity = parseFloat(match[2]);
    const possibleUnit = match[3]?.toLowerCase();

    const unit = this.normalizeUnit(possibleUnit);

    return {
      item: product,
      quantity,
      unit,
      format: 'product_quantity',
    };
  }

  /**
   * Parse: Natural language (I need 10 bags of rice)
   */
  parseNaturalLanguageFormat(line) {
    const pattern = /(\d+(?:\.\d+)?)\s*([a-z]+)?\s*(?:of\s+)?(.+)/i;
    const match = line.match(pattern);

    if (!match) return null;

    const quantity = parseFloat(match[1]);
    const possibleUnit = match[2]?.toLowerCase();
    const product = match[3].trim();

    const unit = this.normalizeUnit(possibleUnit);

    return {
      item: product,
      quantity,
      unit,
      format: 'natural_language',
    };
  }

  /**
   * Normalize unit
   */
  normalizeUnit(unit) {
    if (!unit) return null;

    const normalized = unit.toLowerCase().trim();

    // Check if it's a known unit
    if (this.unitMap[normalized]) {
      return this.unitMap[normalized];
    }

    // Check if it's already a standard unit
    const standardUnits = ['kg', 'g', 'L', 'ml', 'pieces', 'packet', 'bottle', 'bag', 'box'];
    if (standardUnits.includes(normalized)) {
      return normalized;
    }

    return null;
  }

  /**
   * Normalize and match item against product catalog
   */
  async normalizeItem(extractedItem, retailerId) {
    const { item, quantity, unit, rawLine, source, format } = extractedItem;

    logger.info('Normalizing item', {
      item,
      quantity,
      unit,
      format,
    });

    try {
      // Apply spelling corrections
      const correctedItem = this.applySpellingCorrections(item);

      // Match product
      const matchResult = await productMatcher.findProduct(correctedItem);

      if (!matchResult.found) {
        // No match found
        return {
          rawLine,
          source,
          format,
          item: correctedItem,
          quantity,
          unit,
          productId: null,
          productName: null,
          sku: null,
          unitPrice: null,
          matchType: 'none',
          confidence: 0,
          needsReview: true,
          suggestions: matchResult.suggestions || [],
          error: `Product "${correctedItem}" not found`,
        };
      }

      // Match found
      const { product, matchType, confidence: matchConfidence } = matchResult;

      // Calculate final confidence
      const confidence = this.calculateItemConfidence({
        matchType,
        matchConfidence,
        hasUnit: !!unit,
        source,
      });

      // Determine if needs review
      const needsReview = confidence < this.thresholds.autoAccept;

      return {
        rawLine,
        source,
        format,
        item: correctedItem,
        quantity,
        unit: unit || product.product.unit,
        productId: product.productId,
        productName: product.product.name,
        sku: product.sku,
        vendorProductId: product.id,
        vendorId: product.vendorId,
        unitPrice: parseFloat(product.vendorPrice),
        matchType,
        confidence,
        needsReview,
        suggestions: [],
      };
    } catch (error) {
      logger.error('Item normalization failed', {
        item,
        error: error.message,
      });

      return {
        rawLine,
        source,
        format,
        item,
        quantity,
        unit,
        productId: null,
        productName: null,
        sku: null,
        unitPrice: null,
        matchType: 'error',
        confidence: 0,
        needsReview: true,
        suggestions: [],
        error: error.message,
      };
    }
  }

  /**
   * Apply spelling corrections
   */
  applySpellingCorrections(text) {
    let corrected = text.toLowerCase();

    // Apply known variations
    for (const [wrong, correct] of Object.entries(this.spellingVariations)) {
      const regex = new RegExp(`\\b${wrong}\\b`, 'gi');
      corrected = corrected.replace(regex, correct);
    }

    return corrected;
  }

  /**
   * Calculate item confidence score
   */
  calculateItemConfidence({ matchType, matchConfidence, hasUnit, source }) {
    let confidence = matchConfidence;

    // Adjust based on match type
    if (matchType === 'exact_sku') {
      confidence = 100;
    } else if (matchType === 'product_code') {
      confidence = 95;
    } else if (matchType === 'fuzzy_name') {
      // Already set by matcher
    } else if (matchType === 'partial_sku') {
      confidence = Math.max(confidence, 70);
    }

    // Boost if unit is provided
    if (hasUnit) {
      confidence = Math.min(confidence + 5, 100);
    }

    // Adjust based on source
    if (source === 'ocr') {
      // OCR is less reliable, reduce confidence slightly
      confidence = confidence * 0.95;
    }

    return Math.round(confidence);
  }

  /**
   * Calculate overall confidence
   */
  calculateOverallConfidence(items) {
    if (items.length === 0) return 0;

    const totalConfidence = items.reduce((sum, item) => sum + item.confidence, 0);
    return Math.round(totalConfidence / items.length);
  }

  /**
   * Generate clarification message
   */
  generateClarificationMessage(items) {
    const lowConfidenceItems = items.filter(
      item => item.confidence < this.thresholds.autoAccept
    );

    if (lowConfidenceItems.length === 0) {
      return null;
    }

    let message = '⚠️ Please confirm these items:\n\n';

    lowConfidenceItems.forEach((item, index) => {
      message += `${index + 1}. "${item.item}" → `;

      if (item.productName) {
        message += `${item.productName} (${item.confidence}% match)\n`;
        message += `   Qty: ${item.quantity} ${item.unit || ''}\n`;
        message += `   Price: Rs.${item.unitPrice}\n`;
      } else {
        message += `Not found\n`;
        if (item.suggestions && item.suggestions.length > 0) {
          message += `   Did you mean:\n`;
          item.suggestions.slice(0, 3).forEach(s => {
            message += `   • ${s.name} (Rs.${s.price})\n`;
          });
        }
      }
      message += '\n';
    });

    message += 'Reply:\n';
    message += '• "CONFIRM" to proceed\n';
    message += '• "CANCEL" to cancel\n';
    message += '• Or send corrections';

    return message;
  }

  /**
   * Generate order summary
   */
  generateSummary(items) {
    const matched = items.filter(i => i.productId);
    const unmatched = items.filter(i => !i.productId);

    let subtotal = 0;
    matched.forEach(item => {
      subtotal += item.quantity * item.unitPrice;
    });

    const tax = subtotal * 0.13; // 13% VAT
    const total = subtotal + tax;

    return {
      totalItems: items.length,
      matchedItems: matched.length,
      unmatchedItems: unmatched.length,
      subtotal: Math.round(subtotal * 100) / 100,
      tax: Math.round(tax * 100) / 100,
      total: Math.round(total * 100) / 100,
    };
  }

  /**
   * Store parsing result in database
   */
  async storeParsingResult(data) {
    const {
      source,
      rawText,
      retailerId,
      orderId,
      extractedItems,
      normalizedItems,
      overallConfidence,
      needsClarification,
    } = data;

    try {
      const parsingResult = await prisma.orderParsingLog.create({
        data: {
          source,
          rawText,
          retailerId,
          orderId: orderId || null,
          extractedItems: {
            items: extractedItems,
            count: extractedItems.length,
          },
          normalizedItems: {
            items: normalizedItems,
            count: normalizedItems.length,
          },
          overallConfidence,
          needsClarification,
          status: needsClarification ? 'PENDING_REVIEW' : 'COMPLETED',
        },
      });

      logger.info('Parsing result stored', {
        parsingId: parsingResult.id,
        source,
        retailerId,
      });

      return parsingResult;
    } catch (error) {
      logger.error('Failed to store parsing result', {
        source,
        retailerId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get parsing result by ID
   */
  async getParsingResult(parsingId) {
    try {
      return await prisma.orderParsingLog.findUnique({
        where: { id: parsingId },
      });
    } catch (error) {
      logger.error('Failed to get parsing result', {
        parsingId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Update thresholds
   */
  updateThresholds(newThresholds) {
    this.thresholds = {
      ...this.thresholds,
      ...newThresholds,
    };
    logger.info('Thresholds updated', { thresholds: this.thresholds });
  }

  /**
   * Get configuration
   */
  getConfiguration() {
    return {
      thresholds: this.thresholds,
      spellingVariations: Object.keys(this.spellingVariations).length,
      unitMappings: Object.keys(this.unitMap).length,
    };
  }
}

module.exports = new UnifiedOrderParserService();
