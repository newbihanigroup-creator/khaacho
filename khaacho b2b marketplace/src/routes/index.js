const express = require('express');
const authRoutes = require('./auth.routes');
const orderRoutes = require('./order.routes');
const orderLifecycleRoutes = require('./orderLifecycle.routes');
const orderStatusRoutes = require('./orderStatus.routes');
const productRoutes = require('./product.routes');
const creditRoutes = require('./credit.routes');
const creditControlRoutes = require('./creditControl.routes');
const creditLedgerRoutes = require('./creditLedger.routes');
const vendorInventoryRoutes = require('./vendorInventory.routes');
const vendorIntelligenceRoutes = require('./vendorIntelligence.routes');
const financialAccountingRoutes = require('./financialAccounting.routes');
const riskManagementRoutes = require('./riskManagement.routes');
const whatsappRoutes = require('./whatsapp.routes');
const whatsappEnhancedRoutes = require('./whatsappEnhanced.routes');
const dashboardRoutes = require('./dashboard.routes');
const analyticsRoutes = require('./analytics.routes');
const adminRoutes = require('./admin.routes');
const financialMetricsRoutes = require('./financialMetrics.routes');
const creditScoringRoutes = require('./creditScoring.routes');
const riskControlRoutes = require('./riskControl.routes');
const financialExportRoutes = require('./financialExport.routes');
const orderRoutingRoutes = require('./orderRouting.routes');
const vendorPerformanceRoutes = require('./vendorPerformance.routes');
const priceIntelligenceRoutes = require('./priceIntelligence.routes');
const queueRoutes = require('./queue.routes');
const recoveryRoutes = require('./recovery.routes');
const monitoringRoutes = require('./monitoring.routes');
const deliveryRoutes = require('./delivery.routes');
const pricingRoutes = require('./pricing.routes');
const imageUploadRoutes = require('./imageUpload.routes');
const orderValidationRoutes = require('./orderValidation.routes');
const vendorSelectionRoutes = require('./vendorSelection.routes');
const repeatOrderPredictionRoutes = require('./repeatOrderPrediction.routes');
const unifiedOrderParserRoutes = require('./unifiedOrderParser.routes');
const vendorLoadBalancingRoutes = require('./vendorLoadBalancing.routes');
const enhancedCreditScoringRoutes = require('./enhancedCreditScoring.routes');
const adminDashboardRoutes = require('./adminDashboard.routes');
const whatsappIntentDetectionRoutes = require('./whatsappIntentDetection.routes');
const queueAdminRoutes = require('./queueAdmin.routes');
const orderTimeoutRoutes = require('./orderTimeout.routes');
const hardenedWhatsappRoutes = require('./hardenedWhatsapp.routes');
const safeModeRoutes = require('./safeMode.routes');
const vendorScoringRoutes = require('./vendorScoring.routes');
const orderBatchingRoutes = require('./orderBatching.routes');
const multiModalOrderParserRoutes = require('./multiModalOrderParser.routes');
const customerIntelligenceRoutes = require('./customerIntelligence.routes');
const selfHealingRoutes = require('./selfHealing.routes');

/**
 * Create main router with health service
 * Health routes are initialized separately in server.js
 * 
 * @param {Object} options - Router options
 * @param {Object} options.healthRoutes - Health routes (optional)
 * @returns {express.Router} Express router
 */
function createRouter(options = {}) {
  const router = express.Router();

  // Health routes (if provided, mount at root level)
  if (options.healthRoutes) {
    router.use('/', options.healthRoutes);
  }

router.use('/auth', authRoutes);
router.use('/orders', orderRoutes);
router.use('/order-lifecycle', orderLifecycleRoutes);
router.use('/order-status', orderStatusRoutes);
router.use('/order-routing', orderRoutingRoutes);
router.use('/products', productRoutes);
router.use('/credit', creditRoutes);
router.use('/credit-control', creditControlRoutes);
router.use('/credit-ledger', creditLedgerRoutes);
router.use('/vendor-inventory', vendorInventoryRoutes);
router.use('/vendor-intelligence', vendorIntelligenceRoutes);
router.use('/financial-accounting', financialAccountingRoutes);
router.use('/risk-management', riskManagementRoutes);
router.use('/whatsapp', whatsappRoutes);
router.use('/whatsapp/enhanced', whatsappEnhancedRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/analytics', analyticsRoutes);
router.use('/admin', adminRoutes);
router.use('/financial-metrics', financialMetricsRoutes);
router.use('/credit-scoring', creditScoringRoutes);
router.use('/risk-control', riskControlRoutes);
router.use('/financial-export', financialExportRoutes);
router.use('/vendor-performance', vendorPerformanceRoutes);
router.use('/price-intelligence', priceIntelligenceRoutes);
router.use('/queues', queueRoutes);
router.use('/recovery', recoveryRoutes);
router.use('/monitoring', monitoringRoutes);
router.use('/delivery', deliveryRoutes);
router.use('/pricing', pricingRoutes);
router.use('/orders', imageUploadRoutes);
router.use('/order-validation', orderValidationRoutes);
router.use('/vendor-selection', vendorSelectionRoutes);
router.use('/repeat-order-prediction', repeatOrderPredictionRoutes);
router.use('/unified-order-parser', unifiedOrderParserRoutes);
router.use('/load-balancing', vendorLoadBalancingRoutes);
router.use('/enhanced-credit-scoring', enhancedCreditScoringRoutes);
router.use('/admin-dashboard', adminDashboardRoutes);
router.use('/whatsapp-intent', whatsappIntentDetectionRoutes);
router.use('/queue-admin', queueAdminRoutes);
router.use('/admin/order-timeout', orderTimeoutRoutes);
router.use('/whatsapp/hardened', hardenedWhatsappRoutes);
router.use('/admin/safe-mode', safeModeRoutes);
router.use('/vendor-scoring', vendorScoringRoutes);
router.use('/order-batching', orderBatchingRoutes);
router.use('/order-parser', multiModalOrderParserRoutes);
router.use('/customer-intelligence', customerIntelligenceRoutes);
router.use('/self-healing', selfHealingRoutes);

  return router;
}

// Export factory function for flexibility
module.exports = createRouter;

// Also export default router for backward compatibility
module.exports.default = createRouter();
