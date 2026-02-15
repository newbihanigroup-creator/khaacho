const prisma = require('../config/database');
const logger = require('../shared/logger');

/**
 * Vendor Intelligence Scoring System
 * 
 * Modular scoring system for vendor selection and routing
 * Designed for easy ML upgrade in the future
 * 
 * Core Metrics:
 * - Delivery Success Rate (0-100)
 * - Average Response Time (minutes → score 0-100)
 * - Order Acceptance Rate (0-100)
 * - Price Competitiveness (0-100)
 * 
 * Intelligence Score: Weighted composite of all metrics
 */

class VendorIntelligenceService {
  constructor() {
    // Default weights (can be overridden for ML)
    this.weights = {
      deliverySuccessRate: 0.35,
      orderAcceptanceRate: 0.25,
      responseSpeed: 0.20,
      priceCompetitiveness: 0.20,
    };
    
    // Scoring method: 'standard' or 'ml'
    this.scoringMethod = process.env.VENDOR_SCORING_METHOD || 'standard';
  }

  /**
   * Update vendor metrics after order completion
   * Called automatically via trigger or manually
   */
  async updateVendorMetrics(vendorId, orderId = null) {
    logger.setContext({ vendorId, orderId });
    
    try {
      logger.info('Updating vendor metrics', { vendorId, orderId });

      // Calculate all metrics
      const metrics = await this.calculateAllMetrics(vendorId);
      
      // Calculate intelligence score
      const intelligenceScore = await this.calculateIntelligenceScore(metrics);
      
      // Get old metrics for comparison
      const oldMetrics = await this.getVendorMetrics(vendorId);
      
      // Update or create metrics
      const updatedMetrics = await prisma.$executeRaw`
        INSERT INTO vendor_metrics (
          vendor_id,
          delivery_success_rate,
          average_response_time,
          order_acceptance_rate,
          price_competitiveness,
          intelligence_score,
          total_orders,
          completed_orders,
          cancelled_orders,
          rejected_orders,
          total_responses,
          total_response_time_minutes,
          average_price_deviation,
          competitive_products_count,
          total_products_count,
          last_order_at,
          last_calculated_at,
          updated_at
        ) VALUES (
          ${vendorId}::uuid,
          ${metrics.deliverySuccessRate},
          ${metrics.averageResponseTime},
          ${metrics.orderAcceptanceRate},
          ${metrics.priceCompetitiveness},
          ${intelligenceScore},
          ${metrics.totalOrders},
          ${metrics.completedOrders},
          ${metrics.cancelledOrders},
          ${metrics.rejectedOrders},
          ${metrics.totalResponses},
          ${metrics.totalResponseTimeMinutes},
          ${metrics.averagePriceDeviation},
          ${metrics.competitiveProductsCount},
          ${metrics.totalProductsCount},
          ${metrics.lastOrderAt ? new Date(metrics.lastOrderAt) : null},
          CURRENT_TIMESTAMP,
          CURRENT_TIMESTAMP
        )
        ON CONFLICT (vendor_id) DO UPDATE SET
          delivery_success_rate = EXCLUDED.delivery_success_rate,
          average_response_time = EXCLUDED.average_response_time,
          order_acceptance_rate = EXCLUDED.order_acceptance_rate,
          price_competitiveness = EXCLUDED.price_competitiveness,
          intelligence_score = EXCLUDED.intelligence_score,
          total_orders = EXCLUDED.total_orders,
          completed_orders = EXCLUDED.completed_orders,
          cancelled_orders = EXCLUDED.cancelled_orders,
          rejected_orders = EXCLUDED.rejected_orders,
          total_responses = EXCLUDED.total_responses,
          total_response_time_minutes = EXCLUDED.total_response_time_minutes,
          average_price_deviation = EXCLUDED.average_price_deviation,
          competitive_products_count = EXCLUDED.competitive_products_count,
          total_products_count = EXCLUDED.total_products_count,
          last_order_at = EXCLUDED.last_order_at,
          last_calculated_at = EXCLUDED.last_calculated_at,
          updated_at = EXCLUDED.updated_at
      `;
      
      // Log score event
      await this.logScoreEvent(vendorId, orderId, oldMetrics, {
        ...metrics,
        intelligenceScore,
      });
      
      logger.info('Vendor metrics updated successfully', {
        vendorId,
        intelligenceScore,
        deliverySuccessRate: metrics.deliverySuccessRate,
        orderAcceptanceRate: metrics.orderAcceptanceRate,
      });
      
      return {
        ...metrics,
        intelligenceScore,
      };
    } catch (error) {
      logger.error('Failed to update vendor metrics', {
        vendorId,
        orderId,
        error: error.message,
        stack: error.stack,
      });
      throw error;
    }
  }

