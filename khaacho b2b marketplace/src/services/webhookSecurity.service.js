/**
 * Webhook Security Service
 * 
 * Handles webhook signature validation, deduplication, and rate limiting
 * Ensures webhooks are secure and prevent replay attacks
 */

const crypto = require('crypto');
const prisma = require('../config/database');
const logger = require('../shared/logger');

class WebhookSecurityService {
  constructor() {
    // Rate limiting configuration
    this.rateLimits = {
      whatsapp: { maxRequests: 100, windowMinutes: 60 },
      twilio: { maxRequests: 100, windowMinutes: 60 },
      meta: { maxRequests: 100, windowMinutes: 60 },
    };
  }

  /**
   * Validate webhook signature
   * 
   * @param {string} source - Webhook source (whatsapp, twilio, meta)
   * @param {string} signature - Signature from request header
   * @param {string} url - Full webhook URL
   * @param {object} body - Request body
   * @param {string} secret - Webhook secret
   * @returns {Promise<boolean>} True if signature is valid
   */
  async validateSignature(source, signature, url, body, secret) {
    const startTime = Date.now();
    
    try {
      let isValid = false;
      
      switch (source) {
        case 'twilio':
          isValid = this.validateTwilioSignature(signature, url, body, secret);
          break;
          
        case 'meta':
        case 'whatsapp':
          isValid = this.validateMetaSignature(signature, body, secret);
          break;
          
        default:
          logger.warn('Unknown webhook source for signature validation', { source });
          isValid = false;
      }
      
      // Log validation attempt
      await this.logSignatureValidation({
        source,
        url,
        signature,
        isValid,
        duration: Date.now() - startTime,
      });
      
      return isValid;
    } catch (error) {
      logger.error('Signature validation error', {
        source,
        error: error.message,
        stack: error.stack,
      });
      
      // Log failed validation
      await this.logSignatureValidation({
        source,
        url,
        signature,
        isValid: false,
        error: error.message,
        duration: Date.now() - startTime,
      });
      
      return false;
    }
  }

  /**
   * Validate Twilio webhook signature
   * Uses HMAC-SHA1 with auth token
   */
  validateTwilioSignature(signature, url, params, authToken) {
    if (!signature || !authToken) {
      return false;
    }

    // Build data string from URL and params
    let data = url;
    
    // Sort params alphabetically and append
    const sortedKeys = Object.keys(params).sort();
    for (const key of sortedKeys) {
      data += key + params[key];
    }

    // Compute HMAC-SHA1
    const hmac = crypto.createHmac('sha1', authToken);
    hmac.update(Buffer.from(data, 'utf-8'));
    const expectedSignature = hmac.digest('base64');

    return signature === expectedSignature;
  }

  /**
   * Validate Meta/WhatsApp webhook signature
   * Uses HMAC-SHA256 with app secret
   */
  validateMetaSignature(signature, body, appSecret) {
    if (!signature || !appSecret) {
      return false;
    }

    // Remove 'sha256=' prefix if present
    const signatureHash = signature.replace('sha256=', '');

    // Compute HMAC-SHA256
    const hmac = crypto.createHmac('sha256', appSecret);
    hmac.update(JSON.stringify(body));
    const expectedSignature = hmac.digest('hex');

    return signatureHash === expectedSignature;
  }

  /**
   * Check if message is duplicate
   * Prevents replay attacks and duplicate processing
   * 
   * @param {string} messageId - Unique message identifier
   * @param {string} source - Webhook source
   * @returns {Promise<boolean>} True if duplicate
   */
  async isDuplicate(messageId, source) {
    try {
      const result = await prisma.$queryRaw`
        SELECT is_duplicate_webhook_message(${messageId}, ${source}) as is_duplicate
      `;
      
      return result[0]?.is_duplicate || false;
    } catch (error) {
      logger.error('Error checking duplicate message', {
        messageId,
        source,
        error: error.message,
      });
      
      // Fail safe: assume not duplicate to avoid blocking legitimate messages
      return false;
    }
  }

  /**
   * Record webhook message
   * Stores message for deduplication and audit trail
   * 
   * @param {object} data - Message data
   * @returns {Promise<string>} Message record ID
   */
  async recordMessage(data) {
    const {
      messageId,
      source,
      phoneNumber,
      requestBody,
      requestHeaders,
    } = data;

    try {
      const result = await prisma.$queryRaw`
        SELECT record_webhook_message(
          ${messageId},
          ${source},
          ${phoneNumber},
          ${JSON.stringify(requestBody)}::jsonb,
          ${JSON.stringify(requestHeaders)}::jsonb
        ) as id
      `;
      
      return result[0]?.id;
    } catch (error) {
      logger.error('Error recording webhook message', {
        messageId,
        source,
        error: error.message,
      });
      
      throw error;
    }
  }

  /**
   * Update message status
   * 
   * @param {string} messageId - Message identifier
   * @param {string} status - New status
   * @param {object} metadata - Additional metadata
   */
  async updateMessageStatus(messageId, status, metadata = {}) {
    try {
      await prisma.webhookMessages.updateMany({
        where: { messageId },
        data: {
          status,
          processedAt: status === 'completed' ? new Date() : undefined,
          responseTimeMs: metadata.responseTimeMs,
          queueJobId: metadata.queueJobId,
          errorMessage: metadata.errorMessage,
          errorCount: metadata.errorCount,
          updatedAt: new Date(),
        },
      });
    } catch (error) {
      logger.error('Error updating message status', {
        messageId,
        status,
        error: error.message,
      });
    }
  }

