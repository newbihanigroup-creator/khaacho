const prisma = require('../config/database');
const logger = require('../shared/logger');

/**
 * Queue Retry Service
 * 
 * Handles queue job retry logic with exponential backoff
 * 
 * Features:
 * - 3 retry attempts with exponential backoff (5s, 15s, 45s)
 * - Automatic move to dead-letter queue after max retries
 * - Comprehensive error tracking
 * - Recovery worker integration
 */

class QueueRetryService {
  constructor() {
    // Retry configuration
    this.config = {
      maxAttempts: 3,
      retryDelays: [5000, 15000, 45000], // 5s, 15s, 45s (exponential backoff)
      deadLetterQueueEnabled: true,
    };
  }

  /**
   * Track job start
   */
  async trackJobStart(jobId, queueName, jobName, jobData, jobOptions = {}) {
    try {
      await prisma.$executeRaw`
        INSERT INTO queue_jobs (
          job_id,
          queue_name,
          job_name,
          job_data,
          job_options,
          status,
          max_attempts,
          retry_delays,
          started_at
        )
        VALUES (
          ${jobId},
          ${queueName},
          ${jobName},
          ${JSON.stringify(jobData)}::jsonb,
          ${JSON.stringify(jobOptions)}::jsonb,
          'active',
          ${this.config.maxAttempts},
          ARRAY[${this.config.retryDelays.join(',')}]::INTEGER[],
          NOW()
        )
        ON CONFLICT (job_id) DO UPDATE
        SET status = 'active',
            started_at = NOW(),
            updated_at = NOW()
      `;

      logger.info('Job tracking started', {
        jobId,
        queueName,
        jobName,
      });
    } catch (error) {
      logger.error('Failed to track job start', {
        jobId,
        error: error.message,
      });
      // Don't throw - tracking failure shouldn't break job processing
    }
  }

  /**
   * Track job completion
   */
  async trackJobCompletion(jobId, result = null, processingDuration = null) {
    try {
      await prisma.$executeRaw`
        UPDATE queue_jobs
        SET status = 'completed',
            completed_at = NOW(),
            result = ${result ? JSON.stringify(result) : null}::jsonb,
            processing_duration_ms = ${processingDuration},
            updated_at = NOW()
        WHERE job_id = ${jobId}
      `;

      logger.info('Job completed', {
        jobId,
        processingDuration,
      });
    } catch (error) {
      logger.error('Failed to track job completion', {
        jobId,
        error: error.message,
      });
    }
  }

  /**
   * Track job failure and schedule retry
   */
  async trackJobFailure(jobId, error, attemptNumber) {
    try {
      const job = await prisma.$queryRaw`
        SELECT job_id, queue_name, job_name, job_data, max_attempts, retry_delays, error_history
        FROM queue_jobs
        WHERE job_id = ${jobId}
      `;

      if (!job || job.length === 0) {
        logger.warn('Job not found for failure tracking', { jobId });
        return { shouldRetry: false, shouldMoveToDLQ: false };
      }

      const jobData = job[0];
      const errorHistory = jobData.error_history || [];
      
      // Add error to history
      errorHistory.push({
        attempt: attemptNumber,
        error: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString(),
      });

      const shouldRetry = attemptNumber < jobData.max_attempts;
      const shouldMoveToDLQ = attemptNumber >= jobData.max_attempts;

      if (shouldRetry) {
        // Calculate next retry delay
        const retryDelay = this.calculateRetryDelay(attemptNumber, jobData.retry_delays);
        const nextRetryAt = new Date(Date.now() + retryDelay);

        // Update job with retry info
        await prisma.$executeRaw`
          UPDATE queue_jobs
          SET status = 'failed',
              attempt_number = ${attemptNumber},
              failed_at = NOW(),
              next_retry_at = ${nextRetryAt},
              last_error_message = ${error.message},
              last_error_stack = ${error.stack},
              error_history = ${JSON.stringify(errorHistory)}::jsonb,
              updated_at = NOW()
          WHERE job_id = ${jobId}
        `;

        // Log retry
        await this.logRetry(jobId, jobData.queue_name, attemptNumber, retryDelay, error);

        logger.warn('Job failed, will retry', {
          jobId,
          queueName: jobData.queue_name,
          attemptNumber,
          maxAttempts: jobData.max_attempts,
          nextRetryAt,
          retryDelay: `${retryDelay}ms`,
        });

        return {
          shouldRetry: true,
          shouldMoveToDLQ: false,
          nextRetryAt,
          retryDelay,
        };
      } else if (shouldMoveToDLQ) {
        // Update job status
        await prisma.$executeRaw`
          UPDATE queue_jobs
          SET status = 'failed',
              attempt_number = ${attemptNumber},
              failed_at = NOW(),
              last_error_message = ${error.message},
              last_error_stack = ${error.stack},
              error_history = ${JSON.stringify(errorHistory)}::jsonb,
              updated_at = NOW()
          WHERE job_id = ${jobId}
        `;

        logger.error('Job failed permanently, moving to DLQ', {
          jobId,
          queueName: jobData.queue_name,
          attemptNumber,
          maxAttempts: jobData.max_attempts,
        });

        return {
          shouldRetry: false,
          shouldMoveToDLQ: true,
        };
      }
    } catch (err) {
      logger.error('Failed to track job failure', {
        jobId,
        error: err.message,
      });
    }

    return { shouldRetry: false, shouldMoveToDLQ: false };
  }

