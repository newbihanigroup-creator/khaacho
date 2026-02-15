const express = require('express');
const router = express.Router();
const controller = require('../controllers/whatsappIntentDetection.controller');
const { authenticate } = require('../middleware/auth');

/**
 * WhatsApp Intent Detection Routes
 * Base path: /api/whatsapp-intent
 */

// Detect intent (for testing)
router.post('/detect', authenticate, controller.detectIntent);

// Conversation management
router.get('/conversation/:phoneNumber', authenticate, controller.getConversation);
router.put('/conversation/:phoneNumber/context', authenticate, controller.updateContext);
router.post('/conversation/:phoneNumber/pending-action', authenticate, controller.setPendingAction);
router.delete('/conversation/:phoneNumber/pending-action', authenticate, controller.clearPendingAction);

// Analytics
router.get('/statistics', authenticate, controller.getStatistics);
router.get('/conversations/active', authenticate, controller.getActiveConversations);

// Message templates
router.get('/help-message', controller.getHelpMessage);
router.get('/greeting-message', controller.getGreetingMessage);

module.exports = router;
