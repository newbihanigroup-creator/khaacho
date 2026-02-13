const { queueManager } = require('./queueManager');
const SyncFallback = require('./syncFallback');
const whatsappProcessor = require('./processors/whatsappProcessor');
const creditScoreProcessor = require('./processors/creditScoreProcessor');
const orderRoutingProcessor = require('./processors/orderRoutingProcessor');
const paymentReminderProcessor = require('./processors/paymentReminderProcessor');
const reportGenerationProcessor = require('./processors/reportGenerationProcessor');
const orderProcessingProcessor = require('./processors/orderProcessingProcessor');
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

    // Register processors with concurrency settings
    try {
      activeQueueManager.registerProcessor('WHATSAPP', whatsappProcessor, 5);
      logger.info('WhatsApp queue processor registered');
    } catch (error) {
      logger.error('Failed to register WhatsApp processor', { error: error.message });
    }

    try {
      activeQueueManager.registerProcessor('CREDIT_SCORE', creditScoreProcessor, 2);
      logger.info('Credit score queue processor registered');
    } catch (error) {
      logger.error('Failed to register credit score processor', { error: error.message });
    }

    try {
      activeQueueManager.registerProcessor('ORDER_ROUTING', orderRoutingProcessor, 3);
      logger.info('Order routing queue processor registered');
    } catch (error) {
      logger.error('Failed to register order routing processor', { error: error.message });
    }

    try {
      activeQueueManager.registerProcessor('PAYMENT_REMINDERS', paymentReminderProcessor, 3);
      logger.info('Payment reminders queue processor registered');
    } catch (error) {
      logger.error('Failed to register payment reminders processor', { error: error.message });
    }

    try {
      activeQueueManager.registerProcessor('REPORT_GENERATION', reportGenerationProcessor, 1);
      logger.info('Report generation queue processor registered');
    } catch (error) {
      logger.error('Failed to register report generation processor', { error: error.message });
    }

    try {
      activeQueueManager.registerProcessor('ORDER_PROCESSING', orderProcessingProcessor, 5);
      logger.info('Order processing queue processor registered');
    } catch (error) {
      logger.error('Failed to register order processing processor', { error: error.message });
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
