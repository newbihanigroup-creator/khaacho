const prisma = require('../config/database');
const logger = require('../utils/logger');
const twilioService = require('./twilio.service');
const creditControlService = require('./creditControl.service');
const vendorInventoryService = require('./vendorInventory.service');
const financialAccountingService = require('./financialAccounting.service');

class OrderStatusTransitionService {
  constructor() {
    // Define valid status transitions
    this.validTransitions = {
      'PLACED': ['PENDING', 'CANCELLED'],
      'PENDING': ['ACCEPTED', 'CANCELLED'],
      'ACCEPTED': ['PACKING', 'CANCELLED'],
      'PACKING': ['DISPATCHED', 'CANCELLED'],
      'DISPATCHED': ['OUT_FOR_DELIVERY', 'CANCELLED'],
      'OUT_FOR_DELIVERY': ['DELIVERED', 'CANCELLED'],
      'DELIVERED': ['COMPLETED', 'CANCELLED'],
      'COMPLETED': [], // Terminal state
      'CANCELLED': []  // Terminal state
    };

    // Define who can update each status
    this.rolePermissions = {
      'PLACED': ['ADMIN', 'OPERATOR', 'SYSTEM'],
      'PENDING': ['ADMIN', 'OPERATOR', 'SYSTEM'],
      'ACCEPTED': ['ADMIN', 'OPERATOR', 'SYSTEM'],
      'PACKING': ['VENDOR', 'ADMIN', 'OPERATOR'],
      'DISPATCHED': ['VENDOR', 'ADMIN', 'OPERATOR'],
      'OUT_FOR_DELIVERY': ['ADMIN', 'OPERATOR', 'DELIVERY_AGENT'],
      'DELIVERED': ['ADMIN', 'OPERATOR', 'DELIVERY_AGENT'],
      'COMPLETED': ['ADMIN', 'OPERATOR', 'RETAILER'], // Retailer confirms completion
      'CANCELLED': ['ADMIN', 'OPERATOR', 'VENDOR', 'RETAILER']
    };
  }

  async validateTransition(orderId, newStatus, userRole) {
    try {
      // Get current order
      const order = await prisma.order.findUnique({
        where: { id: orderId },
        select: { status: true }
      });

      if (!order) {
        throw new Error('Order not found');
      }

      const currentStatus = order.status;

      // Check if transition is valid
      if (!this.validTransitions[currentStatus].includes(newStatus)) {
        throw new Error(`Invalid status transition from ${currentStatus} to ${newStatus}`);
      }

      // Check if user has permission
      if (!this.rolePermissions[newStatus].includes(userRole)) {
        throw new Error(`User role ${userRole} not authorized to update status to ${newStatus}`);
      }

      return {
        isValid: true,
        currentStatus,
        newStatus,
        userRole
      };

    } catch (error) {
      logger.error('Status transition validation failed', {
        orderId,
        newStatus,
        userRole,
        error: error.message
      });
      return {
        isValid: false,
        error: error.message
      };
    }
  }

