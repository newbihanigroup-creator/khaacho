const logger = require('../shared/logger');
const whatsappThrottling = require('./whatsappThrottling.service');
const { queueManager, QUEUES } = require('../queues/queueManager');
const prisma = require('../config/database');
const axios = require('axios');
const config = require('../config');

/**
 * Throttled WhatsApp Service
 * Integrates throttling, queuing, idempotency, and retry logic
 */
class WhatsAppThrottledService {
  constructor() {
    this.apiUrl = config.whatsapp.apiUrl;
    this.phoneNumberId = config.whatsapp.phoneNumberId;
    this.accessToken = config.whatsapp.accessToken;
  }

  /**
   * Send WhatsApp message with throttling
   * 
   * @param {string} to - Recipient phone number
   * @param {string} message - Message content
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} Send result
   */
  async sendMessage(to, message, options = {}) {
    try {
      // Generate idempotency key
      const idempotencyKey = whatsappThrottling.generateIdempotencyKey(
        to,
        message,
        options
      );

      // Check for duplicate
      const isDuplicate = await whatsappThrottling.isDuplicate(idempotencyKey);
      if (isDuplicate) {
        logger.info('Duplicate message detected, skipping', {
          to,
          idempotencyKey,
        });
        return {
          success: true,
          duplicate: true,
          message: 'Message already sent',
        };
      }

      // Check rate limit
      const canSendNow = whatsappThrottling.canSendImmediately(to);

      if (canSendNow) {
        // Send immediately
        return await this.sendImmediately(to, message, idempotencyKey, options);
      } else {
        // Queue for later
        return await this.queueMessage(to, message, idempotencyKey, options);
      }
    } catch (error) {
      logger.error('Error in sendMessage', {
        to,
        error: error.message,
        stack: error.stack,
      });
      throw error;
    }
  }

