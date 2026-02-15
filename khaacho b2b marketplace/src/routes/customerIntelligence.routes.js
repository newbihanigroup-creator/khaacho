/**
 * Customer Intelligence Routes
 */

const express = require('express');
const customerIntelligenceController = require('../controllers/customerIntelligence.controller');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Customer memory
router.get(
  '/memory/:retailerId',
  customerIntelligenceController.getCustomerMemory
);

// Quick reorder
router.get(
  '/quick-reorder/:retailerId/check',
  customerIntelligenceController.checkQuickReorderEligibility
);

router.post(
  '/quick-reorder/:retailerId/generate',
  customerIntelligenceController.generateQuickReorderSuggestion
);

router.post(
  '/quick-reorder/:retailerId/send',
  customerIntelligenceController.sendQuickReorderSuggestion
);

router.post(
  '/quick-reorder/suggestions/:suggestionId/respond',
  customerIntelligenceController.handleQuickReorderResponse
);

router.post(
  '/quick-reorder/suggestions/:suggestionId/create-order',
  customerIntelligenceController.createOrderFromSuggestion
);

// Frequent buyers
router.get(
  '/frequent-buyers',
  authorize('ADMIN', 'MANAGER'),
  customerIntelligenceController.getFrequentBuyers
);

// Conversation
router.get(
  '/conversation/:retailerId',
  customerIntelligenceController.getConversationContext
);

// Statistics
router.get(
  '/statistics',
  authorize('ADMIN', 'MANAGER'),
  customerIntelligenceController.getStatistics
);

// Analytics
router.post(
  '/analytics/refresh',
  authorize('ADMIN'),
  customerIntelligenceController.refreshAnalytics
);

module.exports = router;
