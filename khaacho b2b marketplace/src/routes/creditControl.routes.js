const express = require('express');
const router = express.Router();
const creditControlController = require('../controllers/creditControl.controller');
const auth = require('../middleware/auth');

// Retailer credit management
router.get('/retailer/:retailerId/status', auth.requireRole(['ADMIN', 'OPERATOR', 'RETAILER']), creditControlController.getRetailerCreditStatus);
router.put('/retailer/:retailerId/credit-limit', auth.requireRole(['ADMIN', 'OPERATOR']), creditControlController.updateRetailerCreditLimit);
router.post('/retailer/:retailerId/unblock', auth.requireRole(['ADMIN', 'OPERATOR']), creditControlController.unblockRetailer);

// Credit validation
router.post('/validate-order-credit', auth.requireRole(['ADMIN', 'OPERATOR', 'VENDOR']), creditControlController.validateOrderCredit);

// Dashboard and analytics
router.get('/dashboard', auth.requireRole(['ADMIN', 'OPERATOR']), creditControlController.getCreditControlDashboard);
router.post('/check-blocked-retailers', auth.requireRole(['ADMIN', 'OPERATOR']), creditControlController.checkBlockedRetailers);
router.get('/high-risk-retailers', auth.requireRole(['ADMIN', 'OPERATOR']), creditControlController.getHighRiskRetailers);
router.get('/analytics', auth.requireRole(['ADMIN', 'OPERATOR']), creditControlController.getCreditAnalytics);

module.exports = router;
