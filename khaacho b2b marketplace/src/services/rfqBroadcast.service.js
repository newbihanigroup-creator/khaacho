const prisma = require('../config/database');
const logger = require('../utils/logger');
const wholesalerRankingService = require('./wholesalerRanking.service');

/**
 * RFQ Broadcast Service
 * Broadcasts Request for Quotations to top wholesalers for extracted items
 */

class RFQBroadcastService {
  constructor() {
    this.defaultWholesalerLimit = 5;
  }

  /**
   * Broadcast RFQs for all items in an uploaded order
   * 
   * @param {string} uploadedOrderId - ID of uploaded order
   * @returns {Promise<Object>} - Broadcast results with RFQ counts
   * @throws {Error} - Structured error with code and details
   */
  async broadcastRFQs(uploadedOrderId) {
    const startTime = Date.now();

    logger.info('🚀 Starting RFQ broadcast', { uploadedOrderId });

    try {
      // Step 1: Fetch uploaded order with extracted items
      logger.info('Step 1: Fetching uploaded order', { uploadedOrderId });
      const uploadedOrder = await this.fetchUploadedOrder(uploadedOrderId);

      if (!uploadedOrder) {
        throw this.createError(
          'ORDER_NOT_FOUND',
          `UploadedOrder not found: ${uploadedOrderId}`,
          { uploadedOrderId }
        );
      }

      logger.info('✓ Uploaded order fetched', {
        uploadedOrderId,
        retailerId: uploadedOrder.retailerId,
        status: uploadedOrder.status,
      });

      // Step 2: Extract items from parsedData
      logger.info('Step 2: Extracting items from parsedData', { uploadedOrderId });
      const extractedItems = this.getExtractedItems(uploadedOrder);

      if (extractedItems.length === 0) {
        logger.warn('No extracted items to broadcast', { uploadedOrderId });
        return {
          uploadedOrderId,
          totalItems: 0,
          itemsProcessed: 0,
          rfqsCreated: 0,
          wholesalersNotified: 0,
          items: [],
        };
      }

      logger.info('✓ Items extracted', {
        uploadedOrderId,
        itemCount: extractedItems.length,
      });

      // Step 3: Process items and broadcast RFQs (wrapped in transaction)
      logger.info('Step 3: Broadcasting RFQs (transaction)', { uploadedOrderId });
      
      const result = await prisma.$transaction(async (tx) => {
        const broadcastResults = [];
        let totalRFQs = 0;
        let totalWholesalers = 0;

        for (let i = 0; i < extractedItems.length; i++) {
          const item = extractedItems[i];
          
          logger.info(`Processing item ${i + 1}/${extractedItems.length}`, {
            uploadedOrderId,
            itemName: item.name,
            productId: item.productId,
          });

          // Skip items without productId
          if (!item.productId) {
            logger.warn('Skipping item without productId', {
              uploadedOrderId,
              itemName: item.name,
            });
            
            broadcastResults.push({
              itemName: item.name,
              productId: null,
              wholesalersFound: 0,
              rfqsCreated: 0,
              skipped: true,
              reason: 'No productId',
            });
            continue;
          }

          // Step 3a: Get top wholesalers for this product
          logger.info('Step 3a: Getting top wholesalers', {
            uploadedOrderId,
            productId: item.productId,
            itemName: item.name,
          });

          const wholesalers = await wholesalerRankingService.getTopWholesalersForProduct(
            item.productId,
            this.defaultWholesalerLimit
          );

          logger.info('✓ Top wholesalers retrieved', {
            uploadedOrderId,
            productId: item.productId,
            wholesalerCount: wholesalers.length,
          });

          if (wholesalers.length === 0) {
            logger.warn('No wholesalers found for product', {
              uploadedOrderId,
              productId: item.productId,
              itemName: item.name,
            });

            broadcastResults.push({
              itemName: item.name,
              productId: item.productId,
              wholesalersFound: 0,
              rfqsCreated: 0,
              skipped: true,
              reason: 'No wholesalers available',
            });
            continue;
          }

          // Step 3b: Create RFQ records for each wholesaler
          logger.info('Step 3b: Creating RFQ records', {
            uploadedOrderId,
            productId: item.productId,
            wholesalerCount: wholesalers.length,
          });

          const rfqRecords = [];

          for (const wholesaler of wholesalers) {
            const rfq = await tx.orderBroadcastLog.create({
              data: {
                uploadedOrderId,
                retailerId: uploadedOrder.retailerId,
                productId: item.productId,
                wholesalerId: wholesaler.wholesalerId,
                requestedQuantity: item.quantity,
                requestedUnit: item.unit,
                status: 'SENT',
                metadata: {
                  itemName: item.name,
                  itemConfidence: item.confidence,
                  wholesalerRankingScore: wholesaler.rankingScore,
                  wholesalerPrice: wholesaler.price,
                  wholesalerReliability: wholesaler.reliabilityScore,
                  extractedAt: new Date().toISOString(),
                },
              },
            });

            rfqRecords.push(rfq);

            logger.info('✓ RFQ record created', {
              uploadedOrderId,
              rfqId: rfq.id,
              wholesalerId: wholesaler.wholesalerId,
              wholesalerName: wholesaler.businessName,
              productId: item.productId,
            });
          }

          // Step 3c: Generate notification payloads
          logger.info('Step 3c: Generating notification payloads', {
            uploadedOrderId,
            productId: item.productId,
            rfqCount: rfqRecords.length,
          });

          const notifications = this.generateNotificationPayloads(
            uploadedOrder,
            item,
            wholesalers,
            rfqRecords
          );

          logger.info('✓ Notification payloads generated', {
            uploadedOrderId,
            notificationCount: notifications.length,
          });

          // Step 3d: Log broadcast for this item
          logger.info('Step 3d: Logging broadcast completion', {
            uploadedOrderId,
            productId: item.productId,
            rfqsCreated: rfqRecords.length,
          });

          totalRFQs += rfqRecords.length;
          totalWholesalers += wholesalers.length;

          broadcastResults.push({
            itemName: item.name,
            productId: item.productId,
            productName: item.productName,
            quantity: item.quantity,
            unit: item.unit,
            wholesalersFound: wholesalers.length,
            rfqsCreated: rfqRecords.length,
            rfqIds: rfqRecords.map(r => r.id),
            notifications,
            skipped: false,
          });

          logger.info('✓ Item broadcast completed', {
            uploadedOrderId,
            itemName: item.name,
            rfqsCreated: rfqRecords.length,
          });
        }

        // Return transaction results
        return {
          uploadedOrderId,
          totalItems: extractedItems.length,
          itemsProcessed: broadcastResults.filter(r => !r.skipped).length,
          rfqsCreated: totalRFQs,
          wholesalersNotified: totalWholesalers,
          items: broadcastResults,
        };
      });

      const duration = Date.now() - startTime;

      logger.info('🎉 RFQ broadcast completed successfully', {
        uploadedOrderId,
        totalItems: result.totalItems,
        itemsProcessed: result.itemsProcessed,
        rfqsCreated: result.rfqsCreated,
        wholesalersNotified: result.wholesalersNotified,
        duration,
      });

      return result;

    } catch (error) {
      const duration = Date.now() - startTime;

      // If already a structured error, re-throw
      if (error.code && error.isBroadcastError) {
        logger.error('❌ RFQ broadcast failed', {
          uploadedOrderId,
          errorCode: error.code,
          errorMessage: error.message,
          duration,
        });
        throw error;
      }

      // Generic error
      logger.error('❌ Unexpected broadcast error', {
        uploadedOrderId,
        error: error.message,
        stack: error.stack,
        duration,
      });

      throw this.createError(
        'BROADCAST_FAILED',
        `Failed to broadcast RFQs: ${error.message}`,
        { uploadedOrderId, originalError: error.message }
      );
    }
  }

