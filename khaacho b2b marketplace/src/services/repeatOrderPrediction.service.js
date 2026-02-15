const prisma = require('../config/database');
const logger = require('../shared/logger');
const whatsappThrottled = require('./whatsappThrottled.service');

/**
 * Repeat Order Prediction Service
 * 
 * Analyzes order patterns and predicts next orders
 * Sends WhatsApp reminders for predictable orders
 * 
 * Features:
 * - Pattern analysis per retailer-product
 * - Frequency consistency scoring
 * - Cycle control (prevents duplicate reminders)
 * - WhatsApp reminder integration
 */

class RepeatOrderPredictionService {
  constructor() {
    // Prediction thresholds
    this.thresholds = {
      minOrders: 3, // Minimum orders to be considered frequent
      minConsistency: 60, // Minimum consistency score (0-100)
      reminderDaysBefore: 1, // Send reminder 1 day before predicted date
      maxPredictionDays: 90, // Don't predict beyond 90 days
    };
  }

  /**
   * Analyze order patterns for a retailer
   * @param {string} retailerId - Retailer ID
   * @returns {Promise<Object>} - Analysis results
   */
  async analyzeOrderPatterns(retailerId) {
    logger.setContext({ retailerId });
    
    try {
      logger.info('Analyzing order patterns', { retailerId });

      // Get all patterns for retailer
      const patterns = await prisma.$queryRaw`
        SELECT 
          op.*,
          p.name as product_name,
          p.sku as product_sku,
          p.category
        FROM order_patterns op
        INNER JOIN products p ON op.product_id = p.id
        WHERE op.retailer_id = ${retailerId}::uuid
          AND op.is_frequent = true
        ORDER BY op.frequency_consistency DESC, op.order_count DESC
      `;

      const analysis = {
        retailerId,
        totalPatterns: patterns.length,
        predictablePatterns: patterns.filter(p => p.is_predictable).length,
        frequentPatterns: patterns.filter(p => p.is_frequent).length,
        patterns: patterns.map(p => this.formatPattern(p)),
        analyzedAt: new Date(),
      };

      logger.info('Order pattern analysis completed', {
        retailerId,
        totalPatterns: analysis.totalPatterns,
        predictablePatterns: analysis.predictablePatterns,
      });

      return analysis;
    } catch (error) {
      logger.error('Failed to analyze order patterns', {
        retailerId,
        error: error.message,
        stack: error.stack,
      });
      throw error;
    }
  }

  /**
   * Format pattern for response
   */
  formatPattern(pattern) {
    return {
      id: pattern.id,
      productId: pattern.product_id,
      productName: pattern.product_name,
      productSku: pattern.product_sku,
      category: pattern.category,
      orderCount: Number(pattern.order_count),
      averageQuantity: Number(pattern.average_quantity),
      averageDaysBetweenOrders: Number(pattern.average_days_between_orders),
      frequencyConsistency: Number(pattern.frequency_consistency),
      isFrequent: pattern.is_frequent,
      isPredictable: pattern.is_predictable,
      firstOrderDate: pattern.first_order_date,
      lastOrderDate: pattern.last_order_date,
      predictedNextOrderDate: pattern.predicted_next_order_date,
      lastCalculatedAt: pattern.last_calculated_at,
    };
  }

