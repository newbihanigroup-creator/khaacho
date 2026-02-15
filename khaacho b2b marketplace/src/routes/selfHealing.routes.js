const express = require('express');
const router = express.Router();
const selfHealingController = require('../controllers/selfHealing.controller');
const { authenticate, authorize } = require('../middleware/auth');

/**
 * Self-Healing Routes
 * Automatic detection and recovery of stuck orders
 */

// Detect stuck orders
router.get(
  '/stuck-orders',
  authenticate,
  authorize(['ADMIN', 'OPERATIONS']),
  selfHealingController.detectStuckOrders
);

// Manually trigger healing for specific order
router.post(
  '/heal/:orderId',
  authenticate,
  authorize(['ADMIN', 'OPERATIONS']),
  selfHealingController.healOrder
);

// Run full healing cycle
router.post(
  '/run-cycle',
  authenticate,
  authorize(['ADMIN', 'OPERATIONS']),
  selfHealingController.runHealingCycle
);

// Get healing statistics
router.get(
  '/statistics',
  authenticate,
  authorize(['ADMIN', 'OPERATIONS']),
  selfHealingController.getStatistics
);

// Get pending admin notifications
router.get(
  '/notifications',
  authenticate,
  authorize(['ADMIN']),
  selfHealingController.getPendingNotifications
);

// Acknowledge notification
router.post(
  '/notifications/:notificationId/acknowledge',
  authenticate,
  authorize(['ADMIN']),
  selfHealingController.acknowledgeNotification
);

module.exports = router;
