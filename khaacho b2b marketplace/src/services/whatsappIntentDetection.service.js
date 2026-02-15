const prisma = require('../config/database');
const logger = require('../shared/logger');

/**
 * WhatsApp Intent Detection Service
 * 
 * Detects user intent from WhatsApp messages:
 * - place_order: User wants to place an order
 * - order_status: User wants to check order status
 * - help: User needs help/instructions
 * - greeting: User is greeting
 * - unknown: Intent unclear
 * 
 * Features:
 * - Pattern-based intent detection with confidence scoring
 * - Conversation state management per user
 * - Context-aware responses
 * - Only sends help if intent truly unclear
 */

class WhatsAppIntentDetectionService {
  constructor() {
    // Intent patterns with confidence weights
    this.intentPatterns = {
      place_order: [
        { pattern: /\b([A-Z0-9-]+)\s*[xX×]\s*(\d+)/i, weight: 95 }, // SKU x Quantity
        { pattern: /\b(\d+)\s*[xX×]\s*([A-Z0-9-]+)/i, weight: 95 }, // Quantity x SKU
        { pattern: /\b(\d+)\s+(kg|kgs|liter|liters|bags?|packets?|bottles?|pieces?)/i, weight: 85 },
        { pattern: /\b(rice|dal|oil|sugar|salt|flour|wheat|chamal|daal|tel|chini)/i, weight: 80 },
        { pattern: /\b(order|need|want|buy|purchase|send|deliver)/i, weight: 70 },
        { pattern: /\b(i need|i want|please send|can i get)/i, weight: 75 },
      ],
      order_status: [
        { pattern: /\b(status|track|where|check|update)\b.*\b(order|delivery)/i, weight: 95 },
        { pattern: /\border\s*#?([A-Z0-9]+)/i, weight: 90 },
        { pattern: /\b(ORD\d+)/i, weight: 95 },
        { pattern: /\b(delivered|dispatched|confirmed|pending)\b/i, weight: 70 },
        { pattern: /\b(when|where is my)/i, weight: 65 },
      ],
      help: [
        { pattern: /\b(help|how|what|guide|instructions|explain)/i, weight: 90 },
        { pattern: /\b(how to|how do i|what is|what are)/i, weight: 85 },
        { pattern: /\b(don't understand|confused|not sure)/i, weight: 95 },
        { pattern: /\?$/i, weight: 60 }, // Ends with question mark
      ],
      greeting: [
        { pattern: /^(hi|hello|hey|namaste|namaskar|good morning|good afternoon|good evening)/i, weight: 95 },
        { pattern: /^(thanks|thank you|dhanyabad|ok|okay|yes|no)$/i, weight: 90 },
      ],
    };

    // Confidence thresholds
    this.thresholds = {
      high: 80, // High confidence - take action
      medium: 50, // Medium confidence - ask for clarification
      low: 50, // Low confidence - send help
    };
  }

  /**
   * Detect intent from WhatsApp message
   * @param {Object} input
   * @param {string} input.phoneNumber - User's phone number
   * @param {string} input.messageText - Message text
   * @param {string} input.messageId - WhatsApp message ID
   * @returns {Promise<Object>} - Intent detection result
   */
  async detectIntent(input) {
    const { phoneNumber, messageText, messageId } = input;
    const startTime = Date.now();

    logger.setContext({ phoneNumber, messageId });
    logger.info('Detecting intent', {
      phoneNumber,
      messageId,
      textLength: messageText?.length,
    });

    try {
      // Validate input
      this.validateInput(input);

      // Get or create conversation
      const conversation = await this.getOrCreateConversation(phoneNumber);

      // Detect intent with confidence scoring
      const detection = this.analyzeIntent(messageText, conversation);

      // Store intent log
      await this.storeIntentLog({
        conversationId: conversation.id,
        phoneNumber,
        messageText,
        messageId,
        detection,
        processingTime: Date.now() - startTime,
      });

      // Update conversation state
      await this.updateConversationState(conversation.id, {
        currentIntent: detection.intent,
        lastMessageAt: new Date(),
        lastIntentAt: new Date(),
        messageCount: conversation.message_count + 1,
      });

      const duration = Date.now() - startTime;

      logger.info('Intent detected', {
        phoneNumber,
        messageId,
        intent: detection.intent,
        confidence: detection.confidence,
        duration,
      });

      return {
        success: true,
        intent: detection.intent,
        confidence: detection.confidence,
        alternativeIntents: detection.alternatives,
        matchedPatterns: detection.matchedPatterns,
        shouldSendHelp: detection.shouldSendHelp,
        conversationId: conversation.id,
        context: conversation.context,
        duration,
      };
    } catch (error) {
      const duration = Date.now() - startTime;

      logger.error('Intent detection failed', {
        phoneNumber,
        messageId,
        error: error.message,
        stack: error.stack,
        duration,
      });

      throw error;
    }
  }

  /**
   * Validate input
   */
  validateInput(input) {
    if (!input.phoneNumber) {
      throw new Error('phoneNumber is required');
    }

    if (!input.messageText || typeof input.messageText !== 'string') {
      throw new Error('messageText must be a non-empty string');
    }
  }

  /**
   * Get or create conversation
   */
  async getOrCreateConversation(phoneNumber) {
    try {
      // Try to find existing conversation
      let conversation = await prisma.whatsappConversations.findUnique({
        where: { phone_number: phoneNumber },
      });

      if (conversation) {
        return conversation;
      }

      // Find retailer by phone number
      const retailer = await prisma.retailers.findFirst({
        where: {
          user: {
            phoneNumber: phoneNumber,
          },
        },
      });

      // Create new conversation
      conversation = await prisma.whatsappConversations.create({
        data: {
          phone_number: phoneNumber,
          retailer_id: retailer?.id || null,
          context: {},
          message_count: 0,
          successful_orders: 0,
          failed_orders: 0,
          help_requests: 0,
        },
      });

      logger.info('New conversation created', {
        conversationId: conversation.id,
        phoneNumber,
        retailerId: retailer?.id,
      });

      return conversation;
    } catch (error) {
      logger.error('Failed to get/create conversation', {
        phoneNumber,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Analyze intent from message text
   */
  analyzeIntent(messageText, conversation) {
    const text = messageText.trim();

    // Calculate scores for each intent
    const intentScores = {};
    const matchedPatterns = {};

    for (const [intent, patterns] of Object.entries(this.intentPatterns)) {
      let score = 0;
      const matches = [];

      for (const { pattern, weight } of patterns) {
        if (pattern.test(text)) {
          score += weight;
          matches.push({
            pattern: pattern.toString(),
            weight,
          });
        }
      }

      intentScores[intent] = score;
      matchedPatterns[intent] = matches;
    }

    // Find intent with highest score
    const sortedIntents = Object.entries(intentScores)
      .sort(([, scoreA], [, scoreB]) => scoreB - scoreA);

    const [topIntent, topScore] = sortedIntents[0];
    const [secondIntent, secondScore] = sortedIntents[1] || [null, 0];

    // Calculate confidence (0-100)
    let confidence = 0;
    if (topScore > 0) {
      // Normalize score to 0-100 range
      const maxPossibleScore = Math.max(...Object.values(intentScores));
      confidence = Math.min(Math.round((topScore / maxPossibleScore) * 100), 100);

      // Reduce confidence if second intent is close
      if (secondScore > 0 && (topScore - secondScore) < 20) {
        confidence = Math.max(confidence - 15, 0);
      }
    }

    // Determine final intent
    let finalIntent = topIntent;
    let shouldSendHelp = false;

    if (confidence < this.thresholds.medium) {
      // Low confidence - mark as unknown
      finalIntent = 'unknown';
      shouldSendHelp = true;
    } else if (finalIntent === 'greeting' && conversation.message_count > 0) {
      // If user already has conversation history, greeting might be order-related
      // Check if there's any order-like content
      if (intentScores.place_order > 0) {
        finalIntent = 'place_order';
        confidence = intentScores.place_order;
      }
    }

    // Build alternatives list
    const alternatives = sortedIntents
      .slice(1, 4)
      .filter(([, score]) => score > 0)
      .map(([intent, score]) => ({
        intent,
        score,
        confidence: Math.min(Math.round((score / topScore) * 100), 100),
      }));

    return {
      intent: finalIntent,
      confidence,
      alternatives,
      matchedPatterns: matchedPatterns[topIntent] || [],
      shouldSendHelp,
      scores: intentScores,
    };
  }

  /**
   * Store intent detection log
   */
  async storeIntentLog(data) {
    const {
      conversationId,
      phoneNumber,
      messageText,
      messageId,
      detection,
      processingTime,
    } = data;

    try {
      await prisma.whatsappIntentLog.create({
        data: {
          conversation_id: conversationId,
          phone_number: phoneNumber,
          message_text: messageText,
          message_id: messageId,
          detected_intent: detection.intent,
          confidence_score: detection.confidence,
          alternative_intents: detection.alternatives,
          processing_time_ms: processingTime,
          matched_patterns: detection.matchedPatterns,
        },
      });

      logger.info('Intent log stored', {
        conversationId,
        phoneNumber,
        intent: detection.intent,
      });
    } catch (error) {
      logger.error('Failed to store intent log', {
        conversationId,
        phoneNumber,
        error: error.message,
      });
      // Don't throw - logging failure shouldn't break flow
    }
  }

  /**
   * Update conversation state
   */
  async updateConversationState(conversationId, updates) {
    try {
      await prisma.whatsappConversations.update({
        where: { id: conversationId },
        data: updates,
      });

      logger.info('Conversation state updated', {
        conversationId,
        updates,
      });
    } catch (error) {
      logger.error('Failed to update conversation state', {
        conversationId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get conversation by phone number
   */
  async getConversation(phoneNumber) {
    try {
      return await prisma.whatsappConversations.findUnique({
        where: { phone_number: phoneNumber },
      });
    } catch (error) {
      logger.error('Failed to get conversation', {
        phoneNumber,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Update conversation context
   */
  async updateContext(phoneNumber, contextUpdates) {
    try {
      const conversation = await this.getConversation(phoneNumber);

      if (!conversation) {
        throw new Error('Conversation not found');
      }

      const updatedContext = {
        ...conversation.context,
        ...contextUpdates,
      };

      await prisma.whatsappConversations.update({
        where: { phone_number: phoneNumber },
        data: { context: updatedContext },
      });

      logger.info('Conversation context updated', {
        phoneNumber,
        contextUpdates,
      });

      return updatedContext;
    } catch (error) {
      logger.error('Failed to update context', {
        phoneNumber,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Set pending action
   */
  async setPendingAction(phoneNumber, action, data = null) {
    try {
      await prisma.whatsappConversations.update({
        where: { phone_number: phoneNumber },
        data: {
          pending_action: action,
          pending_order_data: data,
        },
      });

      logger.info('Pending action set', {
        phoneNumber,
        action,
      });
    } catch (error) {
      logger.error('Failed to set pending action', {
        phoneNumber,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Clear pending action
   */
  async clearPendingAction(phoneNumber) {
    try {
      await prisma.whatsappConversations.update({
        where: { phone_number: phoneNumber },
        data: {
          pending_action: null,
          pending_order_data: null,
        },
      });

      logger.info('Pending action cleared', {
        phoneNumber,
      });
    } catch (error) {
      logger.error('Failed to clear pending action', {
        phoneNumber,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Increment conversation metrics
   */
  async incrementMetric(phoneNumber, metric) {
    try {
      const validMetrics = ['successful_orders', 'failed_orders', 'help_requests'];

      if (!validMetrics.includes(metric)) {
        throw new Error(`Invalid metric: ${metric}`);
      }

      await prisma.whatsappConversations.update({
        where: { phone_number: phoneNumber },
        data: {
          [metric]: {
            increment: 1,
          },
        },
      });

      logger.info('Conversation metric incremented', {
        phoneNumber,
        metric,
      });
    } catch (error) {
      logger.error('Failed to increment metric', {
        phoneNumber,
        metric,
        error: error.message,
      });
      // Don't throw - metric failure shouldn't break flow
    }
  }

  /**
   * Get intent statistics
   */
  async getIntentStatistics(days = 7) {
    try {
      const stats = await prisma.$queryRaw`
        SELECT
          detected_intent,
          COUNT(*) as total_count,
          AVG(confidence_score)::INTEGER as avg_confidence,
          MIN(confidence_score) as min_confidence,
          MAX(confidence_score) as max_confidence,
          AVG(processing_time_ms)::INTEGER as avg_processing_time_ms,
          COUNT(DISTINCT phone_number) as unique_users
        FROM whatsapp_intent_log
        WHERE created_at >= NOW() - INTERVAL '${days} days'
        GROUP BY detected_intent
        ORDER BY total_count DESC
      `;

      return stats;
    } catch (error) {
      logger.error('Failed to get intent statistics', {
        days,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get active conversations
   */
  async getActiveConversations(hoursThreshold = 24) {
    try {
      const conversations = await prisma.$queryRaw`
        SELECT *
        FROM whatsapp_conversation_activity
        WHERE hours_since_last_message <= ${hoursThreshold}
        ORDER BY last_message_at DESC
        LIMIT 100
      `;

      return conversations;
    } catch (error) {
      logger.error('Failed to get active conversations', {
        hoursThreshold,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Generate help message
   */
  generateHelpMessage() {
    return `Welcome to Khaacho! 🛒

I can help you with:

📦 Place Order:
Send items like:
• RICE-1KG x 10
• 10 bags of rice
• Rice 10 kg

📋 Check Order Status:
• Order #ORD260100001
• Status of my order
• Where is my delivery?

Need help? Just ask!`;
  }

  /**
   * Generate greeting response
   */
  generateGreetingResponse(hasHistory = false) {
    if (hasHistory) {
      return `Hello again! 👋

Ready to place an order? Send your items or type "help" for instructions.`;
    }

    return `Hello! Welcome to Khaacho! 👋

To place an order, send items like:
• RICE-1KG x 10
• 10 bags of rice

Type "help" for more options.`;
  }
}

module.exports = new WhatsAppIntentDetectionService();
