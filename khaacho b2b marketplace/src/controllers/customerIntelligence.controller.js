/**
 * Customer Intelligence Controller
 */

const customerIntelligenceService = require('../services/customerIntelligence.service');
const logger = require('../shared/logger');

class CustomerIntelligenceController {
  /**
   * Get customer memory
   */
  async getCustomerMemory(req, res, next) {
    try {
      const { retailerId } = req.params;

      const memory = await customerIntelligenceService.getCustomerMemory(retailerId);

      res.json({
        success: true,
        data: memory,
      });
    } catch (error) {
      logger.error('Get customer memory failed', {
        error: error.message,
      });
      next(error);
    }
  }

  /**
   * Check if should suggest quick reorder
   */
  async checkQuickReorderEligibility(req, res, next) {
    try {
      const { retailerId } = req.params;

      const eligible = await customerIntelligenceService.shouldSuggestQuickReorder(retailerId);

      res.json({
        success: true,
        data: { eligible },
      });
    } catch (error) {
      logger.error('Check quick reorder eligibility failed', {
        error: error.message,
      });
      next(error);
    }
  }

  /**
   * Generate quick reorder suggestion
   */
  async generateQuickReorderSuggestion(req, res, next) {
    try {
      const { retailerId } = req.params;
      const { suggestionType = 'LAST_ORDER' } = req.body;

      const suggestion = await customerIntelligenceService.generateQuickReorderSuggestion(
        retailerId,
        suggestionType
      );

      if (!suggestion) {
        return res.status(404).json({
          success: false,
          message: 'No quick reorder suggestion available',
        });
      }

      res.json({
        success: true,
        data: suggestion,
      });
    } catch (error) {
      logger.error('Generate quick reorder suggestion failed', {
        error: error.message,
      });
      next(error);
    }
  }

  /**
   * Send quick reorder suggestion
   */
  async sendQuickReorderSuggestion(req, res, next) {
    try {
      const { retailerId } = req.params;
      const { phoneNumber } = req.body;

      if (!phoneNumber) {
        return res.status(400).json({
          success: false,
          message: 'Phone number is required',
        });
      }

      const result = await customerIntelligenceService.sendQuickReorderSuggestion(
        retailerId,
        phoneNumber
      );

      res.json({
        success: result.success,
        data: result,
      });
    } catch (error) {
      logger.error('Send quick reorder suggestion failed', {
        error: error.message,
      });
      next(error);
    }
  }

  /**
   * Handle quick reorder response
   */
  async handleQuickReorderResponse(req, res, next) {
    try {
      const { suggestionId } = req.params;
      const { response } = req.body;

      if (!response) {
        return res.status(400).json({
          success: false,
          message: 'Response is required',
        });
      }

      const result = await customerIntelligenceService.handleQuickReorderResponse(
        parseInt(suggestionId),
        response
      );

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      logger.error('Handle quick reorder response failed', {
        error: error.message,
      });
      next(error);
    }
  }

  /**
   * Create order from suggestion
   */
  async createOrderFromSuggestion(req, res, next) {
    try {
      const { suggestionId } = req.params;

      const order = await customerIntelligenceService.createOrderFromSuggestion(
        parseInt(suggestionId)
      );

      res.json({
        success: true,
        data: { orderId: order.id },
        message: 'Order created successfully',
      });
    } catch (error) {
      logger.error('Create order from suggestion failed', {
        error: error.message,
      });
      next(error);
    }
  }

  /**
   * Get frequent buyers
   */
  async getFrequentBuyers(req, res, next) {
    try {
      const { limit = 100, orderFrequencyTier } = req.query;

      const buyers = await customerIntelligenceService.getFrequentBuyers({
        limit: parseInt(limit),
        orderFrequencyTier,
      });

      res.json({
        success: true,
        data: buyers,
        count: buyers.length,
      });
    } catch (error) {
      logger.error('Get frequent buyers failed', {
        error: error.message,
      });
      next(error);
    }
  }

  /**
   * Get conversation context
   */
  async getConversationContext(req, res, next) {
    try {
      const { retailerId } = req.params;

      const context = await customerIntelligenceService.getConversationContext(retailerId);

      res.json({
        success: true,
        data: context,
      });
    } catch (error) {
      logger.error('Get conversation context failed', {
        error: error.message,
      });
      next(error);
    }
  }

  /**
   * Get statistics
   */
  async getStatistics(req, res, next) {
    try {
      const { startDate, endDate } = req.query;

      const stats = await customerIntelligenceService.getStatistics({
        startDate,
        endDate,
      });

      res.json({
        success: true,
        data: stats,
      });
    } catch (error) {
      logger.error('Get statistics failed', {
        error: error.message,
      });
      next(error);
    }
  }

  /**
   * Refresh analytics
   */
  async refreshAnalytics(req, res, next) {
    try {
      const result = await customerIntelligenceService.refreshAnalytics();

      res.json({
        success: true,
        message: 'Analytics refreshed successfully',
      });
    } catch (error) {
      logger.error('Refresh analytics failed', {
        error: error.message,
      });
      next(error);
    }
  }
}

module.exports = new CustomerIntelligenceController();
