/**
 * Order Timeout Routes
 * 
 * Admin routes for managing order timeouts
 */

const express = require('express');
const orderTimeoutController = require('../controllers/orderTimeout.controller');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

// All routes require admin authentication
router.use(authenticate);
router.use(authorize('ADMIN'));

// Configuration
router.get('/config', orderTimeoutController.getConfig);

// Statistics
router.get('/statistics', orderTimeoutController.getStatistics);
router.get('/vendor-performance', orderTimeoutController.getVendorPerformance);
router.get('/active-timeouts', orderTimeoutController.getActiveTimeouts);
router.get('/unresolved-delays', orderTimeoutController.getUnresolvedDelays);

// Worker management
router.get('/worker/status', orderTimeoutController.getWorkerStatus);
router.post('/worker/trigger', orderTimeoutController.triggerManualCheck);

// Delay management
router.post('/delays/:delayId/resolve', orderTimeoutController.resolveDelay);

// Notifications
router.get('/notifications', orderTimeoutController.getNotifications);
router.post('/notifications/:notificationId/read', orderTimeoutController.markNotificationRead);
router.post('/notifications/:notificationId/acknowledge', orderTimeoutController.acknowledgeNotification);

module.exports = router;