  /**
   * Calculate all metrics for a vendor
   * Modular design allows easy replacement with ML models
   */
  async calculateAllMetrics(vendorId) {
    const [
      deliveryMetrics,
      responseMetrics,
      acceptanceMetrics,
      priceMetrics,
    ] = await Promise.all([
      this.calculateDeliveryMetrics(vendorId),
      this.calculateResponseMetrics(vendorId),
      this.calculateAcceptanceMetrics(vendorId),
      this.calculatePriceMetrics(vendorId),
    ]);
    
    return {
      ...deliveryMetrics,
      ...responseMetrics,
      ...acceptanceMetrics,
      ...priceMetrics,
    };
  }

  /**
   * Calculate delivery success rate
   * Formula: (completed_orders / total_orders) * 100
   */
  async calculateDeliveryMetrics(vendorId) {
    const result = await prisma.$queryRaw`
      SELECT 
        COUNT(*) as total_orders,
        COUNT(CASE WHEN status = 'COMPLETED' THEN 1 END) as completed_orders,
        COUNT(CASE WHEN status = 'CANCELLED' THEN 1 END) as cancelled_orders,
        MAX(created_at) as last_order_at
      FROM orders
      WHERE vendor_id = ${vendorId}::uuid
        AND status IN ('COMPLETED', 'CANCELLED', 'DELIVERED')
    `;
    
    const totalOrders = Number(result[0]?.total_orders) || 0;
    const completedOrders = Number(result[0]?.completed_orders) || 0;
    const cancelledOrders = Number(result[0]?.cancelled_orders) || 0;
    const lastOrderAt = result[0]?.last_order_at;
    
    const deliverySuccessRate = totalOrders > 0 
      ? (completedOrders / totalOrders) * 100 
      : 0;
    
    return {
      deliverySuccessRate: Math.round(deliverySuccessRate * 100) / 100,
      totalOrders,
      completedOrders,
      cancelledOrders,
      lastOrderAt,
    };
  }

  /**
   * Calculate average response time
   * From vendor_order_acceptance table
   */
  async calculateResponseMetrics(vendorId) {
    const result = await prisma.$queryRaw`
      SELECT 
        COUNT(*) as total_responses,
        SUM(response_time_minutes) as total_response_time,
        AVG(response_time_minutes) as avg_response_time
      FROM vendor_order_acceptance
      WHERE vendor_id = ${vendorId}::uuid
        AND status IN ('ACCEPTED', 'REJECTED')
        AND response_time_minutes IS NOT NULL
    `;
    
    const totalResponses = Number(result[0]?.total_responses) || 0;
    const totalResponseTimeMinutes = Number(result[0]?.total_response_time) || 0;
    const averageResponseTime = Number(result[0]?.avg_response_time) || 0;
    
    return {
      totalResponses,
      totalResponseTimeMinutes,
      averageResponseTime: Math.round(averageResponseTime * 100) / 100,
    };
  }

  /**
   * Calculate order acceptance rate
   * Formula: (accepted_orders / total_offers) * 100
   */
  async calculateAcceptanceMetrics(vendorId) {
    const result = await prisma.$queryRaw`
      SELECT 
        COUNT(*) as total_offers,
        COUNT(CASE WHEN status = 'ACCEPTED' THEN 1 END) as accepted_orders,
        COUNT(CASE WHEN status = 'REJECTED' THEN 1 END) as rejected_orders
      FROM vendor_order_acceptance
      WHERE vendor_id = ${vendorId}::uuid
        AND status IN ('ACCEPTED', 'REJECTED')
    `;
    
    const totalOffers = Number(result[0]?.total_offers) || 0;
    const acceptedOrders = Number(result[0]?.accepted_orders) || 0;
    const rejectedOrders = Number(result[0]?.rejected_orders) || 0;
    
    const orderAcceptanceRate = totalOffers > 0 
      ? (acceptedOrders / totalOffers) * 100 
      : 0;
    
    return {
      orderAcceptanceRate: Math.round(orderAcceptanceRate * 100) / 100,
      rejectedOrders,
    };
  }

