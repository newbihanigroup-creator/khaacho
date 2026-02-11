const express = require('express');
const router = express.Router();
const vendorInventoryController = require('../controllers/vendorInventory.controller');
const auth = require('../middleware/auth');

// Vendor inventory management
router.get('/vendor/:vendorId/inventory', auth.requireRole(['ADMIN', 'OPERATOR', 'VENDOR']), vendorInventoryController.getVendorInventory);
router.put('/vendor/:vendorId/inventory', auth.requireRole(['ADMIN', 'OPERATOR', 'VENDOR']), vendorInventoryController.updateVendorInventory);
router.post('/vendor/:vendorId/inventory/bulk', auth.requireRole(['ADMIN', 'OPERATOR', 'VENDOR']), vendorInventoryController.bulkUpdateInventory);
router.put('/vendor/:vendorId/product/:productId/out-of-stock', auth.requireRole(['ADMIN', 'OPERATOR', 'VENDOR']), vendorInventoryController.markOutOfStock);

// Price comparison
router.get('/product/:productId/price-comparison', auth.requireRole(['ADMIN', 'OPERATOR', 'VENDOR']), vendorInventoryController.getPriceComparison);

// Alerts and dashboard
router.get('/vendor/:vendorId/low-stock-alerts', auth.requireRole(['ADMIN', 'OPERATOR', 'VENDOR']), vendorInventoryController.getLowStockAlerts);
router.get('/inventory-dashboard', auth.requireRole(['ADMIN', 'OPERATOR']), vendorInventoryController.getInventoryDashboard);

module.exports = router;
