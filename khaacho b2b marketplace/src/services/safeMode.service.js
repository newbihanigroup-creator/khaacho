/**
 * Safe Mode Service
 * 
 * Handles safe mode logic for pausing new orders during high load or maintenance
 * Existing orders continue processing normally
 */

const prisma = require('../config/database');
const logger = require('../shared/logger');

class SafeModeService {
  constructor() {
    this.statusCache = null;
    this.cacheExpiry = null;
    this.CACHE_TTL = 5000; // 5 seconds
  }

  /**
   * Check if safe mode is enabled
   * Uses caching to reduce database queries
   */
  async isEnabled() {
    try {
      // Check cache
      if (this.statusCache !== null && this.cacheExpiry > Date.now()) {
        return this.statusCache;
      }

      // Query database
      const result = await prisma.$queryRaw`
        SELECT is_safe_mode_enabled() as enabled
      `;

      const isEnabled = result[0]?.enabled || false;

      // Update cache
      this.statusCache = isEnabled;
      this.cacheExpiry = Date.now() + this.CACHE_TTL;

      return isEnabled;
    } catch (error) {
      logger.error('Failed to check safe mode status', {
        error: error.message,
        stack: error.stack,
      });

      // Fail safe: assume disabled to avoid blocking orders
      return false;
    }
  }

  /**
   * Clear status cache
   */
  clearCache() {
    this.statusCache = null;
    this.cacheExpiry = null;
  }

