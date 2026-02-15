const logger = require('../shared/logger');
const prisma = require('../config/database');
const crypto = require('crypto');

/**
 * WhatsApp Message Throttling Service
 * 
 * Features:
 * - Rate limiting: 1 message per user per 2 seconds
 * - Message queuing for throttled messages
 * - Duplicate prevention via idempotency keys
 * - Delivery failure tracking and retry
 * - Bull queue integration
 */
class WhatsAppThrottlingService {
  constructor() {
    // In-memory rate limit tracking (per user)
    // Format: { phoneNumber: lastSentTimestamp }
    this.rateLimitMap = new Map();
    
    // Rate limit: 1 message per 2 seconds per user
    this.RATE_LIMIT_MS = 2000;
    
    // Cleanup old entries every 5 minutes
    setInterval(() => this.cleanupRateLimitMap(), 5 * 60 * 1000);
  }

  /**
   * Generate idempotency key for message
   * Prevents duplicate messages
   * 
   * @param {string} to - Recipient phone number
   * @param {string} message - Message content
   * @param {Object} metadata - Additional metadata
   * @returns {string} Idempotency key
   */
  generateIdempotencyKey(to, message, metadata = {}) {
    const data = {
      to,
      message: message.substring(0, 100), // First 100 chars
      type: metadata.type || 'text',
      timestamp: Math.floor(Date.now() / 60000), // Round to minute
    };
    
    const hash = crypto
      .createHash('sha256')
      .update(JSON.stringify(data))
      .digest('hex');
    
    return `whatsapp:${to}:${hash.substring(0, 16)}`;
  }

  /**
   * Check if message can be sent immediately
   * Based on rate limit (1 message per 2 seconds per user)
   * 
   * @param {string} phoneNumber - User phone number
   * @returns {boolean} True if can send immediately
   */
  canSendImmediately(phoneNumber) {
    const lastSent = this.rateLimitMap.get(phoneNumber);
    
    if (!lastSent) {
      return true;
    }
    
    const timeSinceLastSent = Date.now() - lastSent;
    return timeSinceLastSent >= this.RATE_LIMIT_MS;
  }

  /**
   * Get delay until next message can be sent
   * 
   * @param {string} phoneNumber - User phone number
   * @returns {number} Delay in milliseconds (0 if can send now)
   */
  getDelayUntilNextMessage(phoneNumber) {
    const lastSent = this.rateLimitMap.get(phoneNumber);
    
    if (!lastSent) {
      return 0;
    }
    
    const timeSinceLastSent = Date.now() - lastSent;
    const remainingDelay = this.RATE_LIMIT_MS - timeSinceLastSent;
    
    return Math.max(0, remainingDelay);
  }

  /**
   * Update rate limit tracking
   * 
   * @param {string} phoneNumber - User phone number
   */
  updateRateLimit(phoneNumber) {
    this.rateLimitMap.set(phoneNumber, Date.now());
  }

  /**
   * Check if message is duplicate
   * Uses idempotency key to prevent duplicates
   * 
   * @param {string} idempotencyKey - Idempotency key
   * @returns {Promise<boolean>} True if duplicate
   */
  async isDuplicate(idempotencyKey) {
    try {
      // Check if message with this idempotency key exists in last 24 hours
      const existingMessage = await prisma.whatsAppMessage.findFirst({
        where: {
          metadata: {
            path: ['idempotencyKey'],
            equals: idempotencyKey,
          },
          createdAt: {
            gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
          },
        },
      });
      
      return !!existingMessage;
    } catch (error) {
      logger.error('Error checking duplicate message', {
        idempotencyKey,
        error: error.message,
      });
      // On error, assume not duplicate to avoid blocking messages
      return false;
    }
  }

  /**
   * Log delivery failure for retry
   * 
   * @param {Object} messageData - Message data
   * @param {Error} error - Error that occurred
   * @returns {Promise<Object>} Failure log
   */
  async logDeliveryFailure(messageData, error) {
    try {
      const failureLog = await prisma.whatsAppDeliveryFailure.create({
        data: {
          phoneNumber: messageData.to,
          message: messageData.message,
          idempotencyKey: messageData.idempotencyKey,
          errorMessage: error.message,
          errorCode: error.code || error.response?.status?.toString(),
          attemptCount: messageData.attemptCount || 1,
          metadata: {
            originalData: messageData,
            errorDetails: {
              message: error.message,
              code: error.code,
              response: error.response?.data,
            },
          },
          nextRetryAt: this.calculateNextRetry(messageData.attemptCount || 1),
        },
      });
      
      logger.warn('WhatsApp delivery failure logged', {
        id: failureLog.id,
        phoneNumber: messageData.to,
        attemptCount: messageData.attemptCount || 1,
        nextRetryAt: failureLog.nextRetryAt,
      });
      
      return failureLog;
    } catch (logError) {
      logger.error('Error logging delivery failure', {
        messageData,
        error: logError.message,
      });
      throw logError;
    }
  }

