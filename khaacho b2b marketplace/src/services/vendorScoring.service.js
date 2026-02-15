/**
 * Vendor Scoring Service
 * 
 * Dynamic vendor scoring based on:
 * - Response speed
 * - Order acceptance rate
 * - Price competitiveness
 * - Delivery success rate
 * - Cancellation rate
 */

const prisma = require('../config/database');
const logger = require('../shared/logger');

class VendorScoringService {
  constructor() {
    this.config = null;
  }

  /**
   * Get scoring configuration
   */
  async getConfig() {
    if (!this.config) {
      const config = await prisma.vendorScoringConfig.findFirst({
        where: { isActive: true },
        orderBy: { createdAt: 'desc' },
      });
      
      this.config = config || this.getDefaultConfig();
    }
    
    return this.config;
  }

  /**
   * Get default configuration
   */
  getDefaultConfig() {
    return {
      responseTimeThresholdMinutes: 30,
      lateResponsePenaltyPoints: 5.00,
      excellentAcceptanceRate: 90.00,
      goodAcceptanceRate: 75.00,
      poorAcceptanceRate: 50.00,
      excellentDeliveryRate: 95.00,
      goodDeliveryRate: 85.00,
      poorDeliveryRate: 70.00,
      excellentCancellationRate: 2.00,
      acceptableCancellationRate: 5.00,
      poorCancellationRate: 10.00,
      excellentPriceVsMarket: -5.00,
      goodPriceVsMarket: 0.00,
      poorPriceVsMarket: 10.00,
    };
  }

