const express = require('express');
const router = express.Router();
const adminDashboardController = require('../controllers/adminDashboard.controller');
const { authenticate } = require('../middleware/auth');

/**
 * Admin Dashboard Routes
 * 
 * All routes require authentication (admin only recommended)
 */

// Get complete admin dashboard
router.get(
  '/',
  authenticate,
  adminDashboardController.getAdminDashboard
);

// Get top selling items
router.get(
  '/top-selling-items',
  authenticate,
  adminDashboardController.getTopSellingItems
);

// Get vendor performance ranking
router.get(
  '/vendor-performance',
  authenticate,
  adminDashboardController.getVendorPerformance
);

// Get failed orders analysis
router.get(
  '/failed-orders',
  authenticate,
  adminDashboardController.getFailedOrders
);

// Get order processing time
router.get(
  '/processing-time',
  authenticate,
  adminDashboardController.getProcessingTime
);

// Get OCR success rate
router.get(
  '/ocr-success-rate',
  authenticate,
  adminDashboardController.getOCRSuccessRate
);

// Get WhatsApp response time
router.get(
  '/whatsapp-response-time',
  authenticate,
  adminDashboardController.getWhatsAppResponseTime
);

// Get platform overview
router.get(
  '/platform-overview',
  authenticate,
  adminDashboardController.getPlatformOverview
);

module.exports = router;
