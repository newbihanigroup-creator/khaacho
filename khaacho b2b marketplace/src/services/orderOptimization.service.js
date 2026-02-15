const logger = require('../utils/logger');
const vendorPerformanceService = require('./vendorPerformance.service');

/**
 * Order Optimization Service
 * 
 * Optimizes supplier allocation for orders by:
 * - Minimizing total cost
 * - Preferring higher reliability scores
 * - Considering stock availability
 * - Balancing multiple objectives
 */

class OrderOptimizationService {
  constructor() {
    // Configurable weights for optimization
    this.weights = {
      price: parseFloat(process.env.OPTIMIZATION_PRICE_WEIGHT || '0.6'),        // 60% weight on price
      reliability: parseFloat(process.env.OPTIMIZATION_RELIABILITY_WEIGHT || '0.3'), // 30% weight on reliability
      availability: parseFloat(process.env.OPTIMIZATION_AVAILABILITY_WEIGHT || '0.1'), // 10% weight on availability
    };

    // Minimum reliability score threshold
    this.minReliabilityScore = parseFloat(process.env.MIN_RELIABILITY_SCORE || '50');
  }

  /**
   * Optimize order allocation across suppliers
   * @param {Array} items - List of items with productId and quantity
   * @param {Object} options - Optimization options
   * @returns {Promise<Object>} Optimized allocation plan
   */
  async optimizeOrder(items, options = {}) {
    logger.info('🔄 Starting order optimization', {
      itemCount: items.length,
      options,
    });

    try {
      // Validate input
      if (!items || items.length === 0) {
        throw new Error('No items provided for optimization');
      }

      // Get supplier offers for all items
      const supplierOffers = await this.getSupplierOffers(items, options);

      // Calculate optimal allocation
      const allocation = await this.calculateOptimalAllocation(items, supplierOffers, options);

      // Generate allocation plan
      const plan = this.generateAllocationPlan(allocation, supplierOffers);

      logger.info('✅ Order optimization completed', {
        totalItems: items.length,
        suppliersUsed: plan.suppliers.length,
        totalCost: plan.totalCost,
        avgReliability: plan.avgReliabilityScore,
      });

      return plan;

    } catch (error) {
      logger.error('❌ Order optimization failed', {
        error: error.message,
        stack: error.stack,
      });
      throw error;
    }
  }

  /**
   * Get supplier offers for all items
   * @private
   */
  async getSupplierOffers(items, options = {}) {
    logger.info('📊 Fetching supplier offers', { itemCount: items.length });

    const offers = {};

    for (const item of items) {
      try {
        // Get top reliable suppliers for this product
        const limit = options.maxSuppliersPerProduct || 10;
        const suppliers = await vendorPerformanceService.getTopReliableWholesellers(
          item.productId,
          limit
        );

        // Filter suppliers by minimum reliability and stock availability
        const validSuppliers = suppliers.filter(supplier => 
          supplier.reliabilityScore >= this.minReliabilityScore &&
          supplier.stock >= item.quantity &&
          supplier.isAvailable
        );

        if (validSuppliers.length === 0) {
          logger.warn('No valid suppliers found for item', {
            productId: item.productId,
            quantity: item.quantity,
          });
        }

        offers[item.productId] = {
          item,
          suppliers: validSuppliers,
        };

      } catch (error) {
        logger.error('Failed to get suppliers for item', {
          productId: item.productId,
          error: error.message,
        });
        offers[item.productId] = {
          item,
          suppliers: [],
        };
      }
    }

    const totalOffers = Object.values(offers).reduce((sum, o) => sum + o.suppliers.length, 0);
    logger.info('✅ Supplier offers fetched', {
      products: Object.keys(offers).length,
      totalOffers,
    });

    return offers;
  }

