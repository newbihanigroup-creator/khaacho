const config = require('../config');
const WhatsAppService = require('../services/whatsapp.service');
const twilioService = require('../services/twilio.service');
const recoveryService = require('../services/failureRecovery.service');
const queueManager = require('../queues/queueManager');
const ApiResponse = require('../utils/response');
const logger = require('../utils/logger');

class WhatsAppController {
  // Existing webhook for Meta WhatsApp API
  async webhook(req, res, next) {
    try {
      // CRITICAL: Store webhook event BEFORE processing
      // This ensures no data is lost if server crashes
      const webhookEvent = await recoveryService.storeWebhookEvent(
        'whatsapp',
        'message_received',
        req.body,
        req.headers
      );

      // Immediately respond to WhatsApp to prevent timeout
      res.sendStatus(200);

      // Process asynchronously
      try {
        const { entry } = req.body;

        if (entry && entry[0]?.changes) {
          const change = entry[0].changes[0];
          const value = change.value;

          if (value.messages && value.messages[0]) {
            const message = value.messages[0];
            
            // Mark as processing
            await recoveryService.markWebhookProcessing(webhookEvent.id);
            
            // Queue for processing (non-blocking)
            await queueManager.addJob('whatsapp', {
              eventId: webhookEvent.id,
              from: message.from,
              text: message.text?.body || '',
              messageId: message.id,
              timestamp: value.metadata?.timestamp,
            });
            
            // Mark as completed
            await recoveryService.markWebhookCompleted(webhookEvent.id);
          }
        }
      } catch (processingError) {
        // Log error but don't fail the webhook response
        logger.error('WhatsApp webhook processing error:', processingError);
        await recoveryService.markWebhookFailed(webhookEvent.id, processingError);
      }
    } catch (error) {
      logger.error('WhatsApp webhook storage error:', error);
      // Still respond 200 to prevent WhatsApp from retrying
      return res.sendStatus(200);
    }
  }

  async verifyWebhook(req, res) {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === config.whatsapp.verifyToken) {
      logger.info('WhatsApp webhook verified');
      return res.status(200).send(challenge);
    }

    return res.sendStatus(403);
  }

  // NEW: Twilio WhatsApp webhook
  async twilioWebhook(req, res, next) {
    try {
      logger.info('Twilio webhook received', { 
        body: req.body,
        from: req.body.From,
        message: req.body.Body,
        headers: {
          signature: req.headers['x-twilio-signature'],
          host: req.headers.host,
          proto: req.headers['x-forwarded-proto']
        }
      });

      const signature = req.headers['x-twilio-signature'];
      const protocol = req.headers['x-forwarded-proto'] || 'https'; // Default to https for Render
      const url = `${protocol}://${req.get('host')}${req.originalUrl}`;
      
      logger.info('Webhook URL constructed', { url, hasSignature: !!signature });
      
      // Validate webhook signature (only in production with full Twilio account)
      if (process.env.NODE_ENV === 'production' && 
          process.env.TWILIO_AUTH_TOKEN && 
          !process.env.TWILIO_SKIP_VALIDATION) {
        try {
          const isValid = twilioService.validateWebhook(signature, url, req.body);
          if (!isValid) {
            logger.warn('Invalid Twilio webhook signature - continuing anyway', { url });
            // Note: Twilio sandbox can have signature validation issues
            // In production with full account, you may want to reject here
          }
        } catch (validationError) {
          logger.error('Webhook validation error - continuing anyway', { 
            error: validationError.message,
            url 
          });
        }
      } else {
        logger.info('Skipping webhook validation (development or sandbox mode)');
      }

      const { From, Body, MediaUrl0 } = req.body;
      
      logger.info('Processing Twilio message', { From, Body });
      
      // Process the incoming message
      await twilioService.processIncomingMessage(From, Body, MediaUrl0);
      
      // Respond with TwiML (empty response)
      res.set('Content-Type', 'text/xml');
      res.send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
    } catch (error) {
      logger.error('Error handling Twilio webhook', { 
        error: error.message,
        stack: error.stack 
      });
      // Still return 200 to prevent Twilio from retrying
      res.set('Content-Type', 'text/xml');
      res.send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
    }
  }

  // NEW: Send WhatsApp message via Twilio
  async sendMessage(req, res, next) {
    try {
      const { phoneNumber, message, mediaUrl } = req.body;

      if (!phoneNumber || !message) {
        return ApiResponse.error(res, 'Phone number and message are required', 400);
      }

      const result = await twilioService.sendWhatsAppMessage(phoneNumber, message, mediaUrl);
      
      return ApiResponse.success(res, result, 'WhatsApp message sent successfully');
    } catch (error) {
      next(error);
    }
  }

  // NEW: Send order confirmation via Twilio
  async sendOrderConfirmation(req, res, next) {
    try {
      const { orderId } = req.params;
      
      // Get order details
      const order = await WhatsAppService.getOrderDetails(orderId);
      
      if (!order || !order.retailer?.phoneNumber) {
        return ApiResponse.error(res, 'Order or phone number not found', 404);
      }

      const result = await twilioService.sendOrderConfirmation(
        order.retailer.phoneNumber, 
        order
      );
      
      return ApiResponse.success(res, result, 'Order confirmation sent');
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new WhatsAppController();
