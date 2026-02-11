const prisma = require('../config/database');
const logger = require('../utils/logger');

class CreditLedgerService {
  async createOrderDebitEntry(order) {
    try {
      console.log('💳 Creating ORDER_DEBIT entry for order:', order.orderNumber);
      
      // Generate unique ledger number
      const ledgerNumber = 'LDG' + Date.now() + Math.random().toString(36).substr(2, 5).toUpperCase();
      
      // Get current running balance for retailer
      const currentBalance = await this.getRetailerCurrentBalance(order.retailerId);
      
      // Create DEBIT entry for retailer (they owe money)
      const retailerLedgerEntry = await prisma.creditLedger.create({
        data: {
          ledgerNumber,
          retailerId: order.retailerId,
          orderId: order.id,
          transactionType: 'ORDER_DEBIT',
          amount: order.total,
          runningBalance: currentBalance.subtract(order.total),
          previousBalance: currentBalance,
          description: `Order #${order.orderNumber} - ${order.items?.map(item => item.productName).join(', ') || 'Items'}`,
          referenceNumber: order.orderNumber,
          dueDate: new Date(Date.now() + (30 * 24 * 60 * 60 * 1000)), // 30 days from now
          metadata: {
            orderNumber: order.orderNumber,
            itemCount: order.items?.length || 0,
            orderTotal: order.total.toString()
          }
        }
      });
      
      // Create corresponding CREDIT entry for vendor (they are owed money)
      if (order.vendorId) {
        const vendorCurrentBalance = await this.getVendorCurrentBalance(order.vendorId);
        
        await prisma.creditLedger.create({
          data: {
            ledgerNumber: ledgerNumber + '_V',
            vendorId: order.vendorId,
            orderId: order.id,
            transactionType: 'ORDER_CREDIT',
            amount: order.total,
            runningBalance: vendorCurrentBalance.add(order.total),
            previousBalance: vendorCurrentBalance,
            description: `Order #${order.orderNumber} - Sale to ${order.retailer?.user?.businessName || 'Customer'}`,
            referenceNumber: order.orderNumber,
            metadata: {
              orderNumber: order.orderNumber,
              retailerName: order.retailer?.user?.businessName || 'Customer',
              orderTotal: order.total.toString()
            }
          }
        });
      }
      
      console.log('✅ ORDER_DEBIT entry created:', ledgerNumber);
      return retailerLedgerEntry;
      
    } catch (error) {
      logger.error('Error creating order debit entry', { 
        orderId: order.id, 
        error: error.message 
      });
      throw error;
    }
  }

  async createPaymentCreditEntry(payment) {
    try {
      console.log('💰 Creating PAYMENT_CREDIT entry for payment:', payment.id);
      
      // Generate unique ledger number
      const ledgerNumber = 'PAY' + Date.now() + Math.random().toString(36).substr(2, 5).toUpperCase();
      
      // Get current running balance for retailer
      const currentBalance = await this.getRetailerCurrentBalance(payment.order.retailerId);
      
      // Create CREDIT entry for retailer (they paid money)
      const retailerLedgerEntry = await prisma.creditLedger.create({
        data: {
          ledgerNumber,
          retailerId: payment.order.retailerId,
          orderId: payment.orderId,
          paymentId: payment.id,
          transactionType: 'PAYMENT_CREDIT',
          amount: payment.amount,
          runningBalance: currentBalance.add(payment.amount),
          previousBalance: currentBalance,
          description: `Payment for Order #${payment.order.orderNumber} - ${payment.method || 'Payment'}`,
          referenceNumber: payment.receiptNumber || `PAY${Date.now()}`,
          metadata: {
            orderNumber: payment.order.orderNumber,
            paymentMethod: payment.method,
            paymentAmount: payment.amount.toString()
          }
        }
      });
      
      // Create corresponding DEBIT entry for vendor (they received money)
      if (payment.order.vendorId) {
        const vendorCurrentBalance = await this.getVendorCurrentBalance(payment.order.vendorId);
        
        await prisma.creditLedger.create({
          data: {
            ledgerNumber: ledgerNumber + '_V',
            vendorId: payment.order.vendorId,
            orderId: payment.orderId,
            paymentId: payment.id,
            transactionType: 'PAYMENT_DEBIT',
            amount: payment.amount,
            runningBalance: vendorCurrentBalance.subtract(payment.amount),
            previousBalance: vendorCurrentBalance,
            description: `Payment received for Order #${payment.order.orderNumber}`,
            referenceNumber: payment.receiptNumber || `PAY${Date.now()}`,
            metadata: {
              orderNumber: payment.order.orderNumber,
              paymentMethod: payment.method,
              paymentAmount: payment.amount.toString()
            }
          }
        });
      }
      
      console.log('✅ PAYMENT_CREDIT entry created:', ledgerNumber);
      return retailerLedgerEntry;
      
    } catch (error) {
      logger.error('Error creating payment credit entry', { 
        paymentId: payment.id, 
        error: error.message 
      });
      throw error;
    }
  }