  /**
   * Calculate price competitiveness
   * Based on price deviation from market average
   */
  async calculatePriceMetrics(vendorId) {
    const result = await prisma.$queryRaw`
      WITH vendor_prices AS (
        SELECT 
          vp.product_id,
          vp.vendor_price,
          AVG(vp2.vendor_price) OVER (PARTITION BY vp.product_id) as market_avg_price
        FROM vendor_products vp
        INNER JOIN vendor_products vp2 ON vp.product_id = vp2.product_id
        WHERE vp.vendor_id = ${vendorId}::uuid
          AND vp.is_available = true
          AND vp.deleted_at IS NULL
          AND vp2.is_available = true
          AND vp2.deleted_at IS NULL
      )
      SELECT 
        COUNT(*) as total_products,
        AVG(
          CASE 
            WHEN market_avg_price > 0 
            THEN ((vendor_price - market_avg_price) / market_avg_price) * 100
            ELSE 0
          END
        ) as avg_price_deviation,
        COUNT(
          CASE 
            WHEN market_avg_price > 0 
              AND ABS((vendor_price - market_avg_price) / market_avg_price) <= 0.10
            THEN 1
          END
        ) as competitive_products
      FROM vendor_prices
    `;
    
    const totalProductsCount = Number(result[0]?.total_products) || 0;
    const averagePriceDeviation = Number(result[0]?.avg_price_deviation) || 0;
    const competitiveProductsCount = Number(result[0]?.competitive_products) || 0;
    
    // Price competitiveness score: lower deviation = higher score
    // Within 10% of market average = competitive
    let priceCompetitiveness = 50; // Base score
    
    if (totalProductsCount > 0) {
      const competitiveRatio = competitiveProductsCount / totalProductsCount;
      priceCompetitiveness = competitiveRatio * 100;
      
      // Adjust for price deviation
      if (averagePriceDeviation < 0) {
        // Below market average (cheaper) - bonus
        priceCompetitiveness = Math.min(100, priceCompetitiveness + Math.abs(averagePriceDeviation) * 0.5);
      } else if (averagePriceDeviation > 10) {
        // Above market average (expensive) - penalty
        priceCompetitiveness = Math.max(0, priceCompetitiveness - (averagePriceDeviation - 10) * 0.5);
      }
    }
    
    return {
      priceCompetitiveness: Math.round(priceCompetitiveness * 100) / 100,
      averagePriceDeviation: Math.round(averagePriceDeviation * 100) / 100,
      competitiveProductsCount,
      totalProductsCount,
    };
  }

  /**
   * Calculate intelligence score
   * Modular design allows easy ML upgrade
   */
  async calculateIntelligenceScore(metrics) {
    if (this.scoringMethod === 'ml') {
      return await this.calculateIntelligenceScoreML(metrics);
    }
    
    return this.calculateIntelligenceScoreStandard(metrics);
  }

  /**
   * Standard weighted scoring
   */
  calculateIntelligenceScoreStandard(metrics) {
    // Convert response time to score (0-100)
    const responseScore = this.convertResponseTimeToScore(metrics.averageResponseTime);
    
    // Calculate weighted score
    const intelligenceScore = (
      metrics.deliverySuccessRate * this.weights.deliverySuccessRate +
      metrics.orderAcceptanceRate * this.weights.orderAcceptanceRate +
      responseScore * this.weights.responseSpeed +
      metrics.priceCompetitiveness * this.weights.priceCompetitiveness
    );
    
    return Math.round(intelligenceScore * 100) / 100;
  }

  /**
   * ML-based scoring (placeholder for future implementation)
   */
  async calculateIntelligenceScoreML(metrics) {
    // TODO: Implement ML model prediction
    // For now, fallback to standard scoring
    logger.warn('ML scoring not yet implemented, using standard scoring');
    return this.calculateIntelligenceScoreStandard(metrics);
  }

  /**
   * Convert response time (minutes) to score (0-100)
   */
  convertResponseTimeToScore(responseTime) {
    if (responseTime <= 15) return 100;
    if (responseTime <= 30) return 90;
    if (responseTime <= 60) return 80;
    if (responseTime <= 120) return 70;
    if (responseTime <= 240) return 60;
    return 50;
  }

  /**
   * Get vendor metrics
   */
  async getVendorMetrics(vendorId) {
    try {
      const result = await prisma.$queryRaw`
        SELECT * FROM vendor_metrics
        WHERE vendor_id = ${vendorId}::uuid
      `;
      
      return result[0] || null;
    } catch (error) {
      logger.error('Failed to get vendor metrics', {
        vendorId,
        error: error.message,
      });
      return null;
    }
  }

