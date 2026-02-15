/**
 * Vendor Scoring Worker
 * 
 * Periodically recalculates vendor scores
 * Runs every hour to update all vendor scores
 */

const cron = require('node-cron');
const vendorScoringService = require('../services/vendorScoring.service');
const prisma = require('../config/database');
const logger = require('../shared/logger');

class VendorScoringWorker {
  constructor() {
    this.isRunning = false;
    this.cronJob = null;
    this.stats = {
      totalRuns: 0,
      successfulRuns: 0,
      failedRuns: 0,
      lastRunAt: null,
      lastRunDuration: null,
      totalVendorsProcessed: 0,
    };
  }

  /**
   * Start the worker
   * Runs every hour
   */
  start() {
    if (this.cronJob) {
      logger.warn('Vendor scoring worker already running');
      return;
    }

    // Run every hour
    this.cronJob = cron.schedule('0 * * * *', async () => {
      await this.updateAllVendorScores();
    });

    logger.info('Vendor scoring worker started (runs every hour)');
  }

  /**
   * Stop the worker
   */
  stop() {
    if (this.cronJob) {
      this.cronJob.stop();
      this.cronJob = null;
      logger.info('Vendor scoring worker stopped');
    }
  }

  /**
   * Update all vendor scores
   */
  async updateAllVendorScores() {
    if (this.isRunning) {
      logger.warn('Score update already in progress, skipping');
      return;
    }

    this.isRunning = true;
    const startTime = Date.now();

    try {
      logger.info('Starting vendor score updates');

      this.stats.totalRuns++;
      this.stats.lastRunAt = new Date();

      // Get all active vendors
      const vendors = await prisma.vendors.findMany({
        where: {
          user: {
            isActive: true,
          },
        },
        select: { id: true },
      });

      logger.info(`Updating scores for ${vendors.length} vendors`);

      let processed = 0;
      let failed = 0;

      for (const vendor of vendors) {
        try {
          await vendorScoringService.updateVendorScore(
            vendor.id,
            'PERIODIC_UPDATE'
          );
          processed++;
        } catch (error) {
          logger.error('Failed to update vendor score', {
            vendorId: vendor.id,
            error: error.message,
          });
          failed++;
        }
      }

      this.stats.successfulRuns++;
      this.stats.totalVendorsProcessed += processed;
      const duration = Date.now() - startTime;
      this.stats.lastRunDuration = duration;

      logger.info('Vendor score updates completed', {
        processed,
        failed,
        duration: `${duration}ms`,
      });
    } catch (error) {
      this.stats.failedRuns++;

      logger.error('Vendor score update failed', {
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
    logger.info('Manual vendor score update triggered');
    await this.updateAllVendorScores();
  }
}

// Create singleton instance
const worker = new VendorScoringWorker();

// Export worker instance and control functions
module.exports = worker;
module.exports.start = () => worker.start();
module.exports.stop = () => worker.stop();
module.exports.getStats = () => worker.getStats();
module.exports.triggerManually = () => worker.triggerManually();
