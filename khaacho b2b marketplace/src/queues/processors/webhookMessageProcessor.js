/**
 * Webhook Message Processor
 * 
 * Background processor for webhook messages
 * Handles heavy processing after webhook responds
 */

const logger = require('../../shared/logger');
const whatsappService = require('../../services/whatsapp.service');
const webhookSecurityService = require('../../services/webhookSecurity.service');
const queueRetryService = require('../../services/queueRetry.service');

/**
 * Process WhatsApp message from webhook
 * 
 * This runs in background after webhook has responded
 * Can take as long as needed without blocking webhook
 */
async function processWebhookMessage(job) {
  const startTime = Date.now();
  const { data } = job;
  const {
    recordId,
    messageId,
    phoneNumber,
    messageText,
    messageType,
    timestamp,
    requestId,
  } = data;

  try {
    logger.info('Processing webhook message', {
      jobId: job.id,
      messageId,
      phoneNumber,
      requestId,
    });

    // Track job start
    await queueRetryService.trackJobStart(
      job.id,
      'whatsapp-messages',
      'process-message',
      data
    );

    // Process message through WhatsApp service
    await whatsappService.handleIncomingMessage({
      from: phoneNumber,
      text: messageText,
      messageId,
      type: messageType,
      timestamp,
    });

    // Update message status
    await webhookSecurityService.updateMessageStatus(messageId, 'completed', {
      responseTimeMs: Date.now() - startTime,
    });

    // Track job completion
    await queueRetryService.trackJobCompletion(
      job.id,
      { success: true },
      Date.now() - startTime
    );

    logger.info('Webhook message processed successfully', {
      jobId: job.id,
      messageId,
      phoneNumber,
      duration: Date.now() - startTime,
    });

    return { success: true, messageId, duration: Date.now() - startTime };

  } catch (error) {
    const duration = Date.now() - startTime;
    
    logger.error('Webhook message processing failed', {
      jobId: job.id,
      messageId,
      phoneNumber,
      error: error.message,
      stack: error.stack,
      duration,
    });

    // Update message status
    await webhookSecurityService.updateMessageStatus(messageId, 'failed', {
      errorMessage: error.message,
      errorCount: 1,
      responseTimeMs: duration,
    });

    // Track job failure (handles retry logic)
    const retryResult = await queueRetryService.trackJobFailure(
      job.id,
      error,
      job.attemptsMade || 1
    );

    if (retryResult.shouldRetry) {
      logger.info('Job will be retried', {
        jobId: job.id,
        messageId,
        nextRetryAt: retryResult.nextRetryAt,
        retryDelay: retryResult.retryDelay,
      });
      
      // Throw error to trigger retry
      throw error;
    } else if (retryResult.shouldMoveToDLQ) {
      logger.error('Job exhausted retries, moving to DLQ', {
        jobId: job.id,
        messageId,
      });
      
      await queueRetryService.moveToDeadLetterQueue(job.id);
    }

    throw error;
  }
}

/**
 * Process Twilio WhatsApp message
 * Similar to Meta webhook but handles Twilio-specific format
 */
async function processTwilioMessage(job) {
  const startTime = Date.now();
  const { data } = job;
  const {
    recordId,
    messageId,
    phoneNumber,
    messageText,
    mediaUrl,
    timestamp,
    requestId,
  } = data;

  try {
    logger.info('Processing Twilio message', {
      jobId: job.id,
      messageId,
      phoneNumber,
      requestId,
    });

    // Track job start
    await queueRetryService.trackJobStart(
      job.id,
      'whatsapp-messages',
      'process-twilio-message',
      data
    );

    // Process through Twilio service
    const twilioService = require('../../services/twilio.service');
    await twilioService.processIncomingMessage(phoneNumber, messageText, mediaUrl);

    // Update message status
    await webhookSecurityService.updateMessageStatus(messageId, 'completed', {
      responseTimeMs: Date.now() - startTime,
    });

    // Track job completion
    await queueRetryService.trackJobCompletion(
      job.id,
      { success: true },
      Date.now() - startTime
    );

    logger.info('Twilio message processed successfully', {
      jobId: job.id,
      messageId,
      phoneNumber,
      duration: Date.now() - startTime,
    });

    return { success: true, messageId, duration: Date.now() - startTime };

  } catch (error) {
    const duration = Date.now() - startTime;
    
    logger.error('Twilio message processing failed', {
      jobId: job.id,
      messageId,
      phoneNumber,
      error: error.message,
      stack: error.stack,
      duration,
    });

    // Update message status
    await webhookSecurityService.updateMessageStatus(messageId, 'failed', {
      errorMessage: error.message,
      errorCount: 1,
      responseTimeMs: duration,
    });

    // Track job failure
    const retryResult = await queueRetryService.trackJobFailure(
      job.id,
      error,
      job.attemptsMade || 1
    );

    if (retryResult.shouldRetry) {
      logger.info('Twilio job will be retried', {
        jobId: job.id,
        messageId,
        nextRetryAt: retryResult.nextRetryAt,
      });
      
      throw error;
    } else if (retryResult.shouldMoveToDLQ) {
      logger.error('Twilio job exhausted retries, moving to DLQ', {
        jobId: job.id,
        messageId,
      });
      
      await queueRetryService.moveToDeadLetterQueue(job.id);
    }

    throw error;
  }
}

module.exports = {
  processWebhookMessage,
  processTwilioMessage,
};
