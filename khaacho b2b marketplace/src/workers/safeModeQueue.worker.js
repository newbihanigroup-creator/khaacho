/**
 * Safe Mode Queue Worker
 * 
 * Processes queued orders when safe mode is disabled
 * Runs every minute to check for queued orders
 */

const cron = require('node-cron');
const safeModeService = require('../services/safeMode.service');
const unifiedOrderParser = require('../services/unifiedOrderParser.service');
const whatsappService = require('../services/whatsapp.service');
const logger = require('../shared/logger');

class SafeModeQueueWorker {
  constructor() {
    this.isRunning = false;
    this.cronJob = null;
    this.stats = {
      totalRuns: 0,
      successfulRuns: 0,
      failedRuns: 0,
      lastRunAt: null,
      lastRunDuration: null,
      totalOrdersProcessed: 0,
      totalOrdersFailed: 0,
    };
  }

  /**
   * Start the worker
   * Runs every minute
   */
  start() {
    if (this.cronJob) {
      logger.warn('Safe mode queue worker already running');
      return;
    }

    // Run every minute
    this.cronJob = cron.schedule('* * * * *', async () => {
      await this.processQueuedOrders();
    });

    logger.info('Safe mode queue worker started (runs every minute)');
  }

  /**
   * Stop the worker
   */
  stop() {
    if (this.cronJob) {
      this.cronJob.stop();
      this.cronJob = null;
      logger.info('Safe mode queue worker stopped');
    }
  }

  /**
   * Process queued orders
   */
  async processQueuedOrders() {
    if (this.isRunning) {
      logger.warn('Queue processing already in progress, skipping');
      return;
    }

    this.isRunning = true;
    const startTime = Date.now();

    try {
      // Check if safe mode is still enabled
      const safeModeEnabled = await safeModeService.isEnabled();
      
      if (safeModeEnabled) {
        logger.info('Safe mode still enabled, skipping queue processing');
        return;
      }

      logger.info('Starting queued orders processing');

      this.stats.totalRuns++;
      this.stats.lastRunAt = new Date();

      // Get queued orders
      const queuedOrders = await safeModeService.getQueuedOrders(50);

      if (queuedOrders.length === 0) {
        logger.info('No queued orders to process');
        this.stats.successfulRuns++;
        return;
      }

      logger.info(`Processing ${queuedOrders.length} queued orders`);

      const results = [];

      for (const queuedOrder of queuedOrders) {
        try {
          const result = await this.processQueuedOrder(queuedOrder);
          results.push(result);
          
          if (result.success) {
            this.stats.totalOrdersProcessed++;
          } else {
            this.stats.totalOrdersFailed++;
          }
        } catch (error) {
          logger.error('Failed to process queued order', {
            queuedOrderId: queuedOrder.id,
            error: error.message,
          });
          
          this.stats.totalOrdersFailed++;
          results.push({
            queuedOrderId: queuedOrder.id,
            success: false,
            error: error.message,
          });
        }
      }

      this.stats.successfulRuns++;
      const duration = Date.now() - startTime;
      this.stats.lastRunDuration = duration;

      logger.info('Queued orders processing completed', {
        processed: queuedOrders.length,
        successful: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length,
        duration: `${duration}ms`,
      });
    } catch (error) {
      this.stats.failedRuns++;
      
      logger.error('Queued orders processing failed', {
        error: error.message,
        stack: error.stack,
        duration: `${Date.now() - startTime}ms`,
      });
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Process a single queued order
   */
  async processQueuedOrder(queuedOrder) {
    const {
      id: queuedOrderId,
      retailer_id: retailerId,
      phone_number: phoneNumber,
      order_text: orderText,
      order_data: orderData,
      source,
      message_id: messageId,
    } = queuedOrder;

    try {
      logger.info('Processing queued order', {
        queuedOrderId,
        retailerId,
        phoneNumber,
        source,
      });

      // Mark as processing
      await safeModeService.markOrderProcessing(queuedOrderId);

      // Parse order using unified parser
      const parseResult = await unifiedOrderParser.parseOrder({
        source,
        rawText: orderText,
        retailerId,
      });

      if (!parseResult.success || parseResult.items.length === 0) {
        // Failed to parse - notify retailer
        await whatsappService.sendMessage(
          phoneNumber,
          '❌ Could not process your queued order. Please send items in format:\n\nRICE-1KG x 10\nDAL-1KG x 5'
        );

        await safeModeService.markOrderFailed(
          queuedOrderId,
          'Failed to parse order items'
        );

        return {
          queuedOrderId,
          success: false,
          error: 'Failed to parse order items',
        };
      }

      // Create order (simplified - you may want to use atomicOrderCreation.service)
      const prisma = require('../config/database');
      
      const order = await prisma.orders.create({
        data: {
          retailerId,
          orderNumber: await this.generateOrderNumber(),
          status: 'PENDING',
          items: {
            create: parseResult.items.map(item => ({
              productId: item.productId,
              productName: item.productName,
              quantity: item.quantity,
              unit: item.unit,
              unitPrice: item.unitPrice,
            })),
          },
          subtotal: parseResult.summary.subtotal,
          taxAmount: parseResult.summary.tax,
          total: parseResult.summary.total,
        },
      });

      // Mark as completed
      await safeModeService.markOrderCompleted(queuedOrderId, order.id);

      // Notify retailer
      await whatsappService.sendMessage(
        phoneNumber,
        `✅ Your queued order has been processed!\n\nOrder #${order.orderNumber}\nTotal: Rs.${order.total}\n\nThank you for your patience!`
      );

      logger.info('Queued order processed successfully', {
        queuedOrderId,
        orderId: order.id,
        orderNumber: order.orderNumber,
      });

      return {
        queuedOrderId,
        orderId: order.id,
        orderNumber: order.orderNumber,
        success: true,
      };
    } catch (error) {
      logger.error('Failed to process queued order', {
        queuedOrderId,
        error: error.message,
        stack: error.stack,
      });

      // Mark as failed
      await safeModeService.markOrderFailed(queuedOrderId, error.message);

      // Notify retailer
      try {
        await whatsappService.sendMessage(
          phoneNumber,
          '❌ Sorry, there was an error processing your queued order. Please try placing the order again.'
        );
      } catch (notifyError) {
        logger.error('Failed to notify retailer of processing error', {
          queuedOrderId,
          error: notifyError.message,
        });
      }

      return {
        queuedOrderId,
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Generate order number
   */
  async generateOrderNumber() {
    const prefix = 'ORD';
    const date = new Date();
    const year = date.getFullYear().toString().slice(-2);
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const random = Math.floor(Math.random() * 100000).toString().padStart(5, '0');
    
    return `${prefix}${year}${month}${random}`;
  }

  /**
   * Get worker statistics
   */
  getStats() {
    return {
      ...this.stats,
      isRunning: this.isRunning,
      successRate: this.stats.totalRuns > 0
        ? ((this.stats.successfulRuns / this.stats.totalRuns) * 100).toFixed(2) + '%'
        : 'N/A',
    };
  }

  /**
   * Manual trigger (for testing)
   */
  async triggerManually() {
    logger.info('Manual queue processing triggered');
    await this.processQueuedOrders();
  }
}

// Create singleton instance
const worker = new SafeModeQueueWorker();

// Export worker instance and control functions
module.exports = worker;
