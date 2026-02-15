/**
 * Queue Recovery Worker
 * 
 * Runs every 5 minutes to:
 * 1. Retry failed jobs that are ready for retry
 * 2. Move permanently failed jobs to dead-letter queue
 * 3. Clean up old completed jobs
 * 
 * Usage: node src/workers/queueRecovery.worker.js
 */

require('dotenv').config();
const cron = require('node-cron');
const prisma = require('../config/database');
const logger = require('../shared/logger');
const queueRetryService = require('../services/queueRetry.service');
const { queueManager, QUEUES } = require('../queues/queueManager');

class QueueRecoveryWorker {
  constructor() {
    this.isRunning = false;
    this.cronJob = null;
    this.stats = {
      totalRuns: 0,
      successfulRuns: 0,
      failedRuns: 0,
      lastRunAt: null,
      lastRunDuration: null,
    };
  }

  /**
   * Start the recovery worker
   */
  async start() {
    logger.info('Starting queue recovery worker...');

    // Initialize queue manager
    if (!queueManager.isInitialized) {
      queueManager.initialize();
    }

    // Run immediately on start
    await this.runRecovery('startup');

    // Schedule to run every 5 minutes
    this.cronJob = cron.schedule('*/5 * * * *', async () => {
      await this.runRecovery('scheduled');
    });

    logger.info('Queue recovery worker started (runs every 5 minutes)');
  }

  /**
   * Stop the recovery worker
   */
  stop() {
    if (this.cronJob) {
      this.cronJob.stop();
      logger.info('Queue recovery worker stopped');
    }
  }

