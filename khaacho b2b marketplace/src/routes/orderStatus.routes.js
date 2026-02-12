const express = require('express');
const router = express.Router();
const orderStatusController = require('../controllers/orderStatus.controller');
const { authenticate, authorize } = require('../middleware/auth');

// General order status update (admin/operator)
router.put('/orders/:orderId/status', authenticate, authorize('ADMIN', 'OPERATOR'), orderStatusController.adminUpdateStatus);

// Vendor status update (up to DISPATCHED only)
router.put('/vendor/orders/:orderId/status', authenticate, authorize('VENDOR'), orderStatusController.vendorUpdateStatus);

// Retailer order completion confirmation
router.post('/orders/:orderId/confirm-completion', authenticate, authorize('RETAILER'), orderStatusController.confirmOrderCompletion);

// Get valid transitions for a status
router.get('/transitions', authenticate, orderStatusController.getValidTransitions);

// Get delayed orders
router.get('/delayed-orders', authenticate, authorize('ADMIN', 'OPERATOR'), orderStatusController.getDelayedOrders);

// Get order status distribution
router.get('/distribution', authenticate, authorize('ADMIN', 'OPERATOR'), orderStatusController.getOrderStatusDistribution);

// Delivery dashboard
router.get('/delivery-dashboard', authenticate, authorize('ADMIN', 'OPERATOR'), orderStatusController.getDeliveryDashboard);

module.exports = router;
