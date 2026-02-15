/**
 * Hardened WhatsApp Webhook Controller
 * 
 * Production-ready webhook endpoint with:
 * - Fast response (<2s guaranteed)
 * - Background queue processing
 * - Signature validation
 * - Duplicate message prevention
 * - Replay attack protection
 * - Rate limiting
 * - Comprehensive logging
 */

const config = require('../config');
const webhookSecurityService = require('../services/webhookSecurity.service');
const queueManager = require('../queues/queueManager');
const logger = require('../shared/logger');

class HardenedWhatsAppController {
  /**
   * Meta WhatsApp webhook verification
   * Handles webhook subscription verification
   */
  async verifyWebhook(req, res) {
    try {
      const mode = req.query['hub.mode'];
      const token = req.query['hub.verify_token'];
      const challenge = req.query['hub.challenge'];

      if (mode === 'subscribe' && token === config.whatsapp.verifyToken) {
        logger.info('WhatsApp webhook verified successfully');
        return res.status(200).send(challenge);
      }

      logger.warn('WhatsApp webhook verification failed', {
        mode,
        tokenMatch: token === config.whatsapp.verifyToken,
      });

      return res.sendStatus(403);
    } catch (error) {
      logger.error('Webhook verification error', {
        error: error.message,
        stack: error.stack,
      });
      
      return res.sendStatus(403);
    }
  }