  /**
   * Calculate optimal allocation using weighted scoring
   * @private
   */
  async calculateOptimalAllocation(items, supplierOffers, options = {}) {
    logger.info('🧮 Calculating optimal allocation');

    const allocation = [];
    const strategy = options.strategy || 'balanced'; // 'balanced', 'cheapest', 'most_reliable'

    for (const item of items) {
      const offers = supplierOffers[item.productId];

      if (!offers || offers.suppliers.length === 0) {
        allocation.push({
          productId: item.productId,
          quantity: item.quantity,
          supplier: null,
          reason: 'No suppliers available',
        });
        continue;
      }

      // Score each supplier
      const scoredSuppliers = this.scoreSuppliers(offers.suppliers, item, strategy);

      // Select best supplier
      const bestSupplier = scoredSuppliers[0];

      allocation.push({
        productId: item.productId,
        productName: bestSupplier.productName,
        quantity: item.quantity,
        unit: item.unit || bestSupplier.unit,
        supplier: {
          vendorId: bestSupplier.vendorId,
          vendorName: bestSupplier.vendorName,
          vendorCode: bestSupplier.vendorCode,
          price: bestSupplier.price,
          reliabilityScore: bestSupplier.reliabilityScore,
          stock: bestSupplier.stock,
          leadTimeDays: bestSupplier.leadTimeDays,
        },
        cost: bestSupplier.price * item.quantity,
        score: bestSupplier.optimizationScore,
        alternatives: scoredSuppliers.slice(1, 4).map(s => ({
          vendorId: s.vendorId,
          vendorName: s.vendorName,
          price: s.price,
          reliabilityScore: s.reliabilityScore,
          score: s.optimizationScore,
        })),
      });
    }

    logger.info('✅ Allocation calculated', {
      allocatedItems: allocation.filter(a => a.supplier).length,
      unallocatedItems: allocation.filter(a => !a.supplier).length,
    });

    return allocation;
  }

  /**
   * Score suppliers based on multiple criteria
   * @private
   */
  scoreSuppliers(suppliers, item, strategy = 'balanced') {
    // Get min/max values for normalization
    const prices = suppliers.map(s => s.price);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const priceRange = maxPrice - minPrice || 1;

    const reliabilityScores = suppliers.map(s => s.reliabilityScore);
    const minReliability = Math.min(...reliabilityScores);
    const maxReliability = Math.max(...reliabilityScores);
    const reliabilityRange = maxReliability - minReliability || 1;

    // Score each supplier
    const scored = suppliers.map(supplier => {
      // Normalize price (lower is better, so invert)
      const priceScore = 1 - ((supplier.price - minPrice) / priceRange);

      // Normalize reliability (higher is better)
      const reliabilityScore = (supplier.reliabilityScore - minReliability) / reliabilityRange;

      // Availability score (has enough stock)
      const availabilityScore = supplier.stock >= item.quantity ? 1 : 0;

      // Calculate weighted score based on strategy
      let weights = this.weights;
      
      if (strategy === 'cheapest') {
        weights = { price: 0.8, reliability: 0.15, availability: 0.05 };
      } else if (strategy === 'most_reliable') {
        weights = { price: 0.2, reliability: 0.7, availability: 0.1 };
      }

      const optimizationScore = (
        priceScore * weights.price +
        reliabilityScore * weights.reliability +
        availabilityScore * weights.availability
      );

      return {
        ...supplier,
        optimizationScore,
        priceScore,
        reliabilityScoreNormalized: reliabilityScore,
        availabilityScore,
      };
    });

    // Sort by optimization score (highest first)
    scored.sort((a, b) => b.optimizationScore - a.optimizationScore);

    return scored;
  }

  /**
   * Generate final allocation plan
   * @private
   */
  generateAllocationPlan(allocation, supplierOffers) {
    // Group by supplier
    const supplierGroups = {};
    
    allocation.forEach(item => {
      if (!item.supplier) return;

      const vendorId = item.supplier.vendorId;
      
      if (!supplierGroups[vendorId]) {
        supplierGroups[vendorId] = {
          vendorId,
          vendorName: item.supplier.vendorName,
          vendorCode: item.supplier.vendorCode,
          reliabilityScore: item.supplier.reliabilityScore,
          items: [],
          subtotal: 0,
        };
      }

      supplierGroups[vendorId].items.push({
        productId: item.productId,
        productName: item.productName,
        quantity: item.quantity,
        unit: item.unit,
        price: item.supplier.price,
        cost: item.cost,
        leadTimeDays: item.supplier.leadTimeDays,
      });

      supplierGroups[vendorId].subtotal += item.cost;
    });

    const suppliers = Object.values(supplierGroups);

    // Calculate totals
    const totalCost = suppliers.reduce((sum, s) => sum + s.subtotal, 0);
    const totalItems = allocation.filter(a => a.supplier).length;
    const unallocatedItems = allocation.filter(a => !a.supplier);

    // Calculate average reliability
    const avgReliabilityScore = suppliers.length > 0
      ? suppliers.reduce((sum, s) => sum + s.reliabilityScore, 0) / suppliers.length
      : 0;

    // Calculate savings (compared to highest price)
    let potentialMaxCost = 0;
    allocation.forEach(item => {
      if (item.supplier) {
        const offers = supplierOffers[item.productId];
        if (offers && offers.suppliers.length > 0) {
          const maxPrice = Math.max(...offers.suppliers.map(s => s.price));
          potentialMaxCost += maxPrice * item.quantity;
        }
      }
    });
    const savings = potentialMaxCost - totalCost;
    const savingsPercentage = potentialMaxCost > 0 ? (savings / potentialMaxCost) * 100 : 0;

    return {
      success: true,
      totalCost,
      totalItems,
      suppliersUsed: suppliers.length,
      avgReliabilityScore: parseFloat(avgReliabilityScore.toFixed(2)),
      savings: parseFloat(savings.toFixed(2)),
      savingsPercentage: parseFloat(savingsPercentage.toFixed(2)),
      suppliers,
      unallocatedItems: unallocatedItems.map(item => ({
        productId: item.productId,
        quantity: item.quantity,
        reason: item.reason,
      })),
      allocation: allocation.filter(a => a.supplier),
      metadata: {
        optimizationWeights: this.weights,
        minReliabilityScore: this.minReliabilityScore,
        timestamp: new Date().toISOString(),
      },
    };
  }

