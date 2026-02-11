const prisma = require('../config/database');
const logger = require('../utils/logger');
const Decimal = require('decimal.js');

class CreditControlService {
  async validateCreditLimit(retailerId, orderAmount) {
    try {
      console.log(`🔍 Validating credit limit for retailer ${retailerId}, order amount: ${orderAmount}`);
      
      const retailer = await prisma.retailer.findUnique({
        where: { id: retailerId },
        include: {
          user: {
            select: {
              businessName: true,
              phoneNumber: true
            }
          }
        }
      });

      if (!retailer) {
        throw new Error('Retailer not found');
      }

      if (retailer.creditStatus !== 'ACTIVE') {
        return {
          canOrder: false,
          reason: 'BLOCKED',
          message: `Your account is ${retailer.creditStatus}. Please contact admin.`,
          retailer
        };
      }

      const availableCredit = retailer.creditLimit.sub(retailer.outstandingDebt);
      const orderAmountDecimal = new Decimal(orderAmount);

      if (orderAmountDecimal.gt(availableCredit)) {
        console.log(`❌ Credit limit exceeded. Available: ${availableCredit}, Requested: ${orderAmountDecimal}`);
        
        return {
          canOrder: false,
          reason: 'CREDIT_LIMIT_EXCEEDED',
          message: `Credit limit exceeded. Available: Rs.${availableCredit}, Requested: Rs.${orderAmountDecimal}`,
          availableCredit,
          requestedAmount: orderAmountDecimal,
          retailer
        };
      }

      // Check if retailer is blocked due to overdue payments
      if (retailer.blockedAt) {
        return {
          canOrder: false,
          reason: 'BLOCKED',
          message: `Account blocked: ${retailer.blockedReason || 'Contact admin'}`,
          blockedAt: retailer.blockedAt,
          retailer
        };
      }

      console.log(`✅ Credit validation passed. Available: ${availableCredit}`);
      
      return {
        canOrder: true,
        reason: 'APPROVED',
        message: 'Credit limit approved',
        availableCredit,
        requestedAmount: orderAmountDecimal,
        retailer
      };

    } catch (error) {
      logger.error('Error validating credit limit', {
        retailerId,
        orderAmount,
        error: error.message
      });
      throw error;
    }
  }

  async consumeCreditOnDelivery(orderId) {
    try {
      console.log(`💳 Consuming credit for delivered order ${orderId}`);
      
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

      if (order.status !== 'DELIVERED') {
        throw new Error('Order must be delivered to consume credit');
      }

      // Use transaction for atomic credit consumption
      const result = await prisma.$transaction(async (tx) => {
        // Get current retailer state
        const currentRetailer = await tx.retailer.findUnique({
          where: { id: order.retailerId },
          select: { 
            creditUsed: true, 
            outstandingDebt: true 
          }
        });

        // Update retailer credit
        const newCreditUsed = currentRetailer.creditUsed.add(order.total);
        const newOutstandingDebt = currentRetailer.outstandingDebt.add(order.total);
        const newCreditAvailable = order.retailer.creditLimit.sub(newOutstandingDebt);

        await tx.retailer.update({
          where: { id: order.retailerId },
          data: {
            creditUsed: newCreditUsed,
            outstandingDebt: newOutstandingDebt,
            creditAvailable: newCreditAvailable,
            updatedAt: new Date()
          }
        });

        // Create credit ledger DEBIT entry
        await tx.creditLedger.create({
          data: {
            ledgerNumber: 'CREDIT' + Date.now(),
            retailerId: order.retailerId,
            orderId: order.id,
            transactionType: 'ORDER_DEBIT',
            amount: order.total,
            runningBalance: newCreditAvailable.neg(),
            previousBalance: newCreditAvailable.add(order.total),
            description: `Order #${order.orderNumber} - Credit consumed on delivery`,
            referenceNumber: order.orderNumber,
            dueDate: new Date(Date.now() + (order.retailer.paymentDueDays * 24 * 60 * 60 * 1000)),
            metadata: {
              orderNumber: order.orderNumber,
              creditConsumed: order.total.toString(),
              remainingCredit: newCreditAvailable.toString()
            }
          }
        });

        return {
          newCreditUsed,
          newOutstandingDebt,
          newCreditAvailable
        };
      });

      console.log(`✅ Credit consumed for order ${order.orderNumber}:`, result);
      return result;

    } catch (error) {
      logger.error('Error consuming credit on delivery', {
        orderId,
        error: error.message
      });
      throw error;
    }
  }

