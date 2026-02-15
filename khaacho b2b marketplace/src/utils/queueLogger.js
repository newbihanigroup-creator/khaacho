const logger = require('../shared/logger');

/**
 * Queue Logger Utility
 * Standardized logging for queue jobs with context
 */

class QueueLogger {
  /**
   * Wrap queue processor with logging context
   */
  static wrapProcessor(queueName, processor) {
    return async (job) => {
      const context = {
        queueName,
        jobId: job.id,
        jobName: job.name,
        attemptsMade: job.attemptsMade,
        maxAttempts: job.opts.attempts,
      };
      
      // Add job-specific context
      if (job.data.orderId) context.orderId = job.data.orderId;
      if (job.data.retailerId) context.retailerId = job.data.retailerId;
      if (job.data.vendorId) context.vendorId = job.data.vendorId;
      if (job.data.uploadedOrderId) context.uploadedOrderId = job.data.uploadedOrderId;
      if (job.data.messageId) context.messageId = job.data.messageId;
      
      return logger.runWithContext(context, async () => {
        const startTime = Date.now();
        
        logger.logQueueJob('Queue job started', {
          queueName,
          jobId: job.id,
          jobName: job.name,
          data: job.data,
        });
        
        try {
          const result = await processor(job);
          
          const duration = Date.now() - startTime;
          
          logger.logQueueJob('Queue job completed', {
            queueName,
            jobId: job.id,
            jobName: job.name,
            duration,
            success: true,
          });
          
          return result;
        } catch (error) {
          const duration = Date.now() - startTime;
          
          logger.logQueueJobFailure('Queue job failed', {
            queueName,
            jobId: job.id,
            jobName: job.name,
            duration,
            error: error.message,
            stack: error.stack,
            attemptsMade: job.attemptsMade,
            willRetry: job.attemptsMade < job.opts.attempts,
          });
          
          throw error;
        }
      });
    };
  }

  /**
   * Log order processing event
   */
  static logOrderProcessing(message, meta = {}) {
    logger.logOrder(message, {
      ...meta,
      queueName: logger.getContext().queueName,
    });
  }

  /**
   * Log order processing failure
   */
  static logOrderProcessingFailure(message, error, meta = {}) {
    logger.logOrderFailure(message, {
      ...meta,
      error: error.message,
      stack: error.stack,
      queueName: logger.getContext().queueName,
    });
  }

  /**
   * Log WhatsApp processing event
   */
  static logWhatsAppProcessing(message, meta = {}) {
    logger.logWhatsApp(message, {
      ...meta,
      queueName: logger.getContext().queueName,
    });
  }

  /**
   * Log WhatsApp processing failure
   */
  static logWhatsAppProcessingFailure(message, error, meta = {}) {
    logger.logWhatsAppFailure(message, {
      ...meta,
      error: error.message,
      stack: error.stack,
      queueName: logger.getContext().queueName,
    });
  }

  /**
   * Log OCR processing event
   */
  static logOCRProcessing(message, meta = {}) {
    logger.logOCR(message, {
      ...meta,
      queueName: logger.getContext().queueName,
    });
  }

  /**
   * Log OCR processing failure
   */
  static logOCRProcessingFailure(message, error, meta = {}) {
    logger.logOCRFailure(message, {
      ...meta,
      error: error.message,
      stack: error.stack,
      queueName: logger.getContext().queueName,
    });
  }
}

module.exports = QueueLogger;
