const express = require('express');
const router = express.Router();
const vendorIntelligenceController = require('../controllers/vendorIntelligence.controller');
const auth = require('../middleware/auth');

// Vendor intelligence endpoints
router.get('/vendors/performance', auth.requireRole(['ADMIN', 'OPERATOR', 'VENDOR']), vendorIntelligenceController.getVendorPerformance);
router.get('/vendors/ranked', auth.requireRole(['ADMIN', 'OPERATOR', 'VENDOR']), vendorIntelligenceController.getRankedVendors);
router.get('/vendors/:vendorId/score', auth.requireRole(['ADMIN', 'OPERATOR', 'VENDOR']), vendorIntelligenceController.getVendorScore);
router.put('/vendors/:vendorId/performance', auth.requireRole(['ADMIN', 'OPERATOR', 'VENDOR']), vendorIntelligenceController.updateVendorPerformance);
router.get('/vendors/risk', auth.requireRole(['ADMIN', 'OPERATOR']), vendorIntelligenceController.getRiskVendors);
router.get('/performance-stats', auth.requireRole(['ADMIN', 'OPERATOR']), vendorIntelligenceController.getPerformanceStats);
router.get('/market-insights', auth.requireRole(['ADMIN', 'OPERATOR']), vendorIntelligenceController.getMarketInsights);
router.post('/vendors/recalculate-scores', auth.requireRole(['ADMIN', 'OPERATOR']), vendorIntelligenceController.recalculateVendorScores);

module.exports = router;
