const express = require('express');
const WhatsAppController = require('../controllers/whatsapp.controller');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

// Meta WhatsApp API webhook (existing)
router.get('/webhook', WhatsAppController.verifyWebhook.bind(WhatsAppController));
router.post('/webhook', WhatsAppController.webhook.bind(WhatsAppController));

// Twilio WhatsApp webhook
router.post('/twilio/webhook', WhatsAppController.twilioWebhook.bind(WhatsAppController));

// Send message endpoints (authenticated)
router.post('/send', 
  authenticate, 
  authorize('ADMIN', 'VENDOR'), 
  WhatsAppController.sendMessage.bind(WhatsAppController)
);

router.post('/order/:orderId/confirmation', 
  authenticate, 
  authorize('ADMIN', 'VENDOR'), 
  WhatsAppController.sendOrderConfirmation.bind(WhatsAppController)
);

module.exports = router;