  /**
   * Run recovery process
   */
  async runRecovery(runType = 'manual') {
    if (this.isRunning) {
      logger.warn('Recovery already running, skipping...');
      return;
    }

    this.isRunning = true;
    const startTime = Date.now();
    
    let runId;
    const stats = {
      jobsProcessed: 0,
      jobsRetried: 0,
      jobsMovedToDLQ: 0,
      jobsRecovered: 0,
      jobsFailed: 0,
    };

    try {
      // Create recovery run record
      const run = await prisma.$queryRaw`
        INSERT INTO queue_recovery_runs (run_type, status)
        VALUES (${runType}, 'running')
        RETURNING id
      `;
      runId = run[0].id;

      logger.info('Starting queue recovery run', {
        runId,
        runType,
      });

      // Step 1: Retry failed jobs that are ready
      const retryResults = await this.retryFailedJobs();
      stats.jobsRetried = retryResults.retried;
      stats.jobsFailed = retryResults.failed;
      stats.jobsProcessed += retryResults.processed;

      // Step 2: Move permanently failed jobs to DLQ
      const dlqResults = await this.moveJobsToDeadLetterQueue();
      stats.jobsMovedToDLQ = dlqResults.moved;
      stats.jobsProcessed += dlqResults.processed;

      // Step 3: Clean up old completed jobs (older than 7 days)
      await this.cleanupOldJobs();

      // Update run record
      const duration = Date.now() - startTime;
      await prisma.$executeRaw`
        UPDATE queue_recovery_runs
        SET status = 'completed',
            jobs_processed = ${stats.jobsProcessed},
            jobs_retried = ${stats.jobsRetried},
            jobs_moved_to_dlq = ${stats.jobsMovedToDLQ},
            jobs_recovered = ${stats.jobsRecovered},
            jobs_failed = ${stats.jobsFailed},
            completed_at = NOW(),
            duration_ms = ${duration}
        WHERE id = ${runId}
      `;

      // Update worker stats
      this.stats.totalRuns++;
      this.stats.successfulRuns++;
      this.stats.lastRunAt = new Date();
      this.stats.lastRunDuration = duration;

      logger.info('Queue recovery run completed', {
        runId,
        duration: `${duration}ms`,
        stats,
      });
    } catch (error) {
      logger.error('Queue recovery run failed', {
        runId,
        error: error.message,
        stack: error.stack,
      });

      // Update run record
      if (runId) {
        const duration = Date.now() - startTime;
        await prisma.$executeRaw`
          UPDATE queue_recovery_runs
          SET status = 'failed',
              error_message = ${error.message},
              completed_at = NOW(),
              duration_ms = ${duration}
          WHERE id = ${runId}
        `;
      }

      this.stats.totalRuns++;
      this.stats.failedRuns++;
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Retry failed jobs that are ready for retry
   */
  async retryFailedJobs() {
    const results = {
      processed: 0,
      retried: 0,
      failed: 0,
    };

    try {
      // Get jobs ready for retry
      const jobs = await queueRetryService.getJobsReadyForRetry(100);

      logger.info(`Found ${jobs.length} jobs ready for retry`);

      for (const job of jobs) {
        results.processed++;

        try {
          // Find the queue
          const queueKey = Object.keys(QUEUES).find(
            key => QUEUES[key] === job.queue_name
          );

          if (!queueKey) {
            logger.warn('Queue not found for job', {
              jobId: job.job_id,
              queueName: job.queue_name,
            });
            results.failed++;
            continue;
          }

          // Re-add job to queue
          await queueManager.addJob(
            queueKey,
            job.job_name,
            job.job_data,
            {
              jobId: `${job.job_id}-retry-${job.attempt_number + 1}`,
              attempts: job.max_attempts - job.attempt_number,
            }
          );

          // Update job status
          await prisma.$executeRaw`
            UPDATE queue_jobs
            SET status = 'waiting',
                updated_at = NOW()
            WHERE job_id = ${job.job_id}
          `;

          results.retried++;

          logger.info('Job retried successfully', {
            jobId: job.job_id,
            queueName: job.queue_name,
            attemptNumber: job.attempt_number + 1,
          });
        } catch (error) {
          logger.error('Failed to retry job', {
            jobId: job.job_id,
            error: error.message,
          });
          results.failed++;
        }
      }
    } catch (error) {
      logger.error('Failed to retry failed jobs', {
        error: error.message,
      });
    }

    return results;
  }

  /**
   * Move permanently failed jobs to dead letter queue
   */
  async moveJobsToDeadLetterQueue() {
    const results = {
      processed: 0,
      moved: 0,
    };

    try {
      // Get jobs that should move to DLQ
      const jobs = await queueRetryService.getJobsForDeadLetterQueue(100);

      logger.info(`Found ${jobs.length} jobs to move to DLQ`);

      for (const job of jobs) {
        results.processed++;

        try {
          // Move to DLQ
          await queueRetryService.moveToDeadLetterQueue(job.job_id);
          results.moved++;

          logger.warn('Job moved to DLQ', {
            jobId: job.job_id,
            queueName: job.queue_name,
            attempts: job.attempt_number,
          });
        } catch (error) {
          logger.error('Failed to move job to DLQ', {
            jobId: job.job_id,
            error: error.message,
          });
        }
      }
    } catch (error) {
      logger.error('Failed to move jobs to DLQ', {
        error: error.message,
      });
    }

    return results;
  }

  /**
   * Clean up old completed jobs
   */
  async cleanupOldJobs() {
    try {
      const result = await prisma.$executeRaw`
        DELETE FROM queue_jobs
        WHERE status = 'completed'
        AND completed_at < NOW() - INTERVAL '7 days'
      `;

      logger.info(`Cleaned up ${result} old completed jobs`);
    } catch (error) {
      logger.error('Failed to cleanup old jobs', {
        error: error.message,
      });
    }
  }

  /**
   * Get worker statistics
   */
  getStats() {
    return this.stats;
  }

  /**
   * Manually trigger recovery
   */
  async triggerRecovery() {
    logger.info('Manual recovery triggered');
    await this.runRecovery('manual');
  }
}

// Create worker instance
const worker = new QueueRecoveryWorker();

// Handle graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully...');
  worker.stop();
  await queueManager.closeAll();
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully...');
  worker.stop();
  await queueManager.closeAll();
  await prisma.$disconnect();
  process.exit(0);
});

// Start worker if run directly
if (require.main === module) {
  worker.start().catch(error => {
    logger.error('Failed to start queue recovery worker', {
      error: error.message,
      stack: error.stack,
    });
    process.exit(1);
  });
}

module.exports = worker;
