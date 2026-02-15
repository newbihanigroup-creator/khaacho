const express = require('express');
const router = express.Router();
const enhancedCreditScoringController = require('../controllers/enhancedCreditScoring.controller');
const { authenticate } = require('../middleware/auth');

/**
 * Enhanced Credit Scoring Routes
 * 
 * All routes require authentication
 */

// Check order restriction
router.post(
  '/check-restriction',
  authenticate,
  enhancedCreditScoringController.checkOrderRestriction
);

// Process automatic adjustment for single retailer
router.post(
  '/:retailerId/auto-adjust',
  authenticate,
  enhancedCreditScoringController.processAutomaticAdjustment
);

// Update credit score and trigger adjustment
router.post(
  '/:retailerId/update-score',
  authenticate,
  enhancedCreditScoringController.updateCreditScoreAndAdjust
);

// Process all retailers (admin only)
router.post(
  '/process-all',
  authenticate,
  enhancedCreditScoringController.processAllAutomaticAdjustments
);

// Get retailer credit summary
router.get(
  '/:retailerId/summary',
  authenticate,
  enhancedCreditScoringController.getRetailerCreditSummary
);

// Get credit adjustment history
router.get(
  '/:retailerId/adjustment-history',
  authenticate,
  enhancedCreditScoringController.getCreditAdjustmentHistory
);

// Get order restrictions log
router.get(
  '/:retailerId/restrictions-log',
  authenticate,
  enhancedCreditScoringController.getOrderRestrictionsLog
);

// Manual credit adjustment (admin only)
router.post(
  '/:retailerId/manual-adjust',
  authenticate,
  enhancedCreditScoringController.manualCreditAdjustment
);

// Get statistics (admin only)
router.get(
  '/statistics',
  authenticate,
  enhancedCreditScoringController.getCreditScoreStatistics
);

module.exports = router;
