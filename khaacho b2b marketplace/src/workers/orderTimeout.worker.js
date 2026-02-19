/**
 * Order Timeout Worker
 * 
 * Runs every minute to check for timed out orders
 * and automatically reassign them to next available vendor
 */

const cron = require('node-cron');
const orderTimeoutService = require('../services/orderTimeout.service');
const logger = require('../shared/logger');

class OrderTimeoutWorker {
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
      totalReassignments: 0,
      totalEscalations: 0,
    };
  }

  /**
   * Start the worker
   * Runs every minute
   */
  start() {
    if (this.cronJob) {
      logger.warn('Order timeout worker already running');
      return;
    }

    // Run every minute
    this.cronJob = cron.schedule('* * * * *', async () => {
      await this.processTimeouts();
    });

    logger.info('Order timeout worker started (runs every minute)');
    
    // Run immediately on start
    this.processTimeouts();
  }

  /**
   * Stop the worker
   */
  stop() {
    if (this.cronJob) {
      this.cronJob.stop();
      this.cronJob = null;
      logger.info('Order timeout worker stopped');
    }
  }

  /**
   * Process timed out orders
   */
  async processTimeouts() {
    if (this.isRunning) {
      logger.warn('Timeout processing already in progress, skipping');
      return;
    }

    this.isRunning = true;
    const startTime = Date.now();

    try {
      logger.info('Starting timeout check');

      this.stats.totalRuns++;
      this.stats.lastRunAt = new Date();

      // Process timed out orders
      const result = await orderTimeoutService.processTimedOutOrders();

      if (result.skipped) {
        logger.info('Timeout check skipped (already processing)');
        return;
      }

      // Update statistics
      this.stats.successfulRuns++;
      this.stats.totalOrdersProcessed += result.processed || 0;

      if (result.results) {
        this.stats.totalReassignments += result.results.filter(
          r => r.action === 'REASSIGNED'
        ).length;
        this.stats.totalEscalations += result.results.filter(
          r => r.action === 'ESCALATED'
        ).length;
      }

      const duration = Date.now() - startTime;
      this.stats.lastRunDuration = duration;

      logger.info('Timeout check completed', {
        processed: result.processed || 0,
        duration: `${duration}ms`,
        totalRuns: this.stats.totalRuns,
      });
    } catch (error) {
      this.stats.failedRuns++;
      
      logger.error('Timeout check failed', {
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
    logger.info('Manual timeout check triggered');
    await this.processTimeouts();
  }
}

// Create singleton instance
const worker = new OrderTimeoutWorker();

// Export worker instance and control functions
module.exports = worker;