  /**
   * Send message immediately
   * 
   * @param {string} to - Recipient phone number
   * @param {string} message - Message content
   * @param {string} idempotencyKey - Idempotency key
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} Send result
   */
  async sendImmediately(to, message, idempotencyKey, options = {}) {
    const startTime = Date.now();

    try {
      // Send via WhatsApp API
      const response = await axios.post(
        `${this.apiUrl}/${this.phoneNumberId}/messages`,
        {
          messaging_product: 'whatsapp',
          to,
          type: 'text',
          text: { body: message },
        },
        {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json',
          },
          timeout: 10000,
        }
      );

      const duration = Date.now() - startTime;

      // Update rate limit
      whatsappThrottling.updateRateLimit(to);

      // Store message in database
      await prisma.whatsAppMessage.create({
        data: {
          messageId: response.data.messages[0].id,
          from: this.phoneNumberId,
          to,
          body: message,
          type: 'text',
          status: 'sent',
          direction: 'OUTBOUND',
          metadata: {
            idempotencyKey,
            duration,
            ...options.metadata,
          },
        },
      });

      logger.info('WhatsApp message sent immediately', {
        to,
        messageId: response.data.messages[0].id,
        duration,
        idempotencyKey,
      });

      return {
        success: true,
        immediate: true,
        messageId: response.data.messages[0].id,
        duration,
      };
    } catch (error) {
      const duration = Date.now() - startTime;

      logger.error('WhatsApp send error', {
        to,
        error: error.message,
        duration,
      });

      // Log delivery failure
      await whatsappThrottling.logDeliveryFailure(
        {
          to,
          message,
          idempotencyKey,
          attemptCount: 1,
          ...options,
        },
        error
      );

      throw error;
    }
  }

  /**
   * Queue message for later delivery
   * 
   * @param {string} to - Recipient phone number
   * @param {string} message - Message content
   * @param {string} idempotencyKey - Idempotency key
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} Queue result
   */
  async queueMessage(to, message, idempotencyKey, options = {}) {
    try {
      // Calculate delay
      const delay = whatsappThrottling.getDelayUntilNextMessage(to);

      // Add to Bull queue
      const job = await queueManager.addJob(
        'WHATSAPP',
        'send-throttled-message',
        {
          to,
          message,
          idempotencyKey,
          attemptCount: 1,
          ...options,
        },
        {
          delay,
          jobId: idempotencyKey, // Use idempotency key as job ID
          removeOnComplete: true,
          removeOnFail: false,
        }
      );

      logger.info('WhatsApp message queued', {
        to,
        jobId: job.id,
        delay,
        idempotencyKey,
      });

      return {
        success: true,
        queued: true,
        jobId: job.id,
        delay,
      };
    } catch (error) {
      logger.error('Error queuing message', {
        to,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Process queued message (called by Bull worker)
   * 
   * @param {Object} job - Bull job
   * @returns {Promise<Object>} Process result
   */
  async processQueuedMessage(job) {
    const { to, message, idempotencyKey, attemptCount, ...options } = job.data;

    try {
      logger.info('Processing queued WhatsApp message', {
        jobId: job.id,
        to,
        attemptCount,
      });

      // Check for duplicate again (in case it was sent elsewhere)
      const isDuplicate = await whatsappThrottling.isDuplicate(idempotencyKey);
      if (isDuplicate) {
        logger.info('Duplicate detected during processing, skipping', {
          jobId: job.id,
          idempotencyKey,
        });
        return {
          success: true,
          duplicate: true,
        };
      }

      // Send message
      const result = await this.sendImmediately(
        to,
        message,
        idempotencyKey,
        options
      );

      return result;
    } catch (error) {
      logger.error('Error processing queued message', {
        jobId: job.id,
        to,
        error: error.message,
      });

      // Log delivery failure
      await whatsappThrottling.logDeliveryFailure(
        {
          to,
          message,
          idempotencyKey,
          attemptCount: attemptCount || 1,
          ...options,
        },
        error
      );

      throw error;
    }
  }

  /**
   * Retry failed messages
   * Called periodically to retry failed deliveries
   * 
   * @param {number} limit - Maximum messages to retry
   * @returns {Promise<Object>} Retry results
   */
  async retryFailedMessages(limit = 10) {
    try {
      const failedMessages = await whatsappThrottling.getMessagesForRetry(limit);

      logger.info('Retrying failed messages', {
        count: failedMessages.length,
      });

      const results = {
        total: failedMessages.length,
        succeeded: 0,
        failed: 0,
        permanentlyFailed: 0,
      };

      for (const failure of failedMessages) {
        try {
          const { phoneNumber, message, idempotencyKey, attemptCount } = failure;
          const metadata = failure.metadata?.originalData || {};

          // Check if max attempts reached
          if (attemptCount >= 5) {
            await whatsappThrottling.markAsPermanentlyFailed(failure.id);
            results.permanentlyFailed++;
            continue;
          }

          // Try to send
          const result = await this.sendMessage(
            phoneNumber,
            message,
            {
              ...metadata,
              retryAttempt: attemptCount + 1,
            }
          );

          if (result.success) {
            await whatsappThrottling.markAsRetried(failure.id, true);
            results.succeeded++;
          } else {
            await whatsappThrottling.markAsRetried(failure.id, false);
            results.failed++;
          }
        } catch (error) {
          logger.error('Error retrying message', {
            failureId: failure.id,
            error: error.message,
          });
          await whatsappThrottling.markAsRetried(failure.id, false);
          results.failed++;
        }
      }

      logger.info('Failed message retry completed', results);

      return results;
    } catch (error) {
      logger.error('Error in retryFailedMessages', {
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get throttling statistics
   * 
   * @returns {Promise<Object>} Statistics
   */
  async getStats() {
    try {
      const [
        pendingFailures,
        resolvedFailures,
        permanentFailures,
        queueStats,
      ] = await Promise.all([
        prisma.whatsAppDeliveryFailure.count({
          where: { status: 'PENDING' },
        }),
        prisma.whatsAppDeliveryFailure.count({
          where: { status: 'RESOLVED' },
        }),
        prisma.whatsAppDeliveryFailure.count({
          where: { status: 'FAILED' },
        }),
        queueManager.getQueueCounts('WHATSAPP'),
      ]);

      const throttlingStats = whatsappThrottling.getStats();

      return {
        throttling: throttlingStats,
        deliveryFailures: {
          pending: pendingFailures,
          resolved: resolvedFailures,
          permanentlyFailed: permanentFailures,
        },
        queue: queueStats,
      };
    } catch (error) {
      logger.error('Error getting stats', {
        error: error.message,
      });
      throw error;
    }
  }
}

module.exports = new WhatsAppThrottledService();
