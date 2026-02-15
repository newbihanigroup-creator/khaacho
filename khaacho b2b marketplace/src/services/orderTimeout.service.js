/**
 * Order Timeout Service
 * 
 * Handles automatic vendor reassignment when vendors don't respond in time
 * Prevents infinite retry loops and notifies admins of delays
 */

const prisma = require('../config/database');
const logger = require('../shared/logger');
const orderRoutingService = require('./orderRouting.service');
const vendorSelectionService = require('./vendorSelection.service');

class OrderTimeoutService {
  constructor() {
    this.config = null;
    this.isProcessing = false;
  }

  /**
   * Get timeout configuration
   */
  async getConfig() {
    if (!this.config) {
      const configs = await prisma.orderTimeoutConfig.findFirst({
        where: { isActive: true },
      });
      
      this.config = configs || {
        vendorResponseTimeoutMinutes: 30,
        maxReassignmentAttempts: 3,
        escalationTimeoutMinutes: 60,
        notifyAdminAfterAttempts: 2,
        notifyRetailerOnDelay: true,
      };
    }
    
    return this.config;
  }

  /**
   * Start timeout tracking for an order
   * 
   * @param {string} orderId - Order ID
   * @param {string} vendorId - Assigned vendor ID
   * @param {number} attempt - Reassignment attempt number
   * @returns {Promise<object>} Timeout tracking record
   */
  async startTimeoutTracking(orderId, vendorId, attempt = 1) {
    try {
      const config = await this.getConfig();
      
      const timeoutAt = new Date();
      timeoutAt.setMinutes(
        timeoutAt.getMinutes() + config.vendorResponseTimeoutMinutes
      );

      const isFinalAttempt = attempt >= config.maxReassignmentAttempts;

      const tracking = await prisma.orderTimeoutTracking.create({
        data: {
          orderId,
          vendorId,
          assignedAt: new Date(),
          timeoutAt,
          status: 'PENDING',
          reassignmentAttempt: attempt,
          isFinalAttempt,
        },
      });

      logger.info('Timeout tracking started', {
        orderId,
        vendorId,
        attempt,
        timeoutAt,
        isFinalAttempt,
      });

      return tracking;
    } catch (error) {
      logger.error('Failed to start timeout tracking', {
        orderId,
        vendorId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Mark vendor as responded (stops timeout)
   * 
   * @param {string} orderId - Order ID
   * @param {string} vendorId - Vendor ID
   */
  async markVendorResponded(orderId, vendorId) {
    try {
      const tracking = await prisma.orderTimeoutTracking.findFirst({
        where: {
          orderId,
          vendorId,
          status: 'PENDING',
        },
      });

      if (!tracking) {
        logger.warn('No pending timeout tracking found', { orderId, vendorId });
        return null;
      }

      const updated = await prisma.orderTimeoutTracking.update({
        where: { id: tracking.id },
        data: {
          status: 'RESPONDED',
          respondedAt: new Date(),
          updatedAt: new Date(),
        },
      });

      // Update vendor statistics
      await this.updateVendorStatistics(vendorId);

      logger.info('Vendor marked as responded', {
        orderId,
        vendorId,
        responseTime: Math.floor(
          (new Date() - new Date(tracking.assignedAt)) / (1000 * 60)
        ),
      });

      return updated;
    } catch (error) {
      logger.error('Failed to mark vendor as responded', {
        orderId,
        vendorId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Check for timed out orders and process them
   * This should be called by a cron job every minute
   */
  async processTimedOutOrders() {
    if (this.isProcessing) {
      logger.warn('Timeout processing already in progress, skipping');
      return { skipped: true };
    }

    this.isProcessing = true;

    try {
      logger.info('Checking for timed out orders');

      // Get timed out orders
      const timedOutOrders = await prisma.$queryRaw`
        SELECT * FROM check_timed_out_orders()
      `;

      if (timedOutOrders.length === 0) {
        logger.info('No timed out orders found');
        return { processed: 0 };
      }

      logger.warn(`Found ${timedOutOrders.length} timed out orders`, {
        count: timedOutOrders.length,
      });

      const results = [];

      for (const timeout of timedOutOrders) {
        try {
          const result = await this.handleTimeout(timeout);
          results.push(result);
        } catch (error) {
          logger.error('Failed to handle timeout', {
            timeoutId: timeout.timeout_id,
            orderId: timeout.order_id,
            error: error.message,
          });
          
          results.push({
            timeoutId: timeout.timeout_id,
            orderId: timeout.order_id,
            success: false,
            error: error.message,
          });
        }
      }

      logger.info('Timeout processing completed', {
        total: timedOutOrders.length,
        successful: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length,
      });

      return {
        processed: timedOutOrders.length,
        results,
      };
    } catch (error) {
      logger.error('Timeout processing failed', {
        error: error.message,
        stack: error.stack,
      });
      throw error;
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Handle a single timeout
   */
  async handleTimeout(timeout) {
    const {
      timeout_id: timeoutId,
      order_id: orderId,
      vendor_id: vendorId,
      reassignment_attempt: attempt,
      is_final_attempt: isFinalAttempt,
    } = timeout;

    try {
      logger.warn('Handling order timeout', {
        timeoutId,
        orderId,
        vendorId,
        attempt,
        isFinalAttempt,
      });

      // Record timeout
      await prisma.$queryRaw`
        SELECT record_order_timeout(${timeoutId}::uuid, 'Vendor did not respond within timeout period')
      `;

      // Log delay
      await this.logOrderDelay({
        orderId,
        orderNumber: await this.getOrderNumber(orderId),
        delayType: 'VENDOR_TIMEOUT',
        delayReason: `Vendor did not respond within ${await this.getConfig().then(c => c.vendorResponseTimeoutMinutes)} minutes`,
        originalVendorId: vendorId,
        reassignmentAttempt: attempt,
        isCritical: isFinalAttempt,
        customerImpact: this.calculateCustomerImpact(attempt),
      });

      // Update vendor statistics
      await this.updateVendorStatistics(vendorId);

      // Check if final attempt
      if (isFinalAttempt) {
        return await this.handleFinalTimeout(orderId, vendorId, attempt);
      }

      // Attempt reassignment
      return await this.reassignToNextVendor(orderId, vendorId, attempt);
    } catch (error) {
      logger.error('Failed to handle timeout', {
        timeoutId,
        orderId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Reassign order to next available vendor
   */
  async reassignToNextVendor(orderId, failedVendorId, currentAttempt) {
    try {
      logger.info('Attempting vendor reassignment', {
        orderId,
        failedVendorId,
        attempt: currentAttempt + 1,
      });

      // Get order details
      const order = await prisma.orders.findUnique({
        where: { id: orderId },
        include: {
          items: {
            include: {
              product: true,
            },
          },
          retailer: {
            include: {
              user: true,
            },
          },
        },
      });

      if (!order) {
        throw new Error('Order not found');
      }

      // Get list of vendors who have already been tried
      const triedVendors = await prisma.orderTimeoutTracking.findMany({
        where: { orderId },
        select: { vendorId: true },
      });

      const excludeVendorIds = triedVendors.map(t => t.vendorId);

      // Find next best vendor
      const nextVendor = await this.findNextBestVendor(
        order.items,
        excludeVendorIds
      );

      if (!nextVendor) {
        logger.error('No alternative vendor found', {
          orderId,
          excludedCount: excludeVendorIds.length,
        });
        
        return await this.handleNoVendorAvailable(orderId, currentAttempt);
      }

      // Update order with new vendor
      await prisma.orders.update({
        where: { id: orderId },
        data: {
          vendorId: nextVendor.vendorId,
          status: 'PENDING',
          updatedAt: new Date(),
        },
      });

      // Start new timeout tracking
      await this.startTimeoutTracking(orderId, nextVendor.vendorId, currentAttempt + 1);

      // Update timeout tracking
      await prisma.orderTimeoutTracking.update({
        where: { id: await this.getLatestTimeoutId(orderId, failedVendorId) },
        data: {
          status: 'REASSIGNED',
          nextVendorId: nextVendor.vendorId,
          updatedAt: new Date(),
        },
      });

      // Log reassignment
      await this.logOrderDelay({
        orderId,
        orderNumber: order.orderNumber,
        delayType: 'REASSIGNMENT',
        delayReason: `Reassigned from vendor ${failedVendorId} to ${nextVendor.vendorId}`,
        originalVendorId: failedVendorId,
        reassignedVendorId: nextVendor.vendorId,
        reassignmentAttempt: currentAttempt + 1,
        isCritical: false,
        customerImpact: this.calculateCustomerImpact(currentAttempt + 1),
      });

      // Notify admin if threshold reached
      const config = await this.getConfig();
      if (currentAttempt + 1 >= config.notifyAdminAfterAttempts) {
        await this.notifyAdmin({
          orderId,
          orderNumber: order.orderNumber,
          type: 'ORDER_TIMEOUT',
          priority: 'HIGH',
          title: `Order ${order.orderNumber} - Multiple Reassignments`,
          message: `Order has been reassigned ${currentAttempt + 1} times due to vendor timeouts`,
          metadata: {
            failedVendorId,
            newVendorId: nextVendor.vendorId,
            attempt: currentAttempt + 1,
          },
        });
      }

      // Notify retailer if configured
      if (config.notifyRetailerOnDelay) {
        await this.notifyRetailerOfDelay(order, currentAttempt + 1);
      }

      // Notify new vendor
      await this.notifyVendorOfAssignment(nextVendor.vendorId, order);

      logger.info('Order reassigned successfully', {
        orderId,
        fromVendor: failedVendorId,
        toVendor: nextVendor.vendorId,
        attempt: currentAttempt + 1,
      });

      return {
        success: true,
        action: 'REASSIGNED',
        orderId,
        newVendorId: nextVendor.vendorId,
        attempt: currentAttempt + 1,
      };
    } catch (error) {
      logger.error('Vendor reassignment failed', {
        orderId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Handle final timeout (no more reassignments)
   */
  async handleFinalTimeout(orderId, vendorId, attempt) {
    try {
      logger.error('Final timeout reached for order', {
        orderId,
        vendorId,
        attempt,
      });

      // Get order details
      const order = await prisma.orders.findUnique({
        where: { id: orderId },
        include: {
          retailer: {
            include: {
              user: true,
            },
          },
        },
      });

      // Mark order as delayed
      await prisma.orders.update({
        where: { id: orderId },
        data: {
          status: 'DELAYED',
          updatedAt: new Date(),
        },
      });

      // Log critical delay
      await this.logOrderDelay({
        orderId,
        orderNumber: order.orderNumber,
        delayType: 'ESCALATION',
        delayReason: `Maximum reassignment attempts (${attempt}) reached. Manual intervention required.`,
        originalVendorId: vendorId,
        reassignmentAttempt: attempt,
        isCritical: true,
        customerImpact: 'CRITICAL',
      });

      // Notify admin (urgent)
      await this.notifyAdmin({
        orderId,
        orderNumber: order.orderNumber,
        type: 'ESCALATION',
        priority: 'URGENT',
        title: `URGENT: Order ${order.orderNumber} - Manual Intervention Required`,
        message: `Order has failed ${attempt} vendor assignments and requires immediate attention`,
        requiresAction: true,
        metadata: {
          failedVendorId: vendorId,
          totalAttempts: attempt,
          retailerId: order.retailerId,
        },
      });

      // Notify retailer
      await this.notifyRetailerOfCriticalDelay(order);

      logger.error('Order escalated to admin', {
        orderId,
        orderNumber: order.orderNumber,
        attempts: attempt,
      });

      return {
        success: true,
        action: 'ESCALATED',
        orderId,
        status: 'DELAYED',
        requiresManualIntervention: true,
      };
    } catch (error) {
      logger.error('Failed to handle final timeout', {
        orderId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Handle case when no vendor is available
   */
  async handleNoVendorAvailable(orderId, attempt) {
    logger.error('No alternative vendor available', { orderId, attempt });

    // Mark as delayed and escalate
    await prisma.orders.update({
      where: { id: orderId },
      data: {
        status: 'DELAYED',
        updatedAt: new Date(),
      },
    });

    const order = await prisma.orders.findUnique({
      where: { id: orderId },
      select: { orderNumber: true, retailerId: true },
    });

    await this.logOrderDelay({
      orderId,
      orderNumber: order.orderNumber,
      delayType: 'ESCALATION',
      delayReason: 'No alternative vendors available',
      reassignmentAttempt: attempt,
      isCritical: true,
      customerImpact: 'CRITICAL',
    });

    await this.notifyAdmin({
      orderId,
      orderNumber: order.orderNumber,
      type: 'ESCALATION',
      priority: 'URGENT',
      title: `URGENT: Order ${order.orderNumber} - No Vendors Available`,
      message: 'No alternative vendors found. Manual vendor assignment required.',
      requiresAction: true,
      metadata: { attempt },
    });

    return {
      success: true,
      action: 'ESCALATED',
      orderId,
      reason: 'NO_VENDOR_AVAILABLE',
      requiresManualIntervention: true,
    };
  }

  /**
   * Find next best vendor excluding already tried vendors
   */
  async findNextBestVendor(orderItems, excludeVendorIds) {
    try {
      // Use vendor selection service
      const selection = await vendorSelectionService.selectVendorsForOrder(
        orderItems,
        {
          topN: 5,
          minReliabilityScore: 50, // Lower threshold for fallback
        }
      );

      // Find first vendor not in exclude list
      for (const item of selection.items) {
        for (const vendor of item.topVendors) {
          if (!excludeVendorIds.includes(vendor.vendorId)) {
            return vendor;
          }
        }
      }

      return null;
    } catch (error) {
      logger.error('Failed to find next best vendor', {
        error: error.message,
      });
      return null;
    }
  }

  /**
   * Log order delay
   */
  async logOrderDelay(data) {
    try {
      await prisma.orderDelayLog.create({
        data: {
          orderId: data.orderId,
          orderNumber: data.orderNumber,
          delayType: data.delayType,
          delayReason: data.delayReason,
          originalVendorId: data.originalVendorId,
          reassignedVendorId: data.reassignedVendorId,
          reassignmentAttempt: data.reassignmentAttempt,
          isCritical: data.isCritical || false,
          customerImpact: data.customerImpact || 'MEDIUM',
        },
      });

      logger.info('Order delay logged', {
        orderId: data.orderId,
        delayType: data.delayType,
      });
    } catch (error) {
      logger.error('Failed to log order delay', {
        orderId: data.orderId,
        error: error.message,
      });
    }
  }

  /**
   * Notify admin dashboard
   */
  async notifyAdmin(data) {
    try {
      await prisma.adminNotifications.create({
        data: {
          notificationType: data.type,
          priority: data.priority,
          title: data.title,
          message: data.message,
          orderId: data.orderId,
          vendorId: data.metadata?.failedVendorId,
          retailerId: data.metadata?.retailerId,
          requiresAction: data.requiresAction || false,
          metadata: data.metadata,
        },
      });

      logger.info('Admin notified', {
        orderId: data.orderId,
        type: data.type,
        priority: data.priority,
      });
    } catch (error) {
      logger.error('Failed to notify admin', {
        orderId: data.orderId,
        error: error.message,
      });
    }
  }

  /**
   * Notify retailer of delay
   */
  async notifyRetailerOfDelay(order, attempt) {
    try {
      // Implementation depends on notification service (WhatsApp, SMS, etc.)
      logger.info('Retailer notified of delay', {
        orderId: order.id,
        retailerId: order.retailerId,
        attempt,
      });
    } catch (error) {
      logger.error('Failed to notify retailer', {
        orderId: order.id,
        error: error.message,
      });
    }
  }

  /**
   * Notify retailer of critical delay
   */
  async notifyRetailerOfCriticalDelay(order) {
    try {
      logger.warn('Retailer notified of critical delay', {
        orderId: order.id,
        retailerId: order.retailerId,
      });
    } catch (error) {
      logger.error('Failed to notify retailer of critical delay', {
        orderId: order.id,
        error: error.message,
      });
    }
  }

  /**
   * Notify vendor of assignment
   */
  async notifyVendorOfAssignment(vendorId, order) {
    try {
      logger.info('Vendor notified of assignment', {
        vendorId,
        orderId: order.id,
      });
    } catch (error) {
      logger.error('Failed to notify vendor', {
        vendorId,
        error: error.message,
      });
    }
  }

  /**
   * Update vendor timeout statistics
   */
  async updateVendorStatistics(vendorId) {
    try {
      await prisma.$queryRaw`
        SELECT update_vendor_timeout_stats(${vendorId}::uuid)
      `;

      logger.info('Vendor statistics updated', { vendorId });
    } catch (error) {
      logger.error('Failed to update vendor statistics', {
        vendorId,
        error: error.message,
      });
    }
  }

  /**
   * Calculate customer impact level
   */
  calculateCustomerImpact(attempt) {
    if (attempt >= 3) return 'CRITICAL';
    if (attempt >= 2) return 'HIGH';
    if (attempt >= 1) return 'MEDIUM';
    return 'LOW';
  }

  /**
   * Helper methods
   */
  async getOrderNumber(orderId) {
    const order = await prisma.orders.findUnique({
      where: { id: orderId },
      select: { orderNumber: true },
    });
    return order?.orderNumber || 'UNKNOWN';
  }

  async getLatestTimeoutId(orderId, vendorId) {
    const tracking = await prisma.orderTimeoutTracking.findFirst({
      where: { orderId, vendorId, status: 'TIMED_OUT' },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    return tracking?.id;
  }

  /**
   * Get timeout statistics
   */
  async getTimeoutStatistics(days = 30) {
    try {
      const stats = await prisma.$queryRaw`
        SELECT * FROM timeout_statistics_summary
        WHERE date >= NOW() - INTERVAL '${days} days'
        ORDER BY date DESC
      `;

      return stats;
    } catch (error) {
      logger.error('Failed to get timeout statistics', {
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get vendor timeout performance
   */
  async getVendorTimeoutPerformance() {
    try {
      const performance = await prisma.$queryRaw`
        SELECT * FROM vendor_timeout_performance
        ORDER BY timeout_rate DESC
        LIMIT 50
      `;

      return performance;
    } catch (error) {
      logger.error('Failed to get vendor timeout performance', {
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get active timeouts
   */
  async getActiveTimeouts() {
    try {
      const timeouts = await prisma.$queryRaw`
        SELECT * FROM active_order_timeouts
      `;

      return timeouts;
    } catch (error) {
      logger.error('Failed to get active timeouts', {
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get unresolved delays
   */
  async getUnresolvedDelays() {
    try {
      const delays = await prisma.$queryRaw`
        SELECT * FROM unresolved_order_delays
      `;

      return delays;
    } catch (error) {
      logger.error('Failed to get unresolved delays', {
        error: error.message,
      });
      throw error;
    }
  }
}

module.exports = new OrderTimeoutService();
