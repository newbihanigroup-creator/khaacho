const Queue = require('bull');
const logger = require('../utils/logger');
const config = require('../config');
const {
  PRODUCTION_JOB_OPTIONS,
  DEAD_LETTER_QUEUE_CONFIG,
  setupProductionEventHandlers,
  getQueueConfig,
} = require('./productionQueueConfig');

// Redis connection configuration with retry strategy for Render
const getRedisConfig = () => {
  if (config.redis.url) {
    // Parse REDIS_URL for Render
    return {
      redis: config.redis.url,
      settings: {
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
        retryStrategy: (times) => {
          const delay = Math.min(times * 50, 2000);
          logger.warn(`Redis connection retry attempt ${times}, waiting ${delay}ms`);
          return delay;
        },
        reconnectOnError: (err) => {
          logger.error('Redis reconnect on error', { error: err.message });
          return true; // Always reconnect
        },
      },
    };
  }

  // Individual settings fallback
  return {
    redis: {
      host: config.redis.host,
      port: config.redis.port,
      password: config.redis.password,
      db: config.redis.db,
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        logger.warn(`Redis connection retry attempt ${times}, waiting ${delay}ms`);
        return delay;
      },
      reconnectOnError: (err) => {
        logger.error('Redis reconnect on error', { error: err.message });
        return true;
      },
    },
  };
};

// Default job options (production-grade)
const DEFAULT_JOB_OPTIONS = PRODUCTION_JOB_OPTIONS;

// Queue definitions
const QUEUES = {
  WHATSAPP: 'whatsapp-messages',
  CREDIT_SCORE: 'credit-score-calculation',
  ORDER_ROUTING: 'order-routing',
  PAYMENT_REMINDERS: 'payment-reminders',
  REPORT_GENERATION: 'report-generation',
  EMAIL: 'email-notifications',
  ORDER_PROCESSING: 'order-processing',
  IMAGE_PROCESSING: 'image-processing',
};

class QueueManager {
  constructor() {
    this.queues = {};
    this.processors = {};
    this.deadLetterQueue = null;
    this.isInitialized = false;
  }

  /**
   * Initialize all queues with error handling
   */
  initialize() {
    if (this.isInitialized) {
      logger.warn('Queue manager already initialized');
      return;
    }

    logger.info('Initializing queue manager with production configuration...');

    try {
      const redisConfig = getRedisConfig();

      // Create dead letter queue first
      this.deadLetterQueue = new Queue(DEAD_LETTER_QUEUE_CONFIG.name, {
        ...redisConfig,
        defaultJobOptions: DEAD_LETTER_QUEUE_CONFIG.jobOptions,
      });
      
      logger.info('Dead letter queue initialized');

      // Create all queues with production config
      Object.entries(QUEUES).forEach(([key, queueName]) => {
        try {
          const queueConfig = getQueueConfig(queueName);
          
          this.queues[key] = new Queue(queueName, {
            ...redisConfig,
            defaultJobOptions: queueConfig.jobOptions,
            limiter: queueConfig.limiter,
          });

          // Setup production event listeners
          setupProductionEventHandlers(
            this.queues[key],
            queueName,
            this.deadLetterQueue
          );
          
          logger.info(`Queue ${queueName} initialized with production config`, {
            concurrency: queueConfig.concurrency,
            attempts: queueConfig.jobOptions.attempts,
            timeout: queueConfig.jobOptions.timeout,
          });
        } catch (error) {
          logger.error(`Failed to initialize queue ${queueName}`, {
            error: error.message,
            stack: error.stack,
          });
          // Don't throw - allow other queues to initialize
        }
      });

      this.isInitialized = true;
      logger.info(`Initialized ${Object.keys(this.queues).length} queues with dead letter queue`);
    } catch (error) {
      logger.error('Failed to initialize queue manager', {
        error: error.message,
        stack: error.stack,
      });
      throw error;
    }
  }

