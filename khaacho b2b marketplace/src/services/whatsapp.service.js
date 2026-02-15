const axios = require('axios');
const config = require('../config');
const logger = require('../utils/logger');
const { whatsappLogger } = require('../utils/logger');
const prisma = require('../config/database');
const queueManager = require('../utils/asyncQueue');
const monitoringService = require('./monitoring.service');

class WhatsAppService {
  constructor() {
    this.apiUrl = config.whatsapp.apiUrl;
    this.phoneNumberId = config.whatsapp.phoneNumberId;
    this.accessToken = config.whatsapp.accessToken;
    this.useAsync = config.whatsapp.async;
  }

  async sendMessage(to, message) {
    // Use async queue if enabled
    if (this.useAsync && config.features.asyncNotifications) {
      return await queueManager.addJob('whatsapp', 'send-message', {
        to,
        message,
        timestamp: Date.now(),
      });
    }

    // Synchronous sending
    return await this._sendMessageSync(to, message);
  }

  async _sendMessageSync(to, message) {
    const startTime = Date.now();
    
    try {
      const response = await axios.post(
        `${this.apiUrl}/${this.phoneNumberId}/messages`,
        {
          messaging_product: 'whatsapp',
          to,
          type: 'text',
          text: { body: message },
        },
        {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json',
          },
          timeout: 10000, // 10 second timeout
        }
      );

      const duration = Date.now() - startTime;
      
      await prisma.whatsAppMessage.create({
        data: {
          messageId: response.data.messages[0].id,
          from: this.phoneNumberId,
          to,
          body: message,
          type: 'text',
          status: 'sent',
          direction: 'OUTBOUND',
        },
      });

      whatsappLogger.info('WhatsApp message sent', {
        to,
        messageId: response.data.messages[0].id,
        duration,
      });

      // Track successful WhatsApp message
      try {
        await monitoringService.trackWhatsAppMessage(to, 'sent', duration);
      } catch (error) {
        // Don't fail message sending if monitoring fails
        console.error('Failed to track WhatsApp message:', error.message);
      }

      return response.data;
    } catch (error) {
      const duration = Date.now() - startTime;
      
      whatsappLogger.error('WhatsApp send message error', {
        to,
        error: error.response?.data || error.message,
        duration,
      });
      
      // Track failed WhatsApp message
      try {
        await monitoringService.trackWhatsAppMessage(to, 'failed', duration);
      } catch (monitorError) {
        // Don't fail message sending if monitoring fails
        console.error('Failed to track WhatsApp failure:', monitorError.message);
      }
      
      // Don't throw error to prevent blocking main flow
      logger.warn('WhatsApp message failed, continuing...', { to });
      return null;
    }
  }

  async sendOrderConfirmation(order) {
    if (this.useAsync && config.features.asyncNotifications) {
      return await queueManager.addJob('whatsapp', 'order-confirmation', {
        order,
      });
    }

    const retailerPhone = order.retailer.user.phoneNumber;
    const vendorPhone = order.vendor?.user.phoneNumber;

    const itemsList = order.items
      .map(item => `${item.quantity}x ${item.productName} @ Rs.${item.unitPrice}`)
      .join('\n');

    const retailerMessage = `✅ Order Confirmed!\n\nOrder #${order.orderNumber}\nVendor: ${order.vendor?.user.businessName || 'TBD'}\n\nItems:\n${itemsList}\n\nSubtotal: Rs.${order.subtotal}\nTax: Rs.${order.taxAmount}\nTotal: Rs.${order.total}\n\nStatus: ${order.status}`;

    await this._sendMessageSync(retailerPhone, retailerMessage);

    if (vendorPhone) {
      const vendorMessage = `📦 New Order Received!\n\nOrder #${order.orderNumber}\nRetailer: ${order.retailer.user.businessName}\n\nItems:\n${itemsList}\n\nTotal: Rs.${order.total}\n\nPlease process this order.`;
      await this._sendMessageSync(vendorPhone, vendorMessage);
    }
  }

  async sendPaymentConfirmation(order, amount) {
    if (this.useAsync && config.features.asyncNotifications) {
      return await queueManager.addJob('whatsapp', 'payment-confirmation', {
        order,
        amount,
      });
    }

    const retailerPhone = order.retailer.user.phoneNumber;
    
    const message = `💰 Payment Received!\n\nOrder #${order.orderNumber}\nAmount Paid: Rs.${amount}\nRemaining: Rs.${order.dueAmount}\n\nThank you for your payment!`;

    await this._sendMessageSync(retailerPhone, message);
  }

  async handleIncomingMessage(messageData) {
    const { from, text, messageId } = messageData;

    // Store message
    await prisma.whatsAppMessage.create({
      data: {
        messageId,
        from,
        to: this.phoneNumberId,
        body: text,
        type: 'text',
        status: 'received',
        direction: 'INBOUND',
      },
    });

    whatsappLogger.info('Incoming WhatsApp message', { from, text });

    // Detect intent using intent detection service
    const intentDetectionService = require('./whatsappIntentDetection.service');
    const intentResult = await intentDetectionService.detectIntent({
      phoneNumber: from,
      messageText: text,
      messageId,
    });

    logger.info('Intent detected', {
      from,
      intent: intentResult.intent,
      confidence: intentResult.confidence,
    });

    // Handle based on detected intent
    switch (intentResult.intent) {
      case 'place_order':
        await this.handleOrderIntent(from, text, messageId, intentResult);
        break;

      case 'order_status':
        await this.handleOrderStatusIntent(from, text, intentResult);
        break;

      case 'greeting':
        await this.handleGreetingIntent(from, intentResult);
        break;

      case 'help':
        await this.handleHelpIntent(from, intentResult);
        break;

      case 'unknown':
      default:
        // Only send help if truly unclear
        if (intentResult.shouldSendHelp) {
          await this.handleHelpIntent(from, intentResult);
        } else {
          // Try to process as order anyway (might contain items)
          await this.handleOrderIntent(from, text, messageId, intentResult);
        }
        break;
    }
  }

  async handleOrderIntent(from, text, messageId, intentResult) {
    try {
      const unifiedOrderParser = require('./unifiedOrderParser.service');
      const safeModeService = require('./safeMode.service');
      
      // Find retailer
      const retailer = await prisma.retailers.findFirst({
        where: {
          user: {
            phoneNumber: from,
          },
        },
      });

      if (!retailer) {
        await this.sendMessage(
          from,
          '❌ Retailer account not found. Please contact support to register.'
        );
        return;
      }

      // Check if safe mode is enabled
      const safeModeEnabled = await safeModeService.isEnabled();
      
      if (safeModeEnabled) {
        // Queue order during safe mode
        await safeModeService.queueOrder({
          retailerId: retailer.id,
          phoneNumber: from,
          orderText: text,
          orderData: { messageId, intentResult },
          source: 'whatsapp',
          messageId,
        });

        // Send auto-reply
        const status = await safeModeService.getStatus();
        const autoReplyMessage = safeModeService.getAutoReplyMessage(
          status?.custom_message
        );
        
        await this.sendMessage(from, autoReplyMessage);
        
        logger.info('Order queued during safe mode', {
          retailerId: retailer.id,
          phoneNumber: from,
          messageId,
        });
        
        return;
      }

      // Parse order using unified parser
      const parseResult = await unifiedOrderParser.parseOrder({
        source: 'whatsapp',
        rawText: text,
        retailerId: retailer.id,
      });

      if (!parseResult.success || parseResult.items.length === 0) {
        await this.sendMessage(
          from,
          '❌ Could not parse order items. Please send items in format:\n\nRICE-1KG x 10\nDAL-1KG x 5\n\nOr type "help" for more options.'
        );
        return;
      }

      // Generate summary message
      let message = '📋 Order Summary:\n\n';
      
      const matchedItems = parseResult.items.filter(i => i.productId);
      matchedItems.forEach((item, index) => {
        const itemTotal = item.quantity * item.unitPrice;
        message += `${index + 1}. ${item.productName}\n`;
        message += `   Qty: ${item.quantity} ${item.unit || ''}\n`;
        message += `   Price: Rs.${item.unitPrice} × ${item.quantity} = Rs.${itemTotal}\n`;
        
        if (item.confidence < 100) {
          message += `   ⚠️ ${item.confidence}% match\n`;
        }
        message += '\n';
      });

      message += `Subtotal: Rs.${parseResult.summary.subtotal}\n`;
      message += `Tax (13%): Rs.${parseResult.summary.tax}\n`;
      message += `Total: Rs.${parseResult.summary.total}\n`;

      // Check if needs clarification
      if (parseResult.needsClarification) {
        message += '\n' + parseResult.clarificationMessage;
        
        // Store pending order data
        const intentDetectionService = require('./whatsappIntentDetection.service');
        await intentDetectionService.setPendingAction(from, 'confirm_order', {
          parsingId: parseResult.parsingId,
          items: matchedItems,
          summary: parseResult.summary,
        });
      } else {
        message += '\n\n✅ Reply "CONFIRM" to place order or "CANCEL" to cancel.';
        
        // Store pending order data
        const intentDetectionService = require('./whatsappIntentDetection.service');
        await intentDetectionService.setPendingAction(from, 'confirm_order', {
          parsingId: parseResult.parsingId,
          items: matchedItems,
          summary: parseResult.summary,
        });
      }

      await this.sendMessage(from, message);
    } catch (error) {
      logger.error('Failed to handle order intent', {
        from,
        error: error.message,
        stack: error.stack,
      });

      await this.sendMessage(
        from,
        '❌ Sorry, there was an error processing your order. Please try again or contact support.'
      );
    }
  }

  async handleOrderStatusIntent(from, text, intentResult) {
    try {
      // Extract order number
      const orderNumberMatch = text.match(/(?:order|#)?\s*([A-Z]{3}\d+)/i);
      
      if (!orderNumberMatch) {
        await this.sendMessage(
          from,
          '📋 To check order status, send:\n\nOrder #ORD260100001\n\nOr: Status ORD260100001'
        );
        return;
      }

      const orderNumber = orderNumberMatch[1].toUpperCase();

      // Find order
      const order = await prisma.orders.findFirst({
        where: {
          orderNumber,
          retailer: {
            user: {
              phoneNumber: from,
            },
          },
        },
        include: {
          vendor: {
            include: {
              user: true,
            },
          },
        },
      });

      if (!order) {
        await this.sendMessage(
          from,
          `❌ Order ${orderNumber} not found or doesn't belong to you.`
        );
        return;
      }

      // Generate status message
      let message = `📦 Order Status\n\n`;
      message += `Order #: ${order.orderNumber}\n`;
      message += `Status: ${order.status}\n`;
      message += `Vendor: ${order.vendor?.user.businessName || 'TBD'}\n`;
      message += `Total: Rs.${order.total}\n`;
      message += `Created: ${order.createdAt.toLocaleDateString()}\n`;

      if (order.confirmedAt) {
        message += `Confirmed: ${order.confirmedAt.toLocaleDateString()}\n`;
      }
      if (order.dispatchedAt) {
        message += `Dispatched: ${order.dispatchedAt.toLocaleDateString()}\n`;
      }
      if (order.deliveredAt) {
        message += `Delivered: ${order.deliveredAt.toLocaleDateString()}\n`;
      }

      await this.sendMessage(from, message);
    } catch (error) {
      logger.error('Failed to handle order status intent', {
        from,
        error: error.message,
        stack: error.stack,
      });

      await this.sendMessage(
        from,
        '❌ Sorry, there was an error checking order status. Please try again.'
      );
    }
  }

  async handleGreetingIntent(from, intentResult) {
    try {
      const intentDetectionService = require('./whatsappIntentDetection.service');
      const conversation = await intentDetectionService.getConversation(from);
      
      const hasHistory = conversation && conversation.message_count > 1;
      const message = intentDetectionService.generateGreetingResponse(hasHistory);
      
      await this.sendMessage(from, message);
    } catch (error) {
      logger.error('Failed to handle greeting intent', {
        from,
        error: error.message,
      });

      await this.sendMessage(from, 'Hello! 👋 Type "help" for instructions.');
    }
  }

  async handleHelpIntent(from, intentResult) {
    try {
      const intentDetectionService = require('./whatsappIntentDetection.service');
      const message = intentDetectionService.generateHelpMessage();
      
      await this.sendMessage(from, message);
      
      // Increment help requests metric
      await intentDetectionService.incrementMetric(from, 'help_requests');
    } catch (error) {
      logger.error('Failed to handle help intent', {
        from,
        error: error.message,
      });

      await this.sendMessage(
        from,
        'Welcome to Khaacho! 🛒\n\nSend items to order:\nRICE-1KG x 10\n\nType "help" for more options.'
      );
    }
  }

  looksLikeOrder(text) {
    const orderPatterns = [
      /[A-Z0-9-]+\s*[xX×]\s*\d+/,
      /[A-Z0-9-]+\s*[-:]\s*\d+/,
      /\d+\s*[xX×]\s*[A-Z0-9-]+/,
    ];

    return orderPatterns.some(pattern => pattern.test(text));
  }
}

module.exports = new WhatsAppService();
