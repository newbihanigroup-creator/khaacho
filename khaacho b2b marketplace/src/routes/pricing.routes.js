const express = require('express');
const router = express.Router();
const pricingController = require('../controllers/pricing.controller');
const auth = require('../middleware/auth');

// Pricing management
router.post('/pricing', auth.requireRole(['ADMIN', 'VENDOR']), pricingController.setVendorPricing);
router.post('/vendor/:vendorId/pricing/bulk', auth.requireRole(['ADMIN', 'VENDOR']), pricingController.bulkSetPricing);
router.put('/pricing/:pricingId/deactivate', auth.requireRole(['ADMIN', 'VENDOR']), pricingController.deactivatePricing);

// Bulk tiers
router.put('/pricing/:pricingId/tiers', auth.requireRole(['ADMIN', 'VENDOR']), pricingController.updateBulkTiers);

// Get pricing
router.get('/vendor/:vendorId/pricing', auth.requireRole(['ADMIN', 'OPERATOR', 'VENDOR']), pricingController.getAllVendorPricing);
router.get('/vendor/:vendorId/product/:productId/pricing', auth.requireRole(['ADMIN', 'OPERATOR', 'VENDOR', 'RETAILER']), pricingController.getVendorPricing);

// Price selection
router.get('/product/:productId/best-price', pricingController.getBestPrice);
router.get('/product/:productId/all-prices', pricingController.getAllPrices);
router.get('/product/:productId/comparison', pricingController.getPriceComparison);

// Price calculation
router.get('/vendor/:vendorId/product/:productId/calculate', pricingController.calculatePrice);

// Price history
router.get('/product/:productId/history', auth.requireRole(['ADMIN', 'OPERATOR']), pricingController.getPriceHistory);

// Dashboard
router.get('/dashboard', auth.requireRole(['ADMIN', 'OPERATOR']), pricingController.getPricingDashboard);

module.exports = router;
