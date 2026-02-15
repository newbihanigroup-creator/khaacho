const logger = require('../../shared/logger');
const whatsappThrottledService = require('../../services/whatsappThrottled.service');

/**
 * WhatsApp Throttled Message Processor
 * Processes queued WhatsApp messages with rate limiting
 * 
 * @param {Object} job - Bull job
 * @returns {Promise<Object>} Processing result
 */
async function processWhatsAppThrottledMessage(job) {
  const { to, message, idempotencyKey } = job.data;

  logger.info('Processing throttled WhatsApp message', {
    jobId: job.id,
    to,
    idempotencyKey,
  });

  try {
    const result = await whatsappThrottledService.processQueuedMessage(job);

    logger.info('Throttled WhatsApp message processed successfully', {
      jobId: job.id,
      to,
      result,
    });

    return result;
  } catch (error) {
    logger.error('Error processing throttled WhatsApp message', {
      jobId: job.id,
      to,
      error: error.message,
      stack: error.stack,
    });

    // Re-throw to trigger Bull retry mechanism
    throw error;
  }
}

module.exports = processWhatsAppThrottledMessage;