  /**
   * Calculate retry delay with exponential backoff
   */
  calculateRetryDelay(attemptNumber, retryDelays) {
    // attemptNumber is 1-based (1, 2, 3)
    // Array index is 0-based
    const index = attemptNumber - 1;
    
    if (index >= retryDelays.length) {
      // Use last delay if attempt exceeds array length
      return retryDelays[retryDelays.length - 1];
    }
    
    return retryDelays[index];
  }

  /**
   * Log retry attempt
   */
  async logRetry(jobId, queueName, attemptNumber, retryDelay, error) {
    try {
      await prisma.$executeRaw`
        INSERT INTO queue_retry_log (
          job_id,
          queue_name,
          attempt_number,
          retry_delay_ms,
          retry_reason,
          error_message,
          error_stack,
          failed_at,
          next_retry_at
        )
        VALUES (
          ${jobId},
          ${queueName},
          ${attemptNumber},
          ${retryDelay},
          'Automatic retry after failure',
          ${error.message},
          ${error.stack},
          NOW(),
          NOW() + INTERVAL '${retryDelay} milliseconds'
        )
      `;
    } catch (err) {
      logger.error('Failed to log retry', {
        jobId,
        error: err.message,
      });
    }
  }

  /**
   * Move job to dead letter queue
   */
  async moveToDeadLetterQueue(jobId) {
    try {
      const result = await prisma.$queryRaw`
        SELECT move_job_to_dead_letter_queue(${jobId}) as dlq_id
      `;

      const dlqId = result[0]?.dlq_id;

      logger.warn('Job moved to dead letter queue', {
        jobId,
        dlqId,
      });

      return dlqId;
    } catch (error) {
      logger.error('Failed to move job to DLQ', {
        jobId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get jobs ready for retry
   */
  async getJobsReadyForRetry(limit = 100) {
    try {
      const jobs = await prisma.$queryRaw`
        SELECT * FROM get_jobs_ready_for_retry(${limit})
      `;

      return jobs;
    } catch (error) {
      logger.error('Failed to get jobs ready for retry', {
        error: error.message,
      });
      return [];
    }
  }

  /**
   * Get jobs that should move to DLQ
   */
  async getJobsForDeadLetterQueue(limit = 100) {
    try {
      const jobs = await prisma.$queryRaw`
        SELECT * FROM get_jobs_for_dead_letter_queue(${limit})
      `;

      return jobs;
    } catch (error) {
      logger.error('Failed to get jobs for DLQ', {
        error: error.message,
      });
      return [];
    }
  }

  /**
   * Get queue statistics
   */
  async getQueueStatistics() {
    try {
      const stats = await prisma.$queryRaw`
        SELECT * FROM queue_statistics
        ORDER BY queue_name
      `;

      return stats;
    } catch (error) {
      logger.error('Failed to get queue statistics', {
        error: error.message,
      });
      return [];
    }
  }

  /**
   * Get dead letter queue summary
   */
  async getDeadLetterQueueSummary() {
    try {
      const summary = await prisma.$queryRaw`
        SELECT * FROM dead_letter_queue_summary
        ORDER BY total_failed_jobs DESC
      `;

      return summary;
    } catch (error) {
      logger.error('Failed to get DLQ summary', {
        error: error.message,
      });
      return [];
    }
  }

  /**
   * Get failed jobs from dead letter queue
   */
  async getDeadLetterJobs(limit = 50, offset = 0, queueName = null) {
    try {
      const queueFilter = queueName ? `AND original_queue_name = '${queueName}'` : '';
      
      const jobs = await prisma.$queryRaw`
        SELECT
          id,
          original_job_id,
          original_queue_name,
          original_job_name,
          original_job_data,
          failure_reason,
          total_attempts,
          recovery_status,
          recovery_attempts,
          admin_notes,
          priority,
          created_at
        FROM dead_letter_queue
        WHERE 1=1 ${queueFilter}
        ORDER BY priority DESC, created_at DESC
        LIMIT ${limit}
        OFFSET ${offset}
      `;

      return jobs;
    } catch (error) {
      logger.error('Failed to get DLQ jobs', {
        error: error.message,
      });
      return [];
    }
  }

  /**
   * Retry job from dead letter queue
   */
  async retryDeadLetterJob(dlqId) {
    try {
      const job = await prisma.$queryRaw`
        SELECT
          id,
          original_job_id,
          original_queue_name,
          original_job_name,
          original_job_data,
          recovery_attempts,
          max_recovery_attempts
        FROM dead_letter_queue
        WHERE id = ${dlqId}
      `;

      if (!job || job.length === 0) {
        throw new Error('Dead letter job not found');
      }

      const jobData = job[0];

      if (jobData.recovery_attempts >= jobData.max_recovery_attempts) {
        throw new Error('Max recovery attempts reached');
      }

      // Update recovery attempt
      await prisma.$executeRaw`
        UPDATE dead_letter_queue
        SET recovery_attempts = recovery_attempts + 1,
            last_recovery_attempt_at = NOW(),
            updated_at = NOW()
        WHERE id = ${dlqId}
      `;

      logger.info('Retrying job from DLQ', {
        dlqId,
        originalJobId: jobData.original_job_id,
        queueName: jobData.original_queue_name,
        recoveryAttempt: jobData.recovery_attempts + 1,
      });

      return {
        queueName: jobData.original_queue_name,
        jobName: jobData.original_job_name,
        jobData: jobData.original_job_data,
      };
    } catch (error) {
      logger.error('Failed to retry DLQ job', {
        dlqId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Mark dead letter job as recovered
   */
  async markDeadLetterJobRecovered(dlqId) {
    try {
      await prisma.$executeRaw`
        UPDATE dead_letter_queue
        SET recovery_status = 'recovered',
            recovered_at = NOW(),
            updated_at = NOW()
        WHERE id = ${dlqId}
      `;

      logger.info('DLQ job marked as recovered', { dlqId });
    } catch (error) {
      logger.error('Failed to mark DLQ job as recovered', {
        dlqId,
        error: error.message,
      });
    }
  }

  /**
   * Mark dead letter job as permanently failed
   */
  async markDeadLetterJobPermanentlyFailed(dlqId, reason = null) {
    try {
      await prisma.$executeRaw`
        UPDATE dead_letter_queue
        SET recovery_status = 'permanently_failed',
            admin_notes = ${reason},
            updated_at = NOW()
        WHERE id = ${dlqId}
      `;

      logger.info('DLQ job marked as permanently failed', { dlqId, reason });
    } catch (error) {
      logger.error('Failed to mark DLQ job as permanently failed', {
        dlqId,
        error: error.message,
      });
    }
  }

  /**
   * Update dead letter job admin notes
   */
  async updateDeadLetterJobNotes(dlqId, notes, assignedTo = null, priority = null) {
    try {
      await prisma.$executeRaw`
        UPDATE dead_letter_queue
        SET admin_notes = ${notes},
            assigned_to = ${assignedTo},
            priority = COALESCE(${priority}, priority),
            updated_at = NOW()
        WHERE id = ${dlqId}
      `;

      logger.info('DLQ job notes updated', { dlqId });
    } catch (error) {
      logger.error('Failed to update DLQ job notes', {
        dlqId,
        error: error.message,
      });
    }
  }
}

module.exports = new QueueRetryService();
