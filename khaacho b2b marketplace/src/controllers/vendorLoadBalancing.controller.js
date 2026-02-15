const logger = require('../shared/logger');
const prisma = require('../config/database');
const vendorLoadBalancing = require('../services/vendorLoadBalancing.service');

/**
 * Vendor Load Balancing Controller
 * HTTP handlers for load balancing endpoints
 */

class VendorLoadBalancingController {
  /**
   * Get vendor load statistics
   * GET /api/load-balancing/statistics
   */
  async getLoadStatistics(req, res) {
    try {
      const { vendorId } = req.query;

      logger.info('Getting vendor load statistics', { vendorId });

      const stats = await vendorLoadBalancing.getVendorLoadStatistics(vendorId);

      res.json({
        success: true,
        data: stats,
      });
    } catch (error) {
      logger.error('Failed to get load statistics', {
        error: error.message,
        stack: error.stack,
      });

      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * Get monopoly statistics
   * GET /api/load-balancing/monopoly
   */
  async getMonopolyStatistics(req, res) {
    try {
      const { productId, days = 30 } = req.query;

      logger.info('Getting monopoly statistics', { productId, days });

      const stats = await vendorLoadBalancing.getMonopolyStatistics(
        productId,
        parseInt(days)
      );

      res.json({
        success: true,
        data: stats,
      });
    } catch (error) {
      logger.error('Failed to get monopoly statistics', {
        error: error.message,
      });

      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * Get vendor capacity status
   * GET /api/load-balancing/capacity
   */
  async getCapacityStatus(req, res) {
    try {
      logger.info('Getting vendor capacity status');

      const capacityStatus = await prisma.$queryRaw`
        SELECT * FROM vendor_capacity_status
        ORDER BY active_orders_count DESC
      `;

      res.json({
        success: true,
        data: capacityStatus.map(v => ({
          vendorId: v.vendor_id,
          vendorCode: v.vendor_code,
          businessName: v.business_name,
          city: v.city,
          state: v.state,
          activeOrdersCount: Number(v.active_orders_count),
          pendingOrdersCount: Number(v.pending_orders_count),
          workingHoursStart: v.working_hours_start,
          workingHoursEnd: v.working_hours_end,
          timezone: v.timezone,
          currentHour: Number(v.current_hour),
          isInWorkingHours: v.is_in_working_hours,
          intelligenceScore: parseFloat(v.intelligence_score),
          calculatedAt: v.calculated_at,
        })),
      });
    } catch (error) {
      logger.error('Failed to get capacity status', {
        error: error.message,
      });

      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * Get market share view
   * GET /api/load-balancing/market-share
   */
  async getMarketShare(req, res) {
    try {
      const { productId, threshold } = req.query;

      logger.info('Getting market share', { productId, threshold });

      let whereClause = '';
      if (productId) {
        whereClause = `WHERE product_id = '${productId}'::uuid`;
      }
      if (threshold) {
        whereClause += whereClause ? ' AND ' : 'WHERE ';
        whereClause += `market_share_percent_30d >= ${parseFloat(threshold)}`;
      }

      const marketShare = await prisma.$queryRawUnsafe(`
        SELECT * FROM vendor_market_share
        ${whereClause}
        ORDER BY market_share_percent_30d DESC
      `);

      res.json({
        success: true,
        data: marketShare.map(v => ({
          vendorId: v.vendor_id,
          vendorCode: v.vendor_code,
          businessName: v.business_name,
          productId: v.product_id,
          productName: v.product_name,
          category: v.category,
          ordersLast30Days: Number(v.orders_last_30_days),
          marketSharePercent30d: parseFloat(v.market_share_percent_30d),
          ordersLast7Days: Number(v.orders_last_7_days),
          marketSharePercent7d: parseFloat(v.market_share_percent_7d),
        })),
      });
    } catch (error) {
      logger.error('Failed to get market share', {
        error: error.message,
      });

      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * Get load balancing history
   * GET /api/load-balancing/history
   */
  async getHistory(req, res) {
    try {
      const { vendorId, productId, limit = 50, offset = 0 } = req.query;

      logger.info('Getting load balancing history', {
        vendorId,
        productId,
        limit,
        offset,
      });

      const where = {};
      if (vendorId) where.selectedVendorId = vendorId;
      if (productId) where.productId = productId;

      const [history, total] = await Promise.all([
        prisma.vendorLoadBalancingLog.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          take: parseInt(limit),
          skip: parseInt(offset),
        }),
        prisma.vendorLoadBalancingLog.count({ where }),
      ]);

      res.json({
        success: true,
        data: {
          history,
          total,
          limit: parseInt(limit),
          offset: parseInt(offset),
        },
      });
    } catch (error) {
      logger.error('Failed to get history', {
        error: error.message,
      });

      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * Update configuration
   * PUT /api/load-balancing/configuration
   */
  async updateConfiguration(req, res) {
    try {
      const { config } = req.body;

      logger.info('Updating load balancing configuration', { config });

      vendorLoadBalancing.updateConfiguration(config);

      res.json({
        success: true,
        message: 'Configuration updated',
        data: vendorLoadBalancing.getConfiguration(),
      });
    } catch (error) {
      logger.error('Failed to update configuration', {
        error: error.message,
      });

      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * Get current configuration
   * GET /api/load-balancing/configuration
   */
  async getConfiguration(req, res) {
    try {
      const config = vendorLoadBalancing.getConfiguration();

      res.json({
        success: true,
        data: config,
      });
    } catch (error) {
      logger.error('Failed to get configuration', {
        error: error.message,
      });

      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * Update vendor working hours
   * PUT /api/load-balancing/vendors/:vendorId/working-hours
   */
  async updateWorkingHours(req, res) {
    try {
      const { vendorId } = req.params;
      const { workingHoursStart, workingHoursEnd, timezone } = req.body;

      logger.info('Updating vendor working hours', {
        vendorId,
        workingHoursStart,
        workingHoursEnd,
        timezone,
      });

      await prisma.vendor.update({
        where: { id: vendorId },
        data: {
          workingHoursStart,
          workingHoursEnd,
          timezone,
        },
      });

      res.json({
        success: true,
        message: 'Working hours updated',
      });
    } catch (error) {
      logger.error('Failed to update working hours', {
        error: error.message,
      });

      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }
}

module.exports = new VendorLoadBalancingController();