  /**
   * Generate predictions for all predictable patterns
   * @returns {Promise<Object>} - Generation results
   */
  async generatePredictions() {
    try {
      logger.info('Starting prediction generation');

      // Get all predictable patterns
      const patterns = await prisma.$queryRaw`
        SELECT 
          op.*,
          r.id as retailer_id,
          u.name as retailer_name,
          u.phone_number as retailer_phone,
          p.name as product_name,
          p.sku as product_sku
        FROM order_patterns op
        INNER JOIN retailers r ON op.retailer_id = r.id
        INNER JOIN users u ON r.user_id = u.id
        INNER JOIN products p ON op.product_id = p.id
        WHERE op.is_predictable = true
          AND op.predicted_next_order_date IS NOT NULL
          AND op.predicted_next_order_date <= CURRENT_DATE + INTERVAL '${this.thresholds.maxPredictionDays} days'
          AND u.is_active = true
          AND r.deleted_at IS NULL
      `;

      logger.info('Found predictable patterns', { count: patterns.length });

      const results = {
        total: patterns.length,
        created: 0,
        skipped: 0,
        failed: 0,
        predictions: [],
      };

      for (const pattern of patterns) {
        try {
          const prediction = await this.createPrediction(pattern);
          
          if (prediction) {
            results.created++;
            results.predictions.push(prediction);
          } else {
            results.skipped++;
          }
        } catch (error) {
          logger.error('Failed to create prediction', {
            patternId: pattern.id,
            error: error.message,
          });
          results.failed++;
        }
      }

      logger.info('Prediction generation completed', results);

      return results;
    } catch (error) {
      logger.error('Prediction generation failed', {
        error: error.message,
        stack: error.stack,
      });
      throw error;
    }
  }

