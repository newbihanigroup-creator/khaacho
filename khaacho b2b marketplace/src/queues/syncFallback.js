const logger = require('../utils/logger');

/**
 * Synchronous fallback for queue operations when Redis is unavailable
 * Executes jobs immediately instead of queueing them
 */
class SyncFallback {
  constructor() {
    this.processors = {};
    logger.info('Using synchronous fallback for queues (Redis unavailable)');
  }

  /**
   * Register a processor (stores it for direct execution)
   */
  registerProcessor(queueKey, processor) {
    this.processors[queueKey] = processor;
    logger.info(`Registered sync processor for ${queueKey}`);
  }

  /**
   * Add a job (executes immediately instead of queueing)
   */
  async addJob(queueKey, jobName, data, options = {}) {
    const processor = this.processors[queueKey];
    
    if (!processor) {
      logger.warn(`No processor registered for ${queueKey}, skipping job ${jobName}`);
      return { id: `sync-${Date.now()}`, data };
    }

    try {
      logger.info(`Executing job ${jobName} synchronously in ${queueKey}`, { data });
      
      // Create a mock job object that processors expect
      const mockJob = {
        id: `sync-${Date.now()}`,
        name: jobName,
        data: data,
        opts: options,
        timestamp: Date.now(),
      };

      // Execute processor directly
      const result = await processor(mockJob);
      
      logger.info(`Job ${jobName} completed synchronously`, { result });
      return mockJob;
    } catch (error) {
      logger.error(`Job ${jobName} failed in sync execution`, {
        error: error.message,
        stack: error.stack,
      });
      // Don't throw - log and continue
      return { id: `sync-${Date.now()}`, data, error: error.message };
    }
  }

  /**
   * Get queue (returns null for sync fallback)
   */
  getQueue() {
    return null;
  }

  /**
   * Get queue counts (returns zeros for sync fallback)
   */
  async getQueueCounts() {
    return {
      waiting: 0,
      active: 0,
      completed: 0,
      failed: 0,
      delayed: 0,
    };
  }

  /**
   * Get all queue stats (returns empty for sync fallback)
   */
  async getAllQueueStats() {
    return {};
  }

  /**
   * Pause queue (no-op for sync fallback)
   */
  async pauseQueue() {
    logger.warn('Pause not supported in sync fallback mode');
  }

  /**
   * Resume queue (no-op for sync fallback)
   */
  async resumeQueue() {
    logger.warn('Resume not supported in sync fallback mode');
  }

  /**
   * Clean queue (no-op for sync fallback)
   */
  async cleanQueue() {
    return [];
  }

  /**
   * Get failed jobs (returns empty for sync fallback)
   */
  async getFailedJobs() {
    return [];
  }

  /**
   * Retry job (no-op for sync fallback)
   */
  async retryJob() {
    logger.warn('Retry not supported in sync fallback mode');
  }

  /**
   * Remove job (no-op for sync fallback)
   */
  async removeJob() {
    logger.warn('Remove not supported in sync fallback mode');
  }

  /**
   * Close (no-op for sync fallback)
   */
  async closeAll() {
    logger.info('Sync fallback closed (no-op)');
  }
}

module.exports = SyncFallback;
