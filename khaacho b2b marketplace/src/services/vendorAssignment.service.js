const prisma = require('../config/database');
const logger = require('../utils/logger');
const twilioService = require('./twilio.service');
const creditLedgerService = require('./creditLedger.service');
const vendorInventoryService = require('./vendorInventory.service');
const vendorIntelligenceService = require('./vendorIntelligence.service');

class VendorAssignmentService {
  async findMatchingVendors(productName, retailerLocation = null, requestedQuantity = 1) {
    try {
      console.log(`🔍 Finding ranked vendors for: ${productName} (qty: ${requestedQuantity})`);
      
      // Use inventory service to find vendors with actual available stock
      const availableVendors = await vendorInventoryService.findAvailableVendors(
        productName, 
        requestedQuantity
      );

      if (availableVendors.length === 0) {
        console.log(`❌ No vendors have available stock for: ${productName}`);
        return [];
      }

      // Get vendor rankings for intelligent sorting
      const rankedVendors = await vendorIntelligenceService.getRankedVendors(50);
      
      // Create a map of vendorId -> vendor score for quick lookup
      const vendorScoreMap = new Map();
      rankedVendors.forEach(vendor => {
        vendorScoreMap.set(vendor.vendorId, vendor.score);
      });

      // Filter and sort available vendors by their performance scores
      const filteredAndRankedVendors = availableVendors
        .map(vendor => {
          const vendorScore = vendorScoreMap.get(vendor.vendorId) || 0;
          return {
            ...vendor,
            performanceScore: vendorScore,
            rank: vendor.rank,
            // Boost vendors with better scores
            priority: vendorScore >= 70 ? 'HIGH' : 
                     vendorScore >= 60 ? 'MEDIUM' : 
                     vendorScore >= 50 ? 'NORMAL' : 'LOW'
          };
        })
        .sort((a, b) => {
          // First by priority (HIGH > MEDIUM > NORMAL > LOW)
          if (a.priority !== b.priority) {
            return a.priority.localeCompare(b.priority);
          }
          
          // Then by score (descending)
          if (a.priority === b.priority) {
            return b.performanceScore - a.performanceScore;
          }
          
          // Finally by rank (ascending)
          return a.rank - b.rank;
        });

      console.log(`✅ Found ${filteredAndRankedVendors.length} ranked vendors with available stock`);
      
      return filteredAndRankedVendors.map(vendor => ({
        vendorId: vendor.vendorId,
        vendorName: vendor.vendorName,
        vendorPhone: vendor.vendorPhone,
        price: vendor.price,
        availableQuantity: vendor.availableQuantity,
        productId: vendor.productId,
        productName: vendor.productName,
        productCategory: vendor.productCategory,
        unit: vendor.unit,
        canFulfill: vendor.canFulfill,
        fulfillmentRatio: vendor.fulfillmentRatio,
        rank: vendor.rank,
        performanceScore: vendor.performanceScore,
        priority: vendor.priority
      }));

    } catch (error) {
      logger.error('Error finding matching vendors', { 
        productName, 
        retailerLocation, 
        requestedQuantity,
        error: error.message 
      });
      return [];
    }
  }

  calculateVendorRank(vendor) {
    // Simple ranking algorithm - can be enhanced
    let score = 0;
    
    // Price factor (lower is better)
    if (vendor.price && vendor.price > 0) {
      score += Math.max(0, 100 - (vendor.price * 0.1));
    }
    
    // Stock availability factor
    if (vendor.fulfillmentRatio >= 2) {
      score += 50; // Good stock position
    } else if (vendor.fulfillmentRatio >= 1.5) {
      score += 25; // Adequate stock
    }
    
    return score;
  }

  async broadcastOrderToVendors(order, matchedVendors) {
    try {
      console.log(`📢 Broadcasting order ${order.orderNumber} to ${matchedVendors.length} vendors`);
      
      // Get ranked vendors for intelligent routing
      const rankedVendors = await vendorIntelligenceService.getRankedVendors(50);
      
      // Create broadcast results
      const broadcastResults = [];
      
      for (const vendor of rankedVendors) {
        try {
          // Create broadcast log
          const broadcastLog = await prisma.orderBroadcastLog.create({
            data: {
              orderId: order.id,
              vendorId: vendor.vendorId,
              phoneNumber: vendor.vendorPhone,
              message: `🛒 New Order Available!\n\nOrder #: ${order.orderNumber}\nProduct: ${vendor.productName}\nQuantity: ${order.items?.[0]?.quantity || 1} ${vendor.unit}\nPrice: Rs.${vendor.price}/${vendor.unit}\n\nReply ACCEPT to take this order.`,
              sentAt: new Date(),
              status: 'SENT'
            }
          });

          // Send WhatsApp message
          await twilioService.sendWhatsAppMessage(
            vendor.vendorPhone,
            `🛒 New Order Available!

Order #: ${order.orderNumber}
Product: ${vendor.productName}
Quantity: ${order.items?.[0]?.quantity || 1} ${vendor.unit}
Price: Rs.${vendor.price}/${vendor.unit}

Reply ACCEPT to take this order.`
          );

          broadcastResults.push({
            vendorId: vendor.vendorId,
            vendorName: vendor.vendorName,
            status: 'SENT',
            broadcastLogId: broadcastLog.id,
            rank: vendor.rank,
            performanceScore: vendor.performanceScore,
            priority: vendor.priority
          });

          // Add delay between messages to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 500));

        } catch (error) {
          logger.error('Error broadcasting to vendor', {
            vendorId: vendor.vendorId,
            error: error.message
          });
          
          broadcastResults.push({
            vendorId: vendor.vendorId,
            vendorName: vendor.vendorName,
            status: 'FAILED',
            error: error.message
          });
        }
      }

      console.log(`✅ Order broadcast completed: ${broadcastResults.filter(r => r.status === 'SENT').length}/${broadcastResults.length} successful`);
      
      return {
        success: true,
        totalVendors: rankedVendors.length,
        successfulBroadcasts: broadcastResults.filter(r => r.status === 'SENT').length,
        failedBroadcasts: broadcastResults.filter(r => r.status === 'FAILED').length,
        results: broadcastResults
      };

    } catch (error) {
      logger.error('Error broadcasting order to vendors', {
        orderId: order.id,
        error: error.message
      });
      throw error;
    }
  }

