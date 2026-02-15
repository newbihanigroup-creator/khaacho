const logger = require('../shared/logger');
const whatsappThrottledService = require('../services/whatsappThrottled.service');

/**
 * WhatsApp Retry Worker
 * Periodically retries failed WhatsApp message deliveries
 */
class WhatsAppRetryWorker {
  constructor() {
    this.isRunning = false;
    this.interval = null;
    // Retry every 2 minutes
    this.RETRY_INTERVAL_MS = 2 * 60 * 1000;
  }

  /**
   * Start the retry worker
   */
  start() {
    if (this.isRunning) {
      logger.warn('WhatsApp retry worker already running');
      return;
    }

    logger.info('Starting WhatsApp retry worker', {
      intervalMs: this.RETRY_INTERVAL_MS,
    });

    this.isRunning = true;

    // Run immediately on start
    this.runRetry();

    // Then run periodically
    this.interval = setInterval(() => {
      this.runRetry();
    }, this.RETRY_INTERVAL_MS);
  }

  /**
   * Stop the retry worker
   */
  stop() {
    if (!this.isRunning) {
      logger.warn('WhatsApp retry worker not running');
      return;
    }

    logger.info('Stopping WhatsApp retry worker');

    this.isRunning = false;

    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  /**
   * Run retry process
   */
  async runRetry() {
    try {
      logger.info('Running WhatsApp message retry process');

      const results = await whatsappThrottledService.retryFailedMessages(10);

      logger.info('WhatsApp retry process completed', results);
    } catch (error) {
      logger.error('Error in WhatsApp retry process', {
        error: error.message,
        stack: error.stack,
      });
    }
  }

  /**
   * Get worker status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      intervalMs: this.RETRY_INTERVAL_MS,
    };
  }
}

// Export singleton instance
const whatsappRetryWorker = new WhatsAppRetryWorker();

module.exports = whatsappRetryWorker;
