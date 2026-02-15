const prisma = require('../config/database');
const logger = require('../shared/logger');
const { ValidationError } = require('../shared/errors');
const Decimal = require('decimal.js');

/**
 * Order Validation Service
 * Validates orders before processing with credit limit checks
 */
class OrderValidationService {
  /**
   * Validate order before processing
   * Checks credit limit, outstanding balance, and account status
   * 
   * @param {string} retailerId - Retailer ID
   * @param {Decimal} orderAmount - Order total amount
   * @returns {Promise<Object>} Validation result
   */
  async validateOrderCredit(retailerId, orderAmount) {
    try {
      logger.info('Validating order credit', {
        retailerId,
        orderAmount: orderAmount.toString(),
      });

      // Get retailer with credit information
      const retailer = await prisma.retailer.findUnique({
        where: { id: retailerId },
        include: {
          user: {
            select: {
              businessName: true,
              phoneNumber: true,
              isActive: true,
            },
          },
        },
      });

      if (!retailer) {
        throw new ValidationError('Retailer not found');
      }

      // Check if user account is active
      if (!retailer.user.isActive) {
        return {
          isValid: false,
          reason: 'ACCOUNT_INACTIVE',
          message: 'Your account is inactive. Please contact admin.',
          whatsappMessage: 'Your account is inactive. Please contact admin for assistance.',
        };
      }

      // Check if retailer is approved
      if (!retailer.isApproved) {
        return {
          isValid: false,
          reason: 'ACCOUNT_NOT_APPROVED',
          message: 'Your account is pending approval.',
          whatsappMessage: 'Your account is pending approval. Please wait for admin confirmation.',
        };
      }

      // Calculate available credit
      const availableCredit = new Decimal(retailer.creditLimit)
        .sub(new Decimal(retailer.outstandingDebt));

      const orderAmountDecimal = new Decimal(orderAmount);

      // Check if order exceeds available credit
      if (orderAmountDecimal.gt(availableCredit)) {
        logger.warn('Order exceeds credit limit', {
          retailerId,
          orderAmount: orderAmountDecimal.toString(),
          availableCredit: availableCredit.toString(),
          creditLimit: retailer.creditLimit.toString(),
          outstandingDebt: retailer.outstandingDebt.toString(),
        });

        return {
          isValid: false,
          reason: 'CREDIT_LIMIT_EXCEEDED',
          message: `Order exceeds available credit limit. Available: Rs.${availableCredit}, Required: Rs.${orderAmountDecimal}`,
          whatsappMessage: `Order exceeds available credit limit. Your available credit is Rs.${availableCredit}. Please make a payment or reduce order amount.`,
          availableCredit: availableCredit.toString(),
          requestedAmount: orderAmountDecimal.toString(),
          shortfall: orderAmountDecimal.sub(availableCredit).toString(),
        };
      }

      // Check risk category
      if (retailer.riskCategory === 'HIGH' || retailer.riskCategory === 'BLOCKED') {
        return {
          isValid: false,
          reason: 'HIGH_RISK_ACCOUNT',
          message: `Account is marked as ${retailer.riskCategory}. Please contact admin.`,
          whatsappMessage: `Your account requires admin review. Please contact support for assistance.`,
        };
      }

      logger.info('Order credit validation passed', {
        retailerId,
        orderAmount: orderAmountDecimal.toString(),
        availableCredit: availableCredit.toString(),
      });

      return {
        isValid: true,
        reason: 'APPROVED',
        message: 'Order approved',
        whatsappMessage: null,
        availableCredit: availableCredit.toString(),
        requestedAmount: orderAmountDecimal.toString(),
        remainingCredit: availableCredit.sub(orderAmountDecimal).toString(),
      };
    } catch (error) {
      logger.error('Error validating order credit', {
        retailerId,
        orderAmount: orderAmount?.toString(),
        error: error.message,
        stack: error.stack,
      });
      throw error;
    }
  }