  /**
   * Fetch uploaded order from database
   * 
   * @param {string} uploadedOrderId - Order ID
   * @returns {Promise<Object>} - Uploaded order
   */
  async fetchUploadedOrder(uploadedOrderId) {
    try {
      return await prisma.uploadedOrder.findUnique({
        where: { id: uploadedOrderId },
        include: {
          retailer: {
            select: {
              id: true,
              shopName: true,
              user: {
                select: {
                  id: true,
                  name: true,
                  phoneNumber: true,
                },
              },
            },
          },
        },
      });
    } catch (error) {
      logger.error('Failed to fetch uploaded order', {
        uploadedOrderId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Extract items from parsedData
   * 
   * @param {Object} uploadedOrder - Uploaded order
   * @returns {Array} - Extracted items
   */
  getExtractedItems(uploadedOrder) {
    try {
      const parsedData = uploadedOrder.parsedData;

      if (!parsedData || typeof parsedData !== 'object') {
        return [];
      }

      const items = parsedData.items || [];

      if (!Array.isArray(items)) {
        logger.warn('parsedData.items is not an array', {
          uploadedOrderId: uploadedOrder.id,
        });
        return [];
      }

      return items;
    } catch (error) {
      logger.error('Failed to extract items from parsedData', {
        uploadedOrderId: uploadedOrder.id,
        error: error.message,
      });
      return [];
    }
  }

  /**
   * Generate notification payloads for wholesalers
   * 
   * @param {Object} uploadedOrder - Uploaded order
   * @param {Object} item - Extracted item
   * @param {Array} wholesalers - Top wholesalers
   * @param {Array} rfqRecords - Created RFQ records
   * @returns {Array} - Notification payloads
   */
  generateNotificationPayloads(uploadedOrder, item, wholesalers, rfqRecords) {
    const notifications = [];

    for (let i = 0; i < wholesalers.length; i++) {
      const wholesaler = wholesalers[i];
      const rfq = rfqRecords[i];

      const notification = {
        rfqId: rfq.id,
        wholesalerId: wholesaler.wholesalerId,
        wholesalerName: wholesaler.businessName,
        wholesalerPhone: wholesaler.phoneNumber,
        wholesalerEmail: wholesaler.email,
        
        // RFQ details
        productId: item.productId,
        productName: item.productName || item.name,
        requestedQuantity: item.quantity,
        requestedUnit: item.unit,
        
        // Retailer details
        retailerId: uploadedOrder.retailerId,
        retailerName: uploadedOrder.retailer?.shopName,
        retailerContact: uploadedOrder.retailer?.user?.name,
        retailerPhone: uploadedOrder.retailer?.user?.phoneNumber,
        
        // Notification content
        subject: `New RFQ: ${item.name}`,
        message: this.buildNotificationMessage(uploadedOrder, item, wholesaler),
        
        // Metadata
        uploadedOrderId: uploadedOrder.id,
        createdAt: new Date().toISOString(),
        notificationType: 'RFQ_REQUEST',
        priority: 'NORMAL',
      };

      notifications.push(notification);
    }

    return notifications;
  }

  /**
   * Build notification message for wholesaler
   * 
   * @param {Object} uploadedOrder - Uploaded order
   * @param {Object} item - Extracted item
   * @param {Object} wholesaler - Wholesaler
   * @returns {string} - Notification message
   */
  buildNotificationMessage(uploadedOrder, item, wholesaler) {
    const retailerName = uploadedOrder.retailer?.shopName || 'A retailer';
    const productName = item.productName || item.name;
    const quantity = item.quantity;
    const unit = item.unit || 'units';

    return `
Hello ${wholesaler.businessName},

${retailerName} is requesting a quotation for:

Product: ${productName}
Quantity: ${quantity} ${unit}

Please provide your best quote at your earliest convenience.

Thank you!
    `.trim();
  }

  /**
   * Create structured error object
   * 
   * @param {string} code - Error code
   * @param {string} message - Error message
   * @param {Object} details - Additional error details
   * @returns {Error} - Structured error
   */
  createError(code, message, details = {}) {
    const error = new Error(message);
    error.code = code;
    error.details = details;
    error.isBroadcastError = true;
    error.timestamp = new Date().toISOString();
    return error;
  }

  /**
   * Get service health status
   * 
   * @returns {Object} - Health status
   */
  getHealthStatus() {
    return {
      service: 'RFQ Broadcast',
      defaultWholesalerLimit: this.defaultWholesalerLimit,
      timestamp: new Date().toISOString(),
    };
  }
}

// Export singleton instance
module.exports = new RFQBroadcastService();
