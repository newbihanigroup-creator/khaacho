const logger = require('../shared/logger');
const prisma = require('../config/database');
const repeatOrderPredictionService = require('../services/repeatOrderPrediction.service');
const repeatOrderPredictionWorker = require('../workers/repeatOrderPrediction.worker');

/**
 * Repeat Order Prediction Controller
 * HTTP handlers for prediction endpoints
 */

class RepeatOrderPredictionController {
  /**
   * Analyze order patterns for a retailer
   * GET /api/predictions/analyze/:retailerId
   */
  async analyzePatterns(req, res) {
    try {
      const { retailerId } = req.params;

      logger.info('Analyzing order patterns', { retailerId });

      const analysis = await repeatOrderPredictionService.analyzeOrderPatterns(retailerId);

      res.json({
        success: true,
        data: analysis,
      });
    } catch (error) {
      logger.error('Failed to analyze patterns', {
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
   * Generate predictions manually
   * POST /api/predictions/generate
   */
  async generatePredictions(req, res) {
    try {
      logger.info('Manual prediction generation triggered');

      const results = await repeatOrderPredictionService.generatePredictions();

      res.json({
        success: true,
        data: results,
      });
    } catch (error) {
      logger.error('Failed to generate predictions', {
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
   * Send prediction reminders manually
   * POST /api/predictions/send-reminders
   */
  async sendReminders(req, res) {
    try {
      logger.info('Manual reminder sending triggered');

      const results = await repeatOrderPredictionService.sendPredictionReminders();

      res.json({
        success: true,
        data: results,
      });
    } catch (error) {
      logger.error('Failed to send reminders', {
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
   * Get predictions for a retailer
   * GET /api/predictions/retailer/:retailerId
   */
  async getRetailerPredictions(req, res) {
    try {
      const { retailerId } = req.params;
      const { status = 'all' } = req.query;

      logger.info('Getting retailer predictions', { retailerId, status });

      let whereClause = { retailerId };

      if (status === 'pending') {
        whereClause.reminderSent = false;
      } else if (status === 'sent') {
        whereClause.reminderSent = true;
        whereClause.orderPlaced = false;
      } else if (status === 'completed') {
        whereClause.orderPlaced = true;
      }

      const predictions = await prisma.orderPrediction.findMany({
        where: whereClause,
        include: {
          product: {
            select: {
              name: true,
              sku: true,
              unit: true,
            },
          },
        },
        orderBy: {
          predictedOrderDate: 'asc',
        },
      });

      res.json({
        success: true,
        data: {
          retailerId,
          count: predictions.length,
          predictions,
        },
      });
    } catch (error) {
      logger.error('Failed to get retailer predictions', {
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
   * Get prediction statistics
   * GET /api/predictions/statistics
   */
  async getStatistics(req, res) {
    try {
      const { retailerId, startDate, endDate } = req.query;

      logger.info('Getting prediction statistics', {
        retailerId,
        startDate,
        endDate,
      });

      const stats = await repeatOrderPredictionService.getStatistics({
        retailerId,
        startDate: startDate ? new Date(startDate) : null,
        endDate: endDate ? new Date(endDate) : null,
      });

      res.json({
        success: true,
        data: stats,
      });
    } catch (error) {
      logger.error('Failed to get statistics', {
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
   * Mark prediction as order placed
   * POST /api/predictions/:predictionId/order-placed
   */
  async markOrderPlaced(req, res) {
    try {
      const { predictionId } = req.params;
      const { orderId } = req.body;

      logger.info('Marking prediction as order placed', {
        predictionId,
        orderId,
      });

      await repeatOrderPredictionService.markOrderPlaced(predictionId, orderId);

      res.json({
        success: true,
        message: 'Prediction marked as order placed',
      });
    } catch (error) {
      logger.error('Failed to mark order placed', {
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
   * Get worker status
   * GET /api/predictions/worker/status
   */
  async getWorkerStatus(req, res) {
    try {
      const status = repeatOrderPredictionWorker.getStatus();

      res.json({
        success: true,
        data: status,
      });
    } catch (error) {
      logger.error('Failed to get worker status', {
        error: error.message,
      });

      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * Run worker job manually
   * POST /api/predictions/worker/run/:jobName
   */
  async runWorkerJob(req, res) {
    try {
      const { jobName } = req.params;

      logger.info('Running worker job manually', { jobName });

      const result = await repeatOrderPredictionWorker.runManual(jobName);

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      logger.error('Failed to run worker job', {
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
   * Update prediction thresholds
   * PUT /api/predictions/configuration/thresholds
   */
  async updateThresholds(req, res) {
    try {
      const { thresholds } = req.body;

      logger.info('Updating prediction thresholds', { thresholds });

      repeatOrderPredictionService.updateThresholds(thresholds);

      res.json({
        success: true,
        message: 'Thresholds updated',
        data: repeatOrderPredictionService.getConfiguration(),
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
   * GET /api/predictions/configuration
   */
  async getConfiguration(req, res) {
    try {
      const config = repeatOrderPredictionService.getConfiguration();

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

module.exports = new RepeatOrderPredictionController();