  async restoreCreditOnPayment(paymentId) {
    try {
      console.log(`💰 Restoring credit for payment ${paymentId}`);
      
      const payment = await prisma.payment.findUnique({
        where: { id: paymentId },
        include: {
          order: {
            include: {
              retailer: {
                include: {
                  user: true
                }
              }
            }
          }
        }
      });

      if (!payment) {
        throw new Error('Payment not found');
      }

      // Use transaction for atomic credit restoration
      const result = await prisma.$transaction(async (tx) => {
        // Get current retailer state
        const currentRetailer = await tx.retailer.findUnique({
          where: { id: payment.order.retailerId },
          select: { 
            creditUsed: true, 
            outstandingDebt: true,
            lastPaymentDate: true
          }
        });

        // Update retailer credit
        const newCreditUsed = currentRetailer.creditUsed.sub(payment.amount);
        const newOutstandingDebt = currentRetailer.outstandingDebt.sub(payment.amount);
        const newCreditAvailable = payment.order.retailer.creditLimit.sub(newOutstandingDebt);

        await tx.retailer.update({
          where: { id: payment.order.retailerId },
          data: {
            creditUsed: newCreditUsed,
            outstandingDebt: newOutstandingDebt,
            creditAvailable: newCreditAvailable,
            lastPaymentDate: payment.paymentDate,
            creditStatus: 'ACTIVE', // Reactivate if was blocked
            blockedAt: null, // Clear any block
            blockedReason: null,
            updatedAt: new Date()
          }
        });

        // Create credit ledger CREDIT entry
        await tx.creditLedger.create({
          data: {
            ledgerNumber: 'PAYMENT' + Date.now(),
            retailerId: payment.order.retailerId,
            orderId: payment.orderId,
            paymentId: payment.id,
            transactionType: 'PAYMENT_CREDIT',
            amount: payment.amount,
            runningBalance: newCreditAvailable,
            previousBalance: newCreditAvailable.sub(payment.amount),
            description: `Payment for Order #${payment.order.orderNumber}`,
            referenceNumber: payment.receiptNumber,
            metadata: {
              orderNumber: payment.order.orderNumber,
              paymentAmount: payment.amount.toString(),
              remainingCredit: newCreditAvailable.toString()
            }
          }
        });

        return {
          newCreditUsed,
          newOutstandingDebt,
          newCreditAvailable
        };
      });

      console.log(`✅ Credit restored for payment ${payment.receiptNumber}:`, result);
      return result;

    } catch (error) {
      logger.error('Error restoring credit on payment', {
        paymentId,
        error: error.message
      });
      throw error;
    }
  }

