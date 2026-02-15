const prisma = require('../config/database');
const logger = require('../utils/logger');

/**
 * Self-Healing Service
 * Automatically detects and recovers stuck orders
 */
class SelfHealingService {
  /**
   * Detect all stuck orders
   */
  async detectStuckOrders() {
    try {
      const stuckOrders = await prisma.$queryRaw`
        SELECT * FROM detect_stuck_orders()
      `;

      logger.info('Stuck orders detected', {
        count: stuckOrders.length,
        orders: stuckOrders.map(o => ({
          orderId: o.order_id,
          issueType: o.issue_type,
          stuckMinutes: o.stuck_minutes,
        })),
      });

      return stuckOrders;
    } catch (error) {
      logger.error('Failed to detect stuck orders', { error: error.message });
      throw error;
    }
  }

  /**
   * Initiate healing for a stuck order
   */
  async initiateHealing(orderId, issueType, recoveryAction) {
    try {
      const healingId = await prisma.$queryRaw`
        SELECT auto_heal_order(
          ${orderId}::INTEGER,
          ${issueType}::VARCHAR,
          ${recoveryAction}::VARCHAR
        ) AS healing_id
      `;

      logger.info('Healing initiated', {
        orderId,
        issueType,
        recoveryAction,
        healingId: healingId[0]?.healing_id,
      });

      return healingId[0]?.healing_id;
    } catch (error) {
      logger.error('Failed to initiate healing', {
        orderId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Execute healing action based on type
   */
  async executeHealing(healingId) {
    try {
      const healing = await prisma.healing_actions.findUnique({
        where: { id: healingId },
        include: {
          order: {
            include: {
              retailer: true,
              vendor: true,
              order_items: true,
            },
          },
        },
      });

      if (!healing) {
        throw new Error(`Healing action ${healingId} not found`);
      }

      logger.info('Executing healing action', {
        healingId,
        orderId: healing.order_id,
        action: healing.recovery_action,
      });

      let result;
      switch (healing.recovery_action) {
        case 'REASSIGN_VENDOR':
          result = await this.reassignVendor(healing);
          break;
        case 'RETRY_WORKFLOW':
          result = await this.retryWorkflow(healing);
          break;
        case 'CANCEL_ORDER':
          result = await this.cancelOrder(healing);
          break;
        case 'MANUAL_INTERVENTION':
          result = await this.requestManualIntervention(healing);
          break;
        default:
          throw new Error(`Unknown recovery action: ${healing.recovery_action}`);
      }

      return result;
    } catch (error) {
      logger.error('Failed to execute healing', {
        healingId,
        error: error.message,
      });
      
      await this.markHealingFailed(healingId, error.message);
      throw error;
    }
  }

  /**
   * Reassign order to a different vendor
   */
  async reassignVendor(healing) {
    try {
      const order = healing.order;
      
      // Find alternative vendor using vendor selection service
      const vendorSelectionService = require('./vendorSelection.service');
      const alternativeVendors = await vendorSelectionService.selectVendorsForOrder(
        order.id
      );

      if (!alternativeVendors || alternativeVendors.length === 0) {
        throw new Error('No alternative vendors available');
      }

      // Get first vendor that's not the current one
      const newVendor = alternativeVendors.find(
        v => v.vendor_id !== order.vendor_id
      );

      if (!newVendor) {
        throw new Error('No suitable alternative vendor found');
      }

      // Update order with new vendor
      await prisma.orders.update({
        where: { id: order.id },
        data: {
          vendor_id: newVendor.vendor_id,
          status: 'PENDING',
          updated_at: new Date(),
        },
      });

      // Log status change
      await prisma.order_status_log.create({
        data: {
          order_id: order.id,
          old_status: order.status,
          new_status: 'PENDING',
          changed_by: 'SYSTEM',
          reason: `Auto-healed: Reassigned to vendor ${newVendor.vendor_id}`,
        },
      });

      // Mark healing as successful
      await this.markHealingSuccess(healing.id, {
        newStatus: 'PENDING',
        newVendorId: newVendor.vendor_id,
      });

      logger.info('Order reassigned to new vendor', {
        orderId: order.id,
        oldVendorId: order.vendor_id,
        newVendorId: newVendor.vendor_id,
      });

      return {
        success: true,
        action: 'REASSIGN_VENDOR',
        newVendorId: newVendor.vendor_id,
      };
    } catch (error) {
      logger.error('Failed to reassign vendor', {
        orderId: healing.order_id,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Retry the workflow for stuck order
   */
  async retryWorkflow(healing) {
    try {
      const order = healing.order;
      
      // Determine next action based on current status
      let nextStatus;
      let action;

      switch (order.status) {
        case 'PENDING':
          // Retry vendor assignment
          nextStatus = 'PENDING';
          action = 'Retry vendor assignment';
          break;
        case 'CONFIRMED':
          // Retry vendor acceptance
          nextStatus = 'CONFIRMED';
          action = 'Retry vendor notification';
          break;
        case 'ACCEPTED':
          // Move to processing
          nextStatus = 'PROCESSING';
          action = 'Move to processing';
          break;
        case 'PROCESSING':
          // Check with vendor
          nextStatus = 'PROCESSING';
          action = 'Verify processing status';
          break;
        default:
          throw new Error(`Cannot retry workflow for status: ${order.status}`);
      }

      // Update order timestamp to trigger workflow
      await prisma.orders.update({
        where: { id: order.id },
        data: {
          status: nextStatus,
          updated_at: new Date(),
        },
      });

      // Log status change
      await prisma.order_status_log.create({
        data: {
          order_id: order.id,
          old_status: order.status,
          new_status: nextStatus,
          changed_by: 'SYSTEM',
          reason: `Auto-healed: ${action}`,
        },
      });

      // Mark healing as successful
      await this.markHealingSuccess(healing.id, {
        newStatus: nextStatus,
      });

      logger.info('Workflow retried', {
        orderId: order.id,
        action,
        newStatus: nextStatus,
      });

      return {
        success: true,
        action: 'RETRY_WORKFLOW',
        newStatus: nextStatus,
      };
    } catch (error) {
      logger.error('Failed to retry workflow', {
        orderId: healing.order_id,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Cancel stuck order
   */
  async cancelOrder(healing) {
    try {
      const order = healing.order;

      // Update order status to cancelled
      await prisma.orders.update({
        where: { id: order.id },
        data: {
          status: 'CANCELLED',
          updated_at: new Date(),
        },
      });

      // Log status change
      await prisma.order_status_log.create({
        data: {
          order_id: order.id,
          old_status: order.status,
          new_status: 'CANCELLED',
          changed_by: 'SYSTEM',
          reason: 'Auto-healed: Order cancelled due to prolonged stuck state',
        },
      });

      // Refund credit if applicable
      if (order.payment_method === 'CREDIT') {
        await prisma.credit_ledger.create({
          data: {
            retailer_id: order.retailer_id,
            transaction_type: 'REFUND',
            amount: order.total,
            balance_after: 0, // Will be calculated by trigger
            reference_type: 'ORDER',
            reference_id: order.id,
            description: 'Refund for auto-cancelled order',
          },
        });
      }

      // Mark healing as successful
      await this.markHealingSuccess(healing.id, {
        newStatus: 'CANCELLED',
      });

      logger.info('Order cancelled', {
        orderId: order.id,
        reason: 'Auto-healing',
      });

      return {
        success: true,
        action: 'CANCEL_ORDER',
        newStatus: 'CANCELLED',
      };
    } catch (error) {
      logger.error('Failed to cancel order', {
        orderId: healing.order_id,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Request manual intervention
   */
  async requestManualIntervention(healing) {
    try {
      const order = healing.order;

      // Create admin notification
      await this.notifyAdmin({
        type: 'MANUAL_INTERVENTION_REQUIRED',
        severity: 'HIGH',
        orderId: order.id,
        healingActionId: healing.id,
        title: `Manual intervention required for Order #${order.order_number}`,
        message: `Order has been stuck in ${order.status} status for ${healing.stuck_duration_minutes} minutes. Multiple automatic recovery attempts have failed.`,
        details: {
          orderId: order.id,
          orderNumber: order.order_number,
          status: order.status,
          stuckMinutes: healing.stuck_duration_minutes,
          retailerId: order.retailer_id,
          vendorId: order.vendor_id,
          total: order.total,
          healingAttempts: healing.retry_count + 1,
        },
      });

      // Mark healing as requiring manual intervention
      await prisma.healing_actions.update({
        where: { id: healing.id },
        data: {
          requires_manual_intervention: true,
          recovery_status: 'FAILED',
          recovery_completed_at: new Date(),
          error_message: 'Multiple automatic recovery attempts failed',
          updated_at: new Date(),
        },
      });

      logger.warn('Manual intervention requested', {
        orderId: order.id,
        healingId: healing.id,
      });

      return {
        success: false,
        action: 'MANUAL_INTERVENTION',
        requiresAdmin: true,
      };
    } catch (error) {
      logger.error('Failed to request manual intervention', {
        orderId: healing.order_id,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Mark healing as successful
   */
  async markHealingSuccess(healingId, result) {
    await prisma.healing_actions.update({
      where: { id: healingId },
      data: {
        recovery_status: 'SUCCESS',
        recovery_completed_at: new Date(),
        new_status: result.newStatus,
        new_vendor_id: result.newVendorId,
        updated_at: new Date(),
      },
    });
  }

  /**
   * Mark healing as failed
   */
  async markHealingFailed(healingId, errorMessage) {
    const healing = await prisma.healing_actions.findUnique({
      where: { id: healingId },
    });

    const retryCount = (healing?.retry_count || 0) + 1;
    const shouldNotifyAdmin = retryCount >= 3;

    await prisma.healing_actions.update({
      where: { id: healingId },
      data: {
        recovery_status: 'FAILED',
        recovery_completed_at: new Date(),
        error_message: errorMessage,
        retry_count: retryCount,
        requires_manual_intervention: shouldNotifyAdmin,
        updated_at: new Date(),
      },
    });

    // Notify admin if multiple failures
    if (shouldNotifyAdmin) {
      await this.notifyAdminOfFailure(healingId, errorMessage);
    }
  }

  /**
   * Notify admin of healing failure
   */
  async notifyAdminOfFailure(healingId, errorMessage) {
    try {
      const healing = await prisma.healing_actions.findUnique({
        where: { id: healingId },
        include: {
          order: true,
        },
      });

      if (!healing) return;

      await this.notifyAdmin({
        type: 'HEALING_FAILED',
        severity: 'HIGH',
        orderId: healing.order_id,
        healingActionId: healingId,
        title: `Healing failed for Order #${healing.order.order_number}`,
        message: `Automatic healing failed after ${healing.retry_count} attempts. Error: ${errorMessage}`,
        details: {
          orderId: healing.order_id,
          orderNumber: healing.order.order_number,
          issueType: healing.issue_type,
          recoveryAction: healing.recovery_action,
          retryCount: healing.retry_count,
          errorMessage,
        },
      });

      await prisma.healing_actions.update({
        where: { id: healingId },
        data: {
          admin_notified: true,
          admin_notified_at: new Date(),
        },
      });
    } catch (error) {
      logger.error('Failed to notify admin of healing failure', {
        healingId,
        error: error.message,
      });
    }
  }

  /**
   * Send notification to admin
   */
  async notifyAdmin(notification) {
    try {
      await prisma.admin_notifications.create({
        data: {
          notification_type: notification.type,
          severity: notification.severity,
          order_id: notification.orderId,
          healing_action_id: notification.healingActionId,
          title: notification.title,
          message: notification.message,
          details: notification.details,
          delivery_method: 'DASHBOARD',
        },
      });

      logger.info('Admin notification created', {
        type: notification.type,
        orderId: notification.orderId,
      });
    } catch (error) {
      logger.error('Failed to create admin notification', {
        error: error.message,
      });
    }
  }

  /**
   * Get healing statistics
   */
  async getHealingStatistics(days = 7) {
    try {
      const stats = await prisma.$queryRaw`
        SELECT 
          issue_type,
          recovery_action,
          recovery_status,
          COUNT(*) AS total_cases,
          AVG(EXTRACT(EPOCH FROM (recovery_completed_at - recovery_attempted_at)) / 60) AS avg_recovery_time_minutes,
          SUM(CASE WHEN recovery_status = 'SUCCESS' THEN 1 ELSE 0 END) AS successful_recoveries,
          SUM(CASE WHEN recovery_status = 'FAILED' THEN 1 ELSE 0 END) AS failed_recoveries
        FROM healing_actions
        WHERE issue_detected_at >= NOW() - INTERVAL '${days} days'
        GROUP BY issue_type, recovery_action, recovery_status
        ORDER BY total_cases DESC
      `;

      return stats;
    } catch (error) {
      logger.error('Failed to get healing statistics', {
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get pending admin notifications
   */
  async getPendingNotifications() {
    try {
      return await prisma.admin_notifications.findMany({
        where: {
          sent: false,
        },
        include: {
          order: true,
          healing_action: true,
        },
        orderBy: {
          created_at: 'desc',
        },
      });
    } catch (error) {
      logger.error('Failed to get pending notifications', {
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Run full healing cycle
   */
  async runHealingCycle() {
    try {
      logger.info('Starting self-healing cycle');

      // Detect stuck orders
      const stuckOrders = await this.detectStuckOrders();

      if (stuckOrders.length === 0) {
        logger.info('No stuck orders detected');
        return { healed: 0, failed: 0 };
      }

      let healedCount = 0;
      let failedCount = 0;

      // Process each stuck order
      for (const stuck of stuckOrders) {
        try {
          // Initiate healing
          const healingId = await this.initiateHealing(
            stuck.order_id,
            stuck.issue_type,
            stuck.recommended_action
          );

          // Execute healing
          const result = await this.executeHealing(healingId);

          if (result.success) {
            healedCount++;
          } else {
            failedCount++;
          }
        } catch (error) {
          logger.error('Failed to heal order', {
            orderId: stuck.order_id,
            error: error.message,
          });
          failedCount++;
        }
      }

      logger.info('Self-healing cycle completed', {
        detected: stuckOrders.length,
        healed: healedCount,
        failed: failedCount,
      });

      return { healed: healedCount, failed: failedCount };
    } catch (error) {
      logger.error('Self-healing cycle failed', { error: error.message });
      throw error;
    }
  }
}

module.exports = new SelfHealingService();
