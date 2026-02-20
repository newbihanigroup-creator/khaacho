const prisma = require('../config/database');
const logger = require('../utils/logger');

class OrderAuditService {
  async createAuditLog(orderId, previousStatus, newStatus, changedBy, metadata = {}) {
    try {
      const auditLog = await prisma.orderAuditLog.create({
        data: {
          orderId,
          previousStatus,
          newStatus,
          changedBy,
          metadata,
        },
      });

      logger.info('Order audit log created', {
        auditLogId: auditLog.id,
        orderId,
        previousStatus,
        newStatus,
        changedBy,
        metadata
      });

      return auditLog;
    } catch (error) {
      logger.logError(error, {
        context: 'order_audit_log_creation',
        orderId,
        previousStatus,
        newStatus,
        changedBy
      });
      throw error;
    }
  }

  async getOrderAuditHistory(orderId, page = 1, limit = 50) {
    try {
      const skip = (page - 1) * limit;
      
      const [auditLogs, total] = await Promise.all([
        prisma.orderAuditLog.findMany({
          where: { orderId },
          skip,
          take: limit,
          orderBy: { createdAt: 'desc' },
          include: {
            order: {
              select: {
                id: true,
                orderNumber: true,
                retailerId: true,
                vendorId: true,
              },
            },
          },
        }),
        prisma.orderAuditLog.count({
          where: { orderId },
        }),
      ]);

      return {
        auditLogs,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      logger.logError(error, {
        context: 'order_audit_history_retrieval',
        orderId,
        page,
        limit
      });
      throw error;
    }
  }

  async getAuditHistoryByStatus(status, page = 1, limit = 50) {
    try {
      const skip = (page - 1) * limit;
      
      const [auditLogs, total] = await Promise.all([
        prisma.orderAuditLog.findMany({
          where: { newStatus: status },
          skip,
          take: limit,
          orderBy: { createdAt: 'desc' },
          include: {
            order: {
              select: {
                id: true,
                orderNumber: true,
                retailerId: true,
                vendorId: true,
              },
            },
          },
        }),
        prisma.orderAuditLog.count({
          where: { newStatus: status },
        }),
      ]);

      return {
        auditLogs,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      logger.logError(error, {
        context: 'order_audit_status_history_retrieval',
        status,
        page,
        limit
      });
      throw error;
    }
  }

  async getAuditHistoryByUser(changedBy, page = 1, limit = 50) {
    try {
      const skip = (page - 1) * limit;
      
      const [auditLogs, total] = await Promise.all([
        prisma.orderAuditLog.findMany({
          where: { changedBy },
          skip,
          take: limit,
          orderBy: { createdAt: 'desc' },
          include: {
            order: {
              select: {
                id: true,
                orderNumber: true,
                retailerId: true,
                vendorId: true,
              },
            },
          },
        }),
        prisma.orderAuditLog.count({
          where: { changedBy },
        }),
      ]);

      return {
        auditLogs,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      logger.logError(error, {
        context: 'order_audit_user_history_retrieval',
        changedBy,
        page,
        limit
      });
      throw error;
    }
  }

  async cleanupOldAuditLogs(daysOld = 90) {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysOld);

      const deletedLogs = await prisma.orderAuditLog.deleteMany({
        where: {
          createdAt: {
            lt: cutoffDate,
          },
        },
      });

      logger.info('Cleaned up old order audit logs', {
        deletedCount: deletedLogs.count,
        cutoffDate,
        daysOld
      });

      return deletedLogs.count;
    } catch (error) {
      logger.logError(error, {
        context: 'order_audit_cleanup',
        daysOld
      });
      throw error;
    }
  }

  async getAuditStats(startDate, endDate) {
    try {
      const stats = await prisma.orderAuditLog.groupBy({
        by: ['newStatus'],
        where: {
          createdAt: {
            gte: startDate,
            lte: endDate,
          },
        },
        _count: {
          id: true,
        },
      });

      const statusCounts = {};
      for (const stat of stats) {
        statusCounts[stat.newStatus] = stat._count.id;
      }

      return statusCounts;
    } catch (error) {
      logger.logError(error, {
        context: 'order_audit_stats_retrieval',
        startDate,
        endDate
      });
      throw error;
    }
  }
}

module.exports = new OrderAuditService();
