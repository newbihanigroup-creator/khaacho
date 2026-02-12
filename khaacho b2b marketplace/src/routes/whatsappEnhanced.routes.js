const express = require('express');
const EnhancedWhatsAppController = require('../controllers/enhancedWhatsapp.controller');
const { authenticate, authorize } = require('../middleware/auth');
const { body } = require('express-validator');
const validate = require('../middleware/validation');

const router = express.Router();

/**
 * Enhanced WhatsApp Routes
 * Handles incoming messages with fuzzy matching and atomic order creation
 */

// ==================== WEBHOOK ENDPOINTS ====================

/**
 * Main webhook for Twilio WhatsApp messages
 * Public endpoint (no auth) - validated by Twilio signature
 */
router.post(
  '/webhook',
  EnhancedWhatsAppController.handleWebhook.bind(EnhancedWhatsAppController)
);

/**
 * Webhook verification (for initial setup)
 * Used by WhatsApp/Twilio to verify webhook URL
 */
router.get(
  '/webhook',
  EnhancedWhatsAppController.verifyWebhook.bind(EnhancedWhatsAppController)
);

// ==================== MANUAL ORDER CREATION (FOR TESTING) ====================

/**
 * Manually create order from message text
 * Useful for testing parser without WhatsApp
 */
router.post(
  '/test/parse-order',
  authenticate,
  authorize('ADMIN', 'OPERATOR'),
  [
    body('retailerId').isUUID().withMessage('Valid retailer ID required'),
    body('messageText').notEmpty().withMessage('Message text required'),
  ],
  validate,
  async (req, res, next) => {
    try {
      const { retailerId, messageText } = req.body;
      
      const EnhancedOrderParserService = require('../services/enhancedOrderParser.service');
      const parseResult = await EnhancedOrderParserService.parseOrderMessage(messageText);
      
      return res.json({
        success: true,
        data: parseResult
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * Test product matching
 * Useful for testing fuzzy matching algorithm
 */
router.post(
  '/test/match-product',
  authenticate,
  authorize('ADMIN', 'OPERATOR'),
  [
    body('searchTerm').notEmpty().withMessage('Search term required'),
  ],
  validate,
  async (req, res, next) => {
    try {
      const { searchTerm } = req.body;
      
      const ProductMatcherService = require('../services/productMatcher.service');
      const matchResult = await ProductMatcherService.findProduct(searchTerm);
      
      return res.json({
        success: true,
        data: matchResult
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * Test atomic order creation
 * Useful for testing transaction safety
 */
router.post(
  '/test/create-order',
  authenticate,
  authorize('ADMIN', 'OPERATOR'),
  [
    body('retailerId').isUUID().withMessage('Valid retailer ID required'),
    body('items').isArray().withMessage('Items array required'),
    body('items.*.vendorProductId').isUUID().withMessage('Valid product ID required'),
    body('items.*.quantity').isInt({ min: 1 }).withMessage('Valid quantity required'),
  ],
  validate,
  async (req, res, next) => {
    try {
      const { retailerId, items, metadata } = req.body;
      
      const AtomicOrderCreationService = require('../services/atomicOrderCreation.service');
      const result = await AtomicOrderCreationService.createOrder(
        retailerId,
        items,
        {
          ...metadata,
          notes: 'Test order via API',
          createdBy: req.user.id
        }
      );
      
      return res.json({
        success: true,
        data: result
      });
    } catch (error) {
      next(error);
    }
  }
);

// ==================== ADMIN ENDPOINTS ====================

/**
 * Get pending orders awaiting confirmation
 */
router.get(
  '/pending-orders',
  authenticate,
  authorize('ADMIN', 'OPERATOR'),
  async (req, res, next) => {
    try {
      const prisma = require('../config/database');
      
      const pendingOrders = await prisma.$queryRawUnsafe(`
        SELECT 
          p.*,
          r.shop_name,
          u.phone_number,
          u.business_name
        FROM pending_whatsapp_orders p
        JOIN retailers r ON p.retailer_id = r.id
        JOIN users u ON r.user_id = u.id
        WHERE p.expires_at > NOW()
        ORDER BY p.created_at DESC
      `);
      
      return res.json({
        success: true,
        data: pendingOrders.map(order => ({
          ...order,
          order_data: JSON.parse(order.order_data)
        }))
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * Clear expired pending orders (manual cleanup)
 */
router.post(
  '/cleanup-pending',
  authenticate,
  authorize('ADMIN'),
  async (req, res, next) => {
    try {
      const prisma = require('../config/database');
      
      const result = await prisma.$executeRawUnsafe(`
        DELETE FROM pending_whatsapp_orders
        WHERE expires_at < NOW()
      `);
      
      return res.json({
        success: true,
        message: 'Expired pending orders cleaned up',
        deletedCount: result
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * Get WhatsApp message statistics
 */
router.get(
  '/stats',
  authenticate,
  authorize('ADMIN', 'OPERATOR'),
  async (req, res, next) => {
    try {
      const prisma = require('../config/database');
      const { days = 7 } = req.query;
      
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - parseInt(days));
      
      const [totalMessages, processedMessages, failedMessages, ordersCreated] = await Promise.all([
        prisma.whatsAppMessage.count({
          where: {
            createdAt: { gte: startDate }
          }
        }),
        prisma.whatsAppMessage.count({
          where: {
            createdAt: { gte: startDate },
            isProcessed: true
          }
        }),
        prisma.whatsAppMessage.count({
          where: {
            createdAt: { gte: startDate },
            isProcessed: true,
            errorMessage: { not: null }
          }
        }),
        prisma.order.count({
          where: {
            createdAt: { gte: startDate },
            whatsappMessageId: { not: null }
          }
        })
      ]);
      
      return res.json({
        success: true,
        data: {
          period: `Last ${days} days`,
          totalMessages,
          processedMessages,
          failedMessages,
          ordersCreated,
          successRate: totalMessages > 0 ? ((processedMessages - failedMessages) / totalMessages * 100).toFixed(2) : 0,
          orderConversionRate: processedMessages > 0 ? (ordersCreated / processedMessages * 100).toFixed(2) : 0
        }
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * Get fuzzy matching statistics
 */
router.get(
  '/matching-stats',
  authenticate,
  authorize('ADMIN', 'OPERATOR'),
  async (req, res, next) => {
    try {
      const prisma = require('../config/database');
      const { days = 7 } = req.query;
      
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - parseInt(days));
      
      // Get orders with metadata about matching
      const orders = await prisma.order.findMany({
        where: {
          createdAt: { gte: startDate },
          whatsappMessageId: { not: null }
        },
        include: {
          items: true
        }
      });
      
      const stats = {
        totalOrders: orders.length,
        totalItems: orders.reduce((sum, o) => sum + o.items.length, 0),
        avgItemsPerOrder: orders.length > 0 ? (orders.reduce((sum, o) => sum + o.items.length, 0) / orders.length).toFixed(2) : 0
      };
      
      return res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      next(error);
    }
  }
);

module.exports = router;
