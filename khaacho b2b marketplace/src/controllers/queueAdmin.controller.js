const queueRetryService = require('../services/queueRetry.service');
const { queueManager, QUEUES } = require('../queues/queueManager');
const queueRecoveryWorker = require('../workers/queueRecovery.worker');
const ApiResponse = require('../utils/response');
const logger = require('../shared/logger');

/**
 * Queue Admin Controller
 * Admin panel endpoints for managing queue jobs and dead letter queue
 */

class QueueAdminController {
  /**
   * Get queue statistics dashboard
   * GET /api/queue-admin/statistics
   */
  async getStatistics(req, res, next) {
    try {
      const [queueStats, dlqSummary, workerStats] = await Promise.all([
        queueRetryService.getQueueStatistics(),
        queueRetryService.getDeadLetterQueueSummary(),
        Promise.resolve(queueRecoveryWorker.getStats()),
      ]);

      return ApiResponse.success(res, {
        queueStatistics: queueStats,
        deadLetterQueueSummary: dlqSummary,
        recoveryWorkerStats: workerStats,
      }, 'Queue statistics retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get failed jobs from dead letter queue
   * GET /api/queue-admin/dead-letter-queue
   */
  async getDeadLetterJobs(req, res, next) {
    try {
      const {
        limit = 50,
        offset = 0,
        queueName = null,
      } = req.query;

      const jobs = await queueRetryService.getDeadLetterJobs(
        parseInt(limit, 10),
        parseInt(offset, 10),
        queueName
      );

      return ApiResponse.success(res, {
        jobs,
        pagination: {
          limit: parseInt(limit, 10),
          offset: parseInt(offset, 10),
        },
      }, 'Dead letter queue jobs retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  /**
   * Retry a job from dead letter queue
   * POST /api/queue-admin/dead-letter-queue/:dlqId/retry
   */
  async retryDeadLetterJob(req, res, next) {
    try {
      const { dlqId } = req.params;

      // Get job details
      const jobDetails = await queueRetryService.retryDeadLetterJob(dlqId);

      // Find queue
      const queueKey = Object.keys(QUEUES).find(
        key => QUEUES[key] === jobDetails.queueName
      );

      if (!queueKey) {
        return ApiResponse.error(
          res,
          `Queue ${jobDetails.queueName} not found`,
          404
        );
      }

      // Re-add job to queue
      const newJob = await queueManager.addJob(
        queueKey,
        jobDetails.jobName,
        jobDetails.jobData,
        {
          jobId: `dlq-retry-${dlqId}-${Date.now()}`,
        }
      );

      // Mark as recovered
      await queueRetryService.markDeadLetterJobRecovered(dlqId);

      logger.info('DLQ job retried from admin panel', {
        dlqId,
        newJobId: newJob.id,
        queueName: jobDetails.queueName,
      });

      return ApiResponse.success(res, {
        dlqId,
        newJobId: newJob.id,
        queueName: jobDetails.queueName,
      }, 'Job retried successfully');
    } catch (error) {
      next(error);
    }
  }

  /**
   * Mark dead letter job as permanently failed
   * POST /api/queue-admin/dead-letter-queue/:dlqId/mark-failed
   */
  async markJobPermanentlyFailed(req, res, next) {
    try {
      const { dlqId } = req.params;
      const { reason } = req.body;

      await queueRetryService.markDeadLetterJobPermanentlyFailed(dlqId, reason);

      logger.info('DLQ job marked as permanently failed', {
        dlqId,
        reason,
      });

      return ApiResponse.success(res, {
        dlqId,
      }, 'Job marked as permanently failed');
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update dead letter job notes
   * PUT /api/queue-admin/dead-letter-queue/:dlqId/notes
   */
  async updateJobNotes(req, res, next) {
    try {
      const { dlqId } = req.params;
      const { notes, assignedTo, priority } = req.body;

      await queueRetryService.updateDeadLetterJobNotes(
        dlqId,
        notes,
        assignedTo,
        priority
      );

      logger.info('DLQ job notes updated', {
        dlqId,
        assignedTo,
        priority,
      });

      return ApiResponse.success(res, {
        dlqId,
      }, 'Job notes updated successfully');
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get jobs ready for retry
   * GET /api/queue-admin/retry-queue
   */
  async getRetryQueue(req, res, next) {
    try {
      const { limit = 100 } = req.query;

      const jobs = await queueRetryService.getJobsReadyForRetry(
        parseInt(limit, 10)
      );

      return ApiResponse.success(res, {
        jobs,
        count: jobs.length,
      }, 'Retry queue retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  /**
   * Manually trigger recovery worker
   * POST /api/queue-admin/trigger-recovery
   */
  async triggerRecovery(req, res, next) {
    try {
      // Trigger recovery in background
      queueRecoveryWorker.triggerRecovery().catch(error => {
        logger.error('Manual recovery failed', {
          error: error.message,
        });
      });

      return ApiResponse.success(res, {
        message: 'Recovery worker triggered',
      }, 'Recovery process started');
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get recovery worker status
   * GET /api/queue-admin/recovery-status
   */
  async getRecoveryStatus(req, res, next) {
    try {
      const stats = queueRecoveryWorker.getStats();

      return ApiResponse.success(res, {
        isRunning: queueRecoveryWorker.isRunning,
        stats,
      }, 'Recovery worker status retrieved');
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get all queue counts
   * GET /api/queue-admin/queue-counts
   */
  async getQueueCounts(req, res, next) {
    try {
      const counts = {};

      for (const [key, queueName] of Object.entries(QUEUES)) {
        try {
          counts[queueName] = await queueManager.getQueueCounts(key);
        } catch (error) {
          logger.error(`Failed to get counts for queue ${queueName}`, {
            error: error.message,
          });
          counts[queueName] = { error: error.message };
        }
      }

      return ApiResponse.success(res, {
        queues: counts,
      }, 'Queue counts retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  /**
   * Pause a queue
   * POST /api/queue-admin/queues/:queueKey/pause
   */
  async pauseQueue(req, res, next) {
    try {
      const { queueKey } = req.params;

      if (!QUEUES[queueKey]) {
        return ApiResponse.error(res, `Queue ${queueKey} not found`, 404);
      }

      await queueManager.pauseQueue(queueKey);

      logger.info('Queue paused from admin panel', { queueKey });

      return ApiResponse.success(res, {
        queueKey,
        queueName: QUEUES[queueKey],
      }, 'Queue paused successfully');
    } catch (error) {
      next(error);
    }
  }

  /**
   * Resume a queue
   * POST /api/queue-admin/queues/:queueKey/resume
   */
  async resumeQueue(req, res, next) {
    try {
      const { queueKey } = req.params;

      if (!QUEUES[queueKey]) {
        return ApiResponse.error(res, `Queue ${queueKey} not found`, 404);
      }

      await queueManager.resumeQueue(queueKey);

      logger.info('Queue resumed from admin panel', { queueKey });

      return ApiResponse.success(res, {
        queueKey,
        queueName: QUEUES[queueKey],
      }, 'Queue resumed successfully');
    } catch (error) {
      next(error);
    }
  }

  /**
   * Clean old jobs from a queue
   * POST /api/queue-admin/queues/:queueKey/clean
   */
  async cleanQueue(req, res, next) {
    try {
      const { queueKey } = req.params;
      const { grace = 86400000, status = 'completed' } = req.body; // 24 hours default

      if (!QUEUES[queueKey]) {
        return ApiResponse.error(res, `Queue ${queueKey} not found`, 404);
      }

      const jobs = await queueManager.cleanQueue(queueKey, grace, status);

      logger.info('Queue cleaned from admin panel', {
        queueKey,
        jobsRemoved: jobs.length,
        status,
      });

      return ApiResponse.success(res, {
        queueKey,
        queueName: QUEUES[queueKey],
        jobsRemoved: jobs.length,
      }, `Cleaned ${jobs.length} ${status} jobs`);
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new QueueAdminController();
