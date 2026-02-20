const express = require('express');
const OrderController = require('../controllers/order.controller');
const { authenticate, authorize } = require('../middleware/auth');
const validate = require('../middleware/validation');

const router = express.Router();

// Apply idempotency middleware only to createOrder
router.post('/', 
  authenticate, 
  authorize('RETAILER'), 
  ...OrderController.createValidation, 
  validate, 
  ...OrderController.createOrderMiddleware,
  OrderController.createOrder.bind(OrderController)
);

router.get('/', authenticate, OrderController.getOrders.bind(OrderController));
router.get('/:id', authenticate, OrderController.getOrder.bind(OrderController));

// Apply idempotency middleware to status update
router.patch('/:id/status', 
  authenticate, 
  authorize('VENDOR', 'ADMIN'), 
  OrderController.updateStatusValidation, 
  validate, 
  ...OrderController.createOrderMiddleware, // Reuse for audit logging
  OrderController.updateOrderStatus.bind(OrderController)
);

// New audit history routes
router.get('/:id/audit-history', 
  authenticate, 
  authorize('VENDOR', 'ADMIN'), 
  OrderController.getOrderAuditHistory.bind(OrderController)
);

module.exports = router;