  async updateOrderStatus(orderId, newStatus, user, options = {}) {
    try {
      console.log(`📦 Updating order ${orderId} status to ${newStatus} by ${user.role}`);
      
      const { notes = '', estimatedDeliveryTime, deliveryAgentId } = options;

      // Get order details for credit validation if accepting order
      if (newStatus === 'ACCEPTED') {
        const order = await prisma.order.findUnique({
          where: { id: orderId },
          include: {
            retailer: {
              select: {
                id: true
              }
            }
          }
        });

        if (order && order.retailerId) {
          // Validate credit limit before accepting order
          const creditValidation = await creditControlService.validateCreditLimit(
            order.retailerId,
            order.total
          );

          if (!creditValidation.canOrder) {
            throw new Error(`Credit limit validation failed: ${creditValidation.message}`);
          }

          console.log(`✅ Credit validation passed for order ${orderId}`);
        }
      }

      // Validate transition
      const validation = await this.validateTransition(orderId, newStatus, user.role);
      if (!validation.isValid) {
        throw new Error(validation.error);
      }

      // Use transaction for atomic update
      const result = await prisma.$transaction(async (tx) => {
        // Get current order for status log
        const currentOrder = await tx.order.findUnique({
          where: { id: orderId }
        });

        // Update order status with timestamp
        const updateData = {
          status: newStatus,
          updatedAt: new Date(),
          updatedBy: user.id
        };

        // Add specific timestamps based on status
        if (newStatus === 'DISPATCHED') {
          updateData.dispatchedAt = new Date();
        } else if (newStatus === 'DELIVERED') {
          updateData.deliveredAt = new Date();
        } else if (newStatus === 'COMPLETED') {
          updateData.completedAt = new Date();
        }

        // Add optional fields
        if (estimatedDeliveryTime) {
          updateData.expectedDelivery = estimatedDeliveryTime;
        }

        if (deliveryAgentId) {
          updateData.deliveryAgentId = deliveryAgentId;
        }

        // Update order
        const updatedOrder = await tx.order.update({
          where: { id: orderId },
          data: updateData
        });

        // Create status log
        await tx.orderStatusLog.create({
          data: {
            orderId,
            fromStatus: currentOrder.status,
            toStatus: newStatus,
            changedBy: user.id,
            changedByRole: user.role,
            notes,
            timestamp: new Date()
          }
        });

        // Consume credit when order is delivered
        if (newStatus === 'DELIVERED') {
          try {
            await creditControlService.consumeCreditOnDelivery(orderId);
            console.log(`💳 Credit consumed for delivered order ${orderId}`);
          } catch (creditError) {
            console.error('Error consuming credit on delivery', {
              orderId,
              error: creditError.message
            });
            // Don't fail the status update if credit consumption fails
          }

          // Generate invoice automatically
          try {
            await financialAccountingService.generateInvoiceOnDelivery(orderId);
            console.log(`🧾 Invoice generated for delivered order ${orderId}`);
          } catch (invoiceError) {
            console.error('Error generating invoice on delivery', {
              orderId,
              error: invoiceError.message
            });
            // Don't fail the status update if invoice generation fails
          }
        }

        return updatedOrder;
      });

      console.log(`✅ Order ${orderId} status updated to ${newStatus}`);

      // Send notifications based on status
      await this.handleStatusNotifications(result, newStatus, user);

      return {
        success: true,
        order: result,
        message: `Order status updated to ${newStatus}`
      };

    } catch (error) {
      logger.error('Error updating order status', {
        orderId,
        newStatus,
        userId: user.id,
        error: error.message
      });
      throw error;
    }
  }

  async handleStatusNotifications(order, newStatus, updatedBy) {
    try {
      switch (newStatus) {
        case 'DELIVERED':
          await this.sendDeliveryConfirmation(order);
          break;
        
        case 'DISPATCHED':
          await this.sendDispatchNotification(order);
          break;
        
        case 'OUT_FOR_DELIVERY':
          await this.sendOutForDeliveryNotification(order);
          break;
      }
    } catch (error) {
      logger.error('Error sending status notification', {
        orderId: order.id,
        status: newStatus,
        error: error.message
      });
    }
  }

  async sendDeliveryConfirmation(order) {
    try {
      console.log(`📱 Sending delivery confirmation for order ${order.orderNumber}`);
      
      // Get complete order details
      const completeOrder = await prisma.order.findUnique({
        where: { id: order.id },
        include: {
          retailer: {
            include: {
              user: true
            }
          },
          vendor: {
            include: {
              user: true
            }
          },
          items: true
        }
      });

      if (!completeOrder || !completeOrder.retailer?.user?.phoneNumber) {
        console.log('❌ Cannot send delivery confirmation - missing retailer phone');
        return;
      }

      const itemsList = completeOrder.items
        .map(item => `${item.quantity}x ${item.productName}`)
        .join('\n');

      const message = `✅ *Order Delivered!*

Order #${completeOrder.orderNumber}
Vendor: ${completeOrder.vendor?.user?.businessName || 'Assigned Vendor'}

Items:
${itemsList}

Total: Rs.${completeOrder.total}
Paid: Rs.${completeOrder.paidAmount}
Due: Rs.${completeOrder.dueAmount}

Please confirm receipt by replying: CONFIRM
If there are any issues, reply: ISSUE

Thank you for choosing Khaacho! 🙏`;

      await twilioService.sendWhatsAppMessage(
        completeOrder.retailer.user.phoneNumber,
        message
      );

      console.log('✅ Delivery confirmation sent to retailer');
      
    } catch (error) {
      logger.error('Error sending delivery confirmation', {
        orderId: order.id,
        error: error.message
      });
    }
  }

