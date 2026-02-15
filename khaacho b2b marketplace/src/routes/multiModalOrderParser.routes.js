/**
 * Multi-Modal Order Parser Routes
 */

const express = require('express');
const multiModalOrderParserController = require('../controllers/multiModalOrderParser.controller');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// All routes require authentication
router.use(authenticate);

router.post('/parse', multiModalOrderParserController.parseOrder);
router.post('/sessions/:sessionId/clarify', multiModalOrderParserController.submitClarifications);
router.get('/sessions/:sessionId', multiModalOrderParserController.getSession);
router.post('/aliases', multiModalOrderParserController.addProductAlias);

module.exports = router;
