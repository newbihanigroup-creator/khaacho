const logger = require('../utils/logger');

/**
 * Supplier Allocation Service
 * Optimizes supplier allocation to minimize cost while preferring reliable suppliers
 */

class SupplierAllocationService {
  constructor() {
    // Optimization weights (configurable)
    this.costWeight = parseFloat(process.env.ALLOCATION_COST_WEIGHT) || 0.7;
    this.reliabilityWeight = parseFloat(process.env.ALLOCATION_RELIABILITY_WEIGHT) || 0.3;
  }

  /**
   * Optimize supplier allocation for order items
   * 
   * @param {Array} orderItems - Array of items to order
   *   [{ itemId, productId, productName, quantity, unit }]
   * @param {Array} supplierOffers - Array of supplier offers
   *   [{ itemId, wholesalerId, wholesalerName, price, reliabilityScore, availableQuantity }]
   * @returns {Object} - Allocation results with map and summary
   */
  optimizeSupplierAllocation(orderItems, supplierOffers) {
    const startTime = Date.now();

    logger.info('Starting supplier allocation optimization', {
      itemCount: orderItems.length,
      offerCount: supplierOffers.length,
    });

    try {
      // Validate inputs
      this.validateInputs(orderItems, supplierOffers);

      // Group offers by itemId
      const offersByItem = this.groupOffersByItem(supplierOffers);

      // Calculate allocation for each item
      const allocation = {};
      const allocationDetails = [];
      let totalCost = 0;
      let itemsAllocated = 0;
      let itemsUnallocated = 0;

      for (const item of orderItems) {
        const offers = offersByItem[item.itemId] || [];

        if (offers.length === 0) {
          logger.warn('No offers available for item', {
            itemId: item.itemId,
            productName: item.productName,
          });

          allocationDetails.push({
            itemId: item.itemId,
            productName: item.productName,
            quantity: item.quantity,
            unit: item.unit,
            wholesalerId: null,
            wholesalerName: null,
            price: null,
            reliabilityScore: null,
            itemCost: null,
            allocated: false,
            reason: 'No offers available',
          });

          itemsUnallocated++;
          continue;
        }

        // Find best supplier for this item
        const bestOffer = this.selectBestOffer(item, offers);

        if (!bestOffer) {
          logger.warn('No suitable offer found for item', {
            itemId: item.itemId,
            productName: item.productName,
          });

          allocationDetails.push({
            itemId: item.itemId,
            productName: item.productName,
            quantity: item.quantity,
            unit: item.unit,
            wholesalerId: null,
            wholesalerName: null,
            price: null,
            reliabilityScore: null,
            itemCost: null,
            allocated: false,
            reason: 'No suitable offer',
          });

          itemsUnallocated++;
          continue;
        }

        // Calculate item cost
        const itemCost = bestOffer.price * item.quantity;
        totalCost += itemCost;

        // Store allocation
        allocation[item.itemId] = bestOffer.wholesalerId;

        allocationDetails.push({
          itemId: item.itemId,
          productId: item.productId,
          productName: item.productName,
          quantity: item.quantity,
          unit: item.unit,
          wholesalerId: bestOffer.wholesalerId,
          wholesalerName: bestOffer.wholesalerName,
          price: bestOffer.price,
          reliabilityScore: bestOffer.reliabilityScore,
          itemCost,
          score: bestOffer.score,
          allocated: true,
        });

        itemsAllocated++;

        logger.info('Item allocated', {
          itemId: item.itemId,
          productName: item.productName,
          wholesalerId: bestOffer.wholesalerId,
          wholesalerName: bestOffer.wholesalerName,
          price: bestOffer.price,
          itemCost,
        });
      }

      const duration = Date.now() - startTime;

      logger.info('Supplier allocation optimization completed', {
        totalItems: orderItems.length,
        itemsAllocated,
        itemsUnallocated,
        totalCost,
        duration,
      });

      return {
        allocation,
        allocationDetails,
        summary: {
          totalItems: orderItems.length,
          itemsAllocated,
          itemsUnallocated,
          totalCost,
          averageCostPerItem: itemsAllocated > 0 ? totalCost / itemsAllocated : 0,
          allocationRate: orderItems.length > 0 ? (itemsAllocated / orderItems.length) * 100 : 0,
        },
        optimizationWeights: {
          cost: this.costWeight,
          reliability: this.reliabilityWeight,
        },
        duration,
      };

    } catch (error) {
      logger.error('Supplier allocation optimization failed', {
        error: error.message,
        stack: error.stack,
      });
      throw error;
    }
  }

