/**
 * Order Batching Routes
 */

const express = require('express');
const orderBatchingController = require('../controllers/orderBatching.controller');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Admin/vendor routes
router.get('/config', orderBatchingController.getConfig);
router.get('/active', orderBatchingController.getActiveBatches);
router.get('/savings-summary', orderBatchingController.getBatchSavingsSummary);
router.get('/product-efficiency', orderBatchingController.getProductBatchingEfficiency);
router.get('/:batchId', orderBatchingController.getBatchDetails);

router.post('/create', orderBatchingController.createBatch);
router.post('/auto-batch', orderBatchingController.autoBatchPendingOrders);
router.post('/:batchId/confirm', orderBatchingController.confirmBatch);
router.post('/:batchId/dispatch', orderBatchingController.dispatchBatch);
router.post('/:batchId/delivered', orderBatchingController.markBatchDelivered);

module.exports = router;
