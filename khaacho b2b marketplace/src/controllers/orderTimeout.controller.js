/**
 * Order Timeout Controller
 * 
 * Admin endpoints for managing order timeouts and viewing statistics
 */

const orderTimeoutService = require('../services/orderTimeout.service');
const orderTimeoutWorker = require('../workers/orderTimeout.worker');
const logger = require('../shared/logger');

class OrderTimeoutController {
  /**
   * Get timeout configuration
   */
  async getConfig(req, res) {
    try {
      const config = await orderTimeoutService.getConfig();
      
      return res.json({
        success: true,
        data: config,
      });
    } catch (error) {
      logger.error('Failed to get timeout config', {
        error: error.message,
      });
      
      return res.status(500).json({
        success: false,
        error: 'Failed to get timeout configuration',
      });
    }
  }

  /**
   * Get timeout statistics
   */
  async getStatistics(req, res) {
    try {
      const { days = 30 } = req.query;
      
      const stats = await orderTimeoutService.getTimeoutStatistics(parseInt(days));
      
      return res.json({
        success: true,
        data: stats,
      });
    } catch (error) {
      logger.error('Failed to get timeout statistics', {
        error: error.message,
      });
      
      return res.status(500).json({
        success: false,
        error: 'Failed to get timeout statistics',
      });
    }
  }

  /**
   * Get vendor timeout performance
   */
  async getVendorPerformance(req, res) {
    try {
      const performance = await orderTimeoutService.getVendorTimeoutPerformance();
      
      return res.json({
        success: true,
        data: performance,
      });
    } catch (error) {
      logger.error('Failed to get vendor timeout performance', {
        error: error.message,
      });
      
      return res.status(500).json({
        success: false,
        error: 'Failed to get vendor timeout performance',
      });
    }
  }

  /**
   * Get active timeouts
   */
  async getActiveTimeouts(req, res) {
    try {
      const timeouts = await orderTimeoutService.getActiveTimeouts();
      
      return res.json({
        success: true,
        data: timeouts,
      });
    } catch (error) {
      logger.error('Failed to get active timeouts', {
        error: error.message,
      });
      
      return res.status(500).json({
        success: false,
        error: 'Failed to get active timeouts',
      });
    }
  }

  /**
   * Get unresolved delays
   */
  async getUnresolvedDelays(req, res) {
    try {
      const delays = await orderTimeoutService.getUnresolvedDelays();
      
      return res.json({
        success: true,
        data: delays,
      });
    } catch (error) {
      logger.error('Failed to get unresolved delays', {
        error: error.message,
      });
      
      return res.status(500).json({
        success: false,
        error: 'Failed to get unresolved delays',
      });
    }
  }

  /**
   * Get worker status
   */
  async getWorkerStatus(req, res) {
    try {
      const stats = orderTimeoutWorker.getStats();
      
      return res.json({
        success: true,
        data: stats,
      });
    } catch (error) {
      logger.error('Failed to get worker status', {
        error: error.message,
      });
      
      return res.status(500).json({
        success: false,
        error: 'Failed to get worker status',
      });
    }
  }

  /**
   * Trigger manual timeout check
   */
  async triggerManualCheck(req, res) {
    try {
      logger.info('Manual timeout check triggered by admin', {
        adminId: req.user?.id,
      });
      
      // Trigger asynchronously
      orderTimeoutWorker.triggerManually().catch(error => {
        logger.error('Manual timeout check failed', {
          error: error.message,
        });
      });
      
      return res.json({
        success: true,
        message: 'Timeout check triggered',
      });
    } catch (error) {
      logger.error('Failed to trigger manual check', {
        error: error.message,
      });
      
      return res.status(500).json({
        success: false,
        error: 'Failed to trigger manual check',
      });
    }
  }

  /**
   * Mark delay as resolved
   */
  async resolveDelay(req, res) {
    try {
      const { delayId } = req.params;
      const { resolutionNotes } = req.body;
      
      await prisma.orderDelayLog.update({
        where: { id: delayId },
        data: {
          resolved: true,
          resolvedAt: new Date(),
          resolutionNotes,
        },
      });
      
      logger.info('Delay marked as resolved', {
        delayId,
        adminId: req.user?.id,
      });
      
      return res.json({
        success: true,
        message: 'Delay marked as resolved',
      });
    } catch (error) {
      logger.error('Failed to resolve delay', {
        delayId: req.params.delayId,
        error: error.message,
      });
      
      return res.status(500).json({
        success: false,
        error: 'Failed to resolve delay',
      });
    }
  }

  /**
   * Get admin notifications
   */
  async getNotifications(req, res) {
    try {
      const { status = 'UNREAD', limit = 50 } = req.query;
      
      const notifications = await prisma.adminNotifications.findMany({
        where: status !== 'ALL' ? { status } : {},
        orderBy: { createdAt: 'desc' },
        take: parseInt(limit),
        include: {
          order: {
            select: {
              orderNumber: true,
              status: true,
            },
          },
        },
      });
      
      return res.json({
        success: true,
        data: notifications,
      });
    } catch (error) {
      logger.error('Failed to get notifications', {
        error: error.message,
      });
      
      return res.status(500).json({
        success: false,
        error: 'Failed to get notifications',
      });
    }
  }

  /**
   * Mark notification as read
   */
  async markNotificationRead(req, res) {
    try {
      const { notificationId } = req.params;
      
      await prisma.adminNotifications.update({
        where: { id: notificationId },
        data: {
          status: 'READ',
          readAt: new Date(),
          updatedAt: new Date(),
        },
      });
      
      return res.json({
        success: true,
        message: 'Notification marked as read',
      });
    } catch (error) {
      logger.error('Failed to mark notification as read', {
        notificationId: req.params.notificationId,
        error: error.message,
      });
      
      return res.status(500).json({
        success: false,
        error: 'Failed to mark notification as read',
      });
    }
  }

  /**
   * Acknowledge notification
   */
  async acknowledgeNotification(req, res) {
    try {
      const { notificationId } = req.params;
      const { actionTaken } = req.body;
      
      await prisma.adminNotifications.update({
        where: { id: notificationId },
        data: {
          status: 'ACKNOWLEDGED',
          acknowledgedAt: new Date(),
          acknowledgedBy: req.user?.email || req.user?.id,
          actionTaken,
          actionTakenAt: new Date(),
          actionTakenBy: req.user?.email || req.user?.id,
          updatedAt: new Date(),
        },
      });
      
      logger.info('Notification acknowledged', {
        notificationId,
        adminId: req.user?.id,
      });
      
      return res.json({
        success: true,
        message: 'Notification acknowledged',
      });
    } catch (error) {
      logger.error('Failed to acknowledge notification', {
        notificationId: req.params.notificationId,
        error: error.message,
      });
      
      return res.status(500).json({
        success: false,
        error: 'Failed to acknowledge notification',
      });
    }
  }
}

module.exports = new OrderTimeoutController();
