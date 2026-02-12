const twilioService = require('../services/twilio.service');
const EnhancedOrderParserService = require('../services/enhancedOrderParser.service');
const AtomicOrderCreationService = require('../services/atomicOrderCreation.service');
const prisma = require('../config/database');
const logger = require('../utils/logger');
const ApiResponse = require('../utils/response');

/**
 * Enhanced WhatsApp Controller
 * Handles incoming WhatsApp messages with improved parsing and order creation
 */
class EnhancedWhatsAppController {

  /**
   * Main webhook handler for Twilio WhatsApp messages
   */
  async handleWebhook(req, res, next) {
    try {
      const { From, Body, MessageSid } = req.body;
      
      logger.info('WhatsApp message received', { 
        from: From, 
        messageId: MessageSid,
        body: Body 
      });

      // Respond immediately to prevent timeout
      res.set('Content-Type', 'text/xml');
      res.send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');

      // Process message asynchronously
      this.processMessage(From, Body, MessageSid).catch(error => {
        logger.error('Message processing failed', { 
          error: error.message, 
          from: From 
        });
      });

    } catch (error) {
      logger.error('Webhook handler error', { error: error.message });
      res.set('Content-Type', 'text/xml');
      res.send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
    }
  }

  /**
   * Process incoming WhatsApp message
   */
  async processMessage(phoneNumber, messageText, messageId) {
    try {
      // Normalize phone number (remove whatsapp: prefix)
      const normalizedPhone = phoneNumber.replace('whatsapp:', '');

      // Find user by phone number
      const user = await prisma.user.findUnique({
        where: { phoneNumber: normalizedPhone },
        include: {
          retailerProfile: true
        }
      });

      // Handle unregistered users
      if (!user) {
        await this.sendWelcomeMessage(phoneNumber);
        return;
      }

      // Handle non-retailer users
      if (user.role !== 'RETAILER' || !user.retailerProfile) {
        await twilioService.sendWhatsAppMessage(
          phoneNumber,
          '⚠️ Only registered retailers can place orders via WhatsApp.\n\nPlease contact admin for assistance.'
        );
        return;
      }

      // Handle inactive accounts
      if (!user.isActive) {
        await twilioService.sendWhatsAppMessage(
          phoneNumber,
          '⚠️ Your account is inactive.\n\nPlease contact admin to reactivate your account.'
        );
        return;
      }

      // Check for pending order confirmation
      const pendingOrder = await this.checkPendingConfirmation(user.retailerProfile.id);
      if (pendingOrder) {
        await this.handleOrderConfirmation(phoneNumber, messageText, pendingOrder);
        return;
      }

      // Check for order status query
      if (this.isOrderStatusQuery(messageText)) {
        await this.handleOrderStatusQuery(phoneNumber, messageText, user.retailerProfile.id);
        return;
      }

      // Check for help request
      if (this.isHelpRequest(messageText)) {
        await this.sendHelpMessage(phoneNumber);
        return;
      }

      // Parse as order
      await this.handleOrderMessage(phoneNumber, messageText, messageId, user.retailerProfile);

    } catch (error) {
      logger.error('Message processing error', { 
        error: error.message, 
        phoneNumber,
        stack: error.stack 
      });

      // Send error message to user
      await twilioService.sendWhatsAppMessage(
        phoneNumber,
        '❌ Sorry, something went wrong processing your message.\n\nPlease try again or contact support.'
      );
    }
  }

  /**
   * Handle order message
   */
  async handleOrderMessage(phoneNumber, messageText, messageId, retailerProfile) {
    logger.info('Processing order message', { 
      retailerId: retailerProfile.id, 
      message: messageText 
    });

    // Parse order using enhanced parser
    const parseResult = await EnhancedOrderParserService.parseOrderMessage(messageText);

    if (!parseResult.success || parseResult.items.length === 0) {
      // No valid items found
      let errorMsg = '❌ Could not parse your order.\n\n';
      
      if (parseResult.errors.length > 0) {
        errorMsg += 'Issues:\n' + parseResult.errors.join('\n');
      } else {
        errorMsg += 'Please use format:\nSKU x Quantity\n\nExample:\nRICE-1KG x 10\nDAL-1KG x 5';
      }

      await twilioService.sendWhatsAppMessage(phoneNumber, errorMsg);
      return;
    }

    // Generate order summary
    const summary = EnhancedOrderParserService.generateOrderSummary(
      parseResult.items, 
      parseResult.errors
    );

    // Store pending order for confirmation
    await this.storePendingOrder(retailerProfile.id, {
      items: parseResult.items,
      messageText,
      messageId,
      phoneNumber
    });

    // Send confirmation prompt
    const confirmationPrompt = EnhancedOrderParserService.generateConfirmationPrompt(
      parseResult.items
    );

    await twilioService.sendWhatsAppMessage(
      phoneNumber,
      summary + confirmationPrompt
    );
  }