  /**
   * Validate inputs
   */
  validateInputs(orderItems, supplierOffers) {
    if (!Array.isArray(orderItems) || orderItems.length === 0) {
      throw new Error('orderItems must be a non-empty array');
    }

    if (!Array.isArray(supplierOffers)) {
      throw new Error('supplierOffers must be an array');
    }

    // Validate each order item
    for (const item of orderItems) {
      if (!item.itemId) {
        throw new Error('Each orderItem must have an itemId');
      }
      if (!item.quantity || item.quantity <= 0) {
        throw new Error(`Invalid quantity for item ${item.itemId}`);
      }
    }

    // Validate each supplier offer
    for (const offer of supplierOffers) {
      if (!offer.itemId) {
        throw new Error('Each supplierOffer must have an itemId');
      }
      if (!offer.wholesalerId) {
        throw new Error('Each supplierOffer must have a wholesalerId');
      }
      if (offer.price === undefined || offer.price < 0) {
        throw new Error(`Invalid price for offer ${offer.itemId}`);
      }
    }
  }

  /**
   * Group offers by itemId
   */
  groupOffersByItem(supplierOffers) {
    const grouped = {};

    for (const offer of supplierOffers) {
      if (!grouped[offer.itemId]) {
        grouped[offer.itemId] = [];
      }
      grouped[offer.itemId].push(offer);
    }

    return grouped;
  }

  /**
   * Select best offer for an item using weighted scoring
   */
  selectBestOffer(item, offers) {
    // Filter offers with sufficient quantity
    const suitableOffers = offers.filter(offer => {
      const availableQty = offer.availableQuantity || Infinity;
      return availableQty >= item.quantity;
    });

    if (suitableOffers.length === 0) {
      logger.warn('No offers with sufficient quantity', {
        itemId: item.itemId,
        requiredQuantity: item.quantity,
      });
      return null;
    }

    // Calculate scores for each offer
    const scoredOffers = suitableOffers.map(offer => {
      const score = this.calculateOfferScore(offer, suitableOffers);
      return { ...offer, score };
    });

    // Sort by score (descending) - higher score is better
    scoredOffers.sort((a, b) => b.score - a.score);

    // Return best offer
    return scoredOffers[0];
  }

  /**
   * Calculate weighted score for an offer
   * 
   * Score = (normalizedPriceScore × costWeight) + (normalizedReliabilityScore × reliabilityWeight)
   * 
   * Higher score is better
   */
  calculateOfferScore(offer, allOffers) {
    // Normalize price score (lower price = higher score)
    const prices = allOffers.map(o => o.price);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    
    let priceScore;
    if (maxPrice === minPrice) {
      priceScore = 1.0; // All prices are the same
    } else {
      // Invert: lower price gets higher score
      priceScore = 1.0 - ((offer.price - minPrice) / (maxPrice - minPrice));
    }

    // Normalize reliability score (0-100 to 0-1)
    const reliabilityScore = (offer.reliabilityScore || 0) / 100;

    // Calculate weighted score
    const score = (priceScore * this.costWeight) + (reliabilityScore * this.reliabilityWeight);

    return score;
  }