  /**
   * Setup event listeners for a queue
   */
  setupQueueEvents(queue, queueName) {
    // Error handling
    queue.on('error', (error) => {
      logger.error(`Queue ${queueName} error`, {
        error: error.message,
        code: error.code,
        stack: error.stack,
      });
    });

    // Redis connection events
    queue.on('ready', () => {
      logger.info(`Queue ${queueName} Redis connection ready`);
    });

    queue.on('close', () => {
      logger.warn(`Queue ${queueName} Redis connection closed`);
    });

    queue.on('reconnecting', () => {
      logger.info(`Queue ${queueName} Redis reconnecting...`);
    });

    // Job events
    queue.on('waiting', (jobId) => {
      logger.debug(`Job ${jobId} is waiting in queue ${queueName}`);
    });

    queue.on('active', (job) => {
      logger.info(`Job ${job.id} started in queue ${queueName}`, {
        jobData: job.data,
      });
    });

    queue.on('completed', (job, result) => {
      logger.info(`Job ${job.id} completed in queue ${queueName}`, {
        duration: Date.now() - job.timestamp,
        result: result,
      });
    });

    queue.on('failed', (job, error) => {
      logger.error(`Job ${job.id} failed in queue ${queueName}`, {
        error: error.message,
        attempts: job.attemptsMade,
        maxAttempts: job.opts.attempts,
        jobData: job.data,
      });
    });

    queue.on('stalled', (job) => {
      logger.warn(`Job ${job.id} stalled in queue ${queueName}`);
    });
  }

  /**
   * Register a processor for a queue with error handling
   */
  registerProcessor(queueKey, processor, concurrency = null) {
    if (!this.queues[queueKey]) {
      throw new Error(`Queue ${queueKey} not found`);
    }

    const queueName = this.queues[queueKey].name;
    const queueConfig = getQueueConfig(queueName);
    const finalConcurrency = concurrency || queueConfig.concurrency;

    // Wrap processor with error handling
    const { withErrorHandling } = require('./productionQueueConfig');
    const wrappedProcessor = withErrorHandling(processor, queueName);

    this.processors[queueKey] = wrappedProcessor;
    this.queues[queueKey].process(finalConcurrency, wrappedProcessor);

    logger.info(`Registered processor for queue ${queueKey}`, {
      concurrency: finalConcurrency,
      attempts: queueConfig.jobOptions.attempts,
      timeout: queueConfig.jobOptions.timeout,
    });
  }

