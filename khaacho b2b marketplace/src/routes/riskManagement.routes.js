const express = require('express');
const router = express.Router();
const riskManagementController = require('../controllers/riskManagement.controller');
const auth = require('../middleware/auth');

// Risk profile management
router.get('/profiles/:retailerId', auth.requireRole(['ADMIN', 'OPERATOR', 'RETAILER']), riskManagementController.getRetailerRiskProfile);
router.post('/profiles/:retailerId/update', auth.requireRole(['ADMIN', 'OPERATOR', 'SYSTEM']), riskManagementController.updateRiskProfileOnTransaction);
router.post('/profiles/:retailerId/create', auth.requireRole(['ADMIN', 'OPERATOR']), riskManagementController.createRiskProfile);
router.put('/profiles/:retailerId', auth.requireRole(['ADMIN', 'OPERATOR', 'RETAILER']), riskManagementController.updateRiskProfile);

// Risk dashboard and analytics
router.get('/dashboard', auth.requireRole(['ADMIN', 'OPERATOR']), riskManagementController.getRiskDashboard);
router.get('/high-risk', auth.requireRole(['ADMIN', 'OPERATOR']), riskManagementController.getHighRiskRetailers);
router.get('/trends/:retailerId', auth.requireRole(['ADMIN', 'OPERATOR', 'RETAILER']), riskManagementController.getRiskTrends);
router.get('/alerts/:retailerId', auth.requireRole(['ADMIN', 'OPERATOR', 'RETAILER']), riskManagementController.getRiskAlerts);
router.post('/alerts/:retailerId/create', auth.requireRole(['ADMIN', 'OPERATOR']), riskManagementController.createRiskAlert);

// Fraud detection
router.get('/fraud/:retailerId', auth.requireRole(['ADMIN', 'OPERATOR']), riskManagementController.getFraudDetection);
router.get('/flags/:retailerId', auth.requireRole(['ADMIN', 'OPERATOR']), riskManagementController.getRiskFlags);
router.post('/flags/:retailerId/set', auth.requireRole(['ADMIN', 'OPERATOR']), riskManagementController.setRiskFlag);

// Bank integration data
router.get('/bank-exports/:retailerId', auth.requireRole(['ADMIN', 'OPERATOR', 'RETAILER']), riskManagementController.getBankReadyDataExports);

module.exports = router;