  /**
   * Initialize vendor score
   */
  async initializeVendorScore(vendorId) {
    try {
      await prisma.$queryRaw`
        SELECT initialize_vendor_score(${vendorId}::uuid)
      `;

      logger.info('Vendor score initialized', { vendorId });
    } catch (error) {
      logger.error('Failed to initialize vendor score', {
        vendorId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Track vendor response
   */
  async trackVendorResponse(data) {
    const {
      orderId,
      vendorId,
      assignedAt,
      respondedAt,
      responseType, // ACCEPTED, REJECTED, TIMEOUT
      rejectionReason = null,
    } = data;

    try {
      const responseTimeMinutes = Math.floor(
        (new Date(respondedAt) - new Date(assignedAt)) / (1000 * 60)
      );

      const config = await this.getConfig();
      const isLateResponse = responseTimeMinutes > config.responseTimeThresholdMinutes;

      // Record response
      await prisma.vendorResponseTracking.create({
        data: {
          orderId,
          vendorId,
          assignedAt: new Date(assignedAt),
          respondedAt: new Date(respondedAt),
          responseTimeMinutes,
          responseType,
          rejectionReason,
          isLateResponse,
          expectedResponseTimeMinutes: config.responseTimeThresholdMinutes,
        },
      });

      // Update vendor metrics
      await this.updateVendorMetrics(vendorId, {
        responseTimeMinutes,
        responseType,
        isLateResponse,
      });

      // Update score
      const triggerEvent = isLateResponse ? 'LATE_RESPONSE' : 
        responseType === 'ACCEPTED' ? 'ORDER_ACCEPTED' : 'ORDER_REJECTED';
      
      await this.updateVendorScore(vendorId, triggerEvent, orderId);

      logger.info('Vendor response tracked', {
        orderId,
        vendorId,
        responseType,
        responseTimeMinutes,
        isLateResponse,
      });
    } catch (error) {
      logger.error('Failed to track vendor response', {
        orderId,
        vendorId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Track order delivery
   */
  async trackOrderDelivery(orderId, vendorId, success = true) {
    try {
      // Update vendor metrics
      if (success) {
        await prisma.vendorScores.update({
          where: { vendorId },
          data: {
            totalOrdersDelivered: { increment: 1 },
            lastOrderAt: new Date(),
            updatedAt: new Date(),
          },
        });
      }

      // Update score
      await this.updateVendorScore(
        vendorId,
        success ? 'ORDER_DELIVERED' : 'DELIVERY_FAILED',
        orderId
      );

      logger.info('Order delivery tracked', {
        orderId,
        vendorId,
        success,
      });
    } catch (error) {
      logger.error('Failed to track order delivery', {
        orderId,
        vendorId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Track order cancellation
   */
  async trackOrderCancellation(orderId, vendorId, reason = null) {
    try {
      // Update vendor metrics
      await prisma.vendorScores.update({
        where: { vendorId },
        data: {
          totalOrdersCancelled: { increment: 1 },
          updatedAt: new Date(),
        },
      });

      // Update score
      await this.updateVendorScore(vendorId, 'ORDER_CANCELLED', orderId);

      logger.warn('Order cancellation tracked', {
        orderId,
        vendorId,
        reason,
      });
    } catch (error) {
      logger.error('Failed to track order cancellation', {
        orderId,
        vendorId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Track vendor pricing
   */
  async trackVendorPricing(data) {
    const {
      productId,
      vendorId,
      quotedPrice,
      orderId = null,
      quantity = null,
    } = data;

    try {
      // Get market average price
      const marketAvg = await this.getMarketAveragePrice(productId);
      
      const priceVsMarket = marketAvg > 0
        ? ((quotedPrice - marketAvg) / marketAvg * 100)
        : 0;

      // Record price
      await prisma.vendorPriceTracking.create({
        data: {
          productId,
          vendorId,
          quotedPrice,
          marketAvgPrice: marketAvg,
          priceVsMarket,
          orderId,
          quantity,
        },
      });

      // Update vendor average price vs market
      await this.updateVendorPriceMetrics(vendorId);

      logger.info('Vendor pricing tracked', {
        productId,
        vendorId,
        quotedPrice,
        marketAvg,
        priceVsMarket: `${priceVsMarket.toFixed(2)}%`,
      });
    } catch (error) {
      logger.error('Failed to track vendor pricing', {
        productId,
        vendorId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Update vendor metrics
   */
  async updateVendorMetrics(vendorId, data) {
    const { responseTimeMinutes, responseType, isLateResponse } = data;

    try {
      // Get current metrics
      const current = await prisma.vendorScores.findUnique({
        where: { vendorId },
      });

      if (!current) {
        await this.initializeVendorScore(vendorId);
        return;
      }

      // Calculate new average response time
      const totalResponses = current.totalOrdersAssigned + 1;
      const newAvgResponseTime = 
        ((current.avgResponseTimeMinutes * current.totalOrdersAssigned) + responseTimeMinutes) / 
        totalResponses;

      // Update metrics
      const updateData = {
        avgResponseTimeMinutes: newAvgResponseTime,
        totalOrdersAssigned: { increment: 1 },
        updatedAt: new Date(),
      };

      if (responseType === 'ACCEPTED') {
        updateData.totalOrdersAccepted = { increment: 1 };
      } else if (responseType === 'REJECTED') {
        updateData.totalOrdersRejected = { increment: 1 };
      }

      if (isLateResponse) {
        updateData.lateResponsePenalties = { increment: 1 };
        updateData.totalPenaltyPoints = { 
          increment: (await this.getConfig()).lateResponsePenaltyPoints 
        };
      }

      await prisma.vendorScores.update({
        where: { vendorId },
        data: updateData,
      });
    } catch (error) {
      logger.error('Failed to update vendor metrics', {
        vendorId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Update vendor price metrics
   */
  async updateVendorPriceMetrics(vendorId) {
    try {
      // Calculate average price vs market from recent prices
      const recentPrices = await prisma.vendorPriceTracking.findMany({
        where: {
          vendorId,
          recordedAt: {
            gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Last 30 days
          },
        },
        select: { priceVsMarket: true },
      });

      if (recentPrices.length === 0) return;

      const avgPriceVsMarket = 
        recentPrices.reduce((sum, p) => sum + parseFloat(p.priceVsMarket), 0) / 
        recentPrices.length;

      await prisma.vendorScores.update({
        where: { vendorId },
        data: {
          avgPriceVsMarket,
          updatedAt: new Date(),
        },
      });
    } catch (error) {
      logger.error('Failed to update vendor price metrics', {
        vendorId,
        error: error.message,
      });
    }
  }

  /**
   * Get market average price for product
   */
  async getMarketAveragePrice(productId) {
    try {
      const result = await prisma.vendorInventory.aggregate({
        where: {
          productId,
          inStock: true,
          price: { gt: 0 },
        },
        _avg: { price: true },
      });

      return parseFloat(result._avg.price) || 0;
    } catch (error) {
      logger.error('Failed to get market average price', {
        productId,
        error: error.message,
      });
      return 0;
    }
  }

  /**
   * Update vendor score
   */
  async updateVendorScore(vendorId, triggerEvent, orderId = null) {
    try {
      await prisma.$queryRaw`
        SELECT update_vendor_score(
          ${vendorId}::uuid,
          ${triggerEvent},
          ${orderId}::uuid
        )
      `;

      logger.info('Vendor score updated', {
        vendorId,
        triggerEvent,
        orderId,
      });
    } catch (error) {
      logger.error('Failed to update vendor score', {
        vendorId,
        triggerEvent,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get vendor score
   */
  async getVendorScore(vendorId) {
    try {
      const score = await prisma.vendorScores.findUnique({
        where: { vendorId },
        include: {
          vendor: {
            include: {
              user: {
                select: {
                  businessName: true,
                  phoneNumber: true,
                },
              },
            },
          },
        },
      });

      return score;
    } catch (error) {
      logger.error('Failed to get vendor score', {
        vendorId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get vendor score history
   */
  async getVendorScoreHistory(vendorId, days = 30) {
    try {
      const history = await prisma.vendorScoreHistory.findMany({
        where: {
          vendorId,
          recordedAt: {
            gte: new Date(Date.now() - days * 24 * 60 * 60 * 1000),
          },
        },
        orderBy: { recordedAt: 'desc' },
      });

      return history;
    } catch (error) {
      logger.error('Failed to get vendor score history', {
        vendorId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get top vendors by score
   */
  async getTopVendors(limit = 10) {
    try {
      const vendors = await prisma.$queryRaw`
        SELECT * FROM top_vendors_by_score
        LIMIT ${limit}
      `;

      return vendors;
    } catch (error) {
      logger.error('Failed to get top vendors', {
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get best vendors for product
   */
  async getBestVendorsForProduct(productId, limit = 5) {
    try {
      const vendors = await prisma.$queryRaw`
        SELECT * FROM get_best_vendors_for_product(
          ${productId}::uuid,
          ${limit}
        )
      `;

      return vendors;
    } catch (error) {
      logger.error('Failed to get best vendors for product', {
        productId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Select best vendor for order
   * Automatically chooses highest scoring vendor
   */
  async selectBestVendorForOrder(orderItems) {
    try {
      // Get all products in order
      const productIds = orderItems.map(item => item.productId);

      // Get vendors who have all products in stock
      const vendorsWithStock = await prisma.vendorInventory.groupBy({
        by: ['vendorId'],
        where: {
          productId: { in: productIds },
          inStock: true,
        },
        having: {
          productId: {
            _count: productIds.length, // Must have all products
          },
        },
      });

      if (vendorsWithStock.length === 0) {
        logger.warn('No vendors have all products in stock', {
          productIds,
        });
        return null;
      }

      const vendorIds = vendorsWithStock.map(v => v.vendorId);

      // Get scores for these vendors
      const scores = await prisma.vendorScores.findMany({
        where: {
          vendorId: { in: vendorIds },
          isActive: true,
        },
        orderBy: { overallScore: 'desc' },
        take: 1,
        include: {
          vendor: {
            include: {
              user: {
                select: {
                  businessName: true,
                },
              },
            },
          },
        },
      });

      if (scores.length === 0) {
        logger.warn('No active vendors found with scores', {
          vendorIds,
        });
        return null;
      }

      const bestVendor = scores[0];

      logger.info('Best vendor selected', {
        vendorId: bestVendor.vendorId,
        vendorName: bestVendor.vendor.user.businessName,
        score: bestVendor.overallScore,
        productCount: productIds.length,
      });

      return bestVendor;
    } catch (error) {
      logger.error('Failed to select best vendor', {
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get vendor performance summary
   */
  async getVendorPerformanceSummary(vendorId) {
    try {
      const [score, responsePerf, scoreHistory] = await Promise.all([
        this.getVendorScore(vendorId),
        this.getVendorResponsePerformance(vendorId),
        this.getVendorScoreHistory(vendorId, 30),
      ]);

      return {
        currentScore: score,
        responsePerformance: responsePerf,
        scoreHistory,
        performanceTier: this.getPerformanceTier(score?.overallScore),
      };
    } catch (error) {
      logger.error('Failed to get vendor performance summary', {
        vendorId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get vendor response performance
   */
  async getVendorResponsePerformance(vendorId) {
    try {
      const result = await prisma.$queryRaw`
        SELECT * FROM vendor_response_performance
        WHERE vendor_id = ${vendorId}::uuid
      `;

      return result[0] || null;
    } catch (error) {
      logger.error('Failed to get vendor response performance', {
        vendorId,
        error: error.message,
      });
      return null;
    }
  }

  /**
   * Get performance tier
   */
  getPerformanceTier(score) {
    if (!score) return 'UNKNOWN';
    if (score >= 90) return 'EXCELLENT';
    if (score >= 75) return 'GOOD';
    if (score >= 50) return 'AVERAGE';
    return 'POOR';
  }

  /**
   * Penalize vendor for late response
   */
  async penalizeLateResponse(vendorId, orderId, minutesLate) {
    try {
      const config = await this.getConfig();
      
      await prisma.vendorScores.update({
        where: { vendorId },
        data: {
          lateResponsePenalties: { increment: 1 },
          totalPenaltyPoints: { increment: config.lateResponsePenaltyPoints },
          updatedAt: new Date(),
        },
      });

      await this.updateVendorScore(vendorId, 'LATE_RESPONSE', orderId);

      logger.warn('Vendor penalized for late response', {
        vendorId,
        orderId,
        minutesLate,
        penaltyPoints: config.lateResponsePenaltyPoints,
      });
    } catch (error) {
      logger.error('Failed to penalize late response', {
        vendorId,
        orderId,
        error: error.message,
      });
    }
  }
}

module.exports = new VendorScoringService();