  /**
   * Add a job to a queue
   */
  async addJob(queueKey, jobName, data, options = {}) {
    if (!this.queues[queueKey]) {
      throw new Error(`Queue ${queueKey} not found`);
    }

    const jobOptions = {
      ...DEFAULT_JOB_OPTIONS,
      ...options,
      jobId: options.jobId || `${jobName}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    };

    // Check for duplicate if deduplication is enabled
    if (options.deduplicate && options.deduplicationKey) {
      const existingJob = await this.queues[queueKey].getJob(options.deduplicationKey);
      if (existingJob) {
        const state = await existingJob.getState();
        if (state === 'waiting' || state === 'active' || state === 'delayed') {
          logger.info(`Duplicate job detected, skipping: ${options.deduplicationKey}`);
          return existingJob;
        }
      }
      jobOptions.jobId = options.deduplicationKey;
    }

    const job = await this.queues[queueKey].add(jobName, data, jobOptions);

    logger.info(`Added job ${job.id} to queue ${queueKey}`, {
      jobName,
      data,
    });

    return job;
  }

  /**
   * Get queue by key
   */
  getQueue(queueKey) {
    return this.queues[queueKey];
  }

  /**
   * Get job counts for a queue
   */
  async getQueueCounts(queueKey) {
    if (!this.queues[queueKey]) {
      throw new Error(`Queue ${queueKey} not found`);
    }

    return await this.queues[queueKey].getJobCounts();
  }

  /**
   * Get all queue statistics
   */
  async getAllQueueStats() {
    const stats = {};

    for (const [key, queue] of Object.entries(this.queues)) {
      stats[key] = {
        name: queue.name,
        counts: await queue.getJobCounts(),
        isPaused: await queue.isPaused(),
      };
    }

    return stats;
  }

  /**
   * Pause a queue
   */
  async pauseQueue(queueKey) {
    if (!this.queues[queueKey]) {
      throw new Error(`Queue ${queueKey} not found`);
    }

    await this.queues[queueKey].pause();
    logger.info(`Queue ${queueKey} paused`);
  }

  /**
   * Resume a queue
   */
  async resumeQueue(queueKey) {
    if (!this.queues[queueKey]) {
      throw new Error(`Queue ${queueKey} not found`);
    }

    await this.queues[queueKey].resume();
    logger.info(`Queue ${queueKey} resumed`);
  }

  /**
   * Clean old jobs from a queue
   */
  async cleanQueue(queueKey, grace = 24 * 3600 * 1000, status = 'completed') {
    if (!this.queues[queueKey]) {
      throw new Error(`Queue ${queueKey} not found`);
    }

    const jobs = await this.queues[queueKey].clean(grace, status);
    logger.info(`Cleaned ${jobs.length} ${status} jobs from queue ${queueKey}`);
    return jobs;
  }

  /**
   * Get failed jobs
   */
  async getFailedJobs(queueKey, start = 0, end = 10) {
    if (!this.queues[queueKey]) {
      throw new Error(`Queue ${queueKey} not found`);
    }

    return await this.queues[queueKey].getFailed(start, end);
  }

  /**
   * Retry a failed job
   */
  async retryJob(queueKey, jobId) {
    if (!this.queues[queueKey]) {
      throw new Error(`Queue ${queueKey} not found`);
    }

    const job = await this.queues[queueKey].getJob(jobId);
    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }

    await job.retry();
    logger.info(`Retrying job ${jobId} in queue ${queueKey}`);
    return job;
  }

  /**
   * Remove a job
   */
  async removeJob(queueKey, jobId) {
    if (!this.queues[queueKey]) {
      throw new Error(`Queue ${queueKey} not found`);
    }

    const job = await this.queues[queueKey].getJob(jobId);
    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }

    await job.remove();
    logger.info(`Removed job ${jobId} from queue ${queueKey}`);
  }

  /**
   * Get failed jobs from dead letter queue
   */
  async getDeadLetterJobs(start = 0, end = 10) {
    if (!this.deadLetterQueue) {
      throw new Error('Dead letter queue not initialized');
    }

    return await this.deadLetterQueue.getJobs(['completed', 'waiting', 'active'], start, end);
  }

  /**
   * Retry a job from dead letter queue
   */
  async retryDeadLetterJob(jobId) {
    if (!this.deadLetterQueue) {
      throw new Error('Dead letter queue not initialized');
    }

    const job = await this.deadLetterQueue.getJob(jobId);
    if (!job) {
      throw new Error(`Job ${jobId} not found in dead letter queue`);
    }

    const { originalQueue, originalJobName, originalData } = job.data;
    
    // Find the original queue
    const queueKey = Object.keys(QUEUES).find(key => QUEUES[key] === originalQueue);
    if (!queueKey) {
      throw new Error(`Original queue ${originalQueue} not found`);
    }

    // Re-add job to original queue
    const newJob = await this.addJob(queueKey, originalJobName, originalData);
    
    // Remove from dead letter queue
    await job.remove();
    
    logger.info(`Retried job from dead letter queue`, {
      originalJobId: jobId,
      newJobId: newJob.id,
      queue: originalQueue,
    });

    return newJob;
  }

  /**
   * Close all queues
   */
  async closeAll() {
    logger.info('Closing all queues...');

    const closePromises = [
      ...Object.values(this.queues).map(queue => queue.close()),
      this.deadLetterQueue ? this.deadLetterQueue.close() : Promise.resolve(),
    ];
    
    await Promise.all(closePromises);

    logger.info('All queues closed (including dead letter queue)');
  }
}

// Export singleton instance
const queueManager = new QueueManager();

module.exports = {
  queueManager,
  QUEUES,
};