  async sendDispatchNotification(order) {
    try {
      // Get retailer details for dispatch notification
      const orderWithRetailer = await prisma.order.findUnique({
        where: { id: order.id },
        include: {
          retailer: {
            include: {
              user: true
            }
          }
        }
      });

      if (orderWithRetailer?.retailer?.user?.phoneNumber) {
        const message = `🚚 *Order Dispatched!*

Order #${order.orderNumber}
Your order has been dispatched and is on the way.

Track your order status for real-time updates.

Thank you for choosing Khaacho! 🙏`;

        await twilioService.sendWhatsAppMessage(
          orderWithRetailer.retailer.user.phoneNumber,
          message
        );
      }
    } catch (error) {
      logger.error('Error sending dispatch notification', {
        orderId: order.id,
        error: error.message
      });
    }
  }

  async sendOutForDeliveryNotification(order) {
    try {
      // Get retailer details for out-for-delivery notification
      const orderWithRetailer = await prisma.order.findUnique({
        where: { id: order.id },
        include: {
          retailer: {
            include: {
              user: true
            }
          }
        }
      });

      if (orderWithRetailer?.retailer?.user?.phoneNumber) {
        const message = `📦 *Order Out for Delivery!*

Order #${order.orderNumber}
Your order is out for delivery and will arrive soon.

Expected delivery: Today

Thank you for choosing Khaacho! 🙏`;

        await twilioService.sendWhatsAppMessage(
          orderWithRetailer.retailer.user.phoneNumber,
          message
        );
      }
    } catch (error) {
      logger.error('Error sending out-for-delivery notification', {
        orderId: order.id,
        error: error.message
      });
    }
  }

  async confirmOrderCompletion(orderId, retailerUser) {
    try {
      console.log(`✅ Retailer confirming completion for order ${orderId}`);
      
      const order = await prisma.order.findUnique({
        where: { id: orderId },
        include: {
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

      if (order.retailerId !== retailerUser.retailerProfile?.id) {
        throw new Error('You can only confirm your own orders');
      }

      if (order.status !== 'DELIVERED') {
        throw new Error('Order must be delivered before completion');
      }

      // Update to COMPLETED status
      const result = await this.updateOrderStatus(orderId, 'COMPLETED', retailerUser, {
        notes: 'Retailer confirmed order completion'
      });

      console.log('✅ Order marked as completed by retailer');
      return result;

    } catch (error) {
      logger.error('Error confirming order completion', {
        orderId,
        retailerId: retailerUser.id,
        error: error.message
      });
      throw error;
    }
  }

  async getValidTransitions(currentStatus) {
    return this.validTransitions[currentStatus] || [];
  }

  async getRolePermissions(status) {
    return this.rolePermissions[status] || [];
  }

  async getDelayedOrders(delayHours = 24) {
    try {
      const delayThreshold = new Date(Date.now() - (delayHours * 60 * 60 * 1000));
      
      const delayedOrders = await prisma.order.findMany({
        where: {
          status: {
            in: ['ACCEPTED', 'PACKING', 'DISPATCHED', 'OUT_FOR_DELIVERY']
          },
          createdAt: {
            lt: delayThreshold
          }
        },
        include: {
          retailer: {
            include: {
              user: {
                select: {
                  businessName: true,
                  phoneNumber: true
                }
              }
            }
          },
          vendor: {
            include: {
              user: {
                select: {
                  businessName: true,
                  phoneNumber: true
                }
              }
            }
          }
        },
        orderBy: {
          createdAt: 'asc'
        }
      });

      return delayedOrders.map(order => {
        const hoursDelayed = Math.floor((Date.now() - order.createdAt.getTime()) / (1000 * 60 * 60));
        
        return {
          ...order,
          hoursDelayed,
          delayReason: this.getDelayReason(order.status, hoursDelayed)
        };
      });
    } catch (error) {
      logger.error('Error getting delayed orders', { error: error.message });
      return [];
    }
  }

  getDelayReason(status, hoursDelayed) {
    const reasons = {
      'ACCEPTED': `Order accepted but not packed for ${hoursDelayed} hours`,
      'PACKING': `Order being packed for ${hoursDelayed} hours`,
      'DISPATCHED': `Order dispatched but not out for delivery for ${hoursDelayed} hours`,
      'OUT_FOR_DELIVERY': `Order out for delivery for ${hoursDelayed} hours`
    };
    
    return reasons[status] || `Order delayed for ${hoursDelayed} hours`;
  }

  async getOrderStatusDistribution() {
    try {
      const distribution = await prisma.order.groupBy({
        by: ['status'],
        _count: {
          id: true
        }
      });

      const statusCounts = distribution.reduce((acc, item) => {
        acc[item.status] = item._count.id;
        return acc;
      }, {});

      return statusCounts;
    } catch (error) {
      logger.error('Error getting order status distribution', { error: error.message });
      return {};
    }
  }
}

module.exports = new OrderStatusTransitionService();
