const express = require('express');
const router = express.Router();
const unifiedOrderParserController = require('../controllers/unifiedOrderParser.controller');
const { authenticate } = require('../middleware/auth');

/**
 * Unified Order Parser Routes
 * 
 * All routes require authentication
 */

// Parse WhatsApp order
router.post(
  '/whatsapp',
  authenticate,
  unifiedOrderParserController.parseWhatsApp
);

// Parse OCR order
router.post(
  '/ocr',
  authenticate,
  unifiedOrderParserController.parseOCR
);

// Get parsing result
router.get(
  '/:parsingId',
  authenticate,
  unifiedOrderParserController.getParsingResult
);

// Get retailer history
router.get(
  '/retailer/:retailerId',
  authenticate,
  unifiedOrderParserController.getRetailerHistory
);

// Get statistics
router.get(
  '/statistics',
  authenticate,
  unifiedOrderParserController.getStatistics
);

// Configuration
router.get(
  '/configuration',
  authenticate,
  unifiedOrderParserController.getConfiguration
);

router.put(
  '/configuration/thresholds',
  authenticate,
  unifiedOrderParserController.updateThresholds
);

module.exports = router;