  /**
   * Log rejected order for admin review
   * Creates audit trail of rejected orders
   * 
   * @param {Object} orderData - Order data
   * @param {Object} validationResult - Validation result
   * @returns {Promise<Object>} Rejected order log
   */
  async logRejectedOrder(orderData, validationResult) {
    try {
      const rejectedOrder = await prisma.$transaction(async (tx) => {
        // Create rejected order log
        const log = await tx.rejectedOrder.create({
          data: {
            retailerId: orderData.retailerId,
            orderData: orderData,
            rejectionReason: validationResult.reason,
            rejectionMessage: validationResult.message,
            requestedAmount: new Decimal(orderData.total || 0),
            availableCredit: validationResult.availableCredit 
              ? new Decimal(validationResult.availableCredit) 
              : new Decimal(0),
            shortfall: validationResult.shortfall 
              ? new Decimal(validationResult.shortfall) 
              : null,
            metadata: {
              whatsappMessageId: orderData.whatsappMessageId,
              phoneNumber: orderData.phoneNumber,
              validationResult,
            },
          },
        });

        // Create audit log
        await tx.auditLog.create({
          data: {
            userId: orderData.retailerId,
            action: 'REJECT',
            entityType: 'ORDER',
            entityId: log.id,
            description: `Order rejected: ${validationResult.reason}`,
            newValues: {
              rejectionReason: validationResult.reason,
              requestedAmount: orderData.total,
              availableCredit: validationResult.availableCredit,
            },
          },
        });

        return log;
      });

      logger.info('Rejected order logged', {
        rejectedOrderId: rejectedOrder.id,
        retailerId: orderData.retailerId,
        reason: validationResult.reason,
      });

      return rejectedOrder;
    } catch (error) {
      logger.error('Error logging rejected order', {
        orderData,
        validationResult,
        error: error.message,
        stack: error.stack,
      });
      throw error;
    }
  }

  /**
   * Validate and create order atomically
   * Combines validation and order creation in single transaction
   * 
   * @param {Object} orderData - Order data
   * @returns {Promise<Object>} Created order or rejection result
   */
  async validateAndCreateOrder(orderData) {
    try {
      const { retailerId, total } = orderData;

      // Validate credit first
      const validation = await this.validateOrderCredit(
        retailerId,
        new Decimal(total)
      );

      // If validation fails, log rejection and return
      if (!validation.isValid) {
        await this.logRejectedOrder(orderData, validation);
        
        return {
          success: false,
          rejected: true,
          validation,
        };
      }

      // Validation passed - order can be created
      return {
        success: true,
        rejected: false,
        validation,
      };
    } catch (error) {
      logger.error('Error in validateAndCreateOrder', {
        orderData,
        error: error.message,
        stack: error.stack,
      });
      throw error;
    }
  }

  /**
   * Get rejected orders for admin review
   * 
   * @param {Object} filters - Filter options
   * @param {number} page - Page number
   * @param {number} limit - Items per page
   * @returns {Promise<Object>} Rejected orders with pagination
   */
  async getRejectedOrders(filters = {}, page = 1, limit = 20) {
    try {
      const skip = (page - 1) * limit;
      const where = {};

      if (filters.retailerId) {
        where.retailerId = filters.retailerId;
      }

      if (filters.rejectionReason) {
        where.rejectionReason = filters.rejectionReason;
      }

      if (filters.isReviewed !== undefined) {
        where.isReviewed = filters.isReviewed;
      }

      const [rejectedOrders, total] = await Promise.all([
        prisma.rejectedOrder.findMany({
          where,
          skip,
          take: limit,
          orderBy: { createdAt: 'desc' },
          include: {
            retailer: {
              include: {
                user: {
                  select: {
                    businessName: true,
                    phoneNumber: true,
                  },
                },
              },
            },
          },
        }),
        prisma.rejectedOrder.count({ where }),
      ]);

      return {
        rejectedOrders,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      logger.error('Error getting rejected orders', {
        filters,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Mark rejected order as reviewed
   * 
   * @param {string} rejectedOrderId - Rejected order ID
   * @param {string} reviewedBy - Admin user ID
   * @param {string} reviewNotes - Review notes
   * @returns {Promise<Object>} Updated rejected order
   */
  async markAsReviewed(rejectedOrderId, reviewedBy, reviewNotes) {
    try {
      const rejectedOrder = await prisma.rejectedOrder.update({
        where: { id: rejectedOrderId },
        data: {
          isReviewed: true,
          reviewedAt: new Date(),
          reviewedBy,
          reviewNotes,
        },
      });

      logger.info('Rejected order marked as reviewed', {
        rejectedOrderId,
        reviewedBy,
      });

      return rejectedOrder;
    } catch (error) {
      logger.error('Error marking rejected order as reviewed', {
        rejectedOrderId,
        error: error.message,
      });
      throw error;
    }
  }
}

module.exports = new OrderValidationService();
