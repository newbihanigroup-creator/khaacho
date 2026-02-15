const express = require('express');
const router = express.Router();
const repeatOrderPredictionController = require('../controllers/repeatOrderPrediction.controller');
const { authenticate } = require('../middleware/auth');

/**
 * Repeat Order Prediction Routes
 * 
 * All routes require authentication
 */

// Analyze patterns
router.get(
  '/analyze/:retailerId',
  authenticate,
  repeatOrderPredictionController.analyzePatterns
);

// Generate predictions
router.post(
  '/generate',
  authenticate,
  repeatOrderPredictionController.generatePredictions
);

// Send reminders
router.post(
  '/send-reminders',
  authenticate,
  repeatOrderPredictionController.sendReminders
);

// Get retailer predictions
router.get(
  '/retailer/:retailerId',
  authenticate,
  repeatOrderPredictionController.getRetailerPredictions
);

// Get statistics
router.get(
  '/statistics',
  authenticate,
  repeatOrderPredictionController.getStatistics
);

// Mark order placed
router.post(
  '/:predictionId/order-placed',
  authenticate,
  repeatOrderPredictionController.markOrderPlaced
);

// Worker management
router.get(
  '/worker/status',
  authenticate,
  repeatOrderPredictionController.getWorkerStatus
);

router.post(
  '/worker/run/:jobName',
  authenticate,
  repeatOrderPredictionController.runWorkerJob
);

// Configuration
router.get(
  '/configuration',
  authenticate,
  repeatOrderPredictionController.getConfiguration
);

router.put(
  '/configuration/thresholds',
  authenticate,
  repeatOrderPredictionController.updateThresholds
);

module.exports = router;
