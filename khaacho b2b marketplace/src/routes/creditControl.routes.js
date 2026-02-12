const express = require('express');
const router = express.Router();
const creditControlController = require('../controllers/creditControl.controller');
const { authenticate, authorize } = require('../middleware/auth');

// Retailer credit management
router.get('/retailer/:retailerId/status', authenticate, authorize('ADMIN', 'OPERATOR', 'RETAILER'), creditControlController.getRetailerCreditStatus);
router.put('/retailer/:retailerId/credit-limit', authenticate, authorize('ADMIN', 'OPERATOR'), creditControlController.updateRetailerCreditLimit);
router.post('/retailer/:retailerId/unblock', authenticate, authorize('ADMIN', 'OPERATOR'), creditControlController.unblockRetailer);

// Credit validation
router.post('/validate-order-credit', authenticate, authorize('ADMIN', 'OPERATOR', 'VENDOR'), creditControlController.validateOrderCredit);

// Dashboard and analytics
router.get('/dashboard', authenticate, authorize('ADMIN', 'OPERATOR'), creditControlController.getCreditControlDashboard);
router.post('/check-blocked-retailers', authenticate, authorize('ADMIN', 'OPERATOR'), creditControlController.checkBlockedRetailers);
router.get('/high-risk-retailers', authenticate, authorize('ADMIN', 'OPERATOR'), creditControlController.getHighRiskRetailers);
router.get('/analytics', authenticate, authorize('ADMIN', 'OPERATOR'), creditControlController.getCreditAnalytics);

module.exports = router;
