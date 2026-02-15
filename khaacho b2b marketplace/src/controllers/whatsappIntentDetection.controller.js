const intentDetectionService = require('../services/whatsappIntentDetection.service');
const ApiResponse = require('../utils/response');
const logger = require('../shared/logger');

/**
 * WhatsApp Intent Detection Controller
 * HTTP endpoints for intent detection management and analytics
 */

class WhatsAppIntentDetectionController {
  /**
   * Detect intent from message (for testing)
   * POST /api/whatsapp-intent/detect
   */
  async detectIntent(req, res, next) {
    try {
      const { phoneNumber, messageText, messageId } = req.body;

      if (!phoneNumber || !messageText) {
        return ApiResponse.error(
          res,
          'phoneNumber and messageText are required',
          400
        );
      }

      const result = await intentDetectionService.detectIntent({
        phoneNumber,
        messageText,
        messageId: messageId || `test-${Date.now()}`,
      });

      return ApiResponse.success(res, result, 'Intent detected successfully');
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get conversation by phone number
   * GET /api/whatsapp-intent/conversation/:phoneNumber
   */
  async getConversation(req, res, next) {
    try {
      const { phoneNumber } = req.params;

      const conversation = await intentDetectionService.getConversation(
        phoneNumber
      );

      if (!conversation) {
        return ApiResponse.error(res, 'Conversation not found', 404);
      }

      return ApiResponse.success(
        res,
        conversation,
        'Conversation retrieved successfully'
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update conversation context
   * PUT /api/whatsapp-intent/conversation/:phoneNumber/context
   */
  async updateContext(req, res, next) {
    try {
      const { phoneNumber } = req.params;
      const contextUpdates = req.body;

      const updatedContext = await intentDetectionService.updateContext(
        phoneNumber,
        contextUpdates
      );

      return ApiResponse.success(
        res,
        { context: updatedContext },
        'Context updated successfully'
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * Set pending action
   * POST /api/whatsapp-intent/conversation/:phoneNumber/pending-action
   */
  async setPendingAction(req, res, next) {
    try {
      const { phoneNumber } = req.params;
      const { action, data } = req.body;

      if (!action) {
        return ApiResponse.error(res, 'action is required', 400);
      }

      await intentDetectionService.setPendingAction(phoneNumber, action, data);

      return ApiResponse.success(
        res,
        { phoneNumber, action },
        'Pending action set successfully'
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * Clear pending action
   * DELETE /api/whatsapp-intent/conversation/:phoneNumber/pending-action
   */
  async clearPendingAction(req, res, next) {
    try {
      const { phoneNumber } = req.params;

      await intentDetectionService.clearPendingAction(phoneNumber);

      return ApiResponse.success(
        res,
        { phoneNumber },
        'Pending action cleared successfully'
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get intent statistics
   * GET /api/whatsapp-intent/statistics
   */
  async getStatistics(req, res, next) {
    try {
      const { days = 7 } = req.query;

      const stats = await intentDetectionService.getIntentStatistics(
        parseInt(days, 10)
      );

      return ApiResponse.success(
        res,
        { statistics: stats, days: parseInt(days, 10) },
        'Statistics retrieved successfully'
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get active conversations
   * GET /api/whatsapp-intent/conversations/active
   */
  async getActiveConversations(req, res, next) {
    try {
      const { hours = 24 } = req.query;

      const conversations = await intentDetectionService.getActiveConversations(
        parseInt(hours, 10)
      );

      return ApiResponse.success(
        res,
        {
          conversations,
          hoursThreshold: parseInt(hours, 10),
          count: conversations.length,
        },
        'Active conversations retrieved successfully'
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * Generate help message
   * GET /api/whatsapp-intent/help-message
   */
  async getHelpMessage(req, res, next) {
    try {
      const message = intentDetectionService.generateHelpMessage();

      return ApiResponse.success(
        res,
        { message },
        'Help message generated successfully'
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * Generate greeting response
   * GET /api/whatsapp-intent/greeting-message
   */
  async getGreetingMessage(req, res, next) {
    try {
      const { hasHistory = false } = req.query;

      const message = intentDetectionService.generateGreetingResponse(
        hasHistory === 'true'
      );

      return ApiResponse.success(
        res,
        { message },
        'Greeting message generated successfully'
      );
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new WhatsAppIntentDetectionController();
