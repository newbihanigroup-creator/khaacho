const vendorSelectionService = require('../services/vendorSelection.service');
const logger = require('../utils/logger');

class VendorSelectionController {
  /**
   * Select vendors for order items
   * POST /api/vendor-selection/select
   */
  async selectVendorsForOrder(req, res) {
    try {
      const { items, options = {} } = req.body;

      if (!items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Items array is required',
        });
      }

      // Validate items
      for (const item of items) {
        if (!item.productId || !item.quantity) {
          return res.status(400).json({
            success: false,
            message: 'Each item must have productId and quantity',
          });
        }
      }

      const result = await vendorSelectionService.selectVendorsForOrder(items, options);

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      logger.error('Vendor selection failed', {
        error: error.message,
        stack: error.stack,
      });

      res.status(500).json({
        success: false,
        message: 'Vendor selection failed',
        error: error.message,
      });
    }
  }

  /**
   * Rank vendors for a specific product
   * GET /api/vendor-selection/rank/:productId
   */
  async rankVendorsForProduct(req, res) {
    try {
      const { productId } = req.params;
      const { quantity = 1, topN = 3, minReliabilityScore = 60 } = req.query;

      const vendors = await vendorSelectionService.rankVendorsForProduct(
        productId,
        parseInt(quantity),
        {
          topN: parseInt(topN),
          minReliabilityScore: parseInt(minReliabilityScore),
        }
      );

      res.json({
        success: true,
        data: {
          productId,
          quantity: parseInt(quantity),
          vendors,
          count: vendors.length,
        },
      });
    } catch (error) {
      logger.error('Vendor ranking failed', {
        productId: req.params.productId,
        error: error.message,
      });

      res.status(500).json({
        success: false,
        message: 'Vendor ranking failed',
        error: error.message,
      });
    }
  }

  /**
   * Split order by vendor
   * POST /api/vendor-selection/split
   */
  async splitOrderByVendor(req, res) {
    try {
      const { items, vendorSelections } = req.body;

      if (!items || !vendorSelections) {
        return res.status(400).json({
          success: false,
          message: 'Items and vendorSelections are required',
        });
      }

      const splitOrders = await vendorSelectionService.splitOrderByVendor(
        items,
        vendorSelections
      );

      res.json({
        success: true,
        data: {
          splitOrders,
          vendorCount: splitOrders.length,
          totalItems: items.length,
        },
      });
    } catch (error) {
      logger.error('Order splitting failed', {
        error: error.message,
      });

      res.status(500).json({
        success: false,
        message: 'Order splitting failed',
        error: error.message,
      });
    }
  }

  /**
   * Store routing decision
   * POST /api/vendor-selection/routing-decision
   */
  async storeRoutingDecision(req, res) {
    try {
      const { orderId, routingData } = req.body;

      if (!orderId || !routingData) {
        return res.status(400).json({
          success: false,
          message: 'orderId and routingData are required',
        });
      }

      const routingLog = await vendorSelectionService.storeRoutingDecision(
        orderId,
        routingData
      );

      res.json({
        success: true,
        data: routingLog,
      });
    } catch (error) {
      logger.error('Failed to store routing decision', {
        orderId: req.body.orderId,
        error: error.message,
      });

      res.status(500).json({
        success: false,
        message: 'Failed to store routing decision',
        error: error.message,
      });
    }
  }

  /**
   * Get routing decision for an order
   * GET /api/vendor-selection/routing-decision/:orderId
   */
  async getRoutingDecision(req, res) {
    try {
      const { orderId } = req.params;

      const routingLog = await vendorSelectionService.getRoutingDecision(orderId);

      if (!routingLog) {
        return res.status(404).json({
          success: false,
          message: 'Routing decision not found',
        });
      }

      res.json({
        success: true,
        data: routingLog,
      });
    } catch (error) {
      logger.error('Failed to get routing decision', {
        orderId: req.params.orderId,
        error: error.message,
      });

      res.status(500).json({
        success: false,
        message: 'Failed to get routing decision',
        error: error.message,
      });
    }
  }

  /**
   * Get current ranking weights
   * GET /api/vendor-selection/weights
   */
  async getRankingWeights(req, res) {
    try {
      const weights = vendorSelectionService.getRankingWeights();

      res.json({
        success: true,
        data: weights,
      });
    } catch (error) {
      logger.error('Failed to get ranking weights', {
        error: error.message,
      });

      res.status(500).json({
        success: false,
        message: 'Failed to get ranking weights',
        error: error.message,
      });
    }
  }

  /**
   * Update ranking weights (for ML improvements)
   * PUT /api/vendor-selection/weights
   */
  async updateRankingWeights(req, res) {
    try {
      const { weights } = req.body;

      if (!weights || typeof weights !== 'object') {
        return res.status(400).json({
          success: false,
          message: 'Weights object is required',
        });
      }

      const updatedWeights = await vendorSelectionService.updateRankingWeights(weights);

      res.json({
        success: true,
        data: updatedWeights,
        message: 'Ranking weights updated successfully',
      });
    } catch (error) {
      logger.error('Failed to update ranking weights', {
        error: error.message,
      });

      res.status(400).json({
        success: false,
        message: error.message,
      });
    }
  }

  /**
   * Complete vendor selection and order splitting workflow
   * POST /api/vendor-selection/complete-workflow
   */
  async completeWorkflow(req, res) {
    try {
      const { orderId, retailerId, items, options = {} } = req.body;

      if (!items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Items array is required',
        });
      }

      // Step 1: Select vendors for each item
      const vendorSelections = await vendorSelectionService.selectVendorsForOrder(
        items,
        { ...options, retailerId }
      );

      // Step 2: Split order by vendor
      const splitOrders = await vendorSelectionService.splitOrderByVendor(
        items,
        vendorSelections
      );

      // Step 3: Store routing decision (if orderId provided)
      let routingLog = null;
      if (orderId) {
        routingLog = await vendorSelectionService.storeRoutingDecision(orderId, {
          retailerId,
          items,
          vendorSelections,
          splitOrders,
          weights: options.weights || vendorSelectionService.getRankingWeights(),
        });
      }

      res.json({
        success: true,
        data: {
          vendorSelections,
          splitOrders,
          routingLog,
          summary: {
            totalItems: items.length,
            vendorCount: splitOrders.length,
            itemsPerVendor: splitOrders.map(so => ({
              vendorId: so.vendorId,
              vendorName: so.vendorInfo.businessName || so.vendorInfo.vendorName,
              itemCount: so.items.length,
              totalValue: so.items.reduce(
                (sum, item) => sum + item.unitPrice * item.quantity,
                0
              ),
            })),
          },
        },
      });
    } catch (error) {
      logger.error('Complete workflow failed', {
        error: error.message,
        stack: error.stack,
      });

      res.status(500).json({
        success: false,
        message: 'Workflow failed',
        error: error.message,
      });
    }
  }
}

module.exports = new VendorSelectionController();
