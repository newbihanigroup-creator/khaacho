/**
 * Hardened WhatsApp Webhook Routes
 * 
 * Production-ready webhook endpoints with security hardening
 */

const express = require('express');
const hardenedWhatsappController = require('../controllers/hardenedWhatsapp.controller');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

// ============================================================================
// WEBHOOK ENDPOINTS (No authentication - validated by signature)
// ============================================================================

// Meta WhatsApp API webhook verification
router.get(
  '/webhook',
  hardenedWhatsappController.verifyWebhook.bind(hardenedWhatsappController)
);

// Meta WhatsApp API webhook handler
router.post(
  '/webhook',
  hardenedWhatsappController.webhook.bind(hardenedWhatsappController)
);

// Twilio WhatsApp webhook handler
router.post(
  '/twilio/webhook',
  hardenedWhatsappController.twilioWebhook.bind(hardenedWhatsappController)
);

// ============================================================================
// ADMIN ENDPOINTS (Authenticated)
// ============================================================================

// Get webhook statistics
router.get(
  '/stats',
  authenticate,
  authorize('ADMIN'),
  hardenedWhatsappController.getWebhookStats.bind(hardenedWhatsappController)
);

module.exports = router;
