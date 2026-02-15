const logger = require('../shared/logger');
const enhancedCreditScoring = require('../services/enhancedCreditScoring.service');

/**
 * Enhanced Credit Scoring Controller
 * HTTP handlers for enhanced credit scoring endpoints
 */

class EnhancedCreditScoringController {
  /**
   * Check if order should be restricted
   * POST /api/enhanced-credit-scoring/check-restriction
   */
  async checkOrderRestriction(req, res) {
    try {
      const { retailerId, orderAmount } = req.body;

      if (!retailerId || !orderAmount) {
        return res.status(400).json({
          success: false,
          error: 'retailerId and orderAmount are required',
        });
      }

      const result = await enhancedCreditScoring.checkOrderRestriction(
        retailerId,
        orderAmount
      );

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      logger.error('Check order restriction failed', {
        error: error.message,
        stack: error.stack,
      });

      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * Process automatic credit adjustment for retailer
   * POST /api/enhanced-credit-scoring/:retailerId/auto-adjust
   */
  async processAutomaticAdjustment(req, res) {
    try {
      const { retailerId } = req.params;

      const result = await enhancedCreditScoring.processAutomaticCreditAdjustment(
        retailerId
      );

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      logger.error('Automatic adjustment failed', {
        retailerId: req.params.retailerId,
        error: error.message,
      });

      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }


  /**
   * Update credit score and trigger automatic adjustment
   * POST /api/enhanced-credit-scoring/:retailerId/update-score
   */
  async updateCreditScoreAndAdjust(req, res) {
    try {
      const { retailerId } = req.params;

      const result = await enhancedCreditScoring.updateCreditScoreAndAdjust(
        retailerId
      );

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      logger.error('Update credit score failed', {
        retailerId: req.params.retailerId,
        error: error.message,
      });

      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * Process all retailers for automatic adjustments
   * POST /api/enhanced-credit-scoring/process-all
   */
  async processAllAutomaticAdjustments(req, res) {
    try {
      // Start processing in background
      enhancedCreditScoring.processAllAutomaticAdjustments().catch(error => {
        logger.error('Background processing failed', {
          error: error.message,
        });
      });

      res.json({
        success: true,
        message: 'Automatic adjustments processing started in background',
      });
    } catch (error) {
      logger.error('Process all adjustments failed', {
        error: error.message,
      });

      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * Get retailer credit summary
   * GET /api/enhanced-credit-scoring/:retailerId/summary
   */
  async getRetailerCreditSummary(req, res) {
    try {
      const { retailerId } = req.params;

      const summary = await enhancedCreditScoring.getRetailerCreditSummary(
        retailerId
      );

      res.json({
        success: true,
        data: summary,
      });
    } catch (error) {
      logger.error('Get credit summary failed', {
        retailerId: req.params.retailerId,
        error: error.message,
      });

      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * Get credit adjustment history
   * GET /api/enhanced-credit-scoring/:retailerId/adjustment-history
   */
  async getCreditAdjustmentHistory(req, res) {
    try {
      const { retailerId } = req.params;
      const limit = parseInt(req.query.limit) || 50;

      const history = await enhancedCreditScoring.getCreditAdjustmentHistory(
        retailerId,
        limit
      );

      res.json({
        success: true,
        data: history,
      });
    } catch (error) {
      logger.error('Get adjustment history failed', {
        retailerId: req.params.retailerId,
        error: error.message,
      });

      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * Get order restrictions log
   * GET /api/enhanced-credit-scoring/:retailerId/restrictions-log
   */
  async getOrderRestrictionsLog(req, res) {
    try {
      const { retailerId } = req.params;
      const limit = parseInt(req.query.limit) || 50;

      const log = await enhancedCreditScoring.getOrderRestrictionsLog(
        retailerId,
        limit
      );

      res.json({
        success: true,
        data: log,
      });
    } catch (error) {
      logger.error('Get restrictions log failed', {
        retailerId: req.params.retailerId,
        error: error.message,
      });

      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * Manual credit limit adjustment
   * POST /api/enhanced-credit-scoring/:retailerId/manual-adjust
   */
  async manualCreditAdjustment(req, res) {
    try {
      const { retailerId } = req.params;
      const { newLimit, reason } = req.body;
      const approvedBy = req.user?.id; // From auth middleware

      if (!newLimit || !reason) {
        return res.status(400).json({
          success: false,
          error: 'newLimit and reason are required',
        });
      }

      const result = await enhancedCreditScoring.manualCreditAdjustment(
        retailerId,
        newLimit,
        reason,
        approvedBy
      );

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      logger.error('Manual adjustment failed', {
        retailerId: req.params.retailerId,
        error: error.message,
      });

      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * Get credit score statistics
   * GET /api/enhanced-credit-scoring/statistics
   */
  async getCreditScoreStatistics(req, res) {
    try {
      const stats = await enhancedCreditScoring.getCreditScoreStatistics();

      res.json({
        success: true,
        data: stats,
      });
    } catch (error) {
      logger.error('Get statistics failed', {
        error: error.message,
      });

      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }
}

module.exports = new EnhancedCreditScoringController();