  /**
   * Handle order confirmation
   */
  async handleOrderConfirmation(phoneNumber, messageText, pendingOrder) {
    const response = messageText.trim().toUpperCase();

    if (response === 'CONFIRM' || response === 'YES' || response === 'OK') {
      // Create order atomically
      try {
        const result = await AtomicOrderCreationService.createOrder(
          pendingOrder.retailerId,
          pendingOrder.items,
          {
            notes: 'Order placed via WhatsApp',
            whatsappMessageId: pendingOrder.messageId,
            whatsappMessage: pendingOrder.messageText,
            whatsappTo: 'system',
            createdBy: pendingOrder.retailerId
          }
        );

        // Clear pending order
        await this.clearPendingOrder(pendingOrder.retailerId);

        // Send success message
        const order = result.order;
        const successMsg = `✅ Order Confirmed!\n\n` +
          `Order #${order.orderNumber}\n` +
          `Status: ${order.status}\n` +
          `Total: Rs.${parseFloat(order.total).toFixed(2)}\n` +
          `Items: ${order.items.length}\n\n` +
          `We'll notify you when a vendor accepts your order.\n\n` +
          `Track your order: Send "STATUS ${order.orderNumber}"`;

        await twilioService.sendWhatsAppMessage(phoneNumber, successMsg);

        logger.info('Order created successfully via WhatsApp', { 
          orderId: order.id, 
          orderNumber: order.orderNumber 
        });

      } catch (error) {
        logger.error('Order creation failed', { 
          error: error.message, 
          retailerId: pendingOrder.retailerId 
        });

        await twilioService.sendWhatsAppMessage(
          phoneNumber,
          `❌ Order creation failed: ${error.message}\n\nPlease try again or contact support.`
        );

        // Clear pending order
        await this.clearPendingOrder(pendingOrder.retailerId);
      }

    } else if (response === 'CANCEL' || response === 'NO') {
      // Cancel order
      await this.clearPendingOrder(pendingOrder.retailerId);
      
      await twilioService.sendWhatsAppMessage(
        phoneNumber,
        '❌ Order cancelled.\n\nSend a new message to place another order.'
      );

    } else {
      // Invalid response
      await twilioService.sendWhatsAppMessage(
        phoneNumber,
        '⚠️ Please reply:\n• "CONFIRM" to place order\n• "CANCEL" to cancel\n\nOr send corrections to your order.'
      );
    }
  }

