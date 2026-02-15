/**
 * Safe Mode Routes
 * 
 * Admin routes for managing safe mode
 */

const express = require('express');
const safeModeController = require('../controllers/safeMode.controller');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

// All routes require admin authentication
router.use(authenticate);
router.use(authorize('ADMIN'));

// Status and control
router.get('/status', safeModeController.getStatus);
router.post('/enable', safeModeController.enable);
router.post('/disable', safeModeController.disable);

// History and metrics
router.get('/history', safeModeController.getHistory);
router.get('/metrics', safeModeController.getMetrics);

// Queued orders
router.get('/queued-orders', safeModeController.getQueuedOrders);
router.get('/queued-orders/summary', safeModeController.getQueuedOrdersSummary);

module.exports = router;
