const prisma = require('../config/database');
const logger = require('../utils/logger');
const vendorPerformanceService = require('./vendorPerformance.service');

/**
 * Vendor Selection Service
 * Intelligent vendor selection and order splitting based on multiple criteria
 */
class VendorSelectionService {
  constructor() {
    // Default ranking weights (can be overridden by config)
    this.defaultWeights = {
      reliabilityScore: 0.35,
      deliverySuccessRate: 0.25,
      responseSpeed: 0.20,
      priceCompetitiveness: 0.20,
    };
  }

  /**
   * Select top vendors for each item in an order
   * @param {Array} items - Order items with productId and quantity
   * @param {Object} options - Selection options
   * @returns {Promise<Object>} - Vendor selection results
   */
  async selectVendorsForOrder(items, options = {}) {
    const {
      topN = 3,
      weights = this.defaultWeights,
      retailerId = null,
      minReliabilityScore = 60,
    } = options;

    try {
      logger.info('Starting vendor selection for order', {
        itemCount: items.length,
        topN,
        minReliabilityScore,
      });

      const selectionResults = [];

      // Process each item
      for (const item of items) {
        const vendors = await this.rankVendorsForProduct(
          item.productId,
          item.quantity,
          {
            topN,
            weights,
            retailerId,
            minReliabilityScore,
          }
        );

        selectionResults.push({
          productId: item.productId,
          quantity: item.quantity,
          topVendors: vendors,
          selectedVendor: vendors[0] || null,
        });
      }

      logger.info('Vendor selection completed', {
        itemCount: items.length,
        totalVendorsEvaluated: selectionResults.reduce(
          (sum, r) => sum + r.topVendors.length,
          0
        ),
      });

      return {
        items: selectionResults,
        timestamp: new Date(),
      };
    } catch (error) {
      logger.error('Vendor selection failed', {
        error: error.message,
        stack: error.stack,
      });
      throw error;
    }
  }

