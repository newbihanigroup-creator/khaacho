const twilio = require('twilio');
const logger = require('../utils/logger');
const prisma = require('../config/database');
const vendorAssignmentService = require('./vendorAssignment.service');
const orderStatusTransitionService = require('./orderStatusTransition.service');
const creditControlService = require('./creditControl.service');

class TwilioService {
  constructor() {
    this.client = null;
    this.initialized = false;
    this.init();
  }

  init() {
    try {
      const accountSid = process.env.TWILIO_ACCOUNT_SID;
      const authToken = process.env.TWILIO_AUTH_TOKEN;

      if (!accountSid || !authToken) {
        logger.warn('Twilio credentials not provided - WhatsApp features disabled');
        return;
      }

      this.client = twilio(accountSid, authToken);
      this.initialized = true;
      logger.info('Twilio service initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize Twilio service', { error: error.message });
    }
  }

  async sendWhatsAppMessage(to, message, mediaUrl = null) {
    if (!this.initialized) {
      throw new Error('Twilio service not initialized');
    }

    try {
      // Ensure "to" number has whatsapp: prefix
      const toNumber = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`;

      // Get the from number from environment
      let fromNumber = process.env.TWILIO_WHATSAPP_NUMBER;

      if (!fromNumber) {
        throw new Error('TWILIO_WHATSAPP_NUMBER not configured in environment variables');
      }

      // CRITICAL FIX: Ensure fromNumber has whatsapp: prefix but avoid double-prefixing
      // Remove any existing whatsapp: prefix first, then add it back
      fromNumber = fromNumber.replace(/^whatsapp:/, '');
      fromNumber = `whatsapp:${fromNumber}`;

      logger.info('Preparing to send WhatsApp message', {
        to: toNumber,
        from: fromNumber,
        messageLength: message?.length || 0,
        hasMedia: !!mediaUrl,
      });

      const messageData = {
        body: message,
        from: fromNumber,
        to: toNumber,
      };

      if (mediaUrl) {
        messageData.mediaUrl = [mediaUrl];
      }

      // Log the exact payload being sent to Twilio
      logger.debug('Twilio API call payload', {
        from: messageData.from,
        to: messageData.to,
        bodyPreview: message?.substring(0, 50),
      });

      const result = await this.client.messages.create(messageData);

      logger.info('WhatsApp message sent successfully', {
        to: toNumber,
        from: fromNumber,
        messageSid: result.sid,
        status: result.status,
        dateCreated: result.dateCreated,
      });

      return {
        success: true,
        messageSid: result.sid,
        status: result.status,
      };
    } catch (error) {
      // Enhanced error logging with Twilio-specific details
      logger.error('Failed to send WhatsApp message', {
        to,
        fromEnv: process.env.TWILIO_WHATSAPP_NUMBER,
        error: error.message,
        code: error.code,
        status: error.status,
        moreInfo: error.moreInfo,
        details: error.details,
      });

      // Provide helpful error messages based on Twilio error codes
      let errorMessage = error.message;

      if (error.code === 63007) {
        errorMessage = `Twilio Error 63007: Could not find a Channel with the specified From address. ` +
          `Please verify:\n` +
          `1. TWILIO_WHATSAPP_NUMBER is set correctly (current: ${process.env.TWILIO_WHATSAPP_NUMBER})\n` +
          `2. Your Twilio WhatsApp Sandbox is active OR you have an approved WhatsApp sender\n` +
          `3. The number format matches your Twilio account (e.g., +14155238886)\n` +
          `4. If using Sandbox, you've joined it by sending the code to the sandbox number`;
      } else if (error.code === 21608) {
        errorMessage = `Twilio Error 21608: The 'To' phone number is not a valid WhatsApp number or not opted-in to your sandbox`;
      } else if (error.code === 63003) {
        errorMessage = `Twilio Error 63003: Your Twilio account doesn't have WhatsApp enabled. Please enable it in the Twilio Console`;
      }

      throw new Error(`Failed to send WhatsApp message: ${errorMessage}`);
    }
  }

  async sendOrderConfirmation(phoneNumber, order) {
    const message = `🛒 *Order Confirmed!*

Order #: ${order.orderNumber}
Total: Rs. ${order.totalAmount}
Items: ${order.items?.length || 0} products

We'll notify you when your order is ready for delivery.

Thank you for choosing Khaacho! 🙏`;

    return await this.sendWhatsAppMessage(phoneNumber, message);
  }

  async sendOrderStatusUpdate(phoneNumber, order, status) {
    const statusMessages = {
      VENDOR_ASSIGNED: '👨‍💼 Your order has been assigned to a vendor',
      ACCEPTED: '✅ Your order has been accepted and is being prepared',
      DISPATCHED: '🚚 Your order is on the way!',
      DELIVERED: '📦 Your order has been delivered. Thank you!',
      CANCELLED: '❌ Your order has been cancelled',
    };

    const message = `📋 *Order Update*

Order #: ${order.orderNumber}
Status: ${statusMessages[status] || status}

${status === 'DELIVERED' ? 'Please confirm receipt in the app.' : ''}

Track your order: ${process.env.APP_URL}/orders/${order.id}`;

    return await this.sendWhatsAppMessage(phoneNumber, message);
  }

  async sendPaymentReminder(phoneNumber, order) {
    const message = `💰 *Payment Reminder*

Order #: ${order.orderNumber}
Due Amount: Rs. ${order.dueAmount}
Due Date: ${new Date(order.dueDate).toLocaleDateString()}

Please make payment to avoid service interruption.

Pay now: ${process.env.APP_URL}/payments/${order.id}`;

    return await this.sendWhatsAppMessage(phoneNumber, message);
  }

  async sendCreditLimitAlert(phoneNumber, retailer) {
    const message = `⚠️ *Credit Limit Alert*

Your credit limit is running low:
Available Credit: Rs. ${retailer.creditLimit - retailer.outstandingDebt}
Total Limit: Rs. ${retailer.creditLimit}

Please clear pending payments to continue ordering.

Contact support: ${process.env.SUPPORT_PHONE}`;

    return await this.sendWhatsAppMessage(phoneNumber, message);
  }

  async processIncomingMessage(from, body, mediaUrl = null) {
    // Remove 'whatsapp:' prefix early
    const phoneNumber = from.replace('whatsapp:', '');

    // ============================================================================
    // STRUCTURED LOGGING - Step 1: Message Received
    // ============================================================================
    const logContext = {
      step: 'MESSAGE_RECEIVED',
      phoneNumber,
      messageBody: body,
      messageLength: body?.length || 0,
      hasMedia: !!mediaUrl,
      timestamp: new Date().toISOString(),
    };
    
    console.log('📨 [WEBHOOK] Incoming WhatsApp Message:', JSON.stringify(logContext, null, 2));
    logger.info('WhatsApp message received', logContext);

    try {
      if (!this.initialized) {
        console.log('❌ [WEBHOOK] Twilio not initialized');
        logger.warn('Twilio not initialized - cannot process message');
        return { success: false, message: 'Twilio not initialized' };
      }

      // ============================================================================
      // STRUCTURED LOGGING - Step 2: Check for Help Command
      // ============================================================================
      const isHelpCommand = body?.toLowerCase().trim() === 'help';
      console.log('🔍 [WEBHOOK] Checking message type:', {
        step: 'MESSAGE_TYPE_CHECK',
        isHelpCommand,
        trimmedBody: body?.toLowerCase().trim(),
      });

      if (isHelpCommand) {
        console.log('ℹ️ [WEBHOOK] Help command detected - sending help message');
        return await this.sendWhatsAppMessage(
          phoneNumber,
          `🤝 *Khaacho B2B Marketplace Help*

To place an order, send:
• 10kg rice
• 5 coke
• 2 oil

Or visit our app: ${process.env.APP_URL || 'https://khaacho.onrender.com'}

Call us: ${process.env.SUPPORT_PHONE || '+977-9800000000'}`
        );
      }

      // ============================================================================
      // STRUCTURED LOGGING - Step 3: Check for Vendor Response
      // ============================================================================
      const vendorResponse = this.parseVendorResponse(body);
      console.log('🔍 [WEBHOOK] Checking vendor response:', {
        step: 'VENDOR_RESPONSE_CHECK',
        isVendorResponse: vendorResponse.isVendorResponse,
        action: vendorResponse.action,
      });

      if (vendorResponse.isVendorResponse) {
        console.log('👨‍💼 [WEBHOOK] Vendor response detected - handling vendor action');
        return await this.handleVendorResponse(phoneNumber, vendorResponse);
      }

      // ============================================================================
      // STRUCTURED LOGGING - Step 4: Check for Retailer Confirmation
      // ============================================================================
      const confirmationResponse = this.parseRetailerConfirmation(body);
      console.log('🔍 [WEBHOOK] Checking retailer confirmation:', {
        step: 'CONFIRMATION_CHECK',
        isConfirmationResponse: confirmationResponse.isConfirmationResponse,
        action: confirmationResponse.action,
      });

      if (confirmationResponse.isConfirmationResponse) {
        console.log('✅ [WEBHOOK] Retailer confirmation detected - handling confirmation');
        return await this.handleRetailerConfirmation(phoneNumber, confirmationResponse);
      }

      // ============================================================================
      // STRUCTURED LOGGING - Step 5: Parse Order Message
      // ============================================================================
      const orderData = this.parseOrderMessage(body);
      console.log('🔍 [WEBHOOK] Order parsing result:', {
        step: 'ORDER_PARSE',
        isOrder: orderData.isOrder,
        quantity: orderData.quantity,
        unit: orderData.unit,
        productName: orderData.productName,
        originalMessage: orderData.originalMessage,
      });
      
      if (orderData.isOrder) {
        console.log('📦 [WEBHOOK] Valid order detected - processing order');
        
        // Check if vendors have available stock
        const availableVendors = await vendorInventoryService.findAvailableVendors(
          orderData.productName,
          orderData.quantity
        );

        console.log('🏪 [WEBHOOK] Vendor availability check:', {
          step: 'VENDOR_AVAILABILITY',
          productName: orderData.productName,
          quantity: orderData.quantity,
          availableVendorsCount: availableVendors.length,
        });

        if (availableVendors.length === 0) {
          console.log('❌ [WEBHOOK] No vendors available - checking alternatives');
          
          // Get price comparison for alternatives
          const priceComparison = await vendorInventoryService.getPriceComparison(
            orderData.productName
          );

          let alternativeMessage = `❌ *Product Unavailable*

${orderData.quantity} ${orderData.unit} ${orderData.productName} is not available right now.`;

          if (priceComparison.length > 0) {
            const cheapestAlternative = priceComparison[0];
            alternativeMessage += `

🔄 *Alternative Available:*
${cheapestAlternative.productName}
Price: Rs.${cheapestAlternative.price}/${cheapestAlternative.unit}
Vendor: ${cheapestAlternative.vendorName}

Reply YES to confirm this alternative.`;
          }

          return await this.sendWhatsAppMessage(phoneNumber, alternativeMessage);
        }

        console.log('✅ [WEBHOOK] Vendors available - proceeding with order creation');
        return await this.handleParsedOrder(phoneNumber, orderData);
      }

      // ============================================================================
      // STRUCTURED LOGGING - Step 6: Check if New User
      // ============================================================================
      console.log('🔍 [WEBHOOK] Not an order - checking if new user');
      const isNewUser = await this.isNewUser(phoneNumber);
      console.log('👤 [WEBHOOK] User status check:', {
        step: 'USER_STATUS_CHECK',
        phoneNumber,
        isNewUser,
      });
      
      if (isNewUser) {
        console.log('👋 [WEBHOOK] New user detected - sending welcome message');
        return await this.sendWhatsAppMessage(
          phoneNumber,
          `👋 *Welcome to Khaacho B2B Marketplace!*

To place an order, send:
• 10kg rice
• 5 coke
• 2 oil

Example: "10kg rice"

Type "help" for more options.

Visit our app: ${process.env.APP_URL || 'https://khaacho.onrender.com'}`
        );
      }

      // ============================================================================
      // STRUCTURED LOGGING - Step 7: Check Credit Status
      // ============================================================================
      console.log('🔍 [WEBHOOK] Existing user - checking credit status');
      try {
        const user = await prisma.user.findUnique({
          where: { phoneNumber },
          include: { retailerProfile: true }
        });

        console.log('👤 [WEBHOOK] User lookup result:', {
          step: 'USER_LOOKUP',
          phoneNumber,
          userFound: !!user,
          userId: user?.id,
          role: user?.role,
          hasRetailerProfile: !!user?.retailerProfile,
          retailerId: user?.retailerProfile?.id,
        });

        if (user?.retailerProfile) {
          const creditStatus = await creditControlService.getRetailerCreditStatus(user.retailerProfile.id);
          
          console.log('💳 [WEBHOOK] Credit status check:', {
            step: 'CREDIT_STATUS_CHECK',
            retailerId: user.retailerProfile.id,
            isBlocked: creditStatus.isBlocked,
            creditUtilization: creditStatus.creditUtilization?.toString(),
            creditAvailable: creditStatus.creditAvailable?.toString(),
          });
          
          if (creditStatus.isBlocked) {
            console.log('🚫 [WEBHOOK] Account blocked - sending blocked message');
            return await this.sendWhatsAppMessage(
              phoneNumber,
              `❌ *Account Blocked*

${creditStatus.blockedReason || 'Your account is temporarily blocked.'}

Please contact admin to resolve this issue.

Support: ${process.env.SUPPORT_PHONE || '+977-9800000000'}`
            );
          }

          // Send credit limit warning if near limit
          if (creditStatus.creditUtilization && creditStatus.creditUtilization.gte(90)) {
            console.log('⚠️ [WEBHOOK] Credit limit warning - sending warning message');
            return await this.sendWhatsAppMessage(
              phoneNumber,
              `⚠️ *Credit Limit Warning*

You have used ${creditStatus.creditUtilization}% of your credit limit.

Available credit: Rs.${creditStatus.creditAvailable}

Please clear dues to continue ordering.

Thank you for your business! 🙏`
            );
          }
        }
      } catch (creditError) {
        console.error('❌ [WEBHOOK] Error checking credit status:', {
          step: 'CREDIT_CHECK_ERROR',
          error: creditError.message,
          stack: creditError.stack,
        });
        logger.error('Error checking credit status', { error: creditError.message });
        // Continue with normal flow if credit check fails
      }

      // ============================================================================
      // STRUCTURED LOGGING - Step 8: Default Fallback Message
      // ============================================================================
      console.log('💬 [WEBHOOK] Sending default help message (fallback):', {
        step: 'DEFAULT_FALLBACK',
        reason: 'No specific condition matched',
        phoneNumber,
        messageBody: body,
      });

      // Default response for existing users
      return await this.sendWhatsAppMessage(
        phoneNumber,
        `Hello! 👋 

To place an order, send:
• 10kg rice
• 5 coke
• 2 oil

Type "help" for more options.`
      );
    } catch (error) {
      console.error('❌ [WEBHOOK] Fatal error processing message:', {
        step: 'FATAL_ERROR',
        phoneNumber,
        error: error.message,
        stack: error.stack,
        isPrismaError: error.code?.startsWith('P'),
      });
      
      logger.error('Error processing incoming WhatsApp message', {
        from: phoneNumber,
        error: error.message,
        stack: error.stack,
        isPrismaError: error.code?.startsWith('P'),
      });

      // CRITICAL: Always try to send a response, even if DB is down
      try {
        await this.sendWhatsAppMessage(
          phoneNumber,
          'Sorry, our system is temporarily unavailable. Please try again in a few minutes or contact support.'
        );
        return { success: false, error: error.message, replySent: true };
      } catch (sendError) {
        console.error('❌ [WEBHOOK] Failed to send error message:', {
          error: sendError.message,
          code: sendError.code,
        });
        logger.error('Failed to send error message', {
          error: sendError.message,
          code: sendError.code
        });
        return { success: false, error: error.message, replySent: false };
      }
    }
  }

  // Parse vendor response (ACCEPT/DECLINE)
  parseVendorResponse(message) {
    if (!message || typeof message !== 'string') {
      return { isVendorResponse: false };
    }

    const trimmedMessage = message.trim().toLowerCase();
    
    if (trimmedMessage === 'accept') {
      return {
        isVendorResponse: true,
        action: 'ACCEPT'
      };
    }
    
    if (trimmedMessage === 'decline') {
      return {
        isVendorResponse: true,
        action: 'DECLINE'
      };
    }
    
    return { isVendorResponse: false };
  }

  // Parse retailer confirmation response (CONFIRM/ISSUE)
  parseRetailerConfirmation(message) {
    if (!message || typeof message !== 'string') {
      return { isConfirmationResponse: false };
    }

    const trimmedMessage = message.trim().toLowerCase();
    
    if (trimmedMessage === 'confirm') {
      return {
        isConfirmationResponse: true,
        action: 'CONFIRM'
      };
    }
    
    if (trimmedMessage === 'issue') {
      return {
        isConfirmationResponse: true,
        action: 'ISSUE'
      };
    }
    
    if (trimmedMessage === 'yes') {
      return {
        isAlternativeConfirmation: true,
        action: 'YES'
      };
    }
    
    return { isConfirmationResponse: false };
  }

  // Handle retailer confirmation and alternative responses
  async handleRetailerConfirmation(phoneNumber, confirmationResponse) {
    try {
      console.log(`📱 Retailer response from ${phoneNumber}: ${confirmationResponse.action}`);
      
      if (confirmationResponse.action === 'CONFIRM') {
        // Handle normal order confirmation
        return await this.handleNormalOrderConfirmation(phoneNumber);
      }
      
      if (confirmationResponse.action === 'ISSUE') {
        // Handle order issue
        return await this.handleOrderIssue(phoneNumber);
      }
      
      if (confirmationResponse.action === 'YES') {
        // Handle alternative product confirmation
        return await this.handleAlternativeConfirmation(phoneNumber);
      }
      
    } catch (error) {
      logger.error('Error handling retailer confirmation', {
        phoneNumber,
        confirmationResponse,
        error: error.message
      });
      
      return await this.sendWhatsAppMessage(
        phoneNumber,
        '❌ Error processing your confirmation. Please try again or contact support.'
      );
    }
  }

  async handleNormalOrderConfirmation(phoneNumber) {
    // Find delivered orders for this retailer that haven't been confirmed
    const deliveredOrders = await prisma.order.findMany({
      where: {
        status: 'DELIVERED',
        retailer: {
          user: {
            phoneNumber: phoneNumber
          }
        }
      },
      include: {
        retailer: {
          include: {
            user: true
          }
        }
      },
      orderBy: { deliveredAt: 'desc' },
      take: 1 // Get most recent delivered order
    });
    
    if (deliveredOrders.length === 0) {
      return await this.sendWhatsAppMessage(
        phoneNumber,
        `❌ No delivered orders found to confirm.

If you believe this is an error, please contact support.`
      );
    }
    
    const order = deliveredOrders[0];
    
    // Confirm order completion
    await orderStatusTransitionService.confirmOrderCompletion(order.id, {
      id: order.retailer.userId,
      role: 'RETAILER',
      retailerProfile: order.retailer
    });
    
    return await this.sendWhatsAppMessage(
      phoneNumber,
      `✅ *Order Confirmed!*

Order #${order.orderNumber}
Thank you for confirming receipt.

Your order is now marked as completed.

Thank you for choosing Khaacho! 🙏`
    );
  }

  async handleOrderIssue(phoneNumber) {
    // Find delivered orders for this retailer
    const deliveredOrders = await prisma.order.findMany({
      where: {
        status: 'DELIVERED',
        retailer: {
          user: {
            phoneNumber: phoneNumber
          }
        }
      },
      orderBy: { deliveredAt: 'desc' },
      take: 1
    });
    
    if (deliveredOrders.length > 0) {
      const order = deliveredOrders[0];
      
      // Create support ticket or log issue
      await prisma.order.update({
        where: { id: order.id },
        data: {
          internalNotes: `Customer reported issue via WhatsApp: ${new Date().toISOString()}`
        }
      });
      
      return await this.sendWhatsAppMessage(
        phoneNumber,
        `📞 *Support Request Received*

Order #${order.orderNumber}

Our support team will contact you shortly to resolve the issue.
You can also call us: ${process.env.SUPPORT_PHONE || '+977-9800000000'}

Thank you for your patience! 🙏`
      );
    }
  }

  async handleAlternativeConfirmation(phoneNumber) {
    // This would need to track the alternative suggestion state
    // For now, just send a confirmation message
    return await this.sendWhatsAppMessage(
      phoneNumber,
      `✅ *Alternative Confirmed!*

Thank you for confirming the alternative product.

Our team will process your order shortly.

Thank you for choosing Khaacho! 🙏`
    );
  }

  // Handle vendor response to order broadcast
  async handleVendorResponse(phoneNumber, vendorResponse) {
    try {
      console.log(`🤝 Vendor response from ${phoneNumber}: ${vendorResponse.action}`);
      
      if (vendorResponse.action === 'ACCEPT') {
        // Find pending orders that were broadcasted to this vendor
        const broadcastLogs = await prisma.orderBroadcastLog.findMany({
          where: {
            phoneNumber: phoneNumber,
            status: 'SENT',
            responseType: null, // No response yet
            order: {
              status: {
                in: ['PENDING', 'DRAFT']
              }
            }
          },
          include: {
            order: {
              select: {
                id: true,
                orderNumber: true
              }
            }
          },
          orderBy: { sentAt: 'desc' },
          take: 1 // Get most recent
        });
        
        if (broadcastLogs.length === 0) {
          return await this.sendWhatsAppMessage(
            phoneNumber,
            `❌ No pending orders found for your response.

If you believe this is an error, please contact support.`
          );
        }
        
        const mostRecentOrder = broadcastLogs[0];
        
        // Handle vendor acceptance
        const result = await vendorAssignmentService.handleVendorAcceptance(
          phoneNumber,
          mostRecentOrder.order.orderNumber
        );
        
        // Update broadcast log with response
        await prisma.orderBroadcastLog.update({
          where: { id: mostRecentOrder.id },
          data: {
            responseReceivedAt: new Date(),
            responseType: result.success ? 'ACCEPTED' : 'FAILED'
          }
        });
        
        return await this.sendWhatsAppMessage(phoneNumber, result.message);
        
      } else if (vendorResponse.action === 'DECLINE') {
        // Update broadcast log with decline response
        await prisma.orderBroadcastLog.updateMany({
          where: {
            phoneNumber: phoneNumber,
            status: 'SENT',
            responseType: null
          },
          data: {
            responseReceivedAt: new Date(),
            responseType: 'DECLINED'
          }
        });
        
        return await this.sendWhatsAppMessage(
          phoneNumber,
          `👍 Thank you for your response.

We'll keep you in mind for future orders.`
        );
      }
      
    } catch (error) {
      logger.error('Error handling vendor response', {
        phoneNumber,
        vendorResponse,
        error: error.message
      });
      
      return await this.sendWhatsAppMessage(
        phoneNumber,
        '❌ Error processing your response. Please try again or contact support.'
      );
    }
  }

  // Parse order message to extract quantity and product name
  parseOrderMessage(message) {
    console.log('🔍 [PARSER] Starting order message parsing:', {
      function: 'parseOrderMessage',
      message,
      messageType: typeof message,
      messageLength: message?.length,
    });

    if (!message || typeof message !== 'string') {
      console.log('❌ [PARSER] Invalid message type:', {
        message,
        type: typeof message,
        result: 'NOT_AN_ORDER',
      });
      return { isOrder: false };
    }

    const trimmedMessage = message.trim().toLowerCase();
    console.log('🔍 [PARSER] Trimmed message:', {
      original: message,
      trimmed: trimmedMessage,
      length: trimmedMessage.length,
    });
    
    // Pattern to match: number + optional unit + product name
    // Examples: "10kg rice", "5 coke", "2 oil", "1 dozen eggs"
    const orderPattern = /^(\d+(?:\.\d+)?)\s*([a-zA-Z]*)\s*([a-zA-Z\s]+)$/;
    const match = trimmedMessage.match(orderPattern);
    
    console.log('🔍 [PARSER] Regex match result:', {
      pattern: orderPattern.toString(),
      matched: !!match,
      matchGroups: match ? {
        full: match[0],
        quantity: match[1],
        unit: match[2],
        productName: match[3],
      } : null,
    });
    
    if (match) {
      const quantity = parseFloat(match[1]);
      const unit = match[2] || '';
      const productName = match[3].trim();
      
      console.log('✅ [PARSER] Order components extracted:', {
        quantity,
        unit,
        productName,
        isValidQuantity: quantity > 0,
        isValidProductName: productName.length > 0,
      });
      
      if (quantity > 0 && productName.length > 0) {
        const result = {
          isOrder: true,
          quantity: quantity,
          unit: unit,
          productName: productName,
          originalMessage: message.trim()
        };
        
        console.log('✅ [PARSER] Valid order parsed:', JSON.stringify(result, null, 2));
        return result;
      } else {
        console.log('❌ [PARSER] Invalid order components:', {
          quantity,
          productName,
          reason: quantity <= 0 ? 'Invalid quantity' : 'Empty product name',
        });
      }
    } else {
      console.log('❌ [PARSER] Message does not match order pattern:', {
        trimmedMessage,
        pattern: orderPattern.toString(),
        examples: ['10kg rice', '5 coke', '2 oil'],
      });
    }
    
    return { isOrder: false };
  }

  // Check if user is new (no previous orders or messages)
  async isNewUser(phoneNumber) {
    console.log('🔍 [USER_CHECK] Checking if user is new:', {
      function: 'isNewUser',
      phoneNumber,
    });

    try {
      const user = await prisma.user.findUnique({
        where: { phoneNumber },
        include: { retailerProfile: true }
      });
      
      console.log('👤 [USER_CHECK] User lookup result:', {
        phoneNumber,
        userFound: !!user,
        userId: user?.id,
        role: user?.role,
        hasRetailerProfile: !!user?.retailerProfile,
        retailerId: user?.retailerProfile?.id,
      });
      
      if (!user) {
        console.log('❌ [USER_CHECK] User not found in database - treating as new user');
        return true;
      }
      
      // Check if user has any previous orders
      const orderCount = await prisma.order.count({
        where: { retailerId: user.retailerProfile?.id }
      });
      
      console.log('📊 [USER_CHECK] Order count check:', {
        phoneNumber,
        userId: user.id,
        retailerId: user.retailerProfile?.id,
        orderCount,
        isNewUser: orderCount === 0,
      });
      
      return orderCount === 0;
    } catch (error) {
      console.error('❌ [USER_CHECK] Error checking if user is new:', {
        phoneNumber,
        error: error.message,
        stack: error.stack,
      });
      logger.error('Error checking if user is new', { error: error.message });
      return false;
    }
  }

  // Handle parsed order and create order record
  async handleParsedOrder(phoneNumber, orderData) {
    try {
      // Find user by phone number
      const user = await prisma.user.findUnique({
        where: { phoneNumber },
        include: { retailerProfile: true }
      });
      
      if (!user || user.role !== 'RETAILER' || !user.retailerProfile) {
        return await this.sendWhatsAppMessage(
          phoneNumber,
          `❌ *Order Failed*

Only registered retailers can place orders.

Please contact support to register:
${process.env.SUPPORT_PHONE || '+977-9800000000'}`
        );
      }
      
      if (!user.isActive) {
        return await this.sendWhatsAppMessage(
          phoneNumber,
          `❌ *Account Inactive*

Your account is inactive. Please contact admin.`
        );
      }
      
      // Generate order number
      const orderNumber = 'ORD' + Date.now();
      
      // Create order record with PENDING status
      const order = await prisma.order.create({
        data: {
          orderNumber,
          retailerId: user.retailerProfile.id,
          vendorId: '', // Will be assigned later
          status: 'PENDING',
          paymentStatus: 'PENDING',
          subtotal: 0, // Will be calculated when vendor is assigned
          total: 0,
          dueAmount: 0,
          notes: `WhatsApp Order: ${orderData.quantity} ${orderData.unit} ${orderData.productName}`,
          whatsappMessageId: `WA_${Date.now()}`,
        }
      });
      
      // Create order item
      await prisma.orderItem.create({
        data: {
          orderId: order.id,
          vendorProductId: '', // Will be assigned when vendor is assigned
          quantity: orderData.quantity,
          unitPrice: 0, // Will be set when vendor is assigned
          totalPrice: 0,
          productName: `${orderData.quantity} ${orderData.unit} ${orderData.productName}`,
          notes: `Parsed from WhatsApp: ${orderData.originalMessage}`
        }
      });
      
      console.log('✅ Order created:', {
        orderNumber,
        phoneNumber,
        orderData
      });
      
      // Find matching vendors and broadcast order
      try {
        console.log('🔍 Starting vendor matching process...');
        const matchedVendors = await vendorAssignmentService.findMatchingVendors(
          orderData.productName
        );
        
        if (matchedVendors.length > 0) {
          console.log(`📢 Broadcasting to ${matchedVendors.length} vendors`);
          const broadcastResult = await vendorAssignmentService.broadcastOrderToVendors(
            order,
            matchedVendors
          );
          
          if (broadcastResult.success) {
            // Send confirmation to retailer with broadcast info
            return await this.sendWhatsAppMessage(
              phoneNumber,
              `✅ *Order Received!*

Order #${orderNumber}
Item: ${orderData.quantity} ${orderData.unit} ${orderData.productName}
Status: Pending Vendor Assignment

📢 Your order has been sent to ${broadcastResult.successfulSends} vendors.
First vendor to accept will be assigned.

Thank you for choosing Khaacho! 🙏`
            );
          } else {
            console.error('❌ Broadcast failed:', broadcastResult.error);
          }
        } else {
          console.log('❌ No matching vendors found for product:', orderData.productName);
          
          // Send notification to retailer about no vendors found
          return await this.sendWhatsAppMessage(
            phoneNumber,
            `⚠️ *Order Received - No Vendors Found*

Order #${orderNumber}
Item: ${orderData.quantity} ${orderData.unit} ${orderData.productName}

We couldn't find any vendors for this product right now.
Our team will manually source this for you.

Thank you for your patience! 🙏`
          );
        }
      } catch (error) {
        console.error('❌ Error in vendor assignment process:', error.message);
        logger.error('Vendor assignment process error', { error: error.message });
      }
      
      // Send basic confirmation if vendor process fails
      return await this.sendWhatsAppMessage(
        phoneNumber,
        `✅ *Order Received!*

Order #${orderNumber}
Item: ${orderData.quantity} ${orderData.unit} ${orderData.productName}
Status: Pending

We'll process your order and assign a vendor shortly.

Thank you for choosing Khaacho! 🙏`
      );
      
    } catch (error) {
      logger.error('Error handling parsed order', { error: error.message });
      return await this.sendWhatsAppMessage(
        phoneNumber,
        `❌ *Order Processing Failed*

We couldn't process your order. Please try again or contact support.

Error: ${error.message}`
      );
    }
  }

  async handleOrderMessage(phoneNumber, message) {
    // This method is kept for backward compatibility
    const response = `📝 *Order Request Received*

We've received your order request:
"${message.substring(0, 100)}..."

Our team will contact you shortly to confirm details.

For faster service, please use our app:
${process.env.APP_URL}

Or call: ${process.env.SUPPORT_PHONE}`;

    return await this.sendWhatsAppMessage(phoneNumber, response);
  }

  // Webhook verification for Twilio
  validateWebhook(signature, url, params) {
    if (!this.initialized) {
      return false;
    }

    const authToken = process.env.TWILIO_AUTH_TOKEN;
    return twilio.validateRequest(authToken, signature, url, params);
  }
}

module.exports = new TwilioService();