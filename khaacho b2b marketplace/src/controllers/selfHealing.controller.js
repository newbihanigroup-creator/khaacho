const selfHealingService = require('../services/selfHealing.service');
const logger = require('../utils/logger');

/**
 * Self-Healing Controller
 */
class SelfHealingController {
  /**
   * Detect stuck orders
   */
  async detectStuckOrders(req, res) {
    try {
      const stuckOrders = await selfHealingService.detectStuckOrders();

      res.json({
        success: true,
        count: stuckOrders.length,
        stuckOrders,
      });
    } catch (error) {
      logger.error('Failed to detect stuck orders', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Failed to detect stuck orders',
      });
    }
  }

  /**
   * Manually trigger healing for specific order
   */
  async healOrder(req, res) {
    try {
      const { orderId } = req.params;
      const { issueType, recoveryAction } = req.body;

      if (!issueType || !recoveryAction) {
        return res.status(400).json({
          success: false,
          error: 'issueType and recoveryAction are required',
        });
      }

      const healingId = await selfHealingService.initiateHealing(
        parseInt(orderId),
        issueType,
        recoveryAction
      );

      const result = await selfHealingService.executeHealing(healingId);

      res.json({
        success: true,
        healingId,
        result,
      });
    } catch (error) {
      logger.error('Failed to heal order', {
        orderId: req.params.orderId,
        error: error.message,
      });
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * Run full healing cycle
   */
  async runHealingCycle(req, res) {
    try {
      const result = await selfHealingService.runHealingCycle();

      res.json({
        success: true,
        result,
      });
    } catch (error) {
      logger.error('Failed to run healing cycle', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Failed to run healing cycle',
      });
    }
  }

  /**
   * Get healing statistics
   */
  async getStatistics(req, res) {
    try {
      const { days = 7 } = req.query;
      const stats = await selfHealingService.getHealingStatistics(
        parseInt(days)
      );

      res.json({
        success: true,
        days: parseInt(days),
        statistics: stats,
      });
    } catch (error) {
      logger.error('Failed to get healing statistics', {
        error: error.message,
      });
      res.status(500).json({
        success: false,
        error: 'Failed to get healing statistics',
      });
    }
  }

  /**
   * Get pending admin notifications
   */
  async getPendingNotifications(req, res) {
    try {
      const notifications = await selfHealingService.getPendingNotifications();

      res.json({
        success: true,
        count: notifications.length,
        notifications,
      });
    } catch (error) {
      logger.error('Failed to get pending notifications', {
        error: error.message,
      });
      res.status(500).json({
        success: false,
        error: 'Failed to get pending notifications',
      });
    }
  }

  /**
   * Acknowledge notification
   */
  async acknowledgeNotification(req, res) {
    try {
      const { notificationId } = req.params;
      const userId = req.user?.id;

      await prisma.admin_notifications.update({
        where: { id: parseInt(notificationId) },
        data: {
          acknowledged: true,
          acknowledged_at: new Date(),
          acknowledged_by: userId,
        },
      });

      res.json({
        success: true,
        message: 'Notification acknowledged',
      });
    } catch (error) {
      logger.error('Failed to acknowledge notification', {
        notificationId: req.params.notificationId,
        error: error.message,
      });
      res.status(500).json({
        success: false,
        error: 'Failed to acknowledge notification',
      });
    }
  }
}

module.exports = new SelfHealingController();
