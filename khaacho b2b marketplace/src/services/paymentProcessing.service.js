const prisma = require('../config/database');
const logger = require('../utils/logger');
const creditLedgerService = require('./creditLedger.service');
const creditControlService = require('./creditControl.service');

class PaymentProcessingService {
  async processPayment(paymentData) {
    try {
      console.log('💰 Processing payment:', paymentData.orderId);
      
      const { orderId, amount, method, receiptNumber, paymentDate = new Date() } = paymentData;
      
      // Validate order exists and is in correct status
      const order = await prisma.order.findUnique({
        where: { id: orderId },
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
          payments: {
            orderBy: { createdAt: 'desc' }
          }
        }
      });
      
      if (!order) {
        throw new Error('Order not found');
      }
      
      // Calculate outstanding balance
      const outstandingBalance = order.total.subtract(order.paidAmount);
      
      if (amount.gt(outstandingBalance)) {
        throw new Error(`Payment amount (${amount}) exceeds outstanding balance (${outstandingBalance})`);
      }
      
      // Generate receipt number if not provided
      const finalReceiptNumber = receiptNumber || `RCPT${Date.now()}`;
      
      // Create payment record
      const payment = await prisma.payment.create({
        data: {
          orderId,
          amount,
          method: method || 'BANK_TRANSFER',
          status: 'PAID',
          receiptNumber: finalReceiptNumber,
          paymentDate,
          notes: `Payment processed via ${method || 'Bank Transfer'}`,
          createdAt: new Date()
        }
      });
      
      // Update order paid amount
      const newPaidAmount = order.paidAmount.add(amount);
      const newDueAmount = order.total.subtract(newPaidAmount);
      
      await prisma.order.update({
        where: { id: orderId },
        data: {
          paidAmount: newPaidAmount,
          dueAmount: newDueAmount,
          paymentStatus: newDueAmount.eq(0) ? 'PAID' : 'PARTIAL',
          updatedAt: new Date()
        }
      });
      
      // Create credit ledger entry
      await creditLedgerService.createPaymentCreditEntry({
        ...payment,
        order
      });

      // Restore credit to retailer account
      try {
        await creditControlService.restoreCreditOnPayment(payment.id);
        console.log(`💳 Credit restored for payment ${receiptNumber}`);
      } catch (creditError) {
        console.error('Error restoring credit on payment', {
          paymentId: payment.id,
          error: creditError.message
        });
        // Don't fail payment processing if credit restoration fails
      }
      
      console.log('✅ Payment processed successfully:', finalReceiptNumber);
      
      return {
        success: true,
        payment,
        orderNumber: order.orderNumber,
        remainingBalance: newDueAmount,
        isFullyPaid: newDueAmount.eq(0)
      };
      
    } catch (error) {
      logger.error('Error processing payment', { 
        orderId: paymentData.orderId, 
        error: error.message 
      });
      throw error;
    }
  }

  async processBulkPayments(paymentsData) {
    try {
      console.log(`💰 Processing bulk payments: ${paymentsData.length} payments`);
      
      const results = [];
      
      for (const paymentData of paymentsData) {
        try {
          const result = await this.processPayment(paymentData);
          results.push({
            success: true,
            orderId: paymentData.orderId,
            result
          });
        } catch (error) {
          results.push({
            success: false,
            orderId: paymentData.orderId,
            error: error.message
          });
        }
      }
      
      const successCount = results.filter(r => r.success).length;
      console.log(`✅ Bulk payment processing complete: ${successCount}/${results.length} successful`);
      
      return results;
      
    } catch (error) {
      logger.error('Error processing bulk payments', { error: error.message });
      throw error;
    }
  }

  async getPaymentHistory(filters = {}) {
    try {
      const { 
        orderId, 
        retailerId, 
        vendorId, 
        startDate, 
        endDate, 
        method,
        limit = 50,
        offset = 0 
      } = filters;
      
      const where = {};
      
      if (orderId) where.orderId = orderId;
      if (method) where.method = method;
      if (startDate || endDate) {
        where.paymentDate = {};
        if (startDate) where.paymentDate.gte = startDate;
        if (endDate) where.paymentDate.lte = endDate;
      }
      
      if (retailerId || vendorId) {
        where.order = {};
        if (retailerId) where.order.retailerId = retailerId;
        if (vendorId) where.order.vendorId = vendorId;
      }
      
      const payments = await prisma.payment.findMany({
        where,
        include: {
          order: {
            select: {
              orderNumber: true,
              total: true,
              status: true,
              retailer: {
                select: {
                  user: {
                    select: {
                      businessName: true
                    }
                  }
                }
              },
              vendor: {
                select: {
                  user: {
                    select: {
                      businessName: true
                    }
                  }
                }
              }
            }
          }
        },
        orderBy: { paymentDate: 'desc' },
        take: limit,
        skip: offset
      });
      
      return payments;
    } catch (error) {
      logger.error('Error getting payment history', { error: error.message });
      return [];
    }
  }

  async getPaymentSummary(filters = {}) {
    try {
      const { retailerId, vendorId, startDate, endDate } = filters;
      
      const where = {};
      
      if (startDate || endDate) {
        where.paymentDate = {};
        if (startDate) where.paymentDate.gte = startDate;
        if (endDate) where.paymentDate.lte = endDate;
      }
      
      if (retailerId || vendorId) {
        where.order = {};
        if (retailerId) where.order.retailerId = retailerId;
        if (vendorId) where.order.vendorId = vendorId;
      }
      
      const summary = await prisma.payment.aggregate({
        where,
        _sum: { amount: true },
        _count: { id: true },
        _min: { paymentDate: true },
        _max: { paymentDate: true }
      });
      
      const methodBreakdown = await prisma.payment.groupBy({
        by: ['method'],
        where,
        _sum: { amount: true },
        _count: { id: true }
      });
      
      return {
        totalAmount: summary._sum.amount || new (require('decimal.js'))(0),
        totalCount: summary._count.id || 0,
        dateRange: {
          from: summary._min.paymentDate,
          to: summary._max.paymentDate
        },
        methodBreakdown: methodBreakdown.map(item => ({
          method: item.method,
          amount: item._sum.amount || new (require('decimal.js'))(0),
          count: item._count.id || 0
        }))
      };
    } catch (error) {
      logger.error('Error getting payment summary', { error: error.message });
      return null;
    }
  }

  async generatePaymentReport(filters = {}) {
    try {
      console.log('📊 Generating payment report...');
      
      const { startDate, endDate, retailerId, vendorId } = filters;
      
      const payments = await this.getPaymentHistory({
        startDate,
        endDate,
        retailerId,
        vendorId,
        limit: 1000 // Large limit for reporting
      });
      
      const summary = await this.getPaymentSummary(filters);
      
      const report = {
        filters: {
          startDate,
          endDate,
          retailerId,
          vendorId
        },
        summary,
        payments: payments.map(payment => ({
          receiptNumber: payment.receiptNumber,
          orderNumber: payment.order.orderNumber,
          amount: payment.amount,
          method: payment.method,
          paymentDate: payment.paymentDate,
          retailerName: payment.order.retailer?.user?.businessName || 'Unknown',
          vendorName: payment.order.vendor?.user?.businessName || 'Unassigned',
          status: payment.status
        })),
        generatedAt: new Date()
      };
      
      console.log('✅ Payment report generated');
      return report;
      
    } catch (error) {
      logger.error('Error generating payment report', { error: error.message });
      throw error;
    }
  }

  async reconcilePayments(orderId) {
    try {
      console.log('🔍 Reconciling payments for order:', orderId);
      
      const order = await prisma.order.findUnique({
        where: { id: orderId },
        include: {
          payments: true,
          creditLedgers: {
            where: {
              transactionType: { in: ['PAYMENT_CREDIT', 'PAYMENT_DEBIT'] }
            }
          }
        }
      });
      
      if (!order) {
        throw new Error('Order not found');
      }
      
      const totalPayments = order.payments.reduce((sum, payment) => 
        sum.add(payment.amount), new (require('decimal.js'))(0)
      );
      
      const totalLedgerCredits = order.creditLedgers
        .filter(ledger => ledger.transactionType === 'PAYMENT_CREDIT')
        .reduce((sum, ledger) => sum.add(ledger.amount), new (require('decimal.js'))(0));
      
      const discrepancies = [];
      
      if (!totalPayments.eq(totalLedgerCredits)) {
        discrepancies.push({
          type: 'PAYMENT_LEDGER_MISMATCH',
          paymentsTotal: totalPayments,
          ledgerTotal: totalLedgerCredits,
          difference: totalPayments.subtract(totalLedgerCredits)
        });
      }
      
      if (!order.paidAmount.eq(totalPayments)) {
        discrepancies.push({
          type: 'ORDER_PAYMENT_MISMATCH',
          orderPaidAmount: order.paidAmount,
          paymentsTotal: totalPayments,
          difference: order.paidAmount.subtract(totalPayments)
        });
      }
      
      const reconciliation = {
        orderId,
        orderNumber: order.orderNumber,
        orderTotal: order.total,
        orderPaidAmount: order.paidAmount,
        totalPayments,
        totalLedgerCredits,
        discrepancies,
        isReconciled: discrepancies.length === 0,
        reconciledAt: new Date()
      };
      
      console.log(discrepancies.length === 0 ? '✅ Payments reconciled' : '⚠️ Reconciliation issues found');
      
      return reconciliation;
      
    } catch (error) {
      logger.error('Error reconciling payments', { orderId, error: error.message });
      throw error;
    }
  }
}

module.exports = new PaymentProcessingService();