  async handleVendorAcceptance(vendorPhoneNumber, orderNumber) {
    try {
      console.log(`🤝 Handling vendor acceptance: ${vendorPhoneNumber}, order ${orderNumber}`);
      
      // Find the order
      const order = await prisma.order.findUnique({
        where: { orderNumber },
        include: {
          items: true,
          retailer: {
            include: {
              user: true
            }
          }
        }
      });

      if (!order) {
        throw new Error('Order not found');
      }

      // Find the vendor by phone number
      const vendor = await prisma.vendor.findFirst({
        where: {
          user: {
            phoneNumber: vendorPhoneNumber
          }
        },
        include: {
          user: true
        }
      });

      if (!vendor) {
        throw new Error('Vendor not found');
      }

      // Use transaction for atomic assignment and performance tracking
      const result = await prisma.$transaction(async (tx) => {
        // Check if order is still available
        const currentOrder = await tx.order.findUnique({
          where: { id: order.id },
          select: { status: true, vendorId: true }
        });

        if (currentOrder.status !== 'PENDING' && currentOrder.status !== 'DRAFT') {
          throw new Error('Order is no longer available for assignment');
        }

        if (currentOrder.vendorId && currentOrder.vendorId !== vendor.id) {
          throw new Error('Order has already been assigned to another vendor');
        }

        // Get order items to reduce inventory
        const orderItems = await tx.orderItem.findMany({
          where: { orderId: order.id }
        });

        // Update order with vendor assignment
        const updatedOrder = await tx.order.update({
          where: { id: order.id },
          data: {
            vendorId: vendor.id,
            productId: orderItems[0]?.productId || null,
            vendorPrice: orderItems[0]?.unitPrice || 0,
            status: 'ACCEPTED',
            acceptedAt: new Date()
          }
        });

        // Reduce inventory for each order item
        for (const item of orderItems) {
          if (item.productId) {
            await vendorInventoryService.reduceStockOnOrderAcceptance(
              order.id,
              vendor.id,
              item.productId,
              item.quantity
            );
          }
        }

        // Update vendor performance
        await vendorIntelligenceService.updateVendorPerformance(
          order.id, 
          'ACCEPTED'
        );

        console.log(`✅ Order ${orderNumber} assigned to vendor ${vendor.user.businessName}`);

        // Notify retailer about vendor assignment
        await this.notifyRetailerVendorAssigned(updatedOrder, vendor);

        return {
          success: true,
          message: `Order accepted! You've been assigned order #${orderNumber}.`,
          order: updatedOrder
        };

      });

      console.log(`✅ Order ${orderNumber} assigned to vendor ${vendor.user.businessName}`);

      // Notify retailer about vendor assignment
      await this.notifyRetailerVendorAssigned(result, vendor);

      return {
        success: true,
        message: `Order accepted! You've been assigned order #${orderNumber}.`,
        order: result
      };

    } catch (error) {
      logger.error('Error handling vendor acceptance', {
        vendorPhoneNumber,
        orderNumber,
        error: error.message
      });
      
      return {
        success: false,
        message: error.message
      };
    }
  }

  async notifyRetailerVendorAssigned(order, vendor) {
    try {
      console.log(`📱 Notifying retailer about vendor assignment for order ${order.orderNumber}`);
      
      const itemsList = order.items?.map(item => 
        `${item.quantity}x ${item.productName}`
      ).join('\n') || 'Items';

      const message = `✅ *Vendor Assigned!*

Order #${order.orderNumber}
Vendor: ${vendor.user.businessName}

Items:
${itemsList}

Total: Rs.${order.total}
Status: Being Prepared

Thank you for choosing Khaacho! 🙏`;

      if (order.retailer?.user?.phoneNumber) {
        await twilioService.sendWhatsAppMessage(
          order.retailer.user.phoneNumber,
          message
        );
      }

    } catch (error) {
      logger.error('Error notifying retailer about vendor assignment', {
        orderId: order.id,
        error: error.message
      });
    }
  }
}

module.exports = new VendorAssignmentService();
