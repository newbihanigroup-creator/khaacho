/**
 * Production Queue Configuration
 * Reliable Bull queue configuration for distributed systems
 * 
 * Features:
 * - Exponential backoff retry strategy
 * - Failed job logging
 * - Retry logging
 * - Dead letter queue for permanently failed jobs
 * - Worker-level error handling
 */

const logger = require('../utils/logger');

/**
 * Production-grade job options
 * All jobs include retry logic with exponential backoff
 */
const PRODUCTION_JOB_OPTIONS = {
  // Retry configuration
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 5000, // Start at 5 seconds
  },
  
  // Job lifecycle
  removeOnComplete: {
    age: 24 * 3600, // Keep completed jobs for 24 hours
    count: 1000, // Keep last 1000 completed jobs
  },
  removeOnFail: false, // Never auto-remove failed jobs (for dead letter queue)
  
  // Timeout protection
  timeout: 60000, // 60 seconds default timeout
  
  // Job tracking
  stackTraceLimit: 10,
};

/**
 * Queue-specific configurations
 * Customize settings per queue type
 */
const QUEUE_CONFIGS = {
  // Order processing queue
  'order-processing': {
    name: 'order-processing',
    concurrency: 5,
    jobOptions: {
      ...PRODUCTION_JOB_OPTIONS,
      timeout: 120000, // 2 minutes for complex order processing
      priority: 1, // High priority
    },
    limiter: {
      max: 100, // Max 100 jobs
      duration: 60000, // Per minute
    },
  },
  
  // WhatsApp messages queue
  'whatsapp-messages': {
    name: 'whatsapp-messages',
    concurrency: 10, // Higher concurrency for messaging
    jobOptions: {
      ...PRODUCTION_JOB_OPTIONS,
      timeout: 30000, // 30 seconds for API calls
      priority: 2, // Medium-high priority
      attempts: 5, // More retries for external API
      backoff: {
        type: 'exponential',
        delay: 5000,
      },
    },
    limiter: {
      max: 50, // Max 50 messages
      duration: 1000, // Per second (rate limiting)
    },
  },
  
  // Image processing queue
  'image-processing': {
    name: 'image-processing',
    concurrency: 2, // Lower concurrency for CPU-intensive tasks
    jobOptions: {
      ...PRODUCTION_JOB_OPTIONS,
      timeout: 300000, // 5 minutes for image processing
      priority: 3, // Medium priority
    },
    limiter: {
      max: 10, // Max 10 jobs
      duration: 60000, // Per minute
    },
  },
  
  // Credit score calculation queue
  'credit-score-calculation': {
    name: 'credit-score-calculation',
    concurrency: 3,
    jobOptions: {
      ...PRODUCTION_JOB_OPTIONS,
      timeout: 90000, // 90 seconds
      priority: 2,
    },
    limiter: {
      max: 50,
      duration: 60000,
    },
  },
  
  // Order routing queue
  'order-routing': {
    name: 'order-routing',
    concurrency: 3,
    jobOptions: {
      ...PRODUCTION_JOB_OPTIONS,
      timeout: 60000,
      priority: 1, // High priority
    },
    limiter: {
      max: 100,
      duration: 60000,
    },
  },
  
  // Payment reminders queue
  'payment-reminders': {
    name: 'payment-reminders',
    concurrency: 5,
    jobOptions: {
      ...PRODUCTION_JOB_OPTIONS,
      timeout: 30000,
      priority: 3,
    },
    limiter: {
      max: 100,
      duration: 60000,
    },
  },
  
  // Report generation queue
  'report-generation': {
    name: 'report-generation',
    concurrency: 1, // Sequential processing
    jobOptions: {
      ...PRODUCTION_JOB_OPTIONS,
      timeout: 600000, // 10 minutes for large reports
      priority: 4, // Lower priority
    },
    limiter: {
      max: 5,
      duration: 60000,
    },
  },
};

/**
 * Dead Letter Queue Configuration
 * Stores permanently failed jobs for manual review
 */
const DEAD_LETTER_QUEUE_CONFIG = {
  name: 'dead-letter-queue',
  concurrency: 1,
  jobOptions: {
    attempts: 1, // No retries in DLQ
    removeOnComplete: false, // Keep all jobs
    removeOnFail: false,
  },
};

/**
 * Setup event handlers for production monitoring
 * 
 * @param {Queue} queue - Bull queue instance
 * @param {string} queueName - Queue name
 * @param {Queue} deadLetterQueue - Dead letter queue instance
 */