  async checkAndUpdateBlockedRetailers() {
    try {
      console.log('🔍 Checking for overdue retailers to block...');
      
      const overdueThreshold = new Date();
      const retailersToCheck = await prisma.retailer.findMany({
        where: {
          creditStatus: 'ACTIVE',
          outstandingDebt: { gt: 0 }
        },
        include: {
          user: {
            select: {
              businessName: true,
              phoneNumber: true
            }
          }
        }
      });

      const blockingResults = [];

      for (const retailer of retailersToCheck) {
        const paymentDueDate = new Date(retailer.lastPaymentDate?.getTime() || 0);
        paymentDueDate.setDate(paymentDueDate.getDate() + retailer.paymentDueDays);

        const isOverdue = paymentDueDate < overdueThreshold;
        const isHighRisk = retailer.creditAvailable.lt(retailer.creditLimit.mul(0.1)); // Less than 10% available

        if (isOverdue || isHighRisk) {
          try {
            await prisma.retailer.update({
              where: { id: retailer.id },
              data: {
                creditStatus: 'BLOCKED',
                blockedAt: new Date(),
                blockedReason: isOverdue ? 
                  `Payment overdue by ${Math.floor((overdueThreshold - paymentDueDate) / (1000 * 60 * 60 * 24))} days` :
                  'High credit utilization - less than 10% available',
                updatedAt: new Date()
              }
            });

            blockingResults.push({
              retailerId: retailer.id,
              businessName: retailer.user.businessName,
              reason: isOverdue ? 'OVERDUE' : 'HIGH_RISK',
              blockedReason: retailer.blockedReason,
              outstandingDebt: retailer.outstandingDebt,
              creditLimit: retailer.creditLimit
            });

            console.log(`🚫 Blocked retailer ${retailer.user.businessName}: ${isOverdue ? 'Overdue' : 'High risk'}`);

          } catch (error) {
            logger.error('Error blocking retailer', {
              retailerId: retailer.id,
              error: error.message
            });
          }
        }
      }

      console.log(`🔒 Blocked ${blockingResults.length} retailers`);
      return blockingResults;

    } catch (error) {
      logger.error('Error checking blocked retailers', { error: error.message });
      return [];
    }
  }

  async getRetailerCreditStatus(retailerId) {
    try {
      const retailer = await prisma.retailer.findUnique({
        where: { id: retailerId },
        include: {
          user: {
            select: {
              businessName: true,
              phoneNumber: true
            }
          }
        }
      });

      if (!retailer) {
        throw new Error('Retailer not found');
      }

      const creditUtilization = retailer.creditLimit.gt(0) ? 
        retailer.outstandingDebt.div(retailer.creditLimit).mul(100) : 
        new Decimal(0);

      return {
        retailerId,
        businessName: retailer.user.businessName,
        creditLimit: retailer.creditLimit,
        creditUsed: retailer.creditUsed,
        creditAvailable: retailer.creditAvailable,
        outstandingDebt: retailer.outstandingDebt,
        creditStatus: retailer.creditStatus,
        creditUtilization: creditUtilization,
        paymentDueDays: retailer.paymentDueDays,
        lastPaymentDate: retailer.lastPaymentDate,
        blockedAt: retailer.blockedAt,
        blockedReason: retailer.blockedReason,
        riskScore: retailer.riskScore,
        isBlocked: retailer.creditStatus === 'BLOCKED',
        daysSinceLastPayment: retailer.lastPaymentDate ? 
          Math.floor((Date.now() - retailer.lastPaymentDate.getTime()) / (1000 * 60 * 60 * 24)) : 
          null
      };

    } catch (error) {
      logger.error('Error getting retailer credit status', {
        retailerId,
        error: error.message
      });
      throw error;
    }
  }

  async updateRetailerCreditLimit(retailerId, newCreditLimit, updatedBy) {
    try {
      console.log(`📝 Updating credit limit for retailer ${retailerId} to ${newCreditLimit}`);

      const retailer = await prisma.retailer.findUnique({
        where: { id: retailerId },
        select: { creditLimit: true, outstandingDebt: true }
      });

      if (!retailer) {
        throw new Error('Retailer not found');
      }

      const newCreditAvailable = new Decimal(newCreditLimit).sub(retailer.outstandingDebt);

      const result = await prisma.retailer.update({
        where: { id: retailerId },
        data: {
          creditLimit: new Decimal(newCreditLimit),
          creditAvailable: newCreditAvailable,
          updatedAt: new Date()
        }
      });

      console.log(`✅ Credit limit updated for retailer ${retailerId}: ${newCreditLimit}`);
      return result;

    } catch (error) {
      logger.error('Error updating retailer credit limit', {
        retailerId,
        newCreditLimit,
        error: error.message
      });
      throw error;
    }
  }

