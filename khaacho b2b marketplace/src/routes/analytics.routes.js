const express = require('express');
const AnalyticsController = require('../controllers/analytics.controller');
const { authenticate, authorize } = require('../middleware/auth');
const validate = require('../middleware/validation');

const router = express.Router();

router.get(
  '/order-trends',
  authenticate,
  authorize('ADMIN', 'OPERATOR'),
  AnalyticsController.orderTrendsValidation,
  validate,
  AnalyticsController.getOrderTrends.bind(AnalyticsController)
);

router.get(
  '/product-performance',
  authenticate,
  authorize('ADMIN', 'OPERATOR'),
  AnalyticsController.getProductPerformance.bind(AnalyticsController)
);

router.get(
  '/retailer/:id',
  authenticate,
  authorize('ADMIN', 'OPERATOR'),
  AnalyticsController.getRetailerAnalytics.bind(AnalyticsController)
);

router.get(
  '/vendor/:id',
  authenticate,
  authorize('ADMIN', 'OPERATOR'),
  AnalyticsController.getVendorAnalytics.bind(AnalyticsController)
);

// ==================== INTELLIGENCE ENDPOINTS ====================

router.get(
  '/ceo-dashboard',
  authenticate,
  authorize('ADMIN'),
  AnalyticsController.getCEODashboard.bind(AnalyticsController)
);

router.get(
  '/intelligence/retailer/:id',
  authenticate,
  authorize('ADMIN', 'OPERATOR'),
  AnalyticsController.getRetailerIntelligence.bind(AnalyticsController)
);

router.get(
  '/intelligence/vendor/:id',
  authenticate,
  authorize('ADMIN', 'OPERATOR'),
  AnalyticsController.getVendorIntelligence.bind(AnalyticsController)
);

router.get(
  '/intelligence/inventory/:id',
  authenticate,
  authorize('ADMIN', 'OPERATOR'),
  AnalyticsController.getInventoryIntelligence.bind(AnalyticsController)
);

router.get(
  '/intelligence/credit',
  authenticate,
  authorize('ADMIN'),
  AnalyticsController.getCreditIntelligence.bind(AnalyticsController)
);

router.get(
  '/forecast/product/:id',
  authenticate,
  authorize('ADMIN', 'OPERATOR'),
  AnalyticsController.getDemandForecast.bind(AnalyticsController)
);

router.get(
  '/forecast/top20',
  authenticate,
  authorize('ADMIN', 'OPERATOR'),
  AnalyticsController.getTop20Forecast.bind(AnalyticsController)
);

// ==================== AGGREGATION JOB TRIGGERS ====================

router.post(
  '/jobs/daily-aggregation',
  authenticate,
  authorize('ADMIN'),
  AnalyticsController.runDailyAggregation.bind(AnalyticsController)
);

router.post(
  '/jobs/monthly-aggregation',
  authenticate,
  authorize('ADMIN'),
  AnalyticsController.runMonthlyAggregation.bind(AnalyticsController)
);

module.exports = router;