  /**
   * Compare multiple optimization strategies
   * @param {Array} items - List of items
   * @returns {Promise<Object>} Comparison of different strategies
   */
  async compareStrategies(items) {
    logger.info('📊 Comparing optimization strategies', { itemCount: items.length });

    const strategies = ['balanced', 'cheapest', 'most_reliable'];
    const results = {};

    for (const strategy of strategies) {
      try {
        const plan = await this.optimizeOrder(items, { strategy });
        results[strategy] = {
          totalCost: plan.totalCost,
          avgReliabilityScore: plan.avgReliabilityScore,
          suppliersUsed: plan.suppliersUsed,
          savings: plan.savings,
          savingsPercentage: plan.savingsPercentage,
        };
      } catch (error) {
        logger.error(`Strategy ${strategy} failed`, { error: error.message });
        results[strategy] = { error: error.message };
      }
    }

    logger.info('✅ Strategy comparison completed', { strategies: Object.keys(results) });

    return {
      strategies: results,
      recommendation: this.recommendStrategy(results),
    };
  }

  /**
   * Recommend best strategy based on comparison
   * @private
   */
  recommendStrategy(results) {
    const strategies = Object.entries(results).filter(([_, r]) => !r.error);

    if (strategies.length === 0) {
      return null;
    }

    // Score each strategy
    const scored = strategies.map(([name, result]) => {
      // Normalize metrics
      const costs = strategies.map(([_, r]) => r.totalCost);
      const minCost = Math.min(...costs);
      const maxCost = Math.max(...costs);
      const costRange = maxCost - minCost || 1;
      const costScore = 1 - ((result.totalCost - minCost) / costRange);

      const reliabilities = strategies.map(([_, r]) => r.avgReliabilityScore);
      const minReliability = Math.min(...reliabilities);
      const maxReliability = Math.max(...reliabilities);
      const reliabilityRange = maxReliability - minReliability || 1;
      const reliabilityScore = (result.avgReliabilityScore - minReliability) / reliabilityRange;

      // Balanced score
      const score = costScore * 0.6 + reliabilityScore * 0.4;

      return {
        strategy: name,
        score,
        ...result,
      };
    });

    // Sort by score
    scored.sort((a, b) => b.score - a.score);

    return scored[0].strategy;
  }

  /**
   * Validate allocation plan
   * @param {Object} plan - Allocation plan to validate
   * @returns {Object} Validation result
   */
  validateAllocationPlan(plan) {
    const issues = [];

    // Check if all items are allocated
    if (plan.unallocatedItems && plan.unallocatedItems.length > 0) {
      issues.push({
        severity: 'warning',
        message: `${plan.unallocatedItems.length} items could not be allocated`,
        items: plan.unallocatedItems,
      });
    }

    // Check reliability scores
    const lowReliabilitySuppliers = plan.suppliers.filter(
      s => s.reliabilityScore < 60
    );
    if (lowReliabilitySuppliers.length > 0) {
      issues.push({
        severity: 'warning',
        message: `${lowReliabilitySuppliers.length} suppliers have low reliability scores`,
        suppliers: lowReliabilitySuppliers.map(s => ({
          vendorName: s.vendorName,
          reliabilityScore: s.reliabilityScore,
        })),
      });
    }

    // Check if cost is reasonable
    if (plan.savingsPercentage < 0) {
      issues.push({
        severity: 'error',
        message: 'Negative savings detected - optimization may have failed',
      });
    }

    return {
      valid: issues.filter(i => i.severity === 'error').length === 0,
      issues,
    };
  }
}

module.exports = new OrderOptimizationService();
