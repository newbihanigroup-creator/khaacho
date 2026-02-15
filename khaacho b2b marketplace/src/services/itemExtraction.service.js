const axios = require('axios');
const logger = require('../utils/logger');

/**
 * Item Extraction Service
 * Extracts structured grocery order items from messy OCR text using OpenAI API
 */

class ItemExtractionService {
  /**
   * Extract structured items from raw OCR text
   * @param {string} rawText - Raw text extracted from image via OCR
   * @returns {Promise<Array>} Array of structured items with name, quantity, unit
   */
  async extractStructuredItems(rawText) {
    logger.info('🔍 Extracting structured items from raw text', {
      textLength: rawText?.length || 0,
      preview: rawText?.substring(0, 100),
    });

    // Validate input
    if (!rawText || typeof rawText !== 'string' || rawText.trim().length === 0) {
      logger.warn('Empty or invalid raw text provided');
      return [];
    }

    // Check if OpenAI API key is configured
    if (!process.env.OPENAI_API_KEY) {
      logger.error('OpenAI API key not configured');
      throw new Error('OPENAI_API_KEY environment variable is required');
    }

    try {
      const items = await this.callOpenAI(rawText);
      
      logger.info('✅ Items extracted successfully', {
        itemCount: items.length,
        items: items.map(i => `${i.quantity || ''} ${i.unit || ''} ${i.name}`.trim()),
      });

      return items;

    } catch (error) {
      logger.error('❌ Item extraction failed', {
        error: error.message,
        response: error.response?.data,
      });
      throw error;
    }
  }

