/**
 * Order Batching Controller
 * 
 * Endpoints for order batching management
 */

const orderBatchingService = require('../services/orderBatching.service');
const logger = require('../shared/logger');

class OrderBatchingController {
  /**
   * Create batch
   */
  async createBatch(req, res) {
    try {
      const { vendorId, centerLocation } = req.body;

      if (!vendorId || !centerLocation) {
        return res.status(400).json({
          success: false,
          error: 'Vendor ID and center location are required',
        });
      }

      const batch = await orderBatchingService.createBatch(vendorId, centerLocation);

      if (!batch) {
        return res.status(400).json({
          success: false,
          error: 'Not enough orders for batching',
        });
      }

      return res.json({
        success: true,
        data: batch,
      });
    } catch (error) {
      logger.error('Failed to create batch', {
        error: error.message,
      });

      return res.status(500).json({
        success: false,
        error: 'Failed to create batch',
      });
    }
  }

  /**
   * Get batch details
   */
  async getBatchDetails(req, res) {
    try {
      const { batchId } = req.params;

      const batch = await orderBatchingService.getBatchDetails(batchId);

      if (!batch) {
        return res.status(404).json({
          success: false,
          error: 'Batch not found',
        });
      }

      return res.json({
        success: true,
        data: batch,
      });
    } catch (error) {
      logger.error('Failed to get batch details', {
        batchId: req.params.batchId,
        error: error.message,
      });

      return res.status(500).json({
        success: false,
        error: 'Failed to get batch details',
      });
    }
  }

  /**
   * Get active batches
   */
  async getActiveBatches(req, res) {
    try {
      const { vendorId } = req.query;

      const batches = await orderBatchingService.getActiveBatches(vendorId);

      return res.json({
        success: true,
        data: batches,
      });
    } catch (error) {
      logger.error('Failed to get active batches', {
        error: error.message,
      });

      return res.status(500).json({
        success: false,
        error: 'Failed to get active batches',
      });
    }
  }

  /**
   * Confirm batch
   */
  async confirmBatch(req, res) {
    try {
      const { batchId } = req.params;

      const batch = await orderBatchingService.confirmBatch(batchId);

      return res.json({
        success: true,
        message: 'Batch confirmed',
        data: batch,
      });
    } catch (error) {
      logger.error('Failed to confirm batch', {
        batchId: req.params.batchId,
        error: error.message,
      });

      return res.status(500).json({
        success: false,
        error: 'Failed to confirm batch',
      });
    }
  }

  /**
   * Dispatch batch
   */
  async dispatchBatch(req, res) {
    try {
      const { batchId } = req.params;
      const deliveryDetails = req.body;

      const batch = await orderBatchingService.dispatchBatch(batchId, deliveryDetails);

      return res.json({
        success: true,
        message: 'Batch dispatched',
        data: batch,
      });
    } catch (error) {
      logger.error('Failed to dispatch batch', {
        batchId: req.params.batchId,
        error: error.message,
      });

      return res.status(500).json({
        success: false,
        error: 'Failed to dispatch batch',
      });
    }
  }

  /**
   * Mark batch as delivered
   */
  async markBatchDelivered(req, res) {
    try {
      const { batchId } = req.params;

      const batch = await orderBatchingService.markBatchDelivered(batchId);

      return res.json({
        success: true,
        message: 'Batch marked as delivered',
        data: batch,
      });
    } catch (error) {
      logger.error('Failed to mark batch as delivered', {
        batchId: req.params.batchId,
        error: error.message,
      });

      return res.status(500).json({
        success: false,
        error: 'Failed to mark batch as delivered',
      });
    }
  }

  /**
   * Get batch savings summary
   */
  async getBatchSavingsSummary(req, res) {
    try {
      const { days = 30 } = req.query;

      const summary = await orderBatchingService.getBatchSavingsSummary(parseInt(days));

      return res.json({
        success: true,
        data: summary,
      });
    } catch (error) {
      logger.error('Failed to get batch savings summary', {
        error: error.message,
      });

      return res.status(500).json({
        success: false,
        error: 'Failed to get batch savings summary',
      });
    }
  }

  /**
   * Get product batching efficiency
   */
  async getProductBatchingEfficiency(req, res) {
    try {
      const efficiency = await orderBatchingService.getProductBatchingEfficiency();

      return res.json({
        success: true,
        data: efficiency,
      });
    } catch (error) {
      logger.error('Failed to get product batching efficiency', {
        error: error.message,
      });

      return res.status(500).json({
        success: false,
        error: 'Failed to get product batching efficiency',
      });
    }
  }

  /**
   * Auto-batch pending orders
   */
  async autoBatchPendingOrders(req, res) {
    try {
      const { vendorId } = req.body;

      if (!vendorId) {
        return res.status(400).json({
          success: false,
          error: 'Vendor ID is required',
        });
      }

      const batches = await orderBatchingService.autoBatchPendingOrders(vendorId);

      return res.json({
        success: true,
        message: `Created ${batches.length} batch(es)`,
        data: batches,
      });
    } catch (error) {
      logger.error('Failed to auto-batch pending orders', {
        error: error.message,
      });

      return res.status(500).json({
        success: false,
        error: 'Failed to auto-batch pending orders',
      });
    }
  }

  /**
   * Get batching configuration
   */
  async getConfig(req, res) {
    try {
      const config = await orderBatchingService.getConfig();

      return res.json({
        success: true,
        data: config,
      });
    } catch (error) {
      logger.error('Failed to get batching config', {
        error: error.message,
      });

      return res.status(500).json({
        success: false,
        error: 'Failed to get batching configuration',
      });
    }
  }
}

module.exports = new OrderBatchingController();
