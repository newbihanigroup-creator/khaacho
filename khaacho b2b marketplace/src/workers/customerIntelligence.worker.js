/**
 * Customer Intelligence Worker
 * 
 * Automatically:
 * - Sends quick reorder suggestions to eligible customers
 * - Refreshes customer memory analytics
 * - Cleans up expired conversation contexts
 */

const cron = require('node-cron');
const prisma = require('../config/database');
const logger = require('../shared/logger');
const customerIntelligenceService = require('../services/customerIntelligence.service');

class CustomerIntelligenceWorker {
  constructor() {
    this.isRunning = false;
    this.jobs = [];
  }

  /**
   * Start all worker jobs
   */
  start() {
    logger.info('Starting Customer Intelligence Worker');

    // Send quick reorder suggestions every 2 hours
    const quickReorderJob = cron.schedule('0 */2 * * *', async () => {
      await this.sendQuickReorderSuggestions();
    });
    this.jobs.push(quickReorderJob);

    // Refresh analytics every 6 hours
    const analyticsJob = cron.schedule('0 */6 * * *', async () => {
      await this.refreshAnalytics();
    });
    this.jobs.push(analyticsJob);

    // Clean up expired contexts every hour
    const cleanupJob = cron.schedule('0 * * * *', async () => {
      await this.cleanupExpiredContexts();
    });
    this.jobs.push(cleanupJob);

    this.isRunning = true;
    logger.info('Customer Intelligence Worker started');
  }

  /**
   * Stop all worker jobs
   */
  stop() {
    logger.info('Stopping Customer Intelligence Worker');

    this.jobs.forEach(job => job.stop());
    this.jobs = [];
    this.isRunning = false;

    logger.info('Customer Intelligence Worker stopped');
  }

  /**
   * Send quick reorder suggestions to eligible customers
   */
  async sendQuickReorderSuggestions() {
    if (this.isRunning) {
      logger.info('Quick reorder suggestion job already running, skipping');
      return;
    }

    this.isRunning = true;

    try {
      logger.info('Starting quick reorder suggestion job');

      // Get eligible customers
      const candidates = await prisma.$queryRaw`
        SELECT *
        FROM quick_reorder_candidates
        WHERE ready_for_reorder = true
        ORDER BY days_since_last_order DESC
        LIMIT 50
      `;

      logger.info('Found quick reorder candidates', {
        count: candidates.length,
      });

      const results = {
        total: candidates.length,
        sent: 0,
        failed: 0,
        skipped: 0,
      };

      for (const candidate of candidates) {
        try {
          // Check if suggestion already sent recently
          const recentSuggestion = await prisma.quickReorderSuggestions.findFirst({
            where: {
              retailerId: candidate.retailer_id,
              suggestionSent: true,
              sentAt: {
                gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // Last 7 days
              },
            },
          });

          if (recentSuggestion) {
            logger.debug('Suggestion already sent recently', {
              retailerId: candidate.retailer_id,
            });
            results.skipped++;
            continue;
          }

          // Send suggestion
          const result = await customerIntelligenceService.sendQuickReorderSuggestion(
            candidate.retailer_id,
            candidate.phone_number
          );

          if (result.success) {
            results.sent++;
          } else {
            results.skipped++;
          }

          // Rate limiting - wait 2 seconds between messages
          await new Promise(resolve => setTimeout(resolve, 2000));
        } catch (error) {
          logger.error('Failed to send quick reorder suggestion', {
            retailerId: candidate.retailer_id,
            error: error.message,
          });
          results.failed++;
        }
      }

      logger.info('Quick reorder suggestion job completed', results);
    } catch (error) {
      logger.error('Quick reorder suggestion job failed', {
        error: error.message,
        stack: error.stack,
      });
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Refresh customer memory analytics
   */
  async refreshAnalytics() {
    try {
      logger.info('Starting analytics refresh job');

      await customerIntelligenceService.refreshAnalytics();

      logger.info('Analytics refresh job completed');
    } catch (error) {
      logger.error('Analytics refresh job failed', {
        error: error.message,
        stack: error.stack,
      });
    }
  }

  /**
   * Clean up expired conversation contexts
   */
  async cleanupExpiredContexts() {
    try {
      logger.info('Starting expired context cleanup job');

      const result = await prisma.conversationContext.updateMany({
        where: {
          isActive: true,
          expiresAt: {
            lt: new Date(),
          },
        },
        data: {
          isActive: false,
          updatedAt: new Date(),
        },
      });

      logger.info('Expired context cleanup completed', {
        deactivated: result.count,
      });
    } catch (error) {
      logger.error('Expired context cleanup failed', {
        error: error.message,
      });
    }
  }

  /**
   * Get worker status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      activeJobs: this.jobs.length,
    };
  }
}

module.exports = new CustomerIntelligenceWorker();