  /**
   * Handle order status query
   */
  async handleOrderStatusQuery(phoneNumber, messageText, retailerId) {
    // Extract order number
    const orderNumberMatch = messageText.match(/(?:status|track|order)\s*#?([A-Z0-9]+)/i);
    
    if (!orderNumberMatch) {
      await twilioService.sendWhatsAppMessage(
        phoneNumber,
        '⚠️ Please provide order number.\n\nExample: STATUS ORD260210001'
      );
      return;
    }

    const orderNumber = orderNumberMatch[1].toUpperCase();

    // Find order
    const order = await prisma.order.findFirst({
      where: {
        orderNumber,
        retailerId
      },
      include: {
        vendor: {
          include: {
            user: {
              select: { businessName: true }
            }
          }
        },
        items: {
          include: {
            product: true
          }
        }
      }
    });

    if (!order) {
      await twilioService.sendWhatsAppMessage(
        phoneNumber,
        `❌ Order ${orderNumber} not found.`
      );
      return;
    }

    // Generate status message
    const statusEmoji = {
      PENDING: '⏳',
      CONFIRMED: '✅',
      VENDOR_ASSIGNED: '🏪',
      ACCEPTED: '👍',
      DISPATCHED: '🚚',
      DELIVERED: '📦',
      COMPLETED: '✔️',
      CANCELLED: '❌'
    };

    let statusMsg = `${statusEmoji[order.status]} Order Status\n\n`;
    statusMsg += `Order #${order.orderNumber}\n`;
    statusMsg += `Status: ${order.status}\n`;
    
    if (order.vendor) {
      statusMsg += `Vendor: ${order.vendor.user.businessName}\n`;
    }
    
    statusMsg += `\nItems: ${order.items.length}\n`;
    statusMsg += `Total: Rs.${parseFloat(order.total).toFixed(2)}\n`;
    statusMsg += `Paid: Rs.${parseFloat(order.paidAmount).toFixed(2)}\n`;
    statusMsg += `Due: Rs.${parseFloat(order.dueAmount).toFixed(2)}\n`;
    
    if (order.expectedDelivery) {
      const deliveryDate = new Date(order.expectedDelivery);
      statusMsg += `\nExpected Delivery: ${deliveryDate.toLocaleDateString()}`;
    }

    await twilioService.sendWhatsAppMessage(phoneNumber, statusMsg);
  }

  /**
   * Send welcome message to unregistered users
   */
  async sendWelcomeMessage(phoneNumber) {
    const message = `👋 Welcome to Khaacho!\n\n` +
      `You're not registered yet.\n\n` +
      `To place orders via WhatsApp, please:\n` +
      `1. Contact our admin team\n` +
      `2. Complete registration\n` +
      `3. Get your account activated\n\n` +
      `Thank you!`;

    await twilioService.sendWhatsAppMessage(phoneNumber, message);
  }

  /**
   * Send help message
   */
  async sendHelpMessage(phoneNumber) {
    const message = `📚 Khaacho Help\n\n` +
      `🛒 Place Order:\n` +
      `Send product SKU and quantity\n` +
      `Example:\n` +
      `RICE-1KG x 10\n` +
      `DAL-1KG x 5\n\n` +
      `📦 Check Order Status:\n` +
      `Send: STATUS ORD260210001\n\n` +
      `❓ Need Help?\n` +
      `Contact support or visit our website.`;

    await twilioService.sendWhatsAppMessage(phoneNumber, message);
  }

  /**
   * Check if message is order status query
   */
  isOrderStatusQuery(text) {
    const patterns = [
      /status/i,
      /track/i,
      /order\s*#?[A-Z0-9]+/i,
      /where\s+is\s+my\s+order/i
    ];

    return patterns.some(pattern => pattern.test(text));
  }

  /**
   * Check if message is help request
   */
  isHelpRequest(text) {
    const patterns = [
      /^help$/i,
      /^how/i,
      /^what/i,
      /^menu$/i
    ];

    return patterns.some(pattern => pattern.test(text));
  }

  /**
   * Store pending order for confirmation
   */
  async storePendingOrder(retailerId, orderData) {
    // Store in database with 10 minute expiry
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await prisma.$executeRawUnsafe(`
      INSERT INTO pending_whatsapp_orders (retailer_id, order_data, expires_at)
      VALUES ($1, $2, $3)
      ON CONFLICT (retailer_id) DO UPDATE SET
        order_data = EXCLUDED.order_data,
        expires_at = EXCLUDED.expires_at,
        created_at = NOW()
    `, retailerId, JSON.stringify(orderData), expiresAt);
  }

  /**
   * Check for pending order confirmation
   */
  async checkPendingConfirmation(retailerId) {
    try {
      const result = await prisma.$queryRawUnsafe(`
        SELECT * FROM pending_whatsapp_orders
        WHERE retailer_id = $1
        AND expires_at > NOW()
      `, retailerId);

      if (result && result.length > 0) {
        const pending = result[0];
        return {
          retailerId,
          ...JSON.parse(pending.order_data)
        };
      }

      return null;
    } catch (error) {
      // Table might not exist yet
      logger.warn('Pending orders table not found', { error: error.message });
      return null;
    }
  }

  /**
   * Clear pending order
   */
  async clearPendingOrder(retailerId) {
    try {
      await prisma.$executeRawUnsafe(`
        DELETE FROM pending_whatsapp_orders
        WHERE retailer_id = $1
      `, retailerId);
    } catch (error) {
      logger.warn('Could not clear pending order', { error: error.message });
    }
  }

  /**
   * Webhook verification (for setup)
   */
  async verifyWebhook(req, res) {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
      logger.info('WhatsApp webhook verified');
      return res.status(200).send(challenge);
    }

    return res.sendStatus(403);
  }
}

module.exports = new EnhancedWhatsAppController();
