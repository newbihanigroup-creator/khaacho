const express = require('express');
const router = express.Router();
const controller = require('../controllers/queueAdmin.controller');
const { authenticate } = require('../middleware/auth');

/**
 * Queue Admin Routes
 * Base path: /api/queue-admin
 * 
 * All routes require authentication
 */

// Dashboard and statistics
router.get('/statistics', authenticate, controller.getStatistics);
router.get('/queue-counts', authenticate, controller.getQueueCounts);

// Dead letter queue management
router.get('/dead-letter-queue', authenticate, controller.getDeadLetterJobs);
router.post('/dead-letter-queue/:dlqId/retry', authenticate, controller.retryDeadLetterJob);
router.post('/dead-letter-queue/:dlqId/mark-failed', authenticate, controller.markJobPermanentlyFailed);
router.put('/dead-letter-queue/:dlqId/notes', authenticate, controller.updateJobNotes);

// Retry queue
router.get('/retry-queue', authenticate, controller.getRetryQueue);

// Recovery worker
router.post('/trigger-recovery', authenticate, controller.triggerRecovery);
router.get('/recovery-status', authenticate, controller.getRecoveryStatus);

// Queue management
router.post('/queues/:queueKey/pause', authenticate, controller.pauseQueue);
router.post('/queues/:queueKey/resume', authenticate, controller.resumeQueue);
router.post('/queues/:queueKey/clean', authenticate, controller.cleanQueue);

module.exports = router;
