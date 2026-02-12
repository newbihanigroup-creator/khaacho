const express = require('express');
const router = express.Router();
const orderStatusController = require('../controllers/orderStatus.controller');
const auth = require('../middleware/auth');

// General order status update (admin/operator)
router.put('/orders/:orderId/status', ...auth.requireRole(['ADMIN', 'OPERATOR']), orderStatusController.adminUpdateStatus);

// Vendor status update (up to DISPATCHED only)
router.put('/vendor/orders/:orderId/status', ...auth.requireRole(['VENDOR']), orderStatusController.vendorUpdateStatus);

// Retailer order completion confirmation
router.post('/orders/:orderId/confirm-completion', ...auth.requireRole(['RETAILER']), orderStatusController.confirmOrderCompletion);

// Get valid transitions for a status
router.get('/transitions', auth.authenticate, orderStatusController.getValidTransitions);

// Get delayed orders
router.get('/delayed-orders', ...auth.requireRole(['ADMIN', 'OPERATOR']), orderStatusController.getDelayedOrders);

// Get order status distribution
router.get('/distribution', ...auth.requireRole(['ADMIN', 'OPERATOR']), orderStatusController.getOrderStatusDistribution);

// Delivery dashboard
router.get('/delivery-dashboard', ...auth.requireRole(['ADMIN', 'OPERATOR']), orderStatusController.getDeliveryDashboard);

module.exports = router;