  /**
   * Create prediction for a pattern
   */
  async createPrediction(pattern) {
    const {
      retailer_id,
      product_id,
      predicted_next_order_date,
      average_quantity,
      average_days_between_orders,
      frequency_consistency,
      last_order_date,
      order_count,
    } = pattern;

    try {
      // Generate cycle ID
      const predictedDate = new Date(predicted_next_order_date);
      const cycleId = this.generateCycleId(
        retailer_id,
        product_id,
        predictedDate
      );

      // Check if prediction already exists
      const existing = await prisma.orderPrediction.findUnique({
        where: { cycleId },
      });

      if (existing) {
        logger.debug('Prediction already exists', { cycleId });
        return null;
      }

      // Create prediction
      const prediction = await prisma.orderPrediction.create({
        data: {
          retailerId: retailer_id,
          productId: product_id,
          predictedOrderDate: predictedDate,
          predictedQuantity: average_quantity,
          confidenceScore: frequency_consistency,
          averageDaysBetweenOrders: average_days_between_orders,
          lastOrderDate: last_order_date,
          orderCount: order_count,
          cycleId,
          reminderSent: false,
        },
      });

      logger.info('Prediction created', {
        predictionId: prediction.id,
        retailerId: retailer_id,
        productId: product_id,
        predictedDate: predictedDate,
        cycleId,
      });

      return prediction;
    } catch (error) {
      logger.error('Failed to create prediction', {
        retailerId: retailer_id,
        productId: product_id,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Generate cycle ID for duplicate prevention
   * Format: retailer_id:product_id:YYYY-MM-DD
   */
  generateCycleId(retailerId, productId, predictedDate) {
    const dateStr = predictedDate.toISOString().split('T')[0];
    return `${retailerId}:${productId}:${dateStr}`;
  }

  /**
   * Send prediction reminders
   * @returns {Promise<Object>} - Reminder results
   */
  async sendPredictionReminders() {
    try {
      logger.info('Starting prediction reminder sending');

      // Get predictions due for reminder
      const predictions = await this.getPredictionsDueForReminder();

      logger.info('Found predictions due for reminder', {
        count: predictions.length,
      });

      const results = {
        total: predictions.length,
        sent: 0,
        failed: 0,
        skipped: 0,
      };

      for (const prediction of predictions) {
        try {
          const sent = await this.sendReminder(prediction);
          
          if (sent) {
            results.sent++;
          } else {
            results.skipped++;
          }
        } catch (error) {
          logger.error('Failed to send reminder', {
            predictionId: prediction.id,
            error: error.message,
          });
          results.failed++;
        }
      }

      logger.info('Prediction reminder sending completed', results);

      return results;
    } catch (error) {
      logger.error('Prediction reminder sending failed', {
        error: error.message,
        stack: error.stack,
      });
      throw error;
    }
  }

  /**
   * Get predictions due for reminder
   */
  async getPredictionsDueForReminder() {
    try {
      const reminderDate = new Date();
      reminderDate.setDate(
        reminderDate.getDate() + this.thresholds.reminderDaysBefore
      );

      const predictions = await prisma.$queryRaw`
        SELECT 
          op.*,
          r.id as retailer_id,
          u.name as retailer_name,
          u.phone_number as retailer_phone,
          p.name as product_name,
          p.sku as product_sku,
          p.unit
        FROM order_predictions op
        INNER JOIN retailers r ON op.retailer_id = r.id
        INNER JOIN users u ON r.user_id = u.id
        INNER JOIN products p ON op.product_id = p.id
        WHERE op.reminder_sent = false
          AND op.predicted_order_date <= ${reminderDate}::date
          AND op.predicted_order_date >= CURRENT_DATE
          AND u.is_active = true
          AND u.phone_number IS NOT NULL
          AND r.deleted_at IS NULL
        ORDER BY op.predicted_order_date ASC
      `;

      return predictions;
    } catch (error) {
      logger.error('Failed to get predictions due for reminder', {
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Send reminder for a prediction
   */
  async sendReminder(prediction) {
    const {
      id: predictionId,
      retailer_id,
      product_id,
      retailer_phone,
      retailer_name,
      product_name,
      predicted_quantity,
      average_days_between_orders,
      unit,
    } = prediction;

    logger.setContext({ predictionId, retailerId: retailer_id });

    try {
      // Check cycle control
      const canSend = await this.checkCycleControl(
        retailer_id,
        product_id,
        prediction.predicted_order_date
      );

      if (!canSend) {
        logger.info('Reminder already sent for this cycle', {
          predictionId,
          cycleId: prediction.cycle_id,
        });
        return false;
      }

      // Format phone number
      const phoneNumber = this.formatPhoneNumber(retailer_phone);

      // Generate reminder message
      const message = this.generateReminderMessage({
        retailerName: retailer_name,
        productName: product_name,
        quantity: predicted_quantity,
        unit: unit || 'units',
        daysBetween: Math.round(average_days_between_orders),
      });

      // Send via WhatsApp
      const result = await whatsappThrottled.sendMessage(
        phoneNumber,
        message,
        {
          metadata: {
            type: 'repeat_order_reminder',
            predictionId,
            retailerId: retailer_id,
            productId: product_id,
          },
        }
      );

      // Update prediction
      await prisma.orderPrediction.update({
        where: { id: predictionId },
        data: {
          reminderSent: true,
          reminderSentAt: new Date(),
          reminderMessage: message,
        },
      });

      // Log reminder
      await this.logReminder(predictionId, {
        retailerId: retailer_id,
        productId: product_id,
        phoneNumber,
        message,
        status: result.success ? 'sent' : 'failed',
        sentAt: new Date(),
      });

      logger.info('Reminder sent successfully', {
        predictionId,
        retailerId: retailer_id,
        productId: product_id,
        phoneNumber,
      });

      return true;
    } catch (error) {
      logger.error('Failed to send reminder', {
        predictionId,
        retailerId: retailer_id,
        error: error.message,
        stack: error.stack,
      });

      // Log failure
      await this.logReminder(predictionId, {
        retailerId: retailer_id,
        productId: product_id,
        phoneNumber: retailer_phone,
        message: 'Failed to send',
        status: 'failed',
        failureReason: error.message,
        failedAt: new Date(),
      });

      throw error;
    }
  }

  /**
   * Check cycle control to prevent duplicate reminders
   */
  async checkCycleControl(retailerId, productId, predictedDate) {
    try {
      const cycleId = this.generateCycleId(retailerId, productId, predictedDate);

      const existing = await prisma.orderPrediction.findFirst({
        where: {
          cycleId,
          reminderSent: true,
        },
      });

      return !existing;
    } catch (error) {
      logger.error('Cycle control check failed', {
        retailerId,
        productId,
        error: error.message,
      });
      // On error, allow sending to avoid blocking
      return true;
    }
  }

  /**
   * Format phone number for WhatsApp
   */
  formatPhoneNumber(phoneNumber) {
    // Remove non-numeric characters
    let formatted = phoneNumber.replace(/\D/g, '');

    // Add country code if missing (assuming India +91)
    if (!formatted.startsWith('91') && formatted.length === 10) {
      formatted = '91' + formatted;
    }

    return formatted;
  }

  /**
   * Generate reminder message
   */
  generateReminderMessage(data) {
    const { retailerName, productName, quantity, unit, daysBetween } = data;

    return `Hi ${retailerName}! 👋

You usually order ${productName} every ${daysBetween} days.

Based on your pattern, you might need:
📦 ${quantity} ${unit} of ${productName}

Would you like to reorder now?

Reply YES to place order or call us for assistance.`;
  }

  /**
   * Log reminder to audit trail
   */
  async logReminder(predictionId, data) {
    try {
      await prisma.predictionReminderLog.create({
        data: {
          predictionId,
          retailerId: data.retailerId,
          productId: data.productId,
          reminderType: 'whatsapp',
          message: data.message,
          status: data.status,
          sentAt: data.sentAt || null,
          deliveredAt: data.deliveredAt || null,
          failedAt: data.failedAt || null,
          failureReason: data.failureReason || null,
        },
      });
    } catch (error) {
      logger.warn('Failed to log reminder', {
        predictionId,
        error: error.message,
      });
      // Don't throw - logging failure shouldn't break reminder
    }
  }

  /**
   * Mark prediction as order placed
   */
  async markOrderPlaced(predictionId, orderId) {
    try {
      await prisma.orderPrediction.update({
        where: { id: predictionId },
        data: {
          orderPlaced: true,
          orderPlacedAt: new Date(),
          orderId,
        },
      });

      logger.info('Prediction marked as order placed', {
        predictionId,
        orderId,
      });
    } catch (error) {
      logger.error('Failed to mark order placed', {
        predictionId,
        orderId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get prediction statistics
   */
  async getStatistics(filters = {}) {
    try {
      const { retailerId = null, startDate = null, endDate = null } = filters;

      let whereClause = '';
      const params = [];

      if (retailerId) {
        whereClause += ' AND op.retailer_id = $1::uuid';
        params.push(retailerId);
      }

      if (startDate) {
        whereClause += ` AND op.created_at >= $${params.length + 1}::timestamp`;
        params.push(startDate);
      }

      if (endDate) {
        whereClause += ` AND op.created_at <= $${params.length + 1}::timestamp`;
        params.push(endDate);
      }

      const query = `
        SELECT 
          COUNT(*) as total_predictions,
          COUNT(CASE WHEN reminder_sent = true THEN 1 END) as reminders_sent,
          COUNT(CASE WHEN order_placed = true THEN 1 END) as orders_placed,
          AVG(confidence_score) as avg_confidence,
          AVG(CASE 
            WHEN order_placed = true AND order_placed_at IS NOT NULL 
            THEN EXTRACT(EPOCH FROM (order_placed_at - predicted_order_date)) / 86400 
          END) as avg_prediction_accuracy_days
        FROM order_predictions op
        WHERE 1=1 ${whereClause}
      `;

      const result = await prisma.$queryRawUnsafe(query, ...params);

      const stats = result[0];

      return {
        totalPredictions: Number(stats.total_predictions),
        remindersSent: Number(stats.reminders_sent),
        ordersPlaced: Number(stats.orders_placed),
        conversionRate: stats.reminders_sent > 0
          ? (Number(stats.orders_placed) / Number(stats.reminders_sent)) * 100
          : 0,
        averageConfidence: Number(stats.avg_confidence) || 0,
        averagePredictionAccuracyDays: Number(stats.avg_prediction_accuracy_days) || 0,
      };
    } catch (error) {
      logger.error('Failed to get statistics', {
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Update prediction thresholds
   */
  updateThresholds(newThresholds) {
    this.thresholds = {
      ...this.thresholds,
      ...newThresholds,
    };
    logger.info('Prediction thresholds updated', { thresholds: this.thresholds });
  }

  /**
   * Get current configuration
   */
  getConfiguration() {
    return {
      thresholds: this.thresholds,
    };
  }
}

module.exports = new RepeatOrderPredictionService();