  /**
   * Call OpenAI API to extract items
   * @private
   */
  async callOpenAI(rawText) {
    const systemInstruction = `You extract structured grocery order items from messy OCR text.

Return strict JSON array with fields:
- name (string): Product name
- quantity (number): Numeric quantity
- unit (string or null): Unit of measurement

Rules:
1. Parse units like kg, g, l, ml, pieces, dozen, etc.
2. If no unit present, set unit to null
3. Remove duplicates (same name + unit)
4. Ignore irrelevant text (headers, footers, dates, totals, etc.)
5. Only extract actual product items
6. Normalize product names (capitalize properly)
7. Convert text quantities to numbers (e.g., "ten" -> 10)
8. Handle common OCR errors (e.g., "0il" -> "Oil")

Examples:
Input: "10kg rice\n5L oil\n2 sugar"
Output: [
  {"name": "Rice", "quantity": 10, "unit": "kg"},
  {"name": "Oil", "quantity": 5, "unit": "L"},
  {"name": "Sugar", "quantity": 2, "unit": null}
]

Input: "Order #123\nDate: 2024-01-01\n1. Rice 10kg Rs.500\n2. Oil 5L Rs.800\nTotal: Rs.1300"
Output: [
  {"name": "Rice", "quantity": 10, "unit": "kg"},
  {"name": "Oil", "quantity": 5, "unit": "L"}
]`;

    const userPrompt = `Extract grocery items from this OCR text:

"""
${rawText}
"""

Return ONLY a JSON array. No explanation, no markdown, just the array.`;

    try {
      const response = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
          model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: systemInstruction,
            },
            {
              role: 'user',
              content: userPrompt,
            },
          ],
          temperature: 0.1, // Low temperature for consistent extraction
          max_tokens: 2000,
          response_format: { type: 'json_object' },
        },
        {
          headers: {
            'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
            'Content-Type': 'application/json',
          },
          timeout: 30000, // 30 second timeout
        }
      );

      const content = response.data.choices[0].message.content;
      
      logger.debug('OpenAI response received', {
        content: content.substring(0, 200),
        finishReason: response.data.choices[0].finish_reason,
        usage: response.data.usage,
      });

      // Parse JSON response
      let parsedData;
      try {
        parsedData = JSON.parse(content);
      } catch (parseError) {
        logger.error('Failed to parse OpenAI response as JSON', {
          content,
          error: parseError.message,
        });
        throw new Error('OpenAI returned invalid JSON');
      }

      // Handle different response formats
      let items;
      if (Array.isArray(parsedData)) {
        items = parsedData;
      } else if (parsedData.items && Array.isArray(parsedData.items)) {
        items = parsedData.items;
      } else if (parsedData.products && Array.isArray(parsedData.products)) {
        items = parsedData.products;
      } else {
        logger.error('Unexpected response format from OpenAI', { parsedData });
        throw new Error('OpenAI response format not recognized');
      }

      // Validate and clean items
      const validatedItems = this.validateAndCleanItems(items);

      return validatedItems;

    } catch (error) {
      if (error.response) {
        // OpenAI API error
        logger.error('OpenAI API error', {
          status: error.response.status,
          statusText: error.response.statusText,
          data: error.response.data,
        });

        if (error.response.status === 401) {
          throw new Error('Invalid OpenAI API key');
        } else if (error.response.status === 429) {
          throw new Error('OpenAI API rate limit exceeded');
        } else if (error.response.status === 500) {
          throw new Error('OpenAI API server error');
        }
      } else if (error.code === 'ECONNABORTED') {
        throw new Error('OpenAI API request timeout');
      }

      throw error;
    }
  }

  /**
   * Validate and clean extracted items
   * @private
   */
  validateAndCleanItems(items) {
    if (!Array.isArray(items)) {
      logger.warn('Items is not an array', { items });
      return [];
    }

    const validatedItems = [];
    const seen = new Set(); // For duplicate detection

    for (const item of items) {
      // Validate required fields
      if (!item || typeof item !== 'object') {
        logger.warn('Invalid item (not an object)', { item });
        continue;
      }

      if (!item.name || typeof item.name !== 'string' || item.name.trim().length === 0) {
        logger.warn('Invalid item (missing or invalid name)', { item });
        continue;
      }

      // Clean and validate fields
      const cleanedItem = {
        name: this.cleanProductName(item.name),
        quantity: this.parseQuantity(item.quantity),
        unit: this.cleanUnit(item.unit),
      };

      // Skip if quantity is invalid
      if (cleanedItem.quantity === null || cleanedItem.quantity <= 0) {
        logger.warn('Invalid item (invalid quantity)', { item, cleanedItem });
        continue;
      }

      // Check for duplicates
      const itemKey = `${cleanedItem.name.toLowerCase()}_${cleanedItem.unit || 'null'}`;
      if (seen.has(itemKey)) {
        logger.debug('Duplicate item detected, skipping', { cleanedItem });
        continue;
      }
      seen.add(itemKey);

      validatedItems.push(cleanedItem);
    }

    logger.info('Items validated and cleaned', {
      originalCount: items.length,
      validCount: validatedItems.length,
      duplicatesRemoved: items.length - validatedItems.length,
    });

    return validatedItems;
  }

  /**
   * Clean product name
   * @private
   */
  cleanProductName(name) {
    if (!name) return '';

    return name
      .trim()
      .replace(/\s+/g, ' ') // Normalize whitespace
      .replace(/[^\w\s-]/g, '') // Remove special characters except hyphen
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()) // Title case
      .join(' ');
  }

  /**
   * Parse quantity to number
   * @private
   */
  parseQuantity(quantity) {
    if (typeof quantity === 'number') {
      return quantity > 0 ? quantity : null;
    }

    if (typeof quantity === 'string') {
      // Try to parse as number
      const parsed = parseFloat(quantity);
      if (!isNaN(parsed) && parsed > 0) {
        return parsed;
      }

      // Handle text quantities
      const textNumbers = {
        'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5,
        'six': 6, 'seven': 7, 'eight': 8, 'nine': 9, 'ten': 10,
      };

      const lower = quantity.toLowerCase().trim();
      if (textNumbers[lower]) {
        return textNumbers[lower];
      }
    }

    return null;
  }

  /**
   * Clean and normalize unit
   * @private
   */
  cleanUnit(unit) {
    if (!unit || typeof unit !== 'string') {
      return null;
    }

    const cleaned = unit.trim().toLowerCase();

    if (cleaned.length === 0 || cleaned === 'null' || cleaned === 'none') {
      return null;
    }

    // Normalize common units
    const unitMap = {
      'kilogram': 'kg',
      'kilograms': 'kg',
      'kgs': 'kg',
      'gram': 'g',
      'grams': 'g',
      'gms': 'g',
      'liter': 'L',
      'liters': 'L',
      'litre': 'L',
      'litres': 'L',
      'milliliter': 'ml',
      'milliliters': 'ml',
      'millilitre': 'ml',
      'millilitres': 'ml',
      'piece': 'pieces',
      'pcs': 'pieces',
      'pc': 'pieces',
      'dozen': 'dozen',
      'doz': 'dozen',
      'packet': 'packet',
      'packets': 'packet',
      'pack': 'packet',
      'packs': 'packet',
      'bottle': 'bottle',
      'bottles': 'bottle',
      'box': 'box',
      'boxes': 'box',
    };

    return unitMap[cleaned] || cleaned;
  }
}

module.exports = new ItemExtractionService();
