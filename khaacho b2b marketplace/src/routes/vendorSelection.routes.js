const express = require('express');
const router = express.Router();
const vendorSelectionController = require('../controllers/vendorSelection.controller');
const { authenticate } = require('../middleware/auth');

/**
 * Vendor Selection Routes
 * Intelligent vendor selection and order splitting
 */

// Select vendors for order items
router.post(
  '/select',
  authenticate,
  vendorSelectionController.selectVendorsForOrder
);

// Rank vendors for a specific product
router.get(
  '/rank/:productId',
  authenticate,
  vendorSelectionController.rankVendorsForProduct
);

// Split order by vendor
router.post(
  '/split',
  authenticate,
  vendorSelectionController.splitOrderByVendor
);

// Store routing decision
router.post(
  '/routing-decision',
  authenticate,
  vendorSelectionController.storeRoutingDecision
);

// Get routing decision for an order
router.get(
  '/routing-decision/:orderId',
  authenticate,
  vendorSelectionController.getRoutingDecision
);

// Get current ranking weights
router.get(
  '/weights',
  authenticate,
  vendorSelectionController.getRankingWeights
);

// Update ranking weights (admin only)
router.put(
  '/weights',
  authenticate,
  vendorSelectionController.updateRankingWeights
);

// Complete workflow (select, split, store)
router.post(
  '/complete-workflow',
  authenticate,
  vendorSelectionController.completeWorkflow
);

module.exports = router;
