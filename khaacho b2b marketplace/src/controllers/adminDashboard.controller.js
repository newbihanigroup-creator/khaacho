const logger = require('../shared/logger');
const adminDashboard = require('../services/adminDashboard.service');

/**
 * Admin Dashboard Controller
 * HTTP handlers for admin intelligence dashboard
 */

class AdminDashboardController {
  /**
   * Get complete admin dashboard
   * GET /api/admin-dashboard
   */
  async getAdminDashboard(req, res) {
    try {
      const days = parseInt(req.query.days) || 30;

      logger.info('Admin dashboard requested', { days, user: req.user?.id });

      const dashboard = await adminDashboard.getAdminDashboard(days);

      res.json({
        success: true,
        data: dashboard,
      });
    } catch (error) {
      logger.error('Get admin dashboard failed', {
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
   * Get top selling items
   * GET /api/admin-dashboard/top-selling-items
   */
  async getTopSellingItems(req, res) {
    try {
      const days = parseInt(req.query.days) || 30;
      const limit = parseInt(req.query.limit) || 20;

      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const items = await adminDashboard.getTopSellingItems(startDate, limit);

      res.json({
        success: true,
        data: items,
      });
    } catch (error) {
      logger.error('Get top selling items failed', {
        error: error.message,
      });

      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * Get vendor performance ranking
   * GET /api/admin-dashboard/vendor-performance
   */
  async getVendorPerformance(req, res) {
    try {
      const days = parseInt(req.query.days) || 30;
      const limit = parseInt(req.query.limit) || 20;

      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const performance = await adminDashboard.getVendorPerformanceRanking(
        startDate,
        limit
      );

      res.json({
        success: true,
        data: performance,
      });
    } catch (error) {
      logger.error('Get vendor performance failed', {
        error: error.message,
      });

      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * Get failed orders analysis
   * GET /api/admin-dashboard/failed-orders
   */
  async getFailedOrders(req, res) {
    try {
      const days = parseInt(req.query.days) || 30;

      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const analysis = await adminDashboard.getFailedOrdersAnalysis(startDate);

      res.json({
        success: true,
        data: analysis,
      });
    } catch (error) {
      logger.error('Get failed orders failed', {
        error: error.message,
      });

      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * Get order processing time
   * GET /api/admin-dashboard/processing-time
   */
  async getProcessingTime(req, res) {
    try {
      const days = parseInt(req.query.days) || 30;

      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const processingTime = await adminDashboard.getAverageOrderProcessingTime(
        startDate
      );

      res.json({
        success: true,
        data: processingTime,
      });
    } catch (error) {
      logger.error('Get processing time failed', {
        error: error.message,
      });

      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * Get OCR success rate
   * GET /api/admin-dashboard/ocr-success-rate
   */
  async getOCRSuccessRate(req, res) {
    try {
      const days = parseInt(req.query.days) || 30;

      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const ocrMetrics = await adminDashboard.getOCRSuccessRate(startDate);

      res.json({
        success: true,
        data: ocrMetrics,
      });
    } catch (error) {
      logger.error('Get OCR success rate failed', {
        error: error.message,
      });

      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * Get WhatsApp response time
   * GET /api/admin-dashboard/whatsapp-response-time
   */
  async getWhatsAppResponseTime(req, res) {
    try {
      const days = parseInt(req.query.days) || 30;

      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const whatsappMetrics = await adminDashboard.getWhatsAppResponseTime(
        startDate
      );

      res.json({
        success: true,
        data: whatsappMetrics,
      });
    } catch (error) {
      logger.error('Get WhatsApp response time failed', {
        error: error.message,
      });

      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * Get platform overview
   * GET /api/admin-dashboard/platform-overview
   */
  async getPlatformOverview(req, res) {
    try {
      const days = parseInt(req.query.days) || 30;

      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const overview = await adminDashboard.getPlatformOverview(startDate);

      res.json({
        success: true,
        data: overview,
      });
    } catch (error) {
      logger.error('Get platform overview failed', {
        error: error.message,
      });

      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }
}

module.exports = new AdminDashboardController();
