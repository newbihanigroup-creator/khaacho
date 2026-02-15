const axios = require('axios');
const logger = require('../utils/logger');

/**
 * LLM Item Extraction Service
 * Extracts structured grocery items from raw text using OpenAI API
 */

class LLMItemExtractionService {
  constructor() {
    this.apiKey = process.env.OPENAI_API_KEY;
    this.model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
    this.apiUrl = 'https://api.openai.com/v1/chat/completions';
  }

  /**
   * Extract structured items from raw text using OpenAI
   * 
   * @param {string} rawText - Raw text extracted from image
   * @returns {Promise<Array>} - Array of extracted items with name, quantity, unit, confidence
   * @throws {Error} - Structured error with code and details
   */
  async extractItemsWithLLM(rawText) {
    const startTime = Date.now();

    try {
      // Validate API key
      if (!this.apiKey) {
        throw this.createError(
          'OPENAI_NOT_CONFIGURED',
          'OpenAI API key not configured',
          { hint: 'Set OPENAI_API_KEY environment variable' }
        );
      }

      // Validate input
      if (!rawText || typeof rawText !== 'string') {
        throw this.createError(
          'INVALID_INPUT',
          'Raw text is required and must be a string',
          { rawText }
        );
      }

      if (rawText.trim().length === 0) {
        logger.warn('Empty raw text provided');
        return [];
      }

      logger.info('Starting LLM item extraction', {
        textLength: rawText.length,
        model: this.model,
      });

      // Build system prompt
      const systemPrompt = this.buildSystemPrompt();

      // Build user prompt
      const userPrompt = this.buildUserPrompt(rawText);

      // Call OpenAI API
      const response = await axios.post(
        this.apiUrl,
        {
          model: this.model,
          messages: [
            {
              role: 'system',
              content: systemPrompt,
            },
            {
              role: 'user',
              content: userPrompt,
            },
          ],
          temperature: 0.1, // Low temperature for consistent extraction
          response_format: { type: 'json_object' },
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 30000, // 30 second timeout
        }
      );

      // Parse response
      const content = response.data.choices[0].message.content;
      const parsed = JSON.parse(content);

      // Extract items array
      let items = parsed.items || [];

      // Validate and clean items
      items = this.validateAndCleanItems(items);

      // Remove duplicates
      items = this.removeDuplicates(items);

      const duration = Date.now() - startTime;

      logger.info('LLM item extraction completed', {
        itemsExtracted: items.length,
        model: this.model,
        duration,
        tokensUsed: response.data.usage?.total_tokens,
      });

      return items;

    } catch (error) {
      const duration = Date.now() - startTime;

      // If already a structured error, re-throw
      if (error.code && error.isLLMError) {
        logger.error('LLM extraction failed', {
          errorCode: error.code,
          errorMessage: error.message,
          duration,
        });
        throw error;
      }

      // Handle OpenAI API errors
      if (error.response) {
        const status = error.response.status;
        const data = error.response.data;

        if (status === 401) {
          throw this.createError(
            'INVALID_API_KEY',
            'Invalid OpenAI API key',
            { status, error: data.error }
          );
        }

        if (status === 429) {
          throw this.createError(
            'RATE_LIMIT_EXCEEDED',
            'OpenAI API rate limit exceeded',
            { status, error: data.error }
          );
        }

        if (status === 500 || status === 503) {
          throw this.createError(
            'OPENAI_SERVICE_ERROR',
            'OpenAI service temporarily unavailable',
            { status, error: data.error }
          );
        }

        throw this.createError(
          'OPENAI_API_ERROR',
          data.error?.message || 'OpenAI API request failed',
          { status, error: data.error }
        );
      }

      // Handle network errors
      if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
        throw this.createError(
          'REQUEST_TIMEOUT',
          'OpenAI API request timed out',
          { originalError: error.message }
        );
      }

      // Handle JSON parse errors
      if (error instanceof SyntaxError) {
        throw this.createError(
          'INVALID_JSON_RESPONSE',
          'Failed to parse OpenAI response as JSON',
          { originalError: error.message }
        );
      }

      // Generic error
      logger.error('Unexpected LLM extraction error', {
        error: error.message,
        stack: error.stack,
        duration,
      });

      throw this.createError(
        'EXTRACTION_FAILED',
        `Failed to extract items: ${error.message}`,
        { originalError: error.message }
      );
    }
  }

  /**
   * Build system prompt for OpenAI
   * 
   * @returns {string} - System prompt
   */
  buildSystemPrompt() {
    return `You are a grocery order extraction engine. Return STRICT JSON array.

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

Output format:
{
  "items": [
    {
      "name": "Rice",
      "quantity": 10,
      "unit": "kg",
      "confidence": 0.95
    }
  ]
}`;
  }

  /**
   * Build user prompt with raw text
   * 
   * @param {string} rawText - Raw text to extract from
   * @returns {string} - User prompt
   */
  buildUserPrompt(rawText) {
    return `Extract grocery items from this text:

"""
${rawText}
"""

Return JSON with items array. Each item must have: name, quantity, unit, confidence.`;
  }

  /**
   * Validate and clean extracted items
   * 
   * @param {Array} items - Raw items from LLM
   * @returns {Array} - Cleaned items
   */
  validateAndCleanItems(items) {
    if (!Array.isArray(items)) {
      logger.warn('Items is not an array, returning empty array');
      return [];
    }

    return items
      .filter(item => {
        // Must have name and quantity
        if (!item.name || typeof item.name !== 'string') {
          logger.warn('Item missing name, skipping', { item });
          return false;
        }

        if (item.quantity === undefined || item.quantity === null) {
          logger.warn('Item missing quantity, skipping', { item });
          return false;
        }

        return true;
      })
      .map(item => ({
        name: this.cleanProductName(item.name),
        quantity: this.parseQuantity(item.quantity),
        unit: this.cleanUnit(item.unit),
        confidence: this.parseConfidence(item.confidence),
      }))
      .filter(item => {
        // Filter out invalid items after cleaning
        if (!item.name || item.quantity <= 0) {
          logger.warn('Invalid item after cleaning, skipping', { item });
          return false;
        }
        return true;
      });
  }

  /**
   * Clean product name
   * 
   * @param {string} name - Raw product name
   * @returns {string} - Cleaned name
   */
  cleanProductName(name) {
    return name
      .trim()
      .replace(/\s+/g, ' ') // Normalize whitespace
      .replace(/[^\w\s-]/g, '') // Remove special chars except dash
      .substring(0, 100); // Limit length
  }

  /**
   * Parse quantity to number
   * 
   * @param {any} quantity - Raw quantity
   * @returns {number} - Parsed quantity
   */
  parseQuantity(quantity) {
    const parsed = parseFloat(quantity);
    return isNaN(parsed) || parsed <= 0 ? 1 : parsed;
  }

  /**
   * Clean and normalize unit
   * 
   * @param {any} unit - Raw unit
   * @returns {string|null} - Cleaned unit or null
   */
  cleanUnit(unit) {
    if (!unit || typeof unit !== 'string') {
      return null;
    }

    const cleaned = unit.toLowerCase().trim();

    // Normalize common units
    const unitMap = {
      'kilogram': 'kg',
      'kilograms': 'kg',
      'kilo': 'kg',
      'kilos': 'kg',
      'gram': 'g',
      'grams': 'g',
      'liter': 'l',
      'liters': 'l',
      'litre': 'l',
      'litres': 'l',
      'milliliter': 'ml',
      'milliliters': 'ml',
      'millilitre': 'ml',
      'millilitres': 'ml',
      'piece': 'pieces',
      'pcs': 'pieces',
      'pc': 'pieces',
      'dozen': 'dozen',
      'doz': 'dozen',
      'bottle': 'bottle',
      'bottles': 'bottle',
      'packet': 'packet',
      'packets': 'packet',
      'pack': 'packet',
      'packs': 'packet',
      'box': 'box',
      'boxes': 'box',
      'bag': 'bag',
      'bags': 'bag',
    };

    return unitMap[cleaned] || cleaned;
  }

  /**
   * Parse confidence score
   * 
   * @param {any} confidence - Raw confidence
   * @returns {number} - Confidence between 0 and 1
   */
  parseConfidence(confidence) {
    const parsed = parseFloat(confidence);
    
    if (isNaN(parsed)) {
      return 0.5; // Default confidence
    }

    // Clamp between 0 and 1
    return Math.max(0, Math.min(1, parsed));
  }

  /**
   * Remove duplicate items
   * 
   * @param {Array} items - Items array
   * @returns {Array} - Deduplicated items
   */
  removeDuplicates(items) {
    const seen = new Map();

    for (const item of items) {
      const key = `${item.name.toLowerCase()}_${item.unit || 'null'}`;
      
      if (!seen.has(key)) {
        seen.set(key, item);
      } else {
        // If duplicate, keep the one with higher confidence
        const existing = seen.get(key);
        if (item.confidence > existing.confidence) {
          seen.set(key, item);
        }
      }
    }

    return Array.from(seen.values());
  }

  /**
   * Create structured error object
   * 
   * @param {string} code - Error code
   * @param {string} message - Error message
   * @param {Object} details - Additional error details
   * @returns {Error} - Structured error
   */
  createError(code, message, details = {}) {
    const error = new Error(message);
    error.code = code;
    error.details = details;
    error.isLLMError = true;
    error.timestamp = new Date().toISOString();
    return error;
  }

  /**
   * Get service health status
   * 
   * @returns {Object} - Health status
   */
  getHealthStatus() {
    return {
      configured: !!this.apiKey,
      model: this.model,
      service: 'OpenAI API',
      timestamp: new Date().toISOString(),
    };
  }
}

// Export singleton instance
module.exports = new LLMItemExtractionService();
