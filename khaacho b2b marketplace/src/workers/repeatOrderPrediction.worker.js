const cron = require('node-cron');
const logger = require('../shared/logger');
const repeatOrderPredictionService = require('../services/repeatOrderPrediction.service');

/**
 * Repeat Order Prediction Worker
 * 
 * Scheduled tasks:
 * - Generate predictions daily at 2 AM
 * - Send reminders daily at 9 AM
 * - Update statistics daily at 11 PM
 */

class RepeatOrderPredictionWorker {
  constructor() {
    this.jobs = [];
    this.isRunning = false;
  }

  /**
   * Start all scheduled jobs
   */
  start() {
    if (this.isRunning) {
      logger.warn('Repeat order prediction worker already running');
      return;
    }

    logger.info('Starting repeat order prediction worker');

    // Job 1: Generate predictions daily at 2 AM
    const generateJob = cron.schedule('0 2 * * *', async () => {
      await this.runGeneratePredictions();
    });

    // Job 2: Send reminders daily at 9 AM
    const reminderJob = cron.schedule('0 9 * * *', async () => {
      await this.runSendReminders();
    });

    // Job 3: Update statistics daily at 11 PM
    const statsJob = cron.schedule('0 23 * * *', async () => {
      await this.runUpdateStatistics();
    });

    this.jobs = [generateJob, reminderJob, statsJob];
    this.isRunning = true;

    logger.info('Repeat order prediction worker started', {
      jobs: [
        'Generate predictions: Daily at 2 AM',
        'Send reminders: Daily at 9 AM',
        'Update statistics: Daily at 11 PM',
      ],
    });
  }

  /**
   * Stop all scheduled jobs
   */
  stop() {
    if (!this.isRunning) {
      logger.warn('Repeat order prediction worker not running');
      return;
    }

    logger.info('Stopping repeat order prediction worker');

    this.jobs.forEach(job => job.stop());
    this.jobs = [];
    this.isRunning = false;

    logger.info('Repeat order prediction worker stopped');
  }

  /**
   * Run generate predictions job
   */
  async runGeneratePredictions() {
    const startTime = Date.now();

    logger.info('Starting scheduled prediction generation');

    try {
      const results = await repeatOrderPredictionService.generatePredictions();

      const duration = Date.now() - startTime;

      logger.info('Scheduled prediction generation completed', {
        ...results,
        duration,
      });

      return results;
    } catch (error) {
      const duration = Date.now() - startTime;

      logger.error('Scheduled prediction generation failed', {
        error: error.message,
        stack: error.stack,
        duration,
      });

      throw error;
    }
  }

  /**
   * Run send reminders job
   */
  async runSendReminders() {
    const startTime = Date.now();

    logger.info('Starting scheduled reminder sending');

    try {
      const results = await repeatOrderPredictionService.sendPredictionReminders();

      const duration = Date.now() - startTime;

      logger.info('Scheduled reminder sending completed', {
        ...results,
        duration,
      });

      return results;
    } catch (error) {
      const duration = Date.now() - startTime;

      logger.error('Scheduled reminder sending failed', {
        error: error.message,
        stack: error.stack,
        duration,
      });

      throw error;
    }
  }

  /**
   * Run update statistics job
   */
  async runUpdateStatistics() {
    const startTime = Date.now();

    logger.info('Starting scheduled statistics update');

    try {
      const stats = await repeatOrderPredictionService.getStatistics();

      const duration = Date.now() - startTime;

      logger.info('Scheduled statistics update completed', {
        stats,
        duration,
      });

      return stats;
    } catch (error) {
      const duration = Date.now() - startTime;

      logger.error('Scheduled statistics update failed', {
        error: error.message,
        stack: error.stack,
        duration,
      });

      throw error;
    }
  }

  /**
   * Run job manually (for testing)
   */
  async runManual(jobName) {
    logger.info('Running manual job', { jobName });

    switch (jobName) {
      case 'generate':
        return await this.runGeneratePredictions();
      case 'reminders':
        return await this.runSendReminders();
      case 'statistics':
        return await this.runUpdateStatistics();
      default:
        throw new Error(`Unknown job: ${jobName}`);
    }
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
          name: 'generate-predictions',
          schedule: '0 2 * * *',
          description: 'Generate predictions daily at 2 AM',
        },
        {
          name: 'send-reminders',
          schedule: '0 9 * * *',
          description: 'Send reminders daily at 9 AM',
        },
        {
          name: 'update-statistics',
          schedule: '0 23 * * *',
          description: 'Update statistics daily at 11 PM',
        },
      ],
    };
  }
}

// Export singleton instance
const worker = new RepeatOrderPredictionWorker();

module.exports = worker;