function setupProductionEventHandlers(queue, queueName, deadLetterQueue) {
  // Job started
  queue.on('active', (job) => {
    logger.info(`[${queueName}] Job started`, {
      jobId: job.id,
      jobName: job.name,
      attempt: job.attemptsMade + 1,
      maxAttempts: job.opts.attempts,
      data: job.data,
    });
  });
  
  // Job completed successfully
  queue.on('completed', (job, result) => {
    const duration = Date.now() - job.timestamp;
    
    logger.info(`[${queueName}] Job completed`, {
      jobId: job.id,
      jobName: job.name,
      duration: `${duration}ms`,
      attempts: job.attemptsMade,
      result,
    });
  });
  
  // Job failed (will retry)
  queue.on('failed', async (job, error) => {
    const isLastAttempt = job.attemptsMade >= job.opts.attempts;
    
    logger.error(`[${queueName}] Job failed`, {
      jobId: job.id,
      jobName: job.name,
      attempt: job.attemptsMade,
      maxAttempts: job.opts.attempts,
      isLastAttempt,
      error: error.message,
      stack: error.stack,
      data: job.data,
    });
    
    // Move to dead letter queue if all retries exhausted
    if (isLastAttempt && deadLetterQueue) {
      try {
        await deadLetterQueue.add('failed-job', {
          originalQueue: queueName,
          originalJobId: job.id,
          originalJobName: job.name,
          originalData: job.data,
          failureReason: error.message,
          failureStack: error.stack,
          attempts: job.attemptsMade,
          failedAt: new Date().toISOString(),
        });
        
        logger.warn(`[${queueName}] Job moved to dead letter queue`, {
          jobId: job.id,
          jobName: job.name,
        });
      } catch (dlqError) {
        logger.error(`[${queueName}] Failed to move job to dead letter queue`, {
          jobId: job.id,
          error: dlqError.message,
        });
      }
    }
  });
  
  // Job retry
  queue.on('retrying', (job, error) => {
    const nextAttempt = job.attemptsMade + 1;
    const backoffDelay = calculateBackoffDelay(job.opts.backoff, job.attemptsMade);
    
    logger.warn(`[${queueName}] Job retrying`, {
      jobId: job.id,
      jobName: job.name,
      attempt: nextAttempt,
      maxAttempts: job.opts.attempts,
      backoffDelay: `${backoffDelay}ms`,
      error: error.message,
    });
  });
  
  // Job stalled (worker died)
  queue.on('stalled', (job) => {
    logger.error(`[${queueName}] Job stalled`, {
      jobId: job.id,
      jobName: job.name,
      attempt: job.attemptsMade,
      message: 'Worker may have crashed or lost connection',
    });
  });
  
  // Queue error
  queue.on('error', (error) => {
    logger.error(`[${queueName}] Queue error`, {
      error: error.message,
      code: error.code,
      stack: error.stack,
    });
  });
  
  // Redis connection events
  queue.on('ready', () => {
    logger.info(`[${queueName}] Redis connection ready`);
  });
  
  queue.on('close', () => {
    logger.warn(`[${queueName}] Redis connection closed`);
  });
  
  queue.on('reconnecting', () => {
    logger.info(`[${queueName}] Redis reconnecting...`);
  });
}

/**
 * Calculate exponential backoff delay
 * 
 * @param {Object} backoffConfig - Backoff configuration
 * @param {number} attemptsMade - Number of attempts made
 * @returns {number} Delay in milliseconds
 */
function calculateBackoffDelay(backoffConfig, attemptsMade) {
  if (backoffConfig.type === 'exponential') {
    return backoffConfig.delay * Math.pow(2, attemptsMade);
  }
  return backoffConfig.delay;
}

/**
 * Worker-level error handler wrapper
 * Wraps processor functions with error handling
 * 
 * @param {Function} processor - Job processor function
 * @param {string} queueName - Queue name for logging
 * @returns {Function} Wrapped processor
 */
function withErrorHandling(processor, queueName) {
  return async (job) => {
    try {
      const result = await processor(job);
      return result;
    } catch (error) {
      // Log error with full context
      logger.error(`[${queueName}] Processor error`, {
        jobId: job.id,
        jobName: job.name,
        error: error.message,
        stack: error.stack,
        data: job.data,
      });
      
      // Re-throw to trigger Bull's retry mechanism
      throw error;
    }
  };
}

/**
 * Get queue configuration by name
 * 
 * @param {string} queueName - Queue name
 * @returns {Object} Queue configuration
 */
function getQueueConfig(queueName) {
  return QUEUE_CONFIGS[queueName] || {
    name: queueName,
    concurrency: 1,
    jobOptions: PRODUCTION_JOB_OPTIONS,
  };
}

module.exports = {
  PRODUCTION_JOB_OPTIONS,
  QUEUE_CONFIGS,
  DEAD_LETTER_QUEUE_CONFIG,
  setupProductionEventHandlers,
  withErrorHandling,
  getQueueConfig,
};
