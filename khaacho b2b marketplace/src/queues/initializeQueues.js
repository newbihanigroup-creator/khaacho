const { queueManager } = require('./queueManager');
const SyncFallback = require('./syncFallback');
const { getQueueConfig } = require('./productionQueueConfig');
const whatsappProcessor = require('./processors/whatsappProcessor');
const creditScoreProcessor = require('./processors/creditScoreProcessor');
const orderRoutingProcessor = require('./processors/orderRoutingProcessor');
const paymentReminderProcessor = require('./processors/paymentReminderProcessor');
const reportGenerationProcessor = require('./processors/reportGenerationProcessor');
const orderProcessingProcessor = require('./processors/orderProcessingProcessor');
const imageProcessingProcessor = require('./processors/imageProcessingProcessor');
const logger = require('../utils/logger');

let activeQueueManager = null;

/**
 * Initialize all queues and register processors
 */
function initializeQueues() {
  try {
    logger.info('Initializing job queues...');

    // Check if Redis is available
    if (!process.env.REDIS_URL && !process.env.REDIS_HOST) {
      logger.warn('Redis not configured - using synchronous fallback');
      logger.warn('Jobs will execute immediately instead of being queued');
      
      // Use sync fallback
      activeQueueManager = new SyncFallback();
    } else {
      // Try to use Redis queues
      try {
        queueManager.initialize();
        activeQueueManager = queueManager;
        logger.info('Using Redis-based job queues');
      } catch (error) {
        logger.error('Failed to initialize Redis queues, falling back to sync execution', {
          error: error.message,
        });
        activeQueueManager = new SyncFallback();
      }
    }

    // Register processors with production concurrency settings
    try {
      const whatsappConfig = getQueueConfig('whatsapp-messages');
      activeQueueManager.registerProcessor('WHATSAPP', whatsappProcessor, whatsappConfig.concurrency);
      logger.info(`WhatsApp queue processor registered (concurrency: ${whatsappConfig.concurrency})`);
    } catch (error) {
      logger.error('Failed to register WhatsApp processor', { error: error.message });
    }

    try {
      const creditConfig = getQueueConfig('credit-score-calculation');
      activeQueueManager.registerProcessor('CREDIT_SCORE', creditScoreProcessor, creditConfig.concurrency);
      logger.info(`Credit score queue processor registered (concurrency: ${creditConfig.concurrency})`);
    } catch (error) {
      logger.error('Failed to register credit score processor', { error: error.message });
    }

    try {
      const routingConfig = getQueueConfig('order-routing');
      activeQueueManager.registerProcessor('ORDER_ROUTING', orderRoutingProcessor, routingConfig.concurrency);
      logger.info(`Order routing queue processor registered (concurrency: ${routingConfig.concurrency})`);
    } catch (error) {
      logger.error('Failed to register order routing processor', { error: error.message });
    }

    try {
      const reminderConfig = getQueueConfig('payment-reminders');
      activeQueueManager.registerProcessor('PAYMENT_REMINDERS', paymentReminderProcessor, reminderConfig.concurrency);
      logger.info(`Payment reminders queue processor registered (concurrency: ${reminderConfig.concurrency})`);
    } catch (error) {
      logger.error('Failed to register payment reminders processor', { error: error.message });
    }

    try {
      const reportConfig = getQueueConfig('report-generation');
      activeQueueManager.registerProcessor('REPORT_GENERATION', reportGenerationProcessor, reportConfig.concurrency);
      logger.info(`Report generation queue processor registered (concurrency: ${reportConfig.concurrency})`);
    } catch (error) {
      logger.error('Failed to register report generation processor', { error: error.message });
    }

    try {
      const orderConfig = getQueueConfig('order-processing');
      activeQueueManager.registerProcessor('ORDER_PROCESSING', orderProcessingProcessor, orderConfig.concurrency);
      logger.info(`Order processing queue processor registered (concurrency: ${orderConfig.concurrency})`);
    } catch (error) {
      logger.error('Failed to register order processing processor', { error: error.message });
    }

    try {
      const imageConfig = getQueueConfig('image-processing');
      activeQueueManager.registerProcessor('IMAGE_PROCESSING', imageProcessingProcessor, imageConfig.concurrency);
      logger.info(`Image processing queue processor registered (concurrency: ${imageConfig.concurrency})`);
    } catch (error) {
      logger.error('Failed to register image processing processor', { error: error.message });
    }

    logger.info('All job queues initialized successfully');

    return activeQueueManager;
  } catch (error) {
    logger.error('Failed to initialize job queues', {
      error: error.message,
      stack: error.stack,
    });
    // Use sync fallback as last resort
    logger.warn('Using synchronous fallback as last resort');
    activeQueueManager = new SyncFallback();
    return activeQueueManager;
  }
}

/**
 * Get the active queue manager (either Redis-based or sync fallback)
 */
function getQueueManager() {
  return activeQueueManager || queueManager;
}

/**
 * Graceful shutdown of all queues
 */
async function shutdownQueues() {
  try {
    logger.info('Shutting down job queues...');
    if (activeQueueManager) {
      await activeQueueManager.closeAll();
    }
    logger.info('All job queues shut down successfully');
  } catch (error) {
    logger.error('Error shutting down job queues', {
      error: error.message,
    });
    // Don't throw on shutdown
  }
}

module.exports = {
  initializeQueues,
  getQueueManager,
  shutdownQueues,
};
