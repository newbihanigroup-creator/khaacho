const logger = require('../shared/logger');
const prisma = require('../config/database');
const unifiedOrderParser = require('../services/unifiedOrderParser.service');

/**
 * Unified Order Parser Controller
 * HTTP handlers for order parsing endpoints
 */

class UnifiedOrderParserController {
  /**
   * Parse order from WhatsApp text
   * POST /api/parse/whatsapp
   */
  async parseWhatsApp(req, res) {
    try {
      const { rawText, retailerId, orderId } = req.body;

      logger.info('Parsing WhatsApp order', {
        retailerId,
        orderId,
        textLength: rawText?.length,
      });

      const result = await unifiedOrderParser.parseOrder({
        source: 'whatsapp',
        rawText,
        retailerId,
        orderId,
      });

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      logger.error('WhatsApp parsing failed', {
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
   * Parse order from OCR text
   * POST /api/parse/ocr
   */
  async parseOCR(req, res) {
    try {
      const { rawText, retailerId, orderId } = req.body;

      logger.info('Parsing OCR order', {
        retailerId,
        orderId,
        textLength: rawText?.length,
      });

      const result = await unifiedOrderParser.parseOrder({
        source: 'ocr',
        rawText,
        retailerId,
        orderId,
      });

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      logger.error('OCR parsing failed', {
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
   * Get parsing result by ID
   * GET /api/parse/:parsingId
   */
  async getParsingResult(req, res) {
    try {
      const { parsingId } = req.params;

      logger.info('Getting parsing result', { parsingId });

      const result = await unifiedOrderParser.getParsingResult(parsingId);

      if (!result) {
        return res.status(404).json({
          success: false,
          error: 'Parsing result not found',
        });
      }

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      logger.error('Failed to get parsing result', {
        error: error.message,
      });

      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * Get parsing history for retailer
   * GET /api/parse/retailer/:retailerId
   */
  async getRetailerHistory(req, res) {
    try {
      const { retailerId } = req.params;
      const { limit = 20, offset = 0, source } = req.query;

      logger.info('Getting retailer parsing history', {
        retailerId,
        limit,
        offset,
        source,
      });

      const where = { retailerId };
      if (source) {
        where.source = source;
      }

      const [results, total] = await Promise.all([
        prisma.orderParsingLog.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          take: parseInt(limit),
          skip: parseInt(offset),
        }),
        prisma.orderParsingLog.count({ where }),
      ]);

      res.json({
        success: true,
        data: {
          results,
          total,
          limit: parseInt(limit),
          offset: parseInt(offset),
        },
      });
    } catch (error) {
      logger.error('Failed to get retailer history', {
        error: error.message,
      });

      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * Get parsing statistics
   * GET /api/parse/statistics
   */
  async getStatistics(req, res) {
    try {
      const { retailerId, startDate, endDate, source } = req.query;

      logger.info('Getting parsing statistics', {
        retailerId,
        startDate,
        endDate,
        source,
      });

      const where = {};
      if (retailerId) where.retailerId = retailerId;
      if (source) where.source = source;
      if (startDate || endDate) {
        where.createdAt = {};
        if (startDate) where.createdAt.gte = new Date(startDate);
        if (endDate) where.createdAt.lte = new Date(endDate);
      }

      const [
        total,
        bySource,
        byStatus,
        avgConfidence,
        needsClarification,
      ] = await Promise.all([
        prisma.orderParsingLog.count({ where }),
        prisma.orderParsingLog.groupBy({
          by: ['source'],
          where,
          _count: true,
        }),
        prisma.orderParsingLog.groupBy({
          by: ['status'],
          where,
          _count: true,
        }),
        prisma.orderParsingLog.aggregate({
          where,
          _avg: { overallConfidence: true },
        }),
        prisma.orderParsingLog.count({
          where: { ...where, needsClarification: true },
        }),
      ]);

      res.json({
        success: true,
        data: {
          total,
          bySource: bySource.reduce((acc, item) => {
            acc[item.source] = item._count;
            return acc;
          }, {}),
          byStatus: byStatus.reduce((acc, item) => {
            acc[item.status] = item._count;
            return acc;
          }, {}),
          averageConfidence: avgConfidence._avg.overallConfidence || 0,
          needsClarification,
          clarificationRate: total > 0 ? (needsClarification / total) * 100 : 0,
        },
      });
    } catch (error) {
      logger.error('Failed to get statistics', {
        error: error.message,
      });

      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * Update parsing thresholds
   * PUT /api/parse/configuration/thresholds
   */
  async updateThresholds(req, res) {
    try {
      const { thresholds } = req.body;

      logger.info('Updating parsing thresholds', { thresholds });

      unifiedOrderParser.updateThresholds(thresholds);

      res.json({
        success: true,
        message: 'Thresholds updated',
        data: unifiedOrderParser.getConfiguration(),
      });
    } catch (error) {
      logger.error('Failed to update thresholds', {
        error: error.message,
      });

      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * Get current configuration
   * GET /api/parse/configuration
   */
  async getConfiguration(req, res) {
    try {
      const config = unifiedOrderParser.getConfiguration();

      res.json({
        success: true,
        data: config,
      });
    } catch (error) {
      logger.error('Failed to get configuration', {
        error: error.message,
      });

      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }
}

module.exports = new UnifiedOrderParserController();
