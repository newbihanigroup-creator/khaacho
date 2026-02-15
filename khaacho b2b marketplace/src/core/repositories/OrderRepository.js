const BaseRepository = require('./BaseRepository');
const logger = require('../../shared/logger');
const { DatabaseError } = require('../../shared/errors');

/**
 * Order Repository
 * Handles all database operations for orders
 */
class OrderRepository extends BaseRepository {
  constructor(prisma) {
    super(prisma, 'order');
  }

  /**
   * Find order with full details
   */
  async findByIdWithDetails(orderId) {
    try {
      return await this.model.findUnique({
        where: { id: orderId },
        include: {
          retailer: {
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  phoneNumber: true,
                },
              },
            },
          },
          items: {
            include: {
              product: true,
              wholesaler: {
                include: {
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
          },
          statusLogs: {
            orderBy: { createdAt: 'desc' },
            take: 10,
          },
        },
      });
    } catch (error) {
      logger.error('Order findByIdWithDetails error', { orderId, error: error.message });
      throw new DatabaseError('Failed to find order with details', { orderId });
    }
  }

  /**
   * Find orders by retailer
   */
  async findByRetailer(retailerId, options = {}) {
    const {
      status,
      startDate,
      endDate,
      skip = 0,
      take = 20,
    } = options;

    const where = { retailerId };

    if (status) {
      where.status = status;
    }

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate);
    }

    return await this.findMany({
      where,
      include: {
        items: {
          include: {
            product: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    });
  }

  /**
   * Find orders by wholesaler
   */
  async findByWholesaler(wholesalerId, options = {}) {
    const {
      status,
      startDate,
      endDate,
      skip = 0,
      take = 20,
    } = options;

    try {
      const where = {
        items: {
          some: {
            wholesalerId,
          },
        },
      };

      if (status) {
        where.status = status;
      }

      if (startDate || endDate) {
        where.createdAt = {};
        if (startDate) where.createdAt.gte = new Date(startDate);
        if (endDate) where.createdAt.lte = new Date(endDate);
      }

      const [orders, total] = await Promise.all([
        this.model.findMany({
          where,
          include: {
            retailer: {
              include: {
                user: {
                  select: {
                    id: true,
                    name: true,
                    phoneNumber: true,
                  },
                },
              },
            },
            items: {
              where: { wholesalerId },
              include: {
                product: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
          skip,
          take,
        }),
        this.model.count({ where }),
      ]);

      return { items: orders, total };
    } catch (error) {
      logger.error('Order findByWholesaler error', { wholesalerId, error: error.message });
      throw new DatabaseError('Failed to find orders by wholesaler', { wholesalerId });
    }
  }

  /**
   * Create order with items (transaction)
   */
  async createWithItems(orderData, itemsData) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        // Create order
        const order = await tx.order.create({
          data: {
            ...orderData,
            items: {
              create: itemsData,
            },
          },
          include: {
            items: {
              include: {
                product: true,
              },
            },
          },
        });

        // Create status log
        await tx.orderStatusLog.create({
          data: {
            orderId: order.id,
            status: order.status,
            notes: 'Order created',
          },
        });

        return order;
      });
    } catch (error) {
      logger.error('Order createWithItems error', { error: error.message });
      throw new DatabaseError('Failed to create order with items', { error: error.message });
    }
  }

  /**
   * Update order status (with status log)
   */
  async updateStatus(orderId, status, notes = null) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        // Update order
        const order = await tx.order.update({
          where: { id: orderId },
          data: { status },
        });

        // Create status log
        await tx.orderStatusLog.create({
          data: {
            orderId,
            status,
            notes,
          },
        });

        return order;
      });
    } catch (error) {
      logger.error('Order updateStatus error', { orderId, status, error: error.message });
      throw new DatabaseError('Failed to update order status', { orderId, status });
    }
  }

  /**
   * Get order statistics
   */
  async getStatistics(filters = {}) {
    const { retailerId, wholesalerId, startDate, endDate } = filters;

    try {
      const where = {};

      if (retailerId) {
        where.retailerId = retailerId;
      }

      if (wholesalerId) {
        where.items = {
          some: { wholesalerId },
        };
      }

      if (startDate || endDate) {
        where.createdAt = {};
        if (startDate) where.createdAt.gte = new Date(startDate);
        if (endDate) where.createdAt.lte = new Date(endDate);
      }

      const [
        totalOrders,
        totalValue,
        statusBreakdown,
      ] = await Promise.all([
        this.model.count({ where }),
        this.model.aggregate({
          where,
          _sum: { total: true },
        }),
        this.model.groupBy({
          by: ['status'],
          where,
          _count: true,
        }),
      ]);

      return {
        totalOrders,
        totalValue: totalValue._sum.total || 0,
        statusBreakdown: statusBreakdown.reduce((acc, item) => {
          acc[item.status] = item._count;
          return acc;
        }, {}),
      };
    } catch (error) {
      logger.error('Order getStatistics error', { filters, error: error.message });
      throw new DatabaseError('Failed to get order statistics', { filters });
    }
  }
}

module.exports = OrderRepository;
