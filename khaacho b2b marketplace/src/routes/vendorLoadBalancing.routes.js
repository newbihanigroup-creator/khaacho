const express = require('express');
const router = express.Router();
const vendorLoadBalancingController = require('../controllers/vendorLoadBalancing.controller');
const { authenticate } = require('../middleware/auth');

/**
 * Vendor Load Balancing Routes
 * 
 * All routes require authentication
 */

// Get load statistics
router.get(
  '/statistics',
  authenticate,
  vendorLoadBalancingController.getLoadStatistics
);

// Get monopoly statistics
router.get(
  '/monopoly',
  authenticate,
  vendorLoadBalancingController.getMonopolyStatistics
);

// Get capacity status
router.get(
  '/capacity',
  authenticate,
  vendorLoadBalancingController.getCapacityStatus
);

// Get market share
router.get(
  '/market-share',
  authenticate,
  vendorLoadBalancingController.getMarketShare
);

// Get load balancing history
router.get(
  '/history',
  authenticate,
  vendorLoadBalancingController.getHistory
);

// Configuration management
router.get(
  '/configuration',
  authenticate,
  vendorLoadBalancingController.getConfiguration
);

router.put(
  '/configuration',
  authenticate,
  vendorLoadBalancingController.updateConfiguration
);

// Update vendor working hours
router.put(
  '/vendors/:vendorId/working-hours',
  authenticate,
  vendorLoadBalancingController.updateWorkingHours
);

module.exports = router;