  /**
   * Check rate limit
   * Prevents abuse by limiting requests per phone number
   * 
   * @param {string} source - Webhook source
   * @param {string} phoneNumber - Phone number
   * @returns {Promise<boolean>} True if within rate limit
   */
  async checkRateLimit(source, phoneNumber) {
    try {
      const config = this.rateLimits[source] || this.rateLimits.whatsapp;
      
      const result = await prisma.$queryRaw`
        SELECT check_webhook_rate_limit(
          ${source},
          ${phoneNumber},
          ${config.maxRequests},
          ${config.windowMinutes}
        ) as within_limit
      `;
      
      const withinLimit = result[0]?.within_limit || false;
      
      if (!withinLimit) {
        logger.warn('Rate limit exceeded', {
          source,
          phoneNumber,
          maxRequests: config.maxRequests,
          windowMinutes: config.windowMinutes,
        });
      }
      
      return withinLimit;
    } catch (error) {
      logger.error('Error checking rate limit', {
        source,
        phoneNumber,
        error: error.message,
      });
      
      // Fail safe: allow request if rate limit check fails
      return true;
    }
  }

  /**
   * Record rate limit attempt
   * Tracks request rates for monitoring
   */
  async recordRateLimitAttempt(source, phoneNumber, ipAddress) {
    try {
      const windowStart = new Date();
      const windowEnd = new Date(windowStart.getTime() + 60 * 60 * 1000); // 1 hour

      await prisma.webhookRateLimits.upsert({
        where: {
          webhookSource_phoneNumber_windowStart: {
            webhookSource: source,
            phoneNumber,
            windowStart,
          },
        },
        create: {
          webhookSource: source,
          phoneNumber,
          ipAddress,
          requestCount: 1,
          windowStart,
          windowEnd,
        },
        update: {
          requestCount: { increment: 1 },
          updatedAt: new Date(),
        },
      });
    } catch (error) {
      logger.error('Error recording rate limit attempt', {
        source,
        phoneNumber,
        error: error.message,
      });
    }
  }

  /**
   * Log signature validation attempt
   * Stores validation results for security monitoring
   */
  async logSignatureValidation(data) {
    const {
      source,
      url,
      signature,
      isValid,
      error,
      duration,
      ipAddress,
      userAgent,
    } = data;

    try {
      await prisma.webhookSignatureLog.create({
        data: {
          webhookSource: source,
          requestPath: url,
          requestMethod: 'POST',
          signatureHeader: signature?.substring(0, 500), // Truncate long signatures
          signatureValid: isValid,
          validationError: error,
          ipAddress,
          userAgent,
          requestTimestamp: new Date(),
        },
      });
    } catch (error) {
      logger.error('Error logging signature validation', {
        source,
        error: error.message,
      });
    }
  }

  /**
   * Record performance metrics
   * Tracks webhook response times for monitoring
   */
  async recordPerformanceMetrics(data) {
    const {
      source,
      endpoint,
      responseTimeMs,
      queueTimeMs,
      processingTimeMs,
      httpStatus,
      success,
    } = data;

    try {
      const timestamp = new Date();
      const hourBucket = new Date(timestamp);
      hourBucket.setMinutes(0, 0, 0);

      await prisma.webhookPerformanceMetrics.create({
        data: {
          webhookSource: source,
          endpointPath: endpoint,
          responseTimeMs,
          queueTimeMs,
          processingTimeMs,
          httpStatus,
          success,
          metricTimestamp: timestamp,
          hourBucket,
        },
      });
    } catch (error) {
      logger.error('Error recording performance metrics', {
        source,
        error: error.message,
      });
    }
  }

  /**
   * Get webhook statistics
   * Returns processing stats for monitoring
   */
  async getWebhookStats(source, hours = 24) {
    try {
      const stats = await prisma.$queryRaw`
        SELECT * FROM webhook_processing_stats
        WHERE webhook_source = ${source}
      `;
      
      return stats;
    } catch (error) {
      logger.error('Error getting webhook stats', {
        source,
        error: error.message,
      });
      
      return [];
    }
  }

  /**
   * Get security statistics
   * Returns signature validation stats for monitoring
   */
  async getSecurityStats(source, hours = 24) {
    try {
      const stats = await prisma.$queryRaw`
        SELECT * FROM webhook_security_stats
        WHERE webhook_source = ${source}
        ORDER BY hour DESC
        LIMIT ${hours}
      `;
      
      return stats;
    } catch (error) {
      logger.error('Error getting security stats', {
        source,
        error: error.message,
      });
      
      return [];
    }
  }

  /**
   * Get performance statistics
   * Returns response time stats for monitoring
   */
  async getPerformanceStats(source, hours = 24) {
    try {
      const stats = await prisma.$queryRaw`
        SELECT * FROM webhook_performance_stats
        WHERE webhook_source = ${source}
        ORDER BY hour DESC
        LIMIT ${hours}
      `;
      
      return stats;
    } catch (error) {
      logger.error('Error getting performance stats', {
        source,
        error: error.message,
      });
      
      return [];
    }
  }

  /**
   * Cleanup old webhook data
   * Removes old records to prevent table bloat
   */
  async cleanupOldData(daysToKeep = 30) {
    try {
      const result = await prisma.$queryRaw`
        SELECT * FROM cleanup_old_webhook_data(${daysToKeep})
      `;
      
      logger.info('Webhook data cleanup completed', {
        daysToKeep,
        result: result[0],
      });
      
      return result[0];
    } catch (error) {
      logger.error('Error cleaning up webhook data', {
        error: error.message,
      });
      
      throw error;
    }
  }
}

module.exports = new WebhookSecurityService();