  /**
   * Calculate next retry time with exponential backoff
   * 
   * @param {number} attemptCount - Current attempt count
   * @returns {Date} Next retry time
   */
  calculateNextRetry(attemptCount) {
    // Exponential backoff: 1min, 5min, 15min, 30min, 1hr
    const delays = [
      1 * 60 * 1000,      // 1 minute
      5 * 60 * 1000,      // 5 minutes
      15 * 60 * 1000,     // 15 minutes
      30 * 60 * 1000,     // 30 minutes
      60 * 60 * 1000,     // 1 hour
    ];
    
    const delayIndex = Math.min(attemptCount - 1, delays.length - 1);
    const delay = delays[delayIndex];
    
    return new Date(Date.now() + delay);
  }

  /**
   * Get failed messages ready for retry
   * 
   * @param {number} limit - Maximum messages to retrieve
   * @returns {Promise<Array>} Failed messages ready for retry
   */
  async getMessagesForRetry(limit = 10) {
    try {
      const failedMessages = await prisma.whatsAppDeliveryFailure.findMany({
        where: {
          status: 'PENDING',
          nextRetryAt: {
            lte: new Date(), // Ready for retry
          },
          attemptCount: {
            lt: 5, // Max 5 attempts
          },
        },
        take: limit,
        orderBy: {
          nextRetryAt: 'asc',
        },
      });
      
      return failedMessages;
    } catch (error) {
      logger.error('Error getting messages for retry', {
        error: error.message,
      });
      return [];
    }
  }

  /**
   * Mark delivery failure as retried
   * 
   * @param {string} failureId - Failure log ID
   * @param {boolean} success - Whether retry was successful
   * @returns {Promise<Object>} Updated failure log
   */
  async markAsRetried(failureId, success) {
    try {
      const updated = await prisma.whatsAppDeliveryFailure.update({
        where: { id: failureId },
        data: {
          status: success ? 'RESOLVED' : 'PENDING',
          attemptCount: { increment: 1 },
          lastAttemptAt: new Date(),
          resolvedAt: success ? new Date() : null,
        },
      });
      
      logger.info('Delivery failure marked as retried', {
        id: failureId,
        success,
        attemptCount: updated.attemptCount,
      });
      
      return updated;
    } catch (error) {
      logger.error('Error marking failure as retried', {
        failureId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Mark delivery failure as permanently failed
   * 
   * @param {string} failureId - Failure log ID
   * @returns {Promise<Object>} Updated failure log
   */
  async markAsPermanentlyFailed(failureId) {
    try {
      const updated = await prisma.whatsAppDeliveryFailure.update({
        where: { id: failureId },
        data: {
          status: 'FAILED',
          lastAttemptAt: new Date(),
        },
      });
      
      logger.error('Delivery failure marked as permanently failed', {
        id: failureId,
        attemptCount: updated.attemptCount,
      });
      
      return updated;
    } catch (error) {
      logger.error('Error marking failure as permanently failed', {
        failureId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Cleanup old rate limit entries
   * Removes entries older than 5 minutes
   */
  cleanupRateLimitMap() {
    const now = Date.now();
    const cutoff = now - (5 * 60 * 1000); // 5 minutes ago
    
    let cleaned = 0;
    for (const [phoneNumber, timestamp] of this.rateLimitMap.entries()) {
      if (timestamp < cutoff) {
        this.rateLimitMap.delete(phoneNumber);
        cleaned++;
      }
    }
    
    if (cleaned > 0) {
      logger.debug('Cleaned up rate limit map', {
        entriesRemoved: cleaned,
        remainingEntries: this.rateLimitMap.size,
      });
    }
  }

  /**
   * Get throttling statistics
   * 
   * @returns {Object} Throttling stats
   */
  getStats() {
    return {
      activeRateLimits: this.rateLimitMap.size,
      rateLimitMs: this.RATE_LIMIT_MS,
      rateLimitDescription: '1 message per 2 seconds per user',
    };
  }

  /**
   * Clear rate limit for a user (admin function)
   * 
   * @param {string} phoneNumber - User phone number
   */
  clearRateLimit(phoneNumber) {
    this.rateLimitMap.delete(phoneNumber);
    logger.info('Rate limit cleared for user', { phoneNumber });
  }

  /**
   * Clear all rate limits (admin function)
   */
  clearAllRateLimits() {
    const count = this.rateLimitMap.size;
    this.rateLimitMap.clear();
    logger.info('All rate limits cleared', { count });
  }
}

module.exports = new WhatsAppThrottlingService();
