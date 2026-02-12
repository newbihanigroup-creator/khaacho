const prisma = require('../config/database');
const logger = require('../utils/logger');
const ProductMatcherService = require('./productMatcher.service');

/**
 * Enhanced Order Parser Service
 * Parses WhatsApp messages with natural language support
 * Handles multiple formats and spelling variations
 */
class EnhancedOrderParserService {

  /**
   * Parse order from WhatsApp message text
   * Supports multiple formats:
   * - SKU x Quantity (RICE-1KG x 10)
   * - Quantity x SKU (10 x RICE-1KG)
   * - Product name and quantity (Rice 1kg 10 bags)
   * - Natural language (I need 10 bags of rice)
   */
  async parseOrderMessage(text) {
    logger.info('Parsing order message', { text });

    const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    const parsedItems = [];
    const errors = [];

    for (const line of lines) {
      const result = await this.parseLine(line);
      
      if (result.success) {
        parsedItems.push(result.item);
      } else if (result.error) {
        errors.push(result.error);
      }
      // Skip lines that don't look like orders (greetings, etc.)
    }

    return {
      items: parsedItems,
      errors,
      success: parsedItems.length > 0
    };
  }

  /**
   * Parse a single line of text
   */
  async parseLine(line) {
    // Skip common non-order phrases
    if (this.isNonOrderPhrase(line)) {
      return { success: false };
    }

    // Try different parsing patterns
    const patterns = [
      this.parseSkuQuantityFormat,      // RICE-1KG x 10
      this.parseQuantitySkuFormat,      // 10 x RICE-1KG
      this.parseSkuColonFormat,         // RICE-1KG: 10
      this.parseNaturalLanguageFormat,  // 10 bags of rice
      this.parseSimpleFormat            // rice 10
    ];

    for (const pattern of patterns) {
      const result = await pattern.call(this, line);
      if (result.success) {
        return result;
      }
    }

    return {
      success: false,
      error: `Could not parse: "${line}"`
    };
  }

  /**
   * Check if line is a non-order phrase (greeting, question, etc.)
   */
  isNonOrderPhrase(line) {
    const nonOrderPhrases = [
      /^(hi|hello|hey|good morning|good afternoon|good evening)/i,
      /^(thanks|thank you|ok|okay|yes|no)/i,
      /^(what|when|where|how|why)/i,
      /^(please|kindly)/i
    ];

    return nonOrderPhrases.some(pattern => pattern.test(line));
  }

  /**
   * Parse format: SKU x Quantity
   * Example: RICE-1KG x 10, RICE-1KG X 10, RICE-1KG × 10
   */
  async parseSkuQuantityFormat(line) {
    const pattern = /^([A-Z0-9-]+)\s*[xX×]\s*(\d+)$/i;
    const match = line.match(pattern);

    if (!match) return { success: false };

    const sku = match[1].trim().toUpperCase();
    const quantity = parseInt(match[2], 10);

    return await this.matchAndValidate(sku, quantity);
  }

  /**
   * Parse format: Quantity x SKU
   * Example: 10 x RICE-1KG
   */
  async parseQuantitySkuFormat(line) {
    const pattern = /^(\d+)\s*[xX×]\s*([A-Z0-9-]+)$/i;
    const match = line.match(pattern);

    if (!match) return { success: false };

    const quantity = parseInt(match[1], 10);
    const sku = match[2].trim().toUpperCase();

    return await this.matchAndValidate(sku, quantity);
  }

  /**
   * Parse format: SKU: Quantity or SKU - Quantity
   * Example: RICE-1KG: 10, RICE-1KG - 10
   */
  async parseSkuColonFormat(line) {
    const pattern = /^([A-Z0-9-]+)\s*[:-]\s*(\d+)$/i;
    const match = line.match(pattern);

    if (!match) return { success: false };

    const sku = match[1].trim().toUpperCase();
    const quantity = parseInt(match[2], 10);

    return await this.matchAndValidate(sku, quantity);
  }

