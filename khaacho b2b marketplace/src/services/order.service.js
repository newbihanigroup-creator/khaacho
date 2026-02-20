const prisma = require('../config/database');
const { NotFoundError, ValidationError } = require('../utils/errors');
const CreditService = require('./credit.service');
const monitoringService = require('./monitoring.service');
const IdempotencyService = require('./idempotency.service');
const logger = require('../utils/logger');

class OrderService {
  async createOrder(retailerId, vendorId, items, notes = null, idempotencyKey = null) {
    // Check idempotency key first
    if (idempotencyKey) {
      const keyStatus = await IdempotencyService.checkOrCreateKey(idempotencyKey, retailerId);
      
      if (keyStatus.exists && keyStatus.status === 'completed') {
        logger.info('Returning cached order response', {
          key: idempotencyKey,
          retailerId,
          status: keyStatus.status
        });
        return keyStatus.response;
      }

      if (keyStatus.exists && keyStatus.status === 'processing') {
        logger.warn('Order creation already in progress', {
          key: idempotencyKey,
          retailerId,
          status: keyStatus.status
        });
        throw new ValidationError('Order creation is already in progress');
      }
    }

    return await prisma.$transaction(async (tx) => {
      try {
        // Validate retailer and vendor
        const retailer = await tx.retailer.findUnique({
          where: { id: retailerId },
          include: { user: true },
        });

        const vendor = await tx.vendor.findUnique({
          where: { id: vendorId },
          include: { user: true },
        });

        if (!retailer || !vendor) {
          throw new NotFoundError('Retailer or vendor not found');
        }

        if (!retailer.user.isActive || !vendor.user.isActive) {
          throw new ValidationError('User account is inactive');
        }

        // Validate products and calculate totals
        let subtotal = 0;
        const orderItems = [];

        for (const item of items) {
          const product = await tx.product.findUnique({
            where: { id: item.productId },
          });

          if (!product || !product.isActive) {
            throw new NotFoundError(`Product ${item.productId} not found or inactive`);
          }

          if (product.vendorId !== vendorId) {
            throw new ValidationError(`Product ${product.name} does not belong to this vendor`);
          }

          if (product.stock < item.quantity) {
            throw new ValidationError(`Insufficient stock for ${product.name}`);
          }

          const itemSubtotal = product.price * item.quantity;
          subtotal += parseFloat(itemSubtotal);

          orderItems.push({
            productId: product.id,
            quantity: item.quantity,
            unitPrice: product.price,
            subtotal: itemSubtotal,
          });
        }

        const tax = subtotal * 0.13; // 13% VAT
        const total = subtotal + tax;

        // Generate order number
        const orderNumber = await this.generateOrderNumber(tx);

        // Create order with items
        const order = await tx.order.create({
          data: {
            orderNumber,
            retailerId,
            vendorId,
            subtotal,
            tax,
            total,
            dueAmount: total,
            notes,
            items: {
              create: orderItems,
            },
          },
          include: {
            items: {
              include: {
                product: true,
              },
            },
            retailer: {
              include: { user: true },
            },
            vendor: {
              include: { user: true },
            },
          },
        });

        // Update product stock
        for (const item of items) {
          await tx.product.update({
            where: { id: item.productId },
            data: {
              stock: {
                decrement: item.quantity,
              },
            },
          });
        }

        // Create credit ledger entry
        await CreditService.recordTransaction({
          retailerId,
          vendorId,
          orderId: order.id,
          transactionType: 'CREDIT',
          amount: total,
          description: `Order ${orderNumber} - Credit`,
        }, tx);

        // Update retailer stats
        await tx.retailer.update({
          where: { id: retailerId },
          data: {
            totalOrders: { increment: 1 },
            totalSpent: { increment: total },
            outstandingDebt: { increment: total },
          },
        });

        // Mark idempotency key as completed
        if (idempotencyKey) {
          await IdempotencyService.markCompleted(idempotencyKey, order);
        }

        // Track order creation for monitoring
        try {
          await monitoringService.trackOrderCreated(order.id, retailerId, vendorId, total);
        } catch (error) {
          // Don't fail order creation if monitoring fails
          logger.logError(error, { 
            context: 'order_creation_monitoring',
            orderId: order.id 
          });
        }

        return order;
      } catch (error) {
        // Mark idempotency key as failed if transaction fails
        if (idempotencyKey) {
          await IdempotencyService.markFailed(idempotencyKey, error);
        }

        logger.logError(error, { 
          context: 'order_creation_transaction',
          retailerId,
          vendorId,
          itemCount: items?.length,
          idempotencyKey
        });
        
        // Re-throw to trigger transaction rollback
        throw error;
      }
    });
  }

  async updateOrderStatus(orderId, status, userId) {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
    });

    if (!order) {
      throw new NotFoundError('Order not found');
    }

    const updatedOrder = await prisma.order.update({
      where: { id: orderId },
      data: {
        status,
        deliveredAt: status === 'DELIVERED' ? new Date() : order.deliveredAt,
      },
      include: {
        items: {
          include: { product: true },
        },
        retailer: {
          include: { user: true },
        },
        vendor: {
          include: { user: true },
        },
      },
    });

    return updatedOrder;
  }

  async getOrderById(orderId) {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        items: {
          include: { product: true },
        },
        retailer: {
          include: { user: true },
        },
        vendor: {
          include: { user: true },
        },
      },
    });

    if (!order) {
      throw new NotFoundError('Order not found');
    }

    return order;
  }

  async getOrders(filters = {}, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const where = {};

    if (filters.retailerId) where.retailerId = filters.retailerId;
    if (filters.vendorId) where.vendorId = filters.vendorId;
    if (filters.status) where.status = filters.status;
    if (filters.paymentStatus) where.paymentStatus = filters.paymentStatus;

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          items: {
            include: { product: true },
          },
          retailer: {
            include: { user: true },
          },
          vendor: {
            include: { user: true },
          },
        },
      }),
      prisma.order.count({ where }),
    ]);

    return {
      orders,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async generateOrderNumber(tx = null) {
    const dbClient = tx || prisma;
    const date = new Date();
    const year = date.getFullYear().toString().slice(-2);
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    
    const count = await dbClient.order.count();
    const sequence = (count + 1).toString().padStart(6, '0');
    
    return `ORD${year}${month}${sequence}`;
  }
}

module.exports = new OrderService();