  async unblockRetailer(retailerId, reason, updatedBy) {
    try {
      console.log(`🔓 Unblocking retailer ${retailerId}`);

      const result = await prisma.retailer.update({
        where: { id: retailerId },
        data: {
          creditStatus: 'ACTIVE',
          blockedAt: null,
          blockedReason: null,
          updatedAt: new Date()
        }
      });

      console.log(`✅ Retailer ${retailerId} unblocked`);
      return result;

    } catch (error) {
      logger.error('Error unblocking retailer', {
        retailerId,
        error: error.message
      });
      throw error;
    }
  }

  async getCreditControlDashboard() {
    try {
      console.log('📊 Generating credit control dashboard...');

      const [totalStats, blockedStats, riskStats] = await Promise.all([
        // Total credit statistics
        prisma.retailer.aggregate({
          _sum: {
            creditLimit: true,
            creditUsed: true,
            outstandingDebt: true
          },
          _count: {
            id: true
          }
        }),

        // Blocked retailers
        prisma.retailer.aggregate({
          where: { creditStatus: 'BLOCKED' },
          _sum: {
            outstandingDebt: true
          },
          _count: {
            id: true
          }
        }),

        // Risk analysis
        prisma.retailer.findMany({
          where: {
            outstandingDebt: { gt: 0 }
          },
          select: {
            id: true,
            creditLimit: true,
            outstandingDebt: true,
            creditAvailable: true,
            user: {
              select: {
                businessName: true
              }
            }
          },
          take: 10,
          orderBy: {
            outstandingDebt: 'desc'
          }
        })
      ]);

      const totalRetailers = totalStats._count.id || 0;
      const totalCreditLimit = totalStats._sum.creditLimit || new Decimal(0);
      const totalCreditUsed = totalStats._sum.creditUsed || new Decimal(0);
      const totalOutstandingDebt = totalStats._sum.outstandingDebt || new Decimal(0);
      const totalCreditAvailable = totalCreditLimit.sub(totalOutstandingDebt);
      const blockedRetailers = blockedStats._count.id || 0;
      const blockedDebtAmount = blockedStats._sum.outstandingDebt || new Decimal(0);

      const creditUtilizationRate = totalCreditLimit.gt(0) ? 
        totalCreditUsed.div(totalCreditLimit).mul(100) : 
        new Decimal(0);

      const highRiskRetailers = riskStats
        .filter(r => {
          const utilization = r.creditLimit.gt(0) ? 
            r.outstandingDebt.div(r.creditLimit).mul(100) : 
            new Decimal(0);
          return utilization.gt(80); // Over 80% utilization
        })
        .map(r => ({
          retailerId: r.id,
          businessName: r.user.businessName,
          creditLimit: r.creditLimit,
          outstandingDebt: r.outstandingDebt,
          creditUtilization: r.creditLimit.gt(0) ? 
            r.outstandingDebt.div(r.creditLimit).mul(100) : 
            new Decimal(0)
        }));

      const dashboard = {
        summary: {
          totalRetailers,
          activeRetailers: totalRetailers - blockedRetailers,
          blockedRetailers,
          totalCreditLimit,
          totalCreditUsed,
          totalOutstandingDebt,
          totalCreditAvailable,
          creditUtilizationRate,
          blockedDebtAmount,
          averageDebtPerRetailer: totalRetailers > 0 ? 
            totalOutstandingDebt.div(totalRetailers) : 
            new Decimal(0)
        },
        blockedRetailers: blockedRetailers,
        highRiskRetailers,
        riskDistribution: {
          lowRisk: totalRetailers - highRiskRetailers.length - blockedRetailers,
          highRisk: highRiskRetailers.length,
          blocked: blockedRetailers
        },
        generatedAt: new Date()
      };

      console.log('✅ Credit control dashboard generated');
      return dashboard;

    } catch (error) {
      logger.error('Error generating credit control dashboard', { error: error.message });
      throw error;
    }
  }
}

module.exports = new CreditControlService();