  async getRetailerCurrentBalance(retailerId) {
    try {
      const latestEntry = await prisma.creditLedger.findFirst({
        where: { retailerId },
        orderBy: { createdAt: 'desc' },
        select: { runningBalance: true }
      });
      
      return latestEntry?.runningBalance || new (require('decimal.js'))(0);
    } catch (error) {
      logger.error('Error getting retailer current balance', { retailerId, error: error.message });
      return new (require('decimal.js'))(0);
    }
  }

  async getVendorCurrentBalance(vendorId) {
    try {
      const latestEntry = await prisma.creditLedger.findFirst({
        where: { vendorId },
        orderBy: { createdAt: 'desc' },
        select: { runningBalance: true }
      });
      
      return latestEntry?.runningBalance || new (require('decimal.js'))(0);
    } catch (error) {
      logger.error('Error getting vendor current balance', { vendorId, error: error.message });
      return new (require('decimal.js'))(0);
    }
  }

  async getRetailerTotalDue(retailerId) {
    try {
      const result = await prisma.creditLedger.aggregate({
        where: { 
          retailerId,
          transactionType: { in: ['ORDER_DEBIT'] }
        },
        _sum: { amount: true }
      });
      
      const totalDebits = result._sum.amount || new (require('decimal.js'))(0);
      
      const creditResult = await prisma.creditLedger.aggregate({
        where: { 
          retailerId,
          transactionType: { in: ['PAYMENT_CREDIT', 'REFUND_CREDIT', 'ADJUSTMENT_CREDIT'] }
        },
        _sum: { amount: true }
      });
      
      const totalCredits = creditResult._sum.amount || new (require('decimal.js'))(0);
      
      return totalDebits.subtract(totalCredits);
    } catch (error) {
      logger.error('Error calculating retailer total due', { retailerId, error: error.message });
      return new (require('decimal.js'))(0);
    }
  }

  async getVendorReceivable(vendorId) {
    try {
      const result = await prisma.creditLedger.aggregate({
        where: { 
          vendorId,
          transactionType: { in: ['ORDER_CREDIT'] }
        },
        _sum: { amount: true }
      });
      
      const totalCredits = result._sum.amount || new (require('decimal.js'))(0);
      
      const debitResult = await prisma.creditLedger.aggregate({
        where: { 
          vendorId,
          transactionType: { in: ['PAYMENT_DEBIT', 'REFUND_DEBIT', 'ADJUSTMENT_DEBIT'] }
        },
        _sum: { amount: true }
      });
      
      const totalDebits = debitResult._sum.amount || new (require('decimal.js'))(0);
      
      return totalCredits.subtract(totalDebits);
    } catch (error) {
      logger.error('Error calculating vendor receivable', { vendorId, error: error.message });
      return new (require('decimal.js'))(0);
    }
  }

  async getOrderOutstandingBalance(orderId) {
    try {
      const order = await prisma.order.findUnique({
        where: { id: orderId },
        select: { total: true, paidAmount: true }
      });
      
      if (!order) {
        return new (require('decimal.js'))(0);
      }
      
      return order.total.subtract(order.paidAmount);
    } catch (error) {
      logger.error('Error calculating order outstanding balance', { orderId, error: error.message });
      return new (require('decimal.js'))(0);
    }
  }

