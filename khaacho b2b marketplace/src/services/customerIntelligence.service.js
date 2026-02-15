/**
 * Customer Intelligence Service
 * 
 * Provides conversational intelligence for WhatsApp interactions:
 * - Remembers previous orders
 * - Suggests repeat orders
 * - Detects frequent buyers
 * - Offers quick reorder options
 */

const prisma = require('../config/database');
const logger = require('../shared/logger');
const whatsappThrottled = require('./whatsappThrottled.service');
const { v4: uuidv4 } = require('uuid');

class CustomerIntelligenceService {
  constructor() {
    this.sessionTimeout = 30 * 60 * 1000; // 30 minutes
  }

  /**
   * Get or create customer memory
   */
  async getCustomerMemory(retailerId) {
    try {
      let memory = await prisma.customerMemory.findUnique({
        where: { retailerId },
      });

      if (!memory) {
        memory = await prisma.customerMemory.create({
          data: { retailerId },
        });
      }

      return this.formatCustomerMemory(memory);
    } catch (error) {
      logger.error('Failed to get customer memory', {
        retailerId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Format customer memory for response
   */
  formatCustomerMemory(memory) {
    return {
      retailerId: memory.retailerId,
      totalOrders: memory.totalOrders,
      firstOrderDate: memory.firstOrderDate,
      lastOrderDate: memory.lastOrderDate,
      averageOrderValue: parseFloat(memory.averageOrderValue || 0),
      totalSpent: parseFloat(memory.totalSpent || 0),
      isFrequentBuyer: memory.isFrequentBuyer,
      averageDaysBetweenOrders: parseFloat(memory.averageDaysBetweenOrders || 0),
      orderFrequencyTier: memory.orderFrequencyTier,
      preferredOrderDay: memory.preferredOrderDay,
      preferredOrderTime: memory.preferredOrderTime,
      favoriteProducts: memory.favoriteProducts || [],
      favoriteCategories: memory.favoriteCategories || [],
      typicalBasketSize: memory.typicalBasketSize,
      lastOrderItems: memory.lastOrderItems || [],
      quickReorderAvailable: memory.quickReorderAvailable,
      lastInteractionDate: memory.lastInteractionDate,
      lastInteractionType: memory.lastInteractionType,
    };
  }

  /**
   * Check if customer should receive quick reorder suggestion
   */
  async shouldSuggestQuickReorder(retailerId) {
    try {
      const result = await prisma.$queryRaw`
        SELECT ready_for_reorder
        FROM quick_reorder_candidates
        WHERE retailer_id = ${retailerId}::uuid
      `;

      return result.length > 0 && result[0].ready_for_reorder;
    } catch (error) {
      logger.error('Failed to check quick reorder eligibility', {
        retailerId,
        error: error.message,
      });
      return false;
    }
  }

  /**
   * Generate quick reorder suggestion
   */
  async generateQuickReorderSuggestion(retailerId, suggestionType = 'LAST_ORDER') {
    try {
      const memory = await this.getCustomerMemory(retailerId);

      if (!memory.quickReorderAvailable || !memory.lastOrderItems.length) {
        return null;
      }

      // Get product details
      const productIds = memory.lastOrderItems.map(item => item.productId);
      const products = await prisma.product.findMany({
        where: { id: { in: productIds } },
        select: { id: true, name: true, unit: true, price: true },
      });

      const productMap = new Map(products.map(p => [p.id, p]));

      // Build suggested items with current prices
      const suggestedItems = memory.lastOrderItems.map(item => {
        const product = productMap.get(item.productId);
        return {
          productId: item.productId,
          productName: product?.name || 'Unknown',
          quantity: item.quantity,
          unit: item.unit || product?.unit || 'piece',
          price: parseFloat(product?.price || item.price || 0),
        };
      });

      const estimatedTotal = suggestedItems.reduce(
        (sum, item) => sum + (item.quantity * item.price),
        0
      );

      // Create suggestion record
      const suggestion = await prisma.quickReorderSuggestions.create({
        data: {
          retailerId,
          suggestionType,
          suggestedItems,
          totalItems: suggestedItems.length,
          estimatedTotal,
          validUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
        },
      });

      logger.info('Quick reorder suggestion generated', {
        retailerId,
        suggestionId: suggestion.id,
        itemCount: suggestedItems.length,
        estimatedTotal,
      });

      return {
        id: suggestion.id,
        suggestionType,
        items: suggestedItems,
        totalItems: suggestedItems.length,
        estimatedTotal,
        lastOrderDate: memory.lastOrderDate,
      };
    } catch (error) {
      logger.error('Failed to generate quick reorder suggestion', {
        retailerId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Send quick reorder suggestion via WhatsApp
   */
  async sendQuickReorderSuggestion(retailerId, phoneNumber) {
    try {
      const suggestion = await this.generateQuickReorderSuggestion(retailerId);

      if (!suggestion) {
        logger.info('No quick reorder suggestion available', { retailerId });
        return { success: false, reason: 'No suggestion available' };
      }

      // Generate message
      const message = this.generateQuickReorderMessage(suggestion);

      // Send via WhatsApp
      const result = await whatsappThrottled.sendMessage(phoneNumber, message, {
        metadata: {
          type: 'quick_reorder_suggestion',
          suggestionId: suggestion.id,
          retailerId,
        },
      });

      // Update suggestion
      await prisma.quickReorderSuggestions.update({
        where: { id: suggestion.id },
        data: {
          suggestionSent: true,
          sentAt: new Date(),
        },
      });

      // Record metric
      await this.recordMetric('suggestions_sent', 1);

      logger.info('Quick reorder suggestion sent', {
        retailerId,
        suggestionId: suggestion.id,
        phoneNumber,
      });

      return {
        success: true,
        suggestionId: suggestion.id,
        message,
      };
    } catch (error) {
      logger.error('Failed to send quick reorder suggestion', {
        retailerId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Generate quick reorder message
   */
  generateQuickReorderMessage(suggestion) {
    const { items, estimatedTotal, lastOrderDate } = suggestion;

    const daysSince = Math.floor(
      (Date.now() - new Date(lastOrderDate).getTime()) / (1000 * 60 * 60 * 24)
    );

    let message = `Hi! 👋\n\n`;
    message += `It's been ${daysSince} days since your last order.\n\n`;
    message += `Would you like to order the same items again?\n\n`;
    message += `📦 Your last order:\n`;

    items.slice(0, 5).forEach(item => {
      message += `• ${item.quantity} ${item.unit} ${item.productName}\n`;
    });

    if (items.length > 5) {
      message += `... and ${items.length - 5} more items\n`;
    }

    message += `\n💰 Estimated total: ₹${estimatedTotal.toFixed(2)}\n\n`;
    message += `Reply:\n`;
    message += `✅ YES - to place this order\n`;
    message += `✏️ MODIFY - to change items\n`;
    message += `❌ NO - not now\n`;

    return message;
  }

  /**
   * Handle quick reorder response
   */
  async handleQuickReorderResponse(suggestionId, response) {
    try {
      const responseType = this.parseResponse(response);

      await prisma.quickReorderSuggestions.update({
        where: { id: suggestionId },
        data: {
          responseReceived: true,
          responseType,
          respondedAt: new Date(),
        },
      });

      // Record metric
      await this.recordMetric(`suggestions_${responseType.toLowerCase()}`, 1);

      logger.info('Quick reorder response recorded', {
        suggestionId,
        responseType,
      });

      return { responseType };
    } catch (error) {
      logger.error('Failed to handle quick reorder response', {
        suggestionId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Parse customer response
   */
  parseResponse(text) {
    const normalized = text.toLowerCase().trim();

    if (/^(yes|y|ok|sure|confirm|proceed)$/i.test(normalized)) {
      return 'ACCEPTED';
    }
    if (/^(no|n|not now|cancel|skip)$/i.test(normalized)) {
      return 'REJECTED';
    }
    if (/^(modify|change|edit|update)$/i.test(normalized)) {
      return 'MODIFIED';
    }

    return 'IGNORED';
  }

  /**
   * Create order from quick reorder suggestion
   */
  async createOrderFromSuggestion(suggestionId) {
    try {
      const suggestion = await prisma.quickReorderSuggestions.findUnique({
        where: { id: suggestionId },
      });

      if (!suggestion) {
        throw new Error('Suggestion not found');
      }

      // Create order (simplified - integrate with your order service)
      const order = await prisma.order.create({
        data: {
          retailerId: suggestion.retailerId,
          status: 'PENDING',
          totalAmount: suggestion.estimatedTotal,
          source: 'QUICK_REORDER',
          metadata: {
            suggestionId,
            suggestionType: suggestion.suggestionType,
          },
        },
      });

      // Create order items
      for (const item of suggestion.suggestedItems) {
        await prisma.orderItem.create({
          data: {
            orderId: order.id,
            productId: item.productId,
            quantity: item.quantity,
            unit: item.unit,
            unitPrice: item.price,
            totalPrice: item.quantity * item.price,
          },
        });
      }

      // Update suggestion
      await prisma.quickReorderSuggestions.update({
        where: { id: suggestionId },
        data: {
          orderCreated: true,
          createdOrderId: order.id,
        },
      });

      // Record metric
      await this.recordMetric('quick_reorders_completed', 1);

      logger.info('Order created from quick reorder suggestion', {
        suggestionId,
        orderId: order.id,
        retailerId: suggestion.retailerId,
      });

      return order;
    } catch (error) {
      logger.error('Failed to create order from suggestion', {
        suggestionId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get or create conversation context
   */
  async getConversationContext(retailerId) {
    try {
      // Find active session
      let context = await prisma.conversationContext.findFirst({
        where: {
          retailerId,
          isActive: true,
          expiresAt: { gt: new Date() },
        },
      });

      if (!context) {
        // Create new session
        const sessionId = uuidv4();
        context = await prisma.conversationContext.create({
          data: {
            retailerId,
            sessionId,
            expiresAt: new Date(Date.now() + this.sessionTimeout),
          },
        });
      }

      return context;
    } catch (error) {
      logger.error('Failed to get conversation context', {
        retailerId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Update conversation context
   */
  async updateConversationContext(sessionId, updates) {
    try {
      const context = await prisma.conversationContext.update({
        where: { sessionId },
        data: {
          ...updates,
          lastMessageAt: new Date(),
          expiresAt: new Date(Date.now() + this.sessionTimeout),
          updatedAt: new Date(),
        },
      });

      return context;
    } catch (error) {
      logger.error('Failed to update conversation context', {
        sessionId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Log conversation message
   */
  async logMessage(sessionId, retailerId, direction, messageType, messageText, metadata = {}) {
    try {
      await prisma.conversationMessages.create({
        data: {
          sessionId,
          retailerId,
          direction,
          messageType,
          messageText,
          intent: metadata.intent,
          entities: metadata.entities || {},
        },
      });
    } catch (error) {
      logger.warn('Failed to log conversation message', {
        sessionId,
        error: error.message,
      });
    }
  }

  /**
   * Get frequent buyers
   */
  async getFrequentBuyers(filters = {}) {
    try {
      const { limit = 100, orderFrequencyTier = null } = filters;

      let whereClause = '';
      if (orderFrequencyTier) {
        whereClause = `AND order_frequency_tier = '${orderFrequencyTier}'`;
      }

      const query = `
        SELECT *
        FROM frequent_buyers_summary
        WHERE 1=1 ${whereClause}
        ORDER BY days_since_last_order DESC
        LIMIT ${limit}
      `;

      const buyers = await prisma.$queryRawUnsafe(query);

      return buyers.map(buyer => ({
        retailerId: buyer.retailer_id,
        retailerName: buyer.retailer_name,
        phoneNumber: buyer.phone_number,
        totalOrders: Number(buyer.total_orders),
        averageDaysBetweenOrders: parseFloat(buyer.average_days_between_orders),
        orderFrequencyTier: buyer.order_frequency_tier,
        lastOrderDate: buyer.last_order_date,
        daysSinceLastOrder: parseFloat(buyer.days_since_last_order),
        predictedNextOrderDate: buyer.predicted_next_order_date,
        quickReorderAvailable: buyer.quick_reorder_available,
      }));
    } catch (error) {
      logger.error('Failed to get frequent buyers', {
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get intelligence statistics
   */
  async getStatistics(filters = {}) {
    try {
      const { startDate = null, endDate = null } = filters;

      let whereClause = '';
      const params = [];

      if (startDate) {
        whereClause += ` AND metric_date >= $${params.length + 1}::date`;
        params.push(startDate);
      }

      if (endDate) {
        whereClause += ` AND metric_date <= $${params.length + 1}::date`;
        params.push(endDate);
      }

      const query = `
        SELECT 
          COUNT(DISTINCT metric_date) as days_tracked,
          SUM(suggestions_sent) as total_suggestions,
          SUM(suggestions_accepted) as total_accepted,
          SUM(suggestions_rejected) as total_rejected,
          SUM(quick_reorders_completed) as total_quick_reorders,
          CASE 
            WHEN SUM(suggestions_sent) > 0 
            THEN ROUND((SUM(suggestions_accepted)::DECIMAL / SUM(suggestions_sent)) * 100, 2)
            ELSE 0
          END as acceptance_rate,
          CASE 
            WHEN SUM(suggestions_accepted) > 0 
            THEN ROUND((SUM(quick_reorders_completed)::DECIMAL / SUM(suggestions_accepted)) * 100, 2)
            ELSE 0
          END as conversion_rate
        FROM customer_intelligence_metrics
        WHERE 1=1 ${whereClause}
      `;

      const result = await prisma.$queryRawUnsafe(query, ...params);
      const stats = result[0];

      return {
        daysTracked: Number(stats.days_tracked),
        totalSuggestions: Number(stats.total_suggestions),
        totalAccepted: Number(stats.total_accepted),
        totalRejected: Number(stats.total_rejected),
        totalQuickReorders: Number(stats.total_quick_reorders),
        acceptanceRate: parseFloat(stats.acceptance_rate),
        conversionRate: parseFloat(stats.conversion_rate),
      };
    } catch (error) {
      logger.error('Failed to get intelligence statistics', {
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Record metric
   */
  async recordMetric(metricName, value = 1) {
    try {
      const now = new Date();
      const hourBucket = new Date(now);
      hourBucket.setMinutes(0, 0, 0);

      const metricDate = now.toISOString().split('T')[0];

      await prisma.customerIntelligenceMetrics.upsert({
        where: { hourBucket },
        create: {
          metricDate: new Date(metricDate),
          hourBucket,
          [metricName]: value,
        },
        update: {
          [metricName]: { increment: value },
          updatedAt: new Date(),
        },
      });
    } catch (error) {
      logger.warn('Failed to record metric', {
        metricName,
        error: error.message,
      });
    }
  }

  /**
   * Refresh customer memory analytics
   */
  async refreshAnalytics() {
    try {
      logger.info('Refreshing customer memory analytics');

      await prisma.$queryRaw`SELECT refresh_customer_memory_analytics()`;

      logger.info('Customer memory analytics refreshed');

      return { success: true };
    } catch (error) {
      logger.error('Failed to refresh analytics', {
        error: error.message,
      });
      throw error;
    }
  }
}

module.exports = new CustomerIntelligenceService();
