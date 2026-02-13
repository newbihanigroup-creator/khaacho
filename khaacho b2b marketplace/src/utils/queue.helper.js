const { getQueueManager } = require('../queues');
const logger = require('./logger');

/**
 * Add a job to queue (works with both Redis queues and sync fallback)
 * @param {string} queueKey - Queue key from QUEUES enum
 * @param {string} jobName - Job name/type
 * @param {object} data - Job data
 * @param {object} options - Job options
 */
async function addJob(queueKey, jobName, data, options = {}) {
  try {
    const queueManager = getQueueManager();
    
    if (!queueManager) {
      logger.warn(`Queue manager not available, skipping job ${jobName}`);
      return null;
    }

    return await queueManager.addJob(queueKey, jobName, data, options);
  } catch (error) {
    logger.error(`Failed to add job ${jobName} to queue ${queueKey}`, {
      error: error.message,
      data,
    });
    // Don't throw - log and continue
    return null;
  }
}

/**
 * Get queue statistics
 */
async function getQueueStats() {
  try {
    const queueManager = getQueueManager();
    
    if (!queueManager) {
      return { mode: 'unavailable' };
    }

    const stats = await queueManager.getAllQueueStats();
    return {
      mode: queueManager.constructor.name === 'SyncFallback' ? 'sync' : 'redis',
      stats,
    };
  } catch (error) {
    logger.error('Failed to get queue stats', { error: error.message });
    return { mode: 'error', error: error.message };
  }
}

module.exports = {
  addJob,
  getQueueStats,
};
