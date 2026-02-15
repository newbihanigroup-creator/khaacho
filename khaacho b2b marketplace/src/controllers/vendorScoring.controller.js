/**
 * Vendor Scoring Controller
 * 
 * Admin endpoints for vendor scoring system
 */

const vendorScoringService = require('../services/vendorScoring.service');
const logger = require('../shared/logger');

class VendorScoringController {
  /**
   * Get vendor score
   */
  async getVendorScore(req, res) {
    try {
      const { vendorId } = req.params;

      const score = await vendorScoringService.getVendorScore(vendorId);

      if (!score) {
        return res.status(404).json({
          success: false,
          error: 'Vendor score not found',
        });
      }

      return res.json({
        success: true,
        data: score,
      });
    } catch (error) {
      logger.error('Failed to get vendor score', {
        vendorId: req.params.vendorId,
        error: error.message,
      });

      return res.status(500).json({
        success: false,
        error: 'Failed to get vendor score',
      });
    }
  }

  /**
   * Get vendor score history
   */
  async getVendorScoreHistory(req, res) {
    try {
      const { vendorId } = req.params;
      const { days = 30 } = req.query;

      const history = await vendorScoringService.getVendorScoreHistory(
        vendorId,
        parseInt(days)
      );

      return res.json({
        success: true,
        data: history,
      });
    } catch (error) {
      logger.error('Failed to get vendor score history', {
        vendorId: req.params.vendorId,
        error: error.message,
      });

      return res.status(500).json({
        success: false,
        error: 'Failed to get vendor score history',
      });
    }
  }

  /**
   * Get vendor performance summary
   */
  async getVendorPerformanceSummary(req, res) {
    try {
      const { vendorId } = req.params;

      const summary = await vendorScoringService.getVendorPerformanceSummary(vendorId);

      return res.json({
        success: true,
        data: summary,
      });
    } catch (error) {
      logger.error('Failed to get vendor performance summary', {
        vendorId: req.params.vendorId,
        error: error.message,
      });

      return res.status(500).json({
        success: false,
        error: 'Failed to get vendor performance summary',
      });
    }
  }

  /**
   * Get top vendors
   */
  async getTopVendors(req, res) {
    try {
      const { limit = 10 } = req.query;

      const vendors = await vendorScoringService.getTopVendors(parseInt(limit));

      return res.json({
        success: true,
        data: vendors,
      });
    } catch (error) {
      logger.error('Failed to get top vendors', {
        error: error.message,
      });

      return res.status(500).json({
        success: false,
        error: 'Failed to get top vendors',
      });
    }
  }

  /**
   * Get best vendors for product
   */
  async getBestVendorsForProduct(req, res) {
    try {
      const { productId } = req.params;
      const { limit = 5 } = req.query;

      const vendors = await vendorScoringService.getBestVendorsForProduct(
        productId,
        parseInt(limit)
      );

      return res.json({
        success: true,
        data: vendors,
      });
    } catch (error) {
      logger.error('Failed to get best vendors for product', {
        productId: req.params.productId,
        error: error.message,
      });

      return res.status(500).json({
        success: false,
        error: 'Failed to get best vendors for product',
      });
    }
  }

  /**
   * Initialize vendor score
   */
  async initializeVendorScore(req, res) {
    try {
      const { vendorId } = req.params;

      await vendorScoringService.initializeVendorScore(vendorId);

      return res.json({
        success: true,
        message: 'Vendor score initialized',
      });
    } catch (error) {
      logger.error('Failed to initialize vendor score', {
        vendorId: req.params.vendorId,
        error: error.message,
      });

      return res.status(500).json({
        success: false,
        error: 'Failed to initialize vendor score',
      });
    }
  }

  /**
   * Manually update vendor score
   */
  async updateVendorScore(req, res) {
    try {
      const { vendorId } = req.params;
      const { triggerEvent = 'MANUAL_UPDATE', orderId = null } = req.body;

      await vendorScoringService.updateVendorScore(vendorId, triggerEvent, orderId);

      return res.json({
        success: true,
        message: 'Vendor score updated',
      });
    } catch (error) {
      logger.error('Failed to update vendor score', {
        vendorId: req.params.vendorId,
        error: error.message,
      });

      return res.status(500).json({
        success: false,
        error: 'Failed to update vendor score',
      });
    }
  }

  /**
   * Get scoring configuration
   */
  async getConfig(req, res) {
    try {
      const config = await vendorScoringService.getConfig();

      return res.json({
        success: true,
        data: config,
      });
    } catch (error) {
      logger.error('Failed to get scoring config', {
        error: error.message,
      });

      return res.status(500).json({
        success: false,
        error: 'Failed to get scoring configuration',
      });
    }
  }
}

module.exports = new VendorScoringController();
