const express = require('express');
const router = express.Router();
const orderValidationController = require('../controllers/orderValidation.controller');
const { authenticate } = require('../middleware/auth');

/**
 * Order Validation Routes
 * Endpoints for validating orders and managing rejected orders
 */

// Validate order credit
router.post(
  '/validate',
  authenticate,
  orderValidationController.validateCredit
);

// Get rejected orders
router.get(
  '/rejected',
  authenticate,
  orderValidationController.getRejectedOrders
);

// Get rejected order by ID
router.get(
  '/rejected/:id',
  authenticate,
  orderValidationController.getRejectedOrderById
);

// Mark rejected order as reviewed
router.put(
  '/rejected/:id/review',
  authenticate,
  orderValidationController.markAsReviewed
);

// Get rejection statistics
router.get(
  '/stats',
  authenticate,
  orderValidationController.getRejectionStats
);

module.exports = router;
