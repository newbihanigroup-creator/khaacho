const express = require('express');
const OrderController = require('../controllers/OrderController');
const { authenticate, authorize } = require('../middleware/auth');
const { validateOrderCreation, validateStatusUpdate } = require('../middleware/validators/orderValidator');

const router = express.Router();

/**
 * @route   GET /api/orders/statistics
 * @desc    Get order statistics
 * @access  Private (All roles)
 */
router.get(
  '/statistics',
  authenticate,
  OrderController.getStatistics
);

/**
 * @route   GET /api/orders/:id
 * @desc    Get order by ID
 * @access  Private (All roles)
 */
router.get(
  '/:id',
  authenticate,
  OrderController.getOrderById
);

/**
 * @route   GET /api/orders
 * @desc    Get orders list with pagination
 * @access  Private (All roles)
 */
router.get(
  '/',
  authenticate,
  OrderController.getOrders
);

/**
 * @route   POST /api/orders
 * @desc    Create new order
 * @access  Private (Retailer, Admin, Operator)
 */
router.post(
  '/',
  authenticate,
  authorize('RETAILER', 'ADMIN', 'OPERATOR'),
  validateOrderCreation,
  OrderController.createOrder
);

/**
 * @route   PATCH /api/orders/:id/status
 * @desc    Update order status
 * @access  Private (Admin, Operator, Wholesaler)
 */
router.patch(
  '/:id/status',
  authenticate,
  authorize('ADMIN', 'OPERATOR', 'WHOLESALER'),
  validateStatusUpdate,
  OrderController.updateOrderStatus
);

/**
 * @route   POST /api/orders/:id/cancel
 * @desc    Cancel order
 * @access  Private (Retailer, Admin, Operator)
 */
router.post(
  '/:id/cancel',
  authenticate,
  authorize('RETAILER', 'ADMIN', 'OPERATOR'),
  OrderController.cancelOrder
);

module.exports = router;
