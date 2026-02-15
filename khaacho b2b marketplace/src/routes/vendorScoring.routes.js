/**
 * Vendor Scoring Routes
 * 
 * Routes for vendor scoring system
 */

const express = require('express');
const vendorScoringController = require('../controllers/vendorScoring.controller');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

// Public/vendor routes
router.get('/top-vendors', vendorScoringController.getTopVendors);
router.get('/products/:productId/best-vendors', vendorScoringController.getBestVendorsForProduct);

// Admin routes
router.use(authenticate);
router.use(authorize('ADMIN'));

router.get('/config', vendorScoringController.getConfig);
router.get('/vendors/:vendorId/score', vendorScoringController.getVendorScore);
router.get('/vendors/:vendorId/history', vendorScoringController.getVendorScoreHistory);
router.get('/vendors/:vendorId/summary', vendorScoringController.getVendorPerformanceSummary);
router.post('/vendors/:vendorId/initialize', vendorScoringController.initializeVendorScore);
router.post('/vendors/:vendorId/update', vendorScoringController.updateVendorScore);

module.exports = router;