  /**
   * Get top vendors by intelligence score
   */
  async getTopVendors(limit = 10, filters = {}) {
    try {
      const { minScore = 0, productId = null } = filters;
      
      let query = `
        SELECT 
          vm.*,
          v.vendor_code,
          u.name as vendor_name,
          u.business_name,
          u.city
        FROM vendor_metrics vm
        INNER JOIN vendors v ON vm.vendor_id = v.id
        INNER JOIN users u ON v.user_id = u.id
        WHERE vm.intelligence_score >= ${minScore}
          AND v.deleted_at IS NULL
          AND u.is_active = true
      `;
      
      if (productId) {
        query += `
          AND EXISTS (
            SELECT 1 FROM vendor_products vp
            WHERE vp.vendor_id = v.id
              AND vp.product_id = ${productId}::uuid
              AND vp.is_available = true
              AND vp.deleted_at IS NULL
          )
        `;
      }
      
      query += `
        ORDER BY vm.intelligence_score DESC
        LIMIT ${limit}
      `;
      
      const vendors = await prisma.$queryRawUnsafe(query);
      
      return vendors.map(v => ({
        vendorId: v.vendor_id,
        vendorCode: v.vendor_code,
        vendorName: v.vendor_name,
        businessName: v.business_name,
        city: v.city,
        intelligenceScore: Number(v.intelligence_score),
        deliverySuccessRate: Number(v.delivery_success_rate),
        orderAcceptanceRate: Number(v.order_acceptance_rate),
        averageResponseTime: Number(v.average_response_time),
        priceCompetitiveness: Number(v.price_competitiveness),
        totalOrders: Number(v.total_orders),
        lastCalculatedAt: v.last_calculated_at,
      }));
    } catch (error) {
      logger.error('Failed to get top vendors', {
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Log score event for audit trail
   */
  async logScoreEvent(vendorId, orderId, oldMetrics, newMetrics) {
    try {
      const oldScore = oldMetrics?.intelligence_score || 0;
      const newScore = newMetrics.intelligenceScore;
      const scoreDelta = newScore - oldScore;
      
      await prisma.$executeRaw`
        INSERT INTO vendor_score_events (
          vendor_id,
          order_id,
          event_type,
          old_intelligence_score,
          new_intelligence_score,
          score_delta,
          metrics_before,
          metrics_after,
          trigger_reason,
          calculation_method
        ) VALUES (
          ${vendorId}::uuid,
          ${orderId ? orderId : null}::uuid,
          ${orderId ? 'order_completed' : 'manual_update'},
          ${oldScore},
          ${newScore},
          ${scoreDelta},
          ${oldMetrics ? JSON.stringify(oldMetrics) : null}::jsonb,
          ${JSON.stringify(newMetrics)}::jsonb,
          ${orderId ? `Order ${orderId} completed` : 'Manual metric update'},
          ${this.scoringMethod}
        )
      `;
    } catch (error) {
      logger.warn('Failed to log score event', {
        vendorId,
        error: error.message,
      });
      // Don't throw - logging failure shouldn't break metric update
    }
  }

  /**
   * Batch update all vendor metrics
   */
  async batchUpdateAllVendors() {
    try {
      logger.info('Starting batch update of all vendor metrics');
      
      const vendors = await prisma.vendor.findMany({
        where: {
          deletedAt: null,
          isApproved: true,
        },
        select: { id: true },
      });
      
      const results = [];
      
      for (const vendor of vendors) {
        try {
          const metrics = await this.updateVendorMetrics(vendor.id);
          results.push({
            vendorId: vendor.id,
            success: true,
            intelligenceScore: metrics.intelligenceScore,
          });
        } catch (error) {
          logger.error('Failed to update vendor metrics in batch', {
            vendorId: vendor.id,
            error: error.message,
          });
          results.push({
            vendorId: vendor.id,
            success: false,
            error: error.message,
          });
        }
      }
      
      const successCount = results.filter(r => r.success).length;
      
      logger.info('Batch update completed', {
        total: vendors.length,
        successful: successCount,
        failed: vendors.length - successCount,
      });
      
      return results;
    } catch (error) {
      logger.error('Batch update failed', {
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Update scoring weights (for ML tuning)
   */
  updateWeights(newWeights) {
    // Validate weights sum to 1.0
    const sum = Object.values(newWeights).reduce((a, b) => a + b, 0);
    if (Math.abs(sum - 1.0) > 0.01) {
      throw new Error(`Weights must sum to 1.0, got ${sum}`);
    }
    
    this.weights = { ...newWeights };
    logger.info('Scoring weights updated', { weights: this.weights });
  }

  /**
   * Get current configuration
   */
  getConfiguration() {
    return {
      weights: this.weights,
      scoringMethod: this.scoringMethod,
    };
  }
}

module.exports = new VendorIntelligenceService();
