const AIAgent = require('./agent.interface');
const logger = require('../../shared/utils/logger');

/**
 * Local AI Agent - Fallback implementation
 * Uses rule-based logic when external AI services are unavailable
 */
class LocalAgent extends AIAgent {
  constructor() {
    super();
    logger.info('LocalAgent initialized (fallback mode)');
  }

  async parseOrder(data) {
    logger.warn('LocalAgent: Using fallback parser');
    
    // Simple rule-based parsing
    const text = typeof data === 'string' ? data : JSON.stringify(data);
    const lines = text.split('\n').filter(line => line.trim());
    
    const items = [];
    const numberPattern = /(\d+)\s*(kg|liter|piece|box|packet)/i;
    
    for (const line of lines) {
      const match = line.match(numberPattern);
      if (match) {
        items.push({
          productName: line.replace(numberPattern, '').trim(),
          quantity: parseInt(match[1]),
          unit: match[2].toLowerCase(),
        });
      }
    }
    
    return {
      items: items.length > 0 ? items : [{ productName: text, quantity: 1, unit: 'piece' }],
      notes: 'Parsed using fallback logic',
      totalAmount: 0,
    };
  }

  async assessRisk(order) {
    logger.warn('LocalAgent: Using fallback risk assessment');
    
    let riskScore = 0;
    
    // Simple rule-based risk scoring
    if (!order.customerHistory || order.customerHistory.orderCount === 0) {
      riskScore += 0.3; // New customer
    }
    
    if (order.totalAmount > 100000) {
      riskScore += 0.2; // Large order
    }
    
    if (order.items && order.items.length > 50) {
      riskScore += 0.1; // Many items
    }
    
    if (order.items && order.items.some(item => item.quantity > 1000)) {
      riskScore += 0.2; // Unusually large quantities
    }
    
    return Math.min(riskScore, 1);
  }

  async optimizeRouting(order, vendors) {
    logger.warn('LocalAgent: Using fallback routing');
    
    if (!vendors || vendors.length === 0) {
      throw new Error('No vendors available');
    }
    
    // Simple scoring: reliability * 0.5 + (1 - normalized_price) * 0.3 + inventory_score * 0.2
    const scored = vendors.map(vendor => {
      const priceScore = 1 - (vendor.pricing?.averagePrice || 0.5);
      const reliabilityScore = vendor.reliability || 0.5;
      const inventoryScore = vendor.inventory?.availabilityRate || 0.5;
      
      const score = (reliabilityScore * 0.5) + (priceScore * 0.3) + (inventoryScore * 0.2);
      
      return {
        vendorId: vendor.id,
        score,
        reasoning: 'Selected based on reliability, pricing, and inventory',
      };
    });
    
    // Sort by score descending
    scored.sort((a, b) => b.score - a.score);
    
    return scored[0];
  }

  async analyzePricing(items) {
    logger.warn('LocalAgent: Using fallback pricing analysis');
    
    return {
      analysis: 'Basic pricing analysis using fallback logic',
      suggestions: [
        'Consider bulk ordering for better prices',
        'Compare prices across multiple vendors',
      ],
      potentialSavings: 0,
    };
  }

  async healthCheck() {
    return true; // Local agent is always available
  }
}

module.exports = LocalAgent;
