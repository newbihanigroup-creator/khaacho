/**
 * Safe Mode Controller
 * 
 * Admin endpoints for managing safe mode
 */

const safeModeService = require('../services/safeMode.service');
const logger = require('../shared/logger');

class SafeModeController {
  /**
   * Get current safe mode status
   */
  async getStatus(req, res) {
    try {
      const status = await safeModeService.getStatus();

      return res.json({
        success: true,
        data: status,
      });
    } catch (error) {
      logger.error('Failed to get safe mode status', {
        error: error.message,
      });

      return res.status(500).json({
        success: false,
        error: 'Failed to get safe mode status',
      });
    }
  }

  /**
   * Enable safe mode
   */
  async enable(req, res) {
    try {
      const {
        reason,
        autoDisableMinutes = null,
        customMessage = null,
      } = req.body;

      if (!reason) {
        return res.status(400).json({
          success: false,
          error: 'Reason is required',
        });
      }

      const enabledBy = req.user?.email || req.user?.id || 'ADMIN';

      const status = await safeModeService.enable({
        enabledBy,
        reason,
        autoDisableMinutes,
        customMessage,
      });

      logger.warn('Safe mode enabled by admin', {
        enabledBy,
        reason,
        autoDisableMinutes,
      });

      return res.json({
        success: true,
        message: 'Safe mode enabled',
        data: status,
      });
    } catch (error) {
      logger.error('Failed to enable safe mode', {
        error: error.message,
      });

      return res.status(500).json({
        success: false,
        error: 'Failed to enable safe mode',
      });
    }
  }

  /**
   * Disable safe mode
   */
  async disable(req, res) {
    try {
      const disabledBy = req.user?.email || req.user?.id || 'ADMIN';

      const stats = await safeModeService.disable(disabledBy);

      logger.info('Safe mode disabled by admin', {
        disabledBy,
        ordersQueued: stats.orders_queued,
        durationMinutes: stats.duration_minutes,
      });

      return res.json({
        success: true,
        message: 'Safe mode disabled',
        data: {
          ordersQueued: stats.orders_queued,
          durationMinutes: stats.duration_minutes,
        },
      });
    } catch (error) {
      logger.error('Failed to disable safe mode', {
        error: error.message,
      });

      return res.status(500).json({
        success: false,
        error: 'Failed to disable safe mode',
      });
    }
  }

  /**
   * Get safe mode history
   */
  async getHistory(req, res) {
    try {
      const { days = 30 } = req.query;

      const history = await safeModeService.getHistory(parseInt(days));

      return res.json({
        success: true,
        data: history,
      });
    } catch (error) {
      logger.error('Failed to get safe mode history', {
        error: error.message,
      });

      return res.status(500).json({
        success: false,
        error: 'Failed to get safe mode history',
      });
    }
  }

  /**
   * Get safe mode metrics
   */
  async getMetrics(req, res) {
    try {
      const { hours = 24 } = req.query;

      const metrics = await safeModeService.getMetrics(parseInt(hours));

      return res.json({
        success: true,
        data: metrics,
      });
    } catch (error) {
      logger.error('Failed to get safe mode metrics', {
        error: error.message,
      });

      return res.status(500).json({
        success: false,
        error: 'Failed to get safe mode metrics',
      });
    }
  }

  /**
   * Get queued orders
   */
  async getQueuedOrders(req, res) {
    try {
      const { limit = 100 } = req.query;

      const orders = await safeModeService.getQueuedOrders(parseInt(limit));

      return res.json({
        success: true,
        data: orders,
      });
    } catch (error) {
      logger.error('Failed to get queued orders', {
        error: error.message,
      });

      return res.status(500).json({
        success: false,
        error: 'Failed to get queued orders',
      });
    }
  }

  /**
   * Get queued orders summary
   */
  async getQueuedOrdersSummary(req, res) {
    try {
      const summary = await safeModeService.getQueuedOrdersSummary();

      return res.json({
        success: true,
        data: summary,
      });
    } catch (error) {
      logger.error('Failed to get queued orders summary', {
        error: error.message,
      });

      return res.status(500).json({
        success: false,
        error: 'Failed to get queued orders summary',
      });
    }
  }
}

module.exports = new SafeModeController();
