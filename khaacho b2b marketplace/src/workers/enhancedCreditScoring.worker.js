const cron = require('node-cron');
const enhancedCreditScoring = require('../services/enhancedCreditScoring.service');
const logger = require('../shared/logger');

/**
 * Enhanced Credit Scoring Worker
 * 
 * Scheduled jobs:
 * - Update credit scores and process automatic adjustments (daily at 2 AM)
 * - Monitor high-risk retailers (every 6 hours)
 */

class EnhancedCreditScoringWorker {
  constructor() {
    this.jobs = [];
    this.isRunning = false;
  }

  /**
   * Start all scheduled jobs
   */
  start() {
    if (this.isRunning) {
      logger.warn('Enhanced credit scoring worker already running');
      return;
    }

    logger.info('Starting enhanced credit scoring worker');

    // Job 1: Daily credit score update and automatic adjustments (2 AM)
    const dailyUpdateJob = cron.schedule('0 2 * * *', async () => {
      logger.info('Running daily credit score update and adjustments');
      try {
        const results = await enhancedCreditScoring.processAllAutomaticAdjustments();
        logger.info('Daily credit score update completed', results);
      } catch (error) {
        logger.error('Daily credit score update failed', {
          error: error.message,
          stack: error.stack,
        });
      }
    });

    // Job 2: Monitor high-risk retailers (every 6 hours)
    const monitoringJob = cron.schedule('0 */6 * * *', async () => {
      logger.info('Running high-risk retailer monitoring');
      try {
        const stats = await enhancedCreditScoring.getCreditScoreStatistics();
        
        if (stats.distribution.poor + stats.distribution.veryPoor > 0) {
          logger.warn('High-risk retailers detected', {
            poor: stats.distribution.poor,
            veryPoor: stats.distribution.veryPoor,
          });
        }
        
        logger.info('High-risk monitoring completed', stats);
      } catch (error) {
        logger.error('High-risk monitoring failed', {
          error: error.message,
        });
      }
    });

    this.jobs.push(dailyUpdateJob, monitoringJob);
    this.isRunning = true;

    logger.info('Enhanced credit scoring worker started with 2 jobs');
  }

  /**
   * Stop all scheduled jobs
   */
  stop() {
    if (!this.isRunning) {
      logger.warn('Enhanced credit scoring worker not running');
      return;
    }

    logger.info('Stopping enhanced credit scoring worker');

    this.jobs.forEach(job => job.stop());
    this.jobs = [];
    this.isRunning = false;

    logger.info('Enhanced credit scoring worker stopped');
  }

  /**
   * Get worker status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      jobCount: this.jobs.length,
      jobs: [
        {
          name: 'Daily Credit Score Update',
          schedule: '0 2 * * * (2 AM daily)',
          description: 'Update all retailer credit scores and process automatic adjustments',
        },
        {
          name: 'High-Risk Monitoring',
          schedule: '0 */6 * * * (Every 6 hours)',
          description: 'Monitor retailers with poor credit scores',
        },
      ],
    };
  }

  /**
   * Run job manually (for testing)
   */
  async runJob(jobName) {
    logger.info('Running job manually', { jobName });

    switch (jobName) {
      case 'daily-update':
        return await enhancedCreditScoring.processAllAutomaticAdjustments();
      
      case 'monitoring':
        return await enhancedCreditScoring.getCreditScoreStatistics();
      
      default:
        throw new Error(`Unknown job: ${jobName}`);
    }
  }
}

// Export singleton instance
const worker = new EnhancedCreditScoringWorker();

// Auto-start if enabled
if (process.env.ENABLE_CREDIT_SCORING_WORKER !== 'false') {
  worker.start();
}

module.exports = worker;