  /**
   * Compare allocation strategies
   * 
   * @param {Array} orderItems - Order items
   * @param {Array} supplierOffers - Supplier offers
   * @returns {Object} - Comparison of different strategies
   */
  compareStrategies(orderItems, supplierOffers) {
    logger.info('Comparing allocation strategies', {
      itemCount: orderItems.length,
      offerCount: supplierOffers.length,
    });

    // Strategy 1: Balanced (default weights)
    const balanced = this.optimizeSupplierAllocation(orderItems, supplierOffers);

    // Strategy 2: Cheapest (100% cost weight)
    const originalCostWeight = this.costWeight;
    const originalReliabilityWeight = this.reliabilityWeight;
    
    this.costWeight = 1.0;
    this.reliabilityWeight = 0.0;
    const cheapest = this.optimizeSupplierAllocation(orderItems, supplierOffers);

    // Strategy 3: Most Reliable (100% reliability weight)
    this.costWeight = 0.0;
    this.reliabilityWeight = 1.0;
    const mostReliable = this.optimizeSupplierAllocation(orderItems, supplierOffers);

    // Restore original weights
    this.costWeight = originalCostWeight;
    this.reliabilityWeight = originalReliabilityWeight;

    // Calculate average reliability for each strategy
    const balancedAvgReliability = this.calculateAverageReliability(balanced.allocationDetails);
    const cheapestAvgReliability = this.calculateAverageReliability(cheapest.allocationDetails);
    const mostReliableAvgReliability = this.calculateAverageReliability(mostReliable.allocationDetails);

    return {
      balanced: {
        ...balanced.summary,
        averageReliability: balancedAvgReliability,
        strategy: 'Balanced',
        weights: { cost: originalCostWeight, reliability: originalReliabilityWeight },
      },
      cheapest: {
        ...cheapest.summary,
        averageReliability: cheapestAvgReliability,
        strategy: 'Cheapest',
        weights: { cost: 1.0, reliability: 0.0 },
      },
      mostReliable: {
        ...mostReliable.summary,
        averageReliability: mostReliableAvgReliability,
        strategy: 'Most Reliable',
        weights: { cost: 0.0, reliability: 1.0 },
      },
      recommendation: this.recommendStrategy(balanced, cheapest, mostReliable),
    };
  }

  /**
   * Calculate average reliability score for allocated items
   */
  calculateAverageReliability(allocationDetails) {
    const allocatedItems = allocationDetails.filter(item => item.allocated);
    
    if (allocatedItems.length === 0) {
      return 0;
    }

    const totalReliability = allocatedItems.reduce((sum, item) => {
      return sum + (item.reliabilityScore || 0);
    }, 0);

    return totalReliability / allocatedItems.length;
  }

  /**
   * Recommend best strategy based on comparison
   */
  recommendStrategy(balanced, cheapest, mostReliable) {
    const balancedAvgReliability = this.calculateAverageReliability(balanced.allocationDetails);
    const cheapestAvgReliability = this.calculateAverageReliability(cheapest.allocationDetails);
    const mostReliableAvgReliability = this.calculateAverageReliability(mostReliable.allocationDetails);

    // Calculate cost savings vs most reliable
    const costSavings = mostReliable.summary.totalCost - cheapest.summary.totalCost;
    const costSavingsPercent = mostReliable.summary.totalCost > 0 
      ? (costSavings / mostReliable.summary.totalCost) * 100 
      : 0;

    // Calculate reliability difference vs cheapest
    const reliabilityGain = mostReliableAvgReliability - cheapestAvgReliability;

    // Recommendation logic
    if (costSavingsPercent > 20 && cheapestAvgReliability >= 70) {
      return {
        strategy: 'Cheapest',
        reason: `Significant cost savings (${costSavingsPercent.toFixed(1)}%) with acceptable reliability (${cheapestAvgReliability.toFixed(1)}%)`,
      };
    }

    if (reliabilityGain > 15 && mostReliable.summary.totalCost < cheapest.summary.totalCost * 1.15) {
      return {
        strategy: 'Most Reliable',
        reason: `Much higher reliability (+${reliabilityGain.toFixed(1)}%) with minimal cost increase`,
      };
    }

    return {
      strategy: 'Balanced',
      reason: 'Best balance between cost and reliability',
    };
  }

  /**
   * Get service health status
   */
  getHealthStatus() {
    return {
      service: 'Supplier Allocation',
      weights: {
        cost: this.costWeight,
        reliability: this.reliabilityWeight,
        total: this.costWeight + this.reliabilityWeight,
      },
      timestamp: new Date().toISOString(),
    };
  }
}

// Export singleton instance
module.exports = new SupplierAllocationService();