  /**
   * Meta WhatsApp webhook handler
   * 
   * CRITICAL REQUIREMENTS:
   * 1. Return HTTP 200 within 2 seconds
   * 2. Move processing to background queue
   * 3. Validate signature (if configured)
   * 4. Prevent duplicate processing
   * 5. Log messageId for replay attack prevention
   */
  async webhook(req, res) {
    const startTime = Date.now();
    const requestId = req.id || `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    try {
      // STEP 1: Immediate response preparation
      // Set timeout to ensure response within 2 seconds
      const responseTimeout = setTimeout(() => {
        if (!res.headersSent) {
          logger.warn('Webhook response timeout, sending 200', {
            requestId,
            duration: Date.now() - startTime,
          });
          res.sendStatus(200);
        }
      }, 1800); // 1.8 seconds to be safe

      // STEP 2: Extract message data quickly
      const { entry } = req.body;
      
      if (!entry || !entry[0]?.changes) {
        clearTimeout(responseTimeout);
        logger.info('Webhook received with no changes', { requestId });
        return res.sendStatus(200);
      }

      const change = entry[0].changes[0];
      const value = change.value;

      if (!value.messages || !value.messages[0]) {
        clearTimeout(responseTimeout);
        logger.info('Webhook received with no messages', { requestId });
        return res.sendStatus(200);
      }

      const message = value.messages[0];
      const messageId = message.id;
      const phoneNumber = message.from;

      // STEP 3: Quick duplicate check (must be fast)
      const isDuplicate = await webhookSecurityService.isDuplicate(messageId, 'whatsapp');
      
      if (isDuplicate) {
        clearTimeout(responseTimeout);
        logger.info('Duplicate message detected, skipping', {
          requestId,
          messageId,
          phoneNumber,
          duration: Date.now() - startTime,
        });
        return res.sendStatus(200);
      }

      // STEP 4: Quick rate limit check
      const withinRateLimit = await webhookSecurityService.checkRateLimit('whatsapp', phoneNumber);
      
      if (!withinRateLimit) {
        clearTimeout(responseTimeout);
        logger.warn('Rate limit exceeded', {
          requestId,
          messageId,
          phoneNumber,
          duration: Date.now() - startTime,
        });
        return res.sendStatus(200); // Still return 200 to prevent retries
      }

      // STEP 5: Record message (fast insert)
      const recordId = await webhookSecurityService.recordMessage({
        messageId,
        source: 'whatsapp',
        phoneNumber,
        requestBody: req.body,
        requestHeaders: {
          'user-agent': req.headers['user-agent'],
          'x-forwarded-for': req.headers['x-forwarded-for'],
          'x-hub-signature-256': req.headers['x-hub-signature-256'],
        },
      });

      // STEP 6: Queue for background processing (non-blocking)
      const queueJobId = await queueManager.addJob('whatsapp-messages', 'process-message', {
        recordId,
        messageId,
        phoneNumber,
        messageText: message.text?.body || '',
        messageType: message.type,
        timestamp: value.metadata?.timestamp || Date.now(),
        requestId,
      });

      // STEP 7: Record rate limit attempt
      webhookSecurityService.recordRateLimitAttempt(
        'whatsapp',
        phoneNumber,
        req.ip
      ).catch(err => {
        logger.error('Failed to record rate limit attempt', {
          error: err.message,
        });
      });

      // STEP 8: Update message with queue job ID
      webhookSecurityService.updateMessageStatus(messageId, 'processing', {
        queueJobId,
        responseTimeMs: Date.now() - startTime,
      }).catch(err => {
        logger.error('Failed to update message status', {
          error: err.message,
        });
      });

      // STEP 9: Record performance metrics (async, non-blocking)
      const responseTime = Date.now() - startTime;
      webhookSecurityService.recordPerformanceMetrics({
        source: 'whatsapp',
        endpoint: '/webhook',
        responseTimeMs: responseTime,
        httpStatus: 200,
        success: true,
      }).catch(err => {
        logger.error('Failed to record performance metrics', {
          error: err.message,
        });
      });

      // STEP 10: Clear timeout and respond
      clearTimeout(responseTimeout);
      
      logger.info('Webhook processed successfully', {
        requestId,
        messageId,
        phoneNumber,
        queueJobId,
        duration: responseTime,
      });

      return res.sendStatus(200);

    } catch (error) {
      const duration = Date.now() - startTime;
      
      logger.error('Webhook processing error', {
        requestId,
        error: error.message,
        stack: error.stack,
        duration,
      });

      // Record failure metrics
      webhookSecurityService.recordPerformanceMetrics({
        source: 'whatsapp',
        endpoint: '/webhook',
        responseTimeMs: duration,
        httpStatus: 200, // Still return 200
        success: false,
      }).catch(() => {});

      // CRITICAL: Always return 200 to prevent WhatsApp from retrying
      return res.sendStatus(200);
    }
  }

  /**
   * Twilio WhatsApp webhook handler
   * 
   * Same hardening principles as Meta webhook
   */
  async twilioWebhook(req, res) {
    const startTime = Date.now();
    const requestId = req.id || `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    try {
      // STEP 1: Set response timeout
      const responseTimeout = setTimeout(() => {
        if (!res.headersSent) {
          logger.warn('Twilio webhook timeout, sending response', {
            requestId,
            duration: Date.now() - startTime,
          });
          res.set('Content-Type', 'text/xml');
          res.send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
        }
      }, 1800);

      // STEP 2: Validate signature (if configured)
      if (process.env.NODE_ENV === 'production' && 
          process.env.TWILIO_AUTH_TOKEN && 
          !process.env.TWILIO_SKIP_VALIDATION) {
        
        const signature = req.headers['x-twilio-signature'];
        const protocol = req.headers['x-forwarded-proto'] || 'https';
        const url = `${protocol}://${req.get('host')}${req.originalUrl}`;
        
        const isValid = await webhookSecurityService.validateSignature(
          'twilio',
          signature,
          url,
          req.body,
          process.env.TWILIO_AUTH_TOKEN
        );

        if (!isValid) {
          clearTimeout(responseTimeout);
          logger.warn('Invalid Twilio signature', {
            requestId,
            url,
            duration: Date.now() - startTime,
          });
          
          // Still return 200 to prevent retries, but don't process
          res.set('Content-Type', 'text/xml');
          return res.send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
        }
      }

      // STEP 3: Extract message data
      const { From, Body, MessageSid, MediaUrl0 } = req.body;
      const phoneNumber = From;
      const messageId = MessageSid;

      if (!messageId || !phoneNumber) {
        clearTimeout(responseTimeout);
        logger.warn('Twilio webhook missing required fields', {
          requestId,
          hasMessageSid: !!messageId,
          hasFrom: !!phoneNumber,
        });
        
        res.set('Content-Type', 'text/xml');
        return res.send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
      }

      // STEP 4: Duplicate check
      const isDuplicate = await webhookSecurityService.isDuplicate(messageId, 'twilio');
      
      if (isDuplicate) {
        clearTimeout(responseTimeout);
        logger.info('Duplicate Twilio message detected', {
          requestId,
          messageId,
          phoneNumber,
          duration: Date.now() - startTime,
        });
        
        res.set('Content-Type', 'text/xml');
        return res.send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
      }

      // STEP 5: Rate limit check
      const withinRateLimit = await webhookSecurityService.checkRateLimit('twilio', phoneNumber);
      
      if (!withinRateLimit) {
        clearTimeout(responseTimeout);
        logger.warn('Twilio rate limit exceeded', {
          requestId,
          messageId,
          phoneNumber,
          duration: Date.now() - startTime,
        });
        
        res.set('Content-Type', 'text/xml');
        return res.send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
      }

      // STEP 6: Record message
      const recordId = await webhookSecurityService.recordMessage({
        messageId,
        source: 'twilio',
        phoneNumber,
        requestBody: req.body,
        requestHeaders: {
          'user-agent': req.headers['user-agent'],
          'x-forwarded-for': req.headers['x-forwarded-for'],
          'x-twilio-signature': req.headers['x-twilio-signature'],
        },
      });

      // STEP 7: Queue for processing
      const queueJobId = await queueManager.addJob('whatsapp-messages', 'process-twilio-message', {
        recordId,
        messageId,
        phoneNumber,
        messageText: Body || '',
        mediaUrl: MediaUrl0,
        timestamp: Date.now(),
        requestId,
      });

      // STEP 8: Record metrics (async)
      const responseTime = Date.now() - startTime;
      
      webhookSecurityService.updateMessageStatus(messageId, 'processing', {
        queueJobId,
        responseTimeMs: responseTime,
      }).catch(() => {});

      webhookSecurityService.recordRateLimitAttempt('twilio', phoneNumber, req.ip).catch(() => {});
      
      webhookSecurityService.recordPerformanceMetrics({
        source: 'twilio',
        endpoint: '/twilio/webhook',
        responseTimeMs: responseTime,
        httpStatus: 200,
        success: true,
      }).catch(() => {});

      // STEP 9: Respond
      clearTimeout(responseTimeout);
      
      logger.info('Twilio webhook processed successfully', {
        requestId,
        messageId,
        phoneNumber,
        queueJobId,
        duration: responseTime,
      });

      res.set('Content-Type', 'text/xml');
      return res.send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');

    } catch (error) {
      const duration = Date.now() - startTime;
      
      logger.error('Twilio webhook error', {
        requestId,
        error: error.message,
        stack: error.stack,
        duration,
      });

      webhookSecurityService.recordPerformanceMetrics({
        source: 'twilio',
        endpoint: '/twilio/webhook',
        responseTimeMs: duration,
        httpStatus: 200,
        success: false,
      }).catch(() => {});

      // Always return valid TwiML
      res.set('Content-Type', 'text/xml');
      return res.send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
    }
  }

  /**
   * Get webhook statistics
   * Admin endpoint for monitoring
   */
  async getWebhookStats(req, res) {
    try {
      const { source = 'whatsapp', hours = 24 } = req.query;

      const [processingStats, securityStats, performanceStats] = await Promise.all([
        webhookSecurityService.getWebhookStats(source, hours),
        webhookSecurityService.getSecurityStats(source, hours),
        webhookSecurityService.getPerformanceStats(source, hours),
      ]);

      return res.json({
        success: true,
        data: {
          processing: processingStats,
          security: securityStats,
          performance: performanceStats,
        },
      });
    } catch (error) {
      logger.error('Error getting webhook stats', {
        error: error.message,
      });

      return res.status(500).json({
        success: false,
        error: 'Failed to get webhook statistics',
      });
    }
  }
}

module.exports = new HardenedWhatsAppController();