  /**
   * Rank vendors for a specific product
   * @param {string} productId - Product ID
   * @param {number} quantity - Required quantity
   * @param {Object} options - Ranking options
   * @returns {Promise<Array>} - Ranked vendors
   */
  async rankVendorsForProduct(productId, quantity, options = {}) {
    const {
      topN = 3,
      weights = this.defaultWeights,
      retailerId = null,
      minReliabilityScore = 60,
    } = options;

    try {
      // Get eligible vendors
      const eligibleVendors = await this.getEligibleVendors(
        productId,
        quantity,
        minReliabilityScore
      );

      if (eligibleVendors.length === 0) {
        logger.warn('No eligible vendors found', { productId, quantity });
        return [];
      }

      // Calculate scores for each vendor
      const scoredVendors = await Promise.all(
        eligibleVendors.map(vendor =>
          this.calculateVendorScore(vendor, weights, retailerId)
        )
      );

      // Sort by final score (descending)
      scoredVendors.sort((a, b) => b.finalScore - a.finalScore);

      // Return top N vendors
      return scoredVendors.slice(0, topN);
    } catch (error) {
      logger.error('Vendor ranking failed', {
        productId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get eligible vendors for a product
   */
  async getEligibleVendors(productId, quantity, minReliabilityScore) {
    try {
      const vendors = await prisma.$queryRaw`
        SELECT 
          v.id as vendor_id,
          v.vendor_code,
          v.rating as vendor_rating,
          v.commission_rate,
          u.name as vendor_name,
          u.business_name,
          u.city,
          u.state,
          u.phone_number,
          
          -- Product details
          vp.id as vendor_product_id,
          vp.vendor_price,
          vp.stock,
          vp.is_available,
          vp.lead_time_days,
          
          -- Inventory
          vi.available_quantity,
          vi.status as inventory_status,
          
          -- Performance metrics
          vr.vendor_score,
          vr.acceptance_rate,
          vr.completion_rate,
          vr.avg_delivery_time,
          vr.total_orders,
          vr.completed_orders,
          
          -- Routing scores
          vrs.reliability_score,
          vrs.overall_score,
          vrs.availability_score,
          vrs.price_score,
          vrs.workload_score,
          vrs.active_orders_count,
          vrs.pending_orders_count,
          vrs.average_fulfillment_time
          
        FROM vendor_products vp
        INNER JOIN vendors v ON vp.vendor_id = v.id
        INNER JOIN users u ON v.user_id = u.id
        LEFT JOIN vendor_inventories vi ON vi.vendor_id = v.id AND vi.product_id = vp.product_id
        LEFT JOIN vendor_rankings vr ON vr.vendor_id = v.id
        LEFT JOIN vendor_routing_scores vrs ON vrs.vendor_id = v.id
        
        WHERE vp.product_id = ${productId}::uuid
          AND vp.is_available = true
          AND vp.deleted_at IS NULL
          AND v.is_approved = true
          AND v.deleted_at IS NULL
          AND u.is_active = true
          AND (vp.stock >= ${quantity} OR vi.available_quantity >= ${quantity})
          AND COALESCE(vrs.reliability_score, vr.vendor_score, v.rating * 20, 0) >= ${minReliabilityScore}
      `;

      return vendors.map(v => ({
        vendorId: v.vendor_id,
        vendorCode: v.vendor_code,
        vendorName: v.vendor_name,
        businessName: v.business_name,
        city: v.city,
        state: v.state,
        phoneNumber: v.phone_number,
        vendorRating: parseFloat(v.vendor_rating) || 0,
        commissionRate: parseFloat(v.commission_rate) || 0,
        
        // Product
        vendorProductId: v.vendor_product_id,
        price: parseFloat(v.vendor_price),
        stock: v.stock,
        isAvailable: v.is_available,
        leadTimeDays: v.lead_time_days,
        
        // Inventory
        availableQuantity: v.available_quantity || v.stock,
        inventoryStatus: v.inventory_status,
        
        // Performance
        vendorScore: parseFloat(v.vendor_score) || 0,
        acceptanceRate: parseFloat(v.acceptance_rate) || 0,
        completionRate: parseFloat(v.completion_rate) || 0,
        avgDeliveryTime: parseFloat(v.avg_delivery_time) || 0,
        totalOrders: v.total_orders || 0,
        completedOrders: v.completed_orders || 0,
        
        // Routing
        reliabilityScore: parseFloat(v.reliability_score) || 0,
        overallScore: parseFloat(v.overall_score) || 0,
        availabilityScore: parseFloat(v.availability_score) || 0,
        priceScore: parseFloat(v.price_score) || 0,
        workloadScore: parseFloat(v.workload_score) || 0,
        activeOrdersCount: v.active_orders_count || 0,
        pendingOrdersCount: v.pending_orders_count || 0,
        averageFulfillmentTime: v.average_fulfillment_time || 0,
      }));
    } catch (error) {
      logger.error('Failed to get eligible vendors', {
        productId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Calculate comprehensive vendor score
   */
  async calculateVendorScore(vendor, weights, retailerId) {
    try {
      // 1. Reliability Score (0-100)
      const reliabilityScore = this.calculateReliabilityScore(vendor);

      // 2. Delivery Success Rate (0-100)
      const deliverySuccessRate = this.calculateDeliverySuccessRate(vendor);

      // 3. Response Speed Score (0-100)
      const responseSpeedScore = await this.calculateResponseSpeedScore(vendor);

      // 4. Price Competitiveness Score (0-100)
      const priceScore = this.calculatePriceScore(vendor);

      // Calculate weighted final score
      const finalScore = (
        reliabilityScore * weights.reliabilityScore +
        deliverySuccessRate * weights.deliverySuccessRate +
        responseSpeedScore * weights.responseSpeed +
        priceScore * weights.priceCompetitiveness
      );

      return {
        ...vendor,
        scores: {
          reliability: reliabilityScore.toFixed(2),
          deliverySuccess: deliverySuccessRate.toFixed(2),
          responseSpeed: responseSpeedScore.toFixed(2),
          price: priceScore.toFixed(2),
        },
        finalScore: finalScore.toFixed(2),
        weights,
      };
    } catch (error) {
      logger.error('Score calculation failed', {
        vendorId: vendor.vendorId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Calculate reliability score
   */
  calculateReliabilityScore(vendor) {
    // Use existing reliability score if available
    if (vendor.reliabilityScore > 0) {
      return vendor.reliabilityScore;
    }

    // Fallback calculation
    const vendorScore = vendor.vendorScore || 0;
    const rating = vendor.vendorRating * 20; // Convert 0-5 to 0-100
    const completionRate = vendor.completionRate || 0;

    // Weighted average
    return (vendorScore * 0.5 + rating * 0.3 + completionRate * 0.2);
  }

  /**
   * Calculate delivery success rate
   */
  calculateDeliverySuccessRate(vendor) {
    if (vendor.completionRate > 0) {
      return vendor.completionRate;
    }

    // Fallback: calculate from orders
    const { totalOrders, completedOrders } = vendor;
    if (totalOrders === 0) return 50; // Neutral score for new vendors

    return (completedOrders / totalOrders) * 100;
  }

  /**
   * Calculate response speed score
   */
  async calculateResponseSpeedScore(vendor) {
    try {
      // Get average response time from vendor acceptances
      const avgResponse = await prisma.vendorOrderAcceptance.aggregate({
        where: {
          vendorId: vendor.vendorId,
          status: 'ACCEPTED',
          responseTimeMinutes: { not: null },
        },
        _avg: {
          responseTimeMinutes: true,
        },
      });

      const avgMinutes = avgResponse._avg.responseTimeMinutes || 120; // Default 2 hours

      // Score based on response time
      if (avgMinutes <= 15) return 100; // < 15 min
      if (avgMinutes <= 30) return 90;  // < 30 min
      if (avgMinutes <= 60) return 80;  // < 1 hour
      if (avgMinutes <= 120) return 70; // < 2 hours
      if (avgMinutes <= 240) return 60; // < 4 hours
      if (avgMinutes <= 480) return 50; // < 8 hours
      return 40; // > 8 hours
    } catch (error) {
      logger.warn('Response speed calculation failed, using default', {
        vendorId: vendor.vendorId,
      });
      return 70; // Default score
    }
  }

  /**
   * Calculate price competitiveness score
   */
  calculatePriceScore(vendor) {
    // Use existing price score if available
    if (vendor.priceScore > 0) {
      return vendor.priceScore;
    }

    // Fallback: simple score based on price
    // Lower price = higher score (inverse relationship)
    // This is a simplified version; ideally compare with market average
    return 75; // Default neutral score
  }

  /**
   * Split order across multiple vendors
   * @param {Array} items - Order items
   * @param {Object} vendorSelections - Vendor selections per item
   * @returns {Promise<Array>} - Split order groups
   */
  async splitOrderByVendor(items, vendorSelections) {
    try {
      const vendorGroups = {};

      // Group items by selected vendor
      items.forEach((item, index) => {
        const selection = vendorSelections.items[index];
        const vendorId = selection.selectedVendor?.vendorId;

        if (!vendorId) {
          logger.warn('No vendor selected for item', {
            productId: item.productId,
          });
          return;
        }

        if (!vendorGroups[vendorId]) {
          vendorGroups[vendorId] = {
            vendorId,
            vendorInfo: selection.selectedVendor,
            items: [],
          };
        }

        vendorGroups[vendorId].items.push({
          ...item,
          vendorProductId: selection.selectedVendor.vendorProductId,
          unitPrice: selection.selectedVendor.price,
        });
      });

      // Convert to array
      const splitOrders = Object.values(vendorGroups);

      logger.info('Order split completed', {
        originalItemCount: items.length,
        vendorCount: splitOrders.length,
      });

      return splitOrders;
    } catch (error) {
      logger.error('Order splitting failed', {
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Store routing decision in database
   * @param {string} orderId - Order ID
   * @param {Object} routingData - Routing decision data
   * @returns {Promise<Object>} - Created routing log
   */
  async storeRoutingDecision(orderId, routingData) {
    try {
      const {
        retailerId,
        items,
        vendorSelections,
        splitOrders,
        weights,
      } = routingData;

      // Create routing log
      const routingLog = await prisma.orderRoutingLog.create({
        data: {
          orderId,
          retailerId,
          routingAttempt: 1,
          vendorsEvaluated: this.formatVendorsEvaluated(vendorSelections),
          selectedVendorId: splitOrders[0]?.vendorId || null,
          routingReason: this.generateRoutingReason(vendorSelections, splitOrders),
          routingCriteria: {
            weights,
            algorithm: 'multi-criteria-scoring',
            version: '1.0',
          },
          isManualOverride: false,
        },
      });

      // Store item-level routing decisions
      await this.storeItemRoutingDecisions(orderId, vendorSelections, routingLog.id);

      logger.info('Routing decision stored', {
        orderId,
        routingLogId: routingLog.id,
        vendorCount: splitOrders.length,
      });

      return routingLog;
    } catch (error) {
      logger.error('Failed to store routing decision', {
        orderId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Store item-level routing decisions
   */
  async storeItemRoutingDecisions(orderId, vendorSelections, routingLogId) {
    try {
      const records = vendorSelections.items.map(item => ({
        orderId,
        routingLogId,
        productId: item.productId,
        selectedVendorId: item.selectedVendor?.vendorId || null,
        topVendors: item.topVendors.slice(0, 3).map(v => ({
          vendorId: v.vendorId,
          vendorCode: v.vendorCode,
          finalScore: v.finalScore,
          scores: v.scores,
        })),
        selectionReason: `Score: ${item.selectedVendor?.finalScore || 0}`,
      }));

      // Store in a custom table (you may need to create this migration)
      // For now, we'll log it
      logger.info('Item routing decisions', {
        orderId,
        routingLogId,
        itemCount: records.length,
      });

      return records;
    } catch (error) {
      logger.error('Failed to store item routing decisions', {
        orderId,
        error: error.message,
      });
      // Don't throw - this is supplementary data
    }
  }

  /**
   * Format vendors evaluated for storage
   */
  formatVendorsEvaluated(vendorSelections) {
    return vendorSelections.items.map(item => ({
      productId: item.productId,
      vendorsEvaluated: item.topVendors.length,
      topVendors: item.topVendors.map(v => ({
        vendorId: v.vendorId,
        vendorCode: v.vendorCode,
        finalScore: v.finalScore,
        scores: v.scores,
      })),
    }));
  }

  /**
   * Generate human-readable routing reason
   */
  generateRoutingReason(vendorSelections, splitOrders) {
    const reasons = [];

    reasons.push(`Order split across ${splitOrders.length} vendor(s)`);

    splitOrders.forEach((split, index) => {
      const itemCount = split.items.length;
      const vendorName = split.vendorInfo.businessName || split.vendorInfo.vendorName;
      const avgScore = split.vendorInfo.finalScore;

      reasons.push(
        `Vendor ${index + 1}: ${vendorName} (${itemCount} item(s), score: ${avgScore})`
      );
    });

    return reasons.join('. ');
  }

  /**
   * Get routing decision for an order
   */
  async getRoutingDecision(orderId) {
    try {
      const routingLog = await prisma.orderRoutingLog.findFirst({
        where: { orderId },
        orderBy: { createdAt: 'desc' },
      });

      return routingLog;
    } catch (error) {
      logger.error('Failed to get routing decision', {
        orderId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Update ranking weights (for ML improvements)
   */
  async updateRankingWeights(newWeights) {
    try {
      // Validate weights sum to 1.0
      const sum = Object.values(newWeights).reduce((a, b) => a + b, 0);
      if (Math.abs(sum - 1.0) > 0.01) {
        throw new Error(`Weights must sum to 1.0, got ${sum}`);
      }

      this.defaultWeights = { ...newWeights };

      logger.info('Ranking weights updated', { weights: newWeights });

      return this.defaultWeights;
    } catch (error) {
      logger.error('Failed to update ranking weights', {
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get current ranking weights
   */
  getRankingWeights() {
    return { ...this.defaultWeights };
  }
}

module.exports = new VendorSelectionService();
