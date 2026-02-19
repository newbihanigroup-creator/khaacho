/**
 * Order Batching Worker
 * 
 * Automatically creates batches for pending orders
 * Runs every 30 minutes
 */

const cron = require('node-cron');
const orderBatchingService = require('../services/orderBatching.service');
const prisma = require('../config/database');
const logger = require('../shared/logger');

class OrderBatchingWorker {
  constructor() {
    this.isRunning = false;
    this.cronJob = null;
    this.stats = {
      totalRuns: 0,
      successfulRuns: 0,
      failedRuns: 0,
      lastRunAt: null,
      lastRunDuration: null,
      totalBatchesCreated: 0,
      totalOrdersBatched: 0,
    };
  }

  /**
   * Start the worker
   * Runs every 30 minutes
   */
  start() {
    if (this.cronJob) {
      logger.warn('Order batching worker already running');
      return;
    }

    // Run every 30 minutes
    this.cronJob = cron.schedule('*/30 * * * *', async () => {
      await this.processPendingOrders();
    });

    logger.info('Order batching worker started (runs every 30 minutes)');
  }

  /**
   * Stop the worker
   */
  stop() {
    if (this.cronJob) {
      this.cronJob.stop();
      this.cronJob = null;
      logger.info('Order batching worker stopped');
    }
  }

  /**
   * Process pending orders for batching
   */
  async processPendingOrders() {
    if (this.isRunning) {
      logger.warn('Batching already in progress, skipping');
      return;
    }

    this.isRunning = true;
    const startTime = Date.now();

    try {
      logger.info('Starting order batching process');

      this.stats.totalRuns++;
      this.stats.lastRunAt = new Date();

      // Get vendors with pending orders
      const vendorsWithPendingOrders = await prisma.orders.groupBy({
        by: ['vendorId'],
        where: {
          status: 'PENDING',
        },
        _count: {
          id: true,
        },
        having: {
          id: {
            _count: {
              gte: 3, // At least 3 orders
            },
          },
        },
      });

      logger.info(`Found ${vendorsWithPendingOrders.length} vendors with pending orders`);

      let totalBatchesCreated = 0;
      let totalOrdersBatched = 0;

      for (const vendor of vendorsWithPendingOrders) {
        try {
          const batches = await orderBatchingService.autoBatchPendingOrders(vendor.vendorId);
          
          totalBatchesCreated += batches.length;
          totalOrdersBatched += batches.reduce((sum, b) => sum + b.totalOrders, 0);
        } catch (error) {
          logger.error('Failed to batch orders for vendor', {
            vendorId: vendor.vendorId,
            error: error.message,
          });
        }
      }

      this.stats.successfulRuns++;
      this.stats.totalBatchesCreated += totalBatchesCreated;
      this.stats.totalOrdersBatched += totalOrdersBatched;
      
      const duration = Date.now() - startTime;
      this.stats.lastRunDuration = duration;

      logger.info('Order batching completed', {
        batchesCreated: totalBatchesCreated,
        ordersBatched: totalOrdersBatched,
        duration: `${duration}ms`,
      });
    } catch (error) {
      this.stats.failedRuns++;

      logger.error('Order batching failed', {
        error: error.message,
        stack: error.stack,
        duration: `${Date.now() - startTime}ms`,
      });
    } finally {
      this.isRunning = false;
    }
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
    logger.info('Manual order batching triggered');
    await this.processPendingOrders();
  }
}

// Create singleton instance
const worker = new OrderBatchingWorker();

// Export worker instance and control functions
module.exports = worker;
