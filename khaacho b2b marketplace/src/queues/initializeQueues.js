const { queueManager } = require('./queueManager');
const whatsappProcessor = require('./processors/whatsappProcessor');
const creditScoreProcessor = require('./processors/creditScoreProcessor');
const orderRoutingProcessor = require('./processors/orderRoutingProcessor');
const paymentReminderProcessor = require('./processors/paymentReminderProcessor');
const reportGenerationProcessor = require('./processors/reportGenerationProcessor');
const orderProcessingProcessor = require('./processors/orderProcessingProcessor');
const logger = require('../utils/logger');

/**
 * Initialize all queues and register processors
 */
function initializeQueues() {
  try {
    logger.info('Initializing job queues...');

    // Check if Redis is available
    if (!process.env.REDIS_URL && !process.env.REDIS_HOST) {
      logger.warn('Redis not configured - queues will not be initialized');
      logger.warn('Set REDIS_URL environment variable to enable job queues');
      return null;
    }

    // Initialize queue manager
    queueManager.initialize();

    // Register processors with concurrency settings
    try {
      queueManager.registerProcessor('WHATSAPP', whatsappProcessor, 5);
      logger.info('WhatsApp queue processor registered');
    } catch (error) {
      logger.error('Failed to register WhatsApp processor', { error: error.message });
    }

    try {
      queueManager.registerProcessor('CREDIT_SCORE', creditScoreProcessor, 2);
      logger.info('Credit score queue processor registered');
    } catch (error) {
      logger.error('Failed to register credit score processor', { error: error.message });
    }

    try {
      queueManager.registerProcessor('ORDER_ROUTING', orderRoutingProcessor, 3);
      logger.info('Order routing queue processor registered');
    } catch (error) {
      logger.error('Failed to register order routing processor', { error: error.message });
    }

    try {
      queueManager.registerProcessor('PAYMENT_REMINDERS', paymentReminderProcessor, 3);
      logger.info('Payment reminders queue processor registered');
    } catch (error) {
      logger.error('Failed to register payment reminders processor', { error: error.message });
    }

    try {
      queueManager.registerProcessor('REPORT_GENERATION', reportGenerationProcessor, 1);
      logger.info('Report generation queue processor registered');
    } catch (error) {
      logger.error('Failed to register report generation processor', { error: error.message });
    }

    try {
      queueManager.registerProcessor('ORDER_PROCESSING', orderProcessingProcessor, 5);
      logger.info('Order processing queue processor registered');
    } catch (error) {
      logger.error('Failed to register order processing processor', { error: error.message });
    }

    logger.info('All job queues initialized successfully');

    return queueManager;
  } catch (error) {
    logger.error('Failed to initialize job queues', {
      error: error.message,
      stack: error.stack,
    });
    // Don't throw - allow app to start without queues
    logger.warn('Application will continue without job queues');
    return null;
  }
}

/**
 * Graceful shutdown of all queues
 */
async function shutdownQueues() {
  try {
    logger.info('Shutting down job queues...');
    await queueManager.closeAll();
    logger.info('All job queues shut down successfully');
  } catch (error) {
    logger.error('Error shutting down job queues', {
      error: error.message,
    });
    throw error;
  }
}

module.exports = {
  initializeQueues,
  shutdownQueues,
};