  /**
   * Get current safe mode status with details
   */
  async getStatus() {
    try {
      const status = await prisma.$queryRaw`
        SELECT * FROM safe_mode_status
      `;

      return status[0] || null;
    } catch (error) {
      logger.error('Failed to get safe mode status', {
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Enable safe mode
   */
  async enable(data) {
    const {
      enabledBy,
      reason,
      autoDisableMinutes = null,
      customMessage = null,
    } = data;

    try {
      logger.warn('Enabling safe mode', {
        enabledBy,
        reason,
        autoDisableMinutes,
      });

      await prisma.$queryRaw`
        SELECT enable_safe_mode(
          ${enabledBy},
          ${reason},
          ${autoDisableMinutes}::INTEGER,
          ${customMessage}
        )
      `;

      // Clear cache
      this.clearCache();

      logger.warn('Safe mode enabled', {
        enabledBy,
        reason,
        autoDisableMinutes,
      });

      return await this.getStatus();
    } catch (error) {
      logger.error('Failed to enable safe mode', {
        enabledBy,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Disable safe mode
   */
  async disable(disabledBy) {
    try {
      logger.info('Disabling safe mode', { disabledBy });

      const result = await prisma.$queryRaw`
        SELECT * FROM disable_safe_mode(${disabledBy})
      `;

      // Clear cache
      this.clearCache();

      const stats = result[0] || { orders_queued: 0, duration_minutes: 0 };

      logger.info('Safe mode disabled', {
        disabledBy,
        ordersQueued: stats.orders_queued,
        durationMinutes: stats.duration_minutes,
      });

      return stats;
    } catch (error) {
      logger.error('Failed to disable safe mode', {
        disabledBy,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Queue order during safe mode
   */
  async queueOrder(data) {
    const {
      retailerId,
      phoneNumber,
      orderText,
      orderData,
      source = 'whatsapp',
      messageId = null,
    } = data;

    try {
      const result = await prisma.$queryRaw`
        SELECT queue_order_safe_mode(
          ${retailerId}::uuid,
          ${phoneNumber},
          ${orderText},
          ${JSON.stringify(orderData)}::jsonb,
          ${source},
          ${messageId}
        ) as id
      `;

      const queuedOrderId = result[0]?.id;

      logger.info('Order queued during safe mode', {
        queuedOrderId,
        retailerId,
        phoneNumber,
        source,
      });

      // Update metrics
      await this.incrementMetric('orders_queued');

      return queuedOrderId;
    } catch (error) {
      logger.error('Failed to queue order during safe mode', {
        retailerId,
        phoneNumber,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get queued orders ready for processing
   */
  async getQueuedOrders(limit = 100) {
    try {
      const orders = await prisma.$queryRaw`
        SELECT * FROM get_queued_orders_to_process(${limit})
      `;

      return orders;
    } catch (error) {
      logger.error('Failed to get queued orders', {
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Mark queued order as processing
   */
  async markOrderProcessing(queuedOrderId) {
    try {
      await prisma.safeModeQueuedOrders.update({
        where: { id: queuedOrderId },
        data: {
          status: 'PROCESSING',
          updatedAt: new Date(),
        },
      });

      logger.info('Queued order marked as processing', { queuedOrderId });
    } catch (error) {
      logger.error('Failed to mark order as processing', {
        queuedOrderId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Mark queued order as completed
   */
  async markOrderCompleted(queuedOrderId, orderId) {
    try {
      await prisma.safeModeQueuedOrders.update({
        where: { id: queuedOrderId },
        data: {
          status: 'COMPLETED',
          processedAt: new Date(),
          orderId,
          updatedAt: new Date(),
        },
      });

      logger.info('Queued order marked as completed', {
        queuedOrderId,
        orderId,
      });

      // Update metrics
      await this.incrementMetric('orders_processed');
    } catch (error) {
      logger.error('Failed to mark order as completed', {
        queuedOrderId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Mark queued order as failed
   */
  async markOrderFailed(queuedOrderId, errorMessage) {
    try {
      await prisma.safeModeQueuedOrders.update({
        where: { id: queuedOrderId },
        data: {
          status: 'FAILED',
          errorMessage,
          retryCount: { increment: 1 },
          updatedAt: new Date(),
        },
      });

      logger.error('Queued order marked as failed', {
        queuedOrderId,
        errorMessage,
      });
    } catch (error) {
      logger.error('Failed to mark order as failed', {
        queuedOrderId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get safe mode history
   */
  async getHistory(days = 30) {
    try {
      const history = await prisma.safeModeHistory.findMany({
        where: {
          createdAt: {
            gte: new Date(Date.now() - days * 24 * 60 * 60 * 1000),
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      return history;
    } catch (error) {
      logger.error('Failed to get safe mode history', {
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get safe mode metrics
   */
  async getMetrics(hours = 24) {
    try {
      const metrics = await prisma.safeModeMetrics.findMany({
        where: {
          metricTimestamp: {
            gte: new Date(Date.now() - hours * 60 * 60 * 1000),
          },
        },
        orderBy: { metricTimestamp: 'desc' },
      });

      return metrics;
    } catch (error) {
      logger.error('Failed to get safe mode metrics', {
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get queued orders summary
   */
  async getQueuedOrdersSummary() {
    try {
      const summary = await prisma.$queryRaw`
        SELECT * FROM safe_mode_queued_orders_summary
      `;

      return summary;
    } catch (error) {
      logger.error('Failed to get queued orders summary', {
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Increment metric counter
   */
  async incrementMetric(metricName) {
    try {
      const now = new Date();
      const hourBucket = new Date(now);
      hourBucket.setMinutes(0, 0, 0);

      await prisma.safeModeMetrics.upsert({
        where: {
          hourBucket,
        },
        create: {
          metricTimestamp: now,
          hourBucket,
          [metricName]: 1,
        },
        update: {
          [metricName]: { increment: 1 },
        },
      });
    } catch (error) {
      logger.error('Failed to increment metric', {
        metricName,
        error: error.message,
      });
    }
  }

  /**
   * Get auto-reply message for safe mode
   */
  getAutoReplyMessage(customMessage = null) {
    if (customMessage) {
      return customMessage;
    }

    return '⏸️ System is currently busy. Your order has been received and will be processed soon. Thank you for your patience!';
  }
}

module.exports = new SafeModeService();