  async getRetailerLedgerHistory(retailerId, options = {}) {
    try {
      const { limit = 50, offset = 0, startDate, endDate } = options;
      
      const where = { retailerId };
      
      if (startDate || endDate) {
        where.createdAt = {};
        if (startDate) where.createdAt.gte = startDate;
        if (endDate) where.createdAt.lte = endDate;
      }
      
      const entries = await prisma.creditLedger.findMany({
        where,
        include: {
          order: {
            select: {
              orderNumber: true,
              status: true
            }
          },
          payment: {
            select: {
              receiptNumber: true,
              method: true
            }
          }
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset
      });
      
      return entries;
    } catch (error) {
      logger.error('Error getting retailer ledger history', { retailerId, error: error.message });
      return [];
    }
  }

  async getVendorLedgerHistory(vendorId, options = {}) {
    try {
      const { limit = 50, offset = 0, startDate, endDate } = options;
      
      const where = { vendorId };
      
      if (startDate || endDate) {
        where.createdAt = {};
        if (startDate) where.createdAt.gte = startDate;
        if (endDate) where.createdAt.lte = endDate;
      }
      
      const entries = await prisma.creditLedger.findMany({
        where,
        include: {
          order: {
            select: {
              orderNumber: true,
              status: true,
              retailer: {
                select: {
                  user: {
                    select: {
                      businessName: true
                    }
                  }
                }
              }
            }
          },
          payment: {
            select: {
              receiptNumber: true,
              method: true
            }
          }
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset
      });
      
      return entries;
    } catch (error) {
      logger.error('Error getting vendor ledger history', { vendorId, error: error.message });
      return [];
    }
  }

  async getAdminDashboardData() {
    try {
      console.log('📊 Generating admin dashboard data...');
      
      // Get total retailer dues
      const totalRetailerDues = await prisma.creditLedger.aggregate({
        where: { transactionType: 'ORDER_DEBIT' },
        _sum: { amount: true }
      });
      
      // Get total vendor receivables
      const totalVendorReceivables = await prisma.creditLedger.aggregate({
        where: { transactionType: 'ORDER_CREDIT' },
        _sum: { amount: true }
      });
      
      // Get total payments received
      const totalPayments = await prisma.creditLedger.aggregate({
        where: { transactionType: 'PAYMENT_CREDIT' },
        _sum: { amount: true }
      });
      
      // Get overdue amounts
      const overdueAmounts = await prisma.creditLedger.aggregate({
        where: {
          transactionType: 'ORDER_DEBIT',
          dueDate: { lt: new Date() },
          isReversed: false
        },
        _sum: { amount: true }
      });
      
      // Get top retailers by outstanding balance
      const topRetailers = await prisma.retailer.findMany({
        include: {
          user: {
            select: {
              businessName: true,
              phoneNumber: true
            }
          }
        }
      });
      
      const retailersWithBalances = await Promise.all(
        topRetailers.map(async (retailer) => {
          const totalDue = await this.getRetailerTotalDue(retailer.id);
          return {
            ...retailer,
            totalDue
          };
        })
      );
      
      // Get top vendors by receivable
      const topVendors = await prisma.vendor.findMany({
        include: {
          user: {
            select: {
              businessName: true,
              phoneNumber: true
            }
          }
        }
      });
      
      const vendorsWithReceivables = await Promise.all(
        topVendors.map(async (vendor) => {
          const receivable = await this.getVendorReceivable(vendor.id);
          return {
            ...vendor,
            receivable
          };
        })
      );
      
      const dashboardData = {
        summary: {
          totalRetailerDues: totalRetailerDues._sum.amount || new (require('decimal.js'))(0),
          totalVendorReceivables: totalVendorReceivables._sum.amount || new (require('decimal.js'))(0),
          totalPayments: totalPayments._sum.amount || new (require('decimal.js'))(0),
          overdueAmounts: overdueAmounts._sum.amount || new (require('decimal.js'))(0)
        },
        topRetailers: retailersWithBalances
          .filter(r => r.totalDue.gt(0))
          .sort((a, b) => b.totalDue.comparedTo(a.totalDue))
          .slice(0, 10),
        topVendors: vendorsWithReceivables
          .filter(v => v.receivable.gt(0))
          .sort((a, b) => b.receivable.comparedTo(a.receivable))
          .slice(0, 10)
      };
      
      console.log('✅ Admin dashboard data generated');
      return dashboardData;
      
    } catch (error) {
      logger.error('Error generating admin dashboard data', { error: error.message });
      throw error;
    }
  }
}

module.exports = new CreditLedgerService();
