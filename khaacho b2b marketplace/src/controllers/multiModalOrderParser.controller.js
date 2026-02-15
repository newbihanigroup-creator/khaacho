/**
 * Multi-Modal Order Parser Controller
 */

const multiModalOrderParserService = require('../services/multiModalOrderParser.service');
const logger = require('../shared/logger');

class MultiModalOrderParserController {
  /**
   * Parse order
   */
  async parseOrder(req, res) {
    try {
      const { inputType, rawInput, retailerId, inputMetadata } = req.body;

      if (!inputType || !rawInput || !retailerId) {
        return res.status(400).json({
          success: false,
          error: 'Input type, raw input, and retailer ID are required',
        });
      }

      const result = await multiModalOrderParserService.parseOrder({
        inputType,
        rawInput,
        retailerId,
        inputMetadata,
      });

      return res.json(result);
    } catch (error) {
      logger.error('Failed to parse order', {
        error: error.message,
      });

      return res.status(500).json({
        success: false,
        error: 'Failed to parse order',
      });
    }
  }

  /**
   * Submit clarifications
   */
  async submitClarifications(req, res) {
    try {
      const { sessionId } = req.params;
      const { responses } = req.body;

      if (!responses || !Array.isArray(responses)) {
        return res.status(400).json({
          success: false,
          error: 'Responses array is required',
        });
      }

      const result = await multiModalOrderParserService.submitClarifications(
        sessionId,
        responses
      );

      return res.json(result);
    } catch (error) {
      logger.error('Failed to submit clarifications', {
        sessionId: req.params.sessionId,
        error: error.message,
      });

      return res.status(500).json({
        success: false,
        error: 'Failed to submit clarifications',
      });
    }
  }

  /**
   * Get parsing session
   */
  async getSession(req, res) {
    try {
      const { sessionId } = req.params;

      const session = await multiModalOrderParserService.getSession(sessionId);

      if (!session) {
        return res.status(404).json({
          success: false,
          error: 'Session not found',
        });
      }

      return res.json({
        success: true,
        data: session,
      });
    } catch (error) {
      logger.error('Failed to get session', {
        sessionId: req.params.sessionId,
        error: error.message,
      });

      return res.status(500).json({
        success: false,
        error: 'Failed to get session',
      });
    }
  }

  /**
   * Add product alias
   */
  async addProductAlias(req, res) {
    try {
      const { productId, aliasName, aliasType } = req.body;

      if (!productId || !aliasName) {
        return res.status(400).json({
          success: false,
          error: 'Product ID and alias name are required',
        });
      }

      const alias = await multiModalOrderParserService.addProductAlias(
        productId,
        aliasName,
        aliasType
      );

      return res.json({
        success: true,
        data: alias,
      });
    } catch (error) {
      logger.error('Failed to add product alias', {
        error: error.message,
      });

      return res.status(500).json({
        success: false,
        error: 'Failed to add product alias',
      });
    }
  }
}

module.exports = new MultiModalOrderParserController();