  /**
   * Parse natural language format
   * Example: "10 bags of rice", "I need 5 kg dal", "20 bottles oil"
   */
  async parseNaturalLanguageFormat(line) {
    // Pattern: [quantity] [unit?] [of?] [product name]
    const pattern = /(\d+)\s*(?:bags?|kgs?|kg|packets?|bottles?|pieces?|pcs?)?\s*(?:of\s+)?(.+)/i;
    const match = line.match(pattern);

    if (!match) return { success: false };

    const quantity = parseInt(match[1], 10);
    const productName = match[2].trim();

    return await this.matchAndValidate(productName, quantity);
  }

  /**
   * Parse simple format: product quantity
   * Example: "rice 10", "dal 5"
   */
  async parseSimpleFormat(line) {
    const pattern = /^([a-z0-9-]+)\s+(\d+)$/i;
    const match = line.match(pattern);

    if (!match) return { success: false };

    const productName = match[1].trim();
    const quantity = parseInt(match[2], 10);

    return await this.matchAndValidate(productName, quantity);
  }

  /**
   * Match product and validate availability
   */
  async matchAndValidate(searchTerm, quantity) {
    // Find product using fuzzy matching
    const matchResult = await ProductMatcherService.findProduct(searchTerm);

    if (!matchResult.found) {
      // Product not found - provide suggestions
      const suggestions = matchResult.suggestions || [];
      let errorMsg = `Product "${searchTerm}" not found.`;
      
      if (suggestions.length > 0) {
        errorMsg += '\n\nDid you mean:\n';
        errorMsg += suggestions.map(s => `• ${s.sku} - ${s.name} (Rs.${s.price})`).join('\n');
      }

      return {
        success: false,
        error: errorMsg
      };
    }

    const { product, matchType, confidence } = matchResult;

    // Validate availability and stock
    const validation = await ProductMatcherService.validateAvailability(product.id, quantity);

    if (!validation.valid) {
      return {
        success: false,
        error: validation.error
      };
    }

    // Success - return parsed item
    return {
      success: true,
      item: {
        searchTerm,
        sku: product.sku,
        vendorProductId: product.id,
        productId: product.productId,
        productName: product.product.name,
        quantity,
        unitPrice: parseFloat(product.vendorPrice),
        vendorId: product.vendorId,
        vendorName: product.vendor.user.businessName,
        matchType,
        confidence,
        stock: product.stock
      }
    };
  }

  /**
   * Generate order summary message
   */
  generateOrderSummary(items, errors) {
    let message = '';

    if (items.length > 0) {
      message += '📋 Order Summary:\n\n';
      
      let subtotal = 0;
      items.forEach((item, index) => {
        const itemTotal = item.quantity * item.unitPrice;
        subtotal += itemTotal;
        
        message += `${index + 1}. ${item.productName}\n`;
        message += `   SKU: ${item.sku}\n`;
        message += `   Qty: ${item.quantity} × Rs.${item.unitPrice} = Rs.${itemTotal}\n`;
        
        if (item.confidence < 100) {
          message += `   ⚠️ Matched with ${item.confidence}% confidence\n`;
        }
        
        message += '\n';
      });

      const tax = subtotal * 0.13; // 13% VAT
      const total = subtotal + tax;

      message += `Subtotal: Rs.${subtotal.toFixed(2)}\n`;
      message += `Tax (13%): Rs.${tax.toFixed(2)}\n`;
      message += `Total: Rs.${total.toFixed(2)}\n`;
    }

    if (errors.length > 0) {
      message += '\n❌ Issues:\n';
      errors.forEach((error, index) => {
        message += `${index + 1}. ${error}\n`;
      });
    }

    return message;
  }

  /**
   * Generate confirmation prompt
   */
  generateConfirmationPrompt(items) {
    const itemCount = items.length;
    const totalQty = items.reduce((sum, item) => sum + item.quantity, 0);
    
    return `\n\n✅ Found ${itemCount} product(s), ${totalQty} total items.\n\nReply:\n• "CONFIRM" to place order\n• "CANCEL" to cancel\n• Or send corrections`;
  }
}

module.exports = new EnhancedOrderParserService();
