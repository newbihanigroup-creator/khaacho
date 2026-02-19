/**
 * AI Agent Interface
 * Base class for all AI agent implementations
 */
class AIAgent {
  /**
   * Parse order from text/image to structured data
   * @param {Object} data - Raw order data (text, image, etc.)
   * @returns {Promise<Object>} Parsed order with items array
   */
  async parseOrder(data) {
    throw new Error('parseOrder() must be implemented by subclass');
  }

  /**
   * Assess risk score for an order
   * @param {Object} order - Order object
   * @returns {Promise<number>} Risk score (0-1)
   */
  async assessRisk(order) {
    throw new Error('assessRisk() must be implemented by subclass');
  }

  /**
   * Optimize vendor routing
   * @param {Object} order - Order object
   * @param {Array} vendors - Available vendors
   * @returns {Promise<Object>} Selected vendor with score
   */
  async optimizeRouting(order, vendors) {
    throw new Error('optimizeRouting() must be implemented by subclass');
  }

  /**
   * Analyze pricing intelligence
   * @param {Array} items - Order items
   * @returns {Promise<Object>} Price analysis
   */
  async analyzePricing(items) {
    throw new Error('analyzePricing() must be implemented by subclass');
  }

  /**
   * Health check for AI service
   * @returns {Promise<boolean>} Service health status
   */
  async healthCheck() {
    throw new Error('healthCheck() must be implemented by subclass');
  }
}

module.exports = AIAgent;
