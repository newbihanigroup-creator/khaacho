const prisma = require('../config/database');
const logger = require('../utils/logger');

class FinancialAccountingService {
  async generateInvoiceOnDelivery(orderId) {
    try {
      console.log(`🧾 Generating invoice for delivered order: ${orderId}`);
      
      const order = await prisma.order.findUnique({
        where: { id: orderId },
        include: {
          retailer: {
            include: {
              user: {
                select: {
                  businessName: true
                }
              }
            }
          },
          vendor: {
            include: {
              user: {
                select: {
                  businessName: true
                }
              }
            }
          },
          items: true
        }
      });

      if (!order) {
        throw new Error('Order not found');
      }

      if (order.status !== 'DELIVERED') {
        throw new Error('Order must be delivered to generate invoice');
      }

      // Generate invoice number
      const invoiceNumber = 'INV' + Date.now() + '-' + order.id.substring(0, 8);

      // Calculate invoice amounts
      const subtotal = order.items.reduce((sum, item) => sum.add(item.subtotal), new Decimal(0));
      const taxAmount = order.items.reduce((sum, item) => sum.add(item.taxAmount || 0), new Decimal(0));
      const deliveryCharge = order.shippingCharges || new Decimal(0);
      const totalAmount = subtotal.add(taxAmount).add(deliveryCharge);

      // Set due date (30 days from delivery)
      const dueDate = new Date(order.deliveredAt.getTime() + (30 * 24 * 60 * 60 * 1000));

      const result = await prisma.$transaction(async (tx) => {
        // Create invoice
        const invoice = await tx.invoice.create({
          data: {
            invoiceNumber,
            orderId: order.id,
            retailerId: order.retailerId,
            vendorId: order.vendorId,
            invoiceAmount: subtotal,
            taxAmount,
            deliveryCharge,
            totalAmount,
            dueDate,
            status: 'UNPAID',
            paidAmount: new Decimal(0),
            balanceAmount: totalAmount,
            notes: `Invoice for Order #${order.orderNumber}`,
            createdAt: new Date(),
            createdBy: order.createdBy
          }
        });

        // Update order with invoice number
        await tx.order.update({
          where: { id: order.id },
          data: {
            invoiceNumber: invoice.invoiceNumber,
            invoiceUrl: `/invoices/${invoice.invoiceNumber}`
          }
        });

        // Create credit ledger entry (debit retailer)
        await tx.creditLedger.create({
          data: {
            ledgerNumber: 'CREDIT' + Date.now(),
            retailerId: order.retailerId,
            vendorId: order.vendorId,
            orderId: order.id,
            invoiceId: invoice.id,
            transactionType: 'ORDER_DEBIT',
            amount: totalAmount,
            runningBalance: (order.retailer?.outstandingDebt || 0).add(totalAmount),
            previousBalance: order.retailer?.outstandingDebt || 0,
            description: `Invoice #${invoice.invoiceNumber} - Order #${order.orderNumber}`,
            referenceNumber: invoice.invoiceNumber,
            dueDate,
            metadata: {
              orderNumber: order.orderNumber,
              invoiceNumber: invoice.invoiceNumber,
              retailerName: order.retailer?.user?.businessName,
              vendorName: order.vendor?.user?.businessName
            }
          }
        });

        return invoice;
      });

      console.log(`✅ Invoice generated: ${invoice.invoiceNumber} for order ${order.orderNumber}`);
      return result;

    } catch (error) {
      logger.error('Error generating invoice', {
        orderId,
        error: error.message
      });
      throw error;
    }
  }

  async processPayment(paymentData) {
    try {
      console.log(`💰 Processing payment:`, paymentData);
      
      const { orderId, amount, paymentMethod, bankReference, receivedBy } = paymentData;

      const order = await prisma.order.findUnique({
        where: { id: orderId },
        include: {
          retailer: true,
          invoice: true
        }
      });

      if (!order) {
        throw new Error('Order not found');
      }

      const result = await prisma.$transaction(async (tx) => {
        // Create payment record
        const payment = await tx.payment.create({
          data: {
            paymentNumber: 'PAY' + Date.now(),
            retailerId: order.retailerId,
            vendorId: order.vendorId,
            orderId: order.id,
            amount,
            paymentMethod,
            transactionId: bankReference,
            bankReference,
            paymentStatus: 'PROCESSED',
            processedAt: new Date(),
            createdBy: receivedBy
          }
        });

        // Update invoice balance
        let newPaidAmount = new Decimal(0);
        let newBalanceAmount = order.invoice?.totalAmount || new Decimal(0);
        
        if (order.invoice) {
          newPaidAmount = order.invoice.paidAmount.add(amount);
          newBalanceAmount = order.invoice.totalAmount.sub(newPaidAmount);
          
          await tx.invoice.update({
            where: { id: order.invoice.id },
            data: {
              paidAmount: newPaidAmount,
              balanceAmount: newBalanceAmount,
              status: newBalanceAmount.eq(0) ? 'PAID' : 
                     newBalanceAmount.lt(order.invoice.totalAmount.mul(0.5)) ? 'PARTIAL' : 'UNPAID',
              updatedAt: new Date()
            }
          });
        }

        // Create credit ledger entry (credit retailer)
        await tx.creditLedger.create({
          data: {
            ledgerNumber: 'CREDIT' + Date.now(),
            retailerId: order.retailerId,
            vendorId: order.vendorId,
            orderId: order.id,
            paymentId: payment.id,
            invoiceId: order.invoice?.id,
            transactionType: 'PAYMENT_CREDIT',
            amount: amount,
            runningBalance: (order.retailer?.outstandingDebt || 0).sub(amount),
            previousBalance: order.retailer?.outstandingDebt || 0,
            description: `Payment for Order #${order.orderNumber}`,
            referenceNumber: payment.paymentNumber,
            metadata: {
              orderNumber: order.orderNumber,
              paymentNumber: payment.paymentNumber,
              paymentMethod,
              retailerName: order.retailer?.user?.businessName
            }
          }
        });

        // Update retailer outstanding debt
        const newOutstandingDebt = (order.retailer?.outstandingDebt || 0).sub(amount);
        await tx.retailer.update({
          where: { id: order.retailerId },
          data: {
            outstandingDebt: newOutstandingDebt,
            lastPaymentDate: new Date(),
            updatedAt: new Date()
          }
        });

        return {
          payment,
          invoice: order.invoice,
          newOutstandingDebt
        };
      });

      console.log(`✅ Payment processed: ${result.payment.paymentNumber} for order ${order.orderNumber}`);
      return result;

    } catch (error) {
      logger.error('Error processing payment', {
        paymentData,
        error: error.message
      });
      throw error;
    }
  }

  async createVendorSettlement(settlementData) {
    try {
      console.log(`🏦 Creating vendor settlement:`, settlementData);
      
      const { vendorId, invoiceIds, payableAmount, platformCommission, notes, bankReference } = settlementData;

      const vendor = await prisma.vendor.findUnique({
        where: { id: vendorId },
        include: {
          user: {
            select: {
              businessName: true
            }
          }
        }
      });

      if (!vendor) {
        throw new Error('Vendor not found');
      }

      const result = await prisma.$transaction(async (tx) => {
        // Generate settlement number
        const settlementNumber = 'SET' + Date.now();

        // Create settlement record
        const settlement = await tx.vendorSettlement.create({
          data: {
            settlementNumber,
            vendorId,
            payableAmount,
            platformCommission,
            settlementAmount: payableAmount.sub(platformCommission),
            status: 'PENDING',
            notes,
            bankReference,
            createdAt: new Date(),
            createdBy: 'SYSTEM'
          }
        });

        // Update invoice settlement references
        if (invoiceIds && invoiceIds.length > 0) {
          await tx.invoice.updateMany({
            where: {
              id: { in: invoiceIds }
            },
            data: {
              updatedAt: new Date()
            }
          });
        }

        return settlement;
      });

      console.log(`✅ Vendor settlement created: ${result.settlementNumber} for ${vendor.user.businessName}`);
      return result;

    } catch (error) {
      logger.error('Error creating vendor settlement', {
        settlementData,
        error: error.message
      });
      throw error;
    }
  }

  async getFinancialReports(retailerId, options = {}) {
    try {
      console.log(`📊 Generating financial reports for retailer: ${retailerId}`);
      
      const { 
        startDate, 
        endDate, 
        includeInvoices = true, 
        includePayments = true,
        includeSettlements = false 
      } = options;

      const whereClause = {
        retailerId,
        createdAt: {}
      };

      if (startDate) {
        whereClause.createdAt.gte = startDate;
      }
      if (endDate) {
        whereClause.createdAt.lte = endDate;
      }

      const [invoices, payments] = await Promise.all([
        includeInvoices ? prisma.invoice.findMany({
          where: whereClause,
          include: {
            order: {
              select: {
                orderNumber: true,
                total: true,
                createdAt: true
              }
            },
            retailer: {
              include: {
                user: {
                  select: {
                    businessName: true
                  }
                }
              }
            },
            vendor: {
              include: {
                user: {
                  select: {
                    businessName: true
                  }
                }
              }
            }
          },
          orderBy: { createdAt: 'desc' }
        }) : Promise.resolve([]),

        includePayments ? prisma.payment.findMany({
          where: whereClause,
          include: {
            order: {
              select: {
                orderNumber: true,
                total: true
              }
            },
            retailer: {
              include: {
                user: {
                  select: {
                    businessName: true
                  }
                }
              }
            },
            vendor: {
              include: {
                user: {
                  select: {
                    businessName: true
                  }
                }
              }
            }
          },
          orderBy: { createdAt: 'desc' }
        }) : Promise.resolve([])
      ]);

      // Calculate summary statistics
      const totalInvoiceAmount = invoices.reduce((sum, inv) => sum.add(inv.totalAmount), new Decimal(0));
      const totalPaidAmount = payments.reduce((sum, pay) => sum.add(pay.amount), new Decimal(0));
      const outstandingAmount = totalInvoiceAmount.sub(totalPaidAmount);

      const reports = {
        retailerId,
        period: { startDate, endDate },
        summary: {
          totalInvoices: invoices.length,
          totalPayments: payments.length,
          totalInvoiceAmount,
          totalPaidAmount,
          outstandingAmount,
          averageInvoiceValue: invoices.length > 0 ? totalInvoiceAmount.div(invoices.length) : new Decimal(0)
        },
        invoices: invoices.map(inv => ({
          invoiceNumber: inv.invoiceNumber,
          orderNumber: inv.order?.orderNumber,
          amount: inv.totalAmount,
          status: inv.status,
          dueDate: inv.dueDate,
          createdAt: inv.createdAt
        })),
        payments: payments.map(pay => ({
          paymentNumber: pay.paymentNumber,
          orderNumber: pay.order?.orderNumber,
          amount: pay.amount,
          paymentMethod: pay.paymentMethod,
          status: pay.paymentStatus,
          processedAt: pay.processedAt,
          createdAt: pay.createdAt
        }))
      };

      console.log('✅ Financial reports generated successfully');
      return reports;

    } catch (error) {
      logger.error('Error generating financial reports', {
        retailerId,
        error: error.message
      });
      throw error;
    }
  }

  async getVendorFinancialReports(vendorId, options = {}) {
    try {
      console.log(`📊 Generating vendor financial reports for: ${vendorId}`);
      
      const { startDate, endDate } = options;

      const whereClause = {
        vendorId,
        createdAt: {}
      };

      if (startDate) {
        whereClause.createdAt.gte = startDate;
      }
      if (endDate) {
        whereClause.createdAt.lte = endDate;
      }

      const [settlements, invoices] = await Promise.all([
        prisma.vendorSettlement.findMany({
          where: whereClause,
          include: {
            vendor: {
              include: {
                user: {
                  select: {
                    businessName: true
                  }
                }
              }
            },
            invoice: {
              select: {
                invoiceNumber: true,
                totalAmount: true
              }
            }
          },
          orderBy: { createdAt: 'desc' }
        }),

        prisma.invoice.findMany({
          where: {
            vendorId
          },
          include: {
            order: {
              select: {
                orderNumber: true,
                total: true
              }
            }
          },
          orderBy: { createdAt: 'desc' }
        })
      ]);

      // Calculate vendor statistics
      const totalPayableAmount = settlements.reduce((sum, set) => sum.add(set.payableAmount), new Decimal(0));
      const totalSettledAmount = settlements.reduce((sum, set) => sum.add(set.settlementAmount), new Decimal(0));
      const totalInvoiceAmount = invoices.reduce((sum, inv) => sum.add(inv.totalAmount), new Decimal(0));
      const pendingSettlements = totalPayableAmount.sub(totalSettledAmount);

      const reports = {
        vendorId,
        period: { startDate, endDate },
        summary: {
          totalSettlements: settlements.length,
          totalInvoices: invoices.length,
          totalPayableAmount,
          totalSettledAmount,
          pendingSettlements,
          averageSettlementAmount: settlements.length > 0 ? totalSettledAmount.div(settlements.length) : new Decimal(0),
          platformCommission: settlements.reduce((sum, set) => sum.add(set.platformCommission), new Decimal(0))
        },
        settlements: settlements.map(set => ({
          settlementNumber: set.settlementNumber,
          payableAmount: set.payableAmount,
          platformCommission: set.platformCommission,
          settlementAmount: set.settlementAmount,
          status: set.status,
          settlementDate: set.settlementDate,
          notes: set.notes,
          createdAt: set.createdAt
        })),
        invoices: invoices.map(inv => ({
          invoiceNumber: inv.invoiceNumber,
          orderNumber: inv.order?.orderNumber,
          amount: inv.totalAmount,
          status: inv.status,
          createdAt: inv.createdAt
        }))
      };

      console.log('✅ Vendor financial reports generated successfully');
      return reports;

    } catch (error) {
      logger.error('Error generating vendor financial reports', {
        vendorId,
        error: error.message
      });
      throw error;
    }
  }

  async getPlatformFinancialOverview(options = {}) {
    try {
      console.log('📊 Generating platform financial overview...');
      
      const { startDate, endDate } = options;

      const whereClause = {};
      if (startDate) {
        whereClause.createdAt = { gte: startDate };
      }
      if (endDate) {
        whereClause.createdAt = { lte: endDate };
      }

      const [totalInvoices, totalPayments, totalSettlements] = await Promise.all([
        prisma.invoice.count({ where: whereClause }),
        prisma.payment.count({ where: whereClause }),
        prisma.vendorSettlement.count({ where: whereClause })
      ]);

      const [invoiceSum, paymentSum, settlementSum] = await Promise.all([
        prisma.invoice.aggregate({
          where: whereClause,
          _sum: { totalAmount: true }
        }),
        prisma.payment.aggregate({
          where: whereClause,
          _sum: { amount: true }
        }),
        prisma.vendorSettlement.aggregate({
          where: whereClause,
          _sum: { payableAmount: true }
        })
      ]);

      const totalInvoiceAmount = invoiceSum._sum.totalAmount || new Decimal(0);
      const totalPaymentAmount = paymentSum._sum.amount || new Decimal(0);
      const totalPayableAmount = settlementSum._sum.payableAmount || new Decimal(0);

      const overview = {
        period: { startDate, endDate },
        summary: {
          totalInvoices,
          totalPayments,
          totalSettlements,
          totalInvoiceAmount,
          totalPaymentAmount,
          totalPayableAmount,
          outstandingReceivables: totalInvoiceAmount.sub(totalPaymentAmount),
          pendingSettlements: totalPayableAmount.sub(totalSettlements),
          platformRevenue: totalSettlements.reduce((sum, set) => sum.add(set.platformCommission), new Decimal(0))
        },
        metrics: {
          averageInvoiceValue: totalInvoices > 0 ? totalInvoiceAmount.div(totalInvoices) : new Decimal(0),
          averagePaymentAmount: totalPayments > 0 ? totalPaymentAmount.div(totalPayments) : new Decimal(0),
          paymentRate: totalInvoices > 0 ? totalPayments.div(totalInvoices) : new Decimal(0),
          settlementRate: totalPayableAmount.gt(0) ? totalSettlements.div(totalPayableAmount) : new Decimal(0)
        }
      };

      console.log('✅ Platform financial overview generated successfully');
      return overview;

    } catch (error) {
      logger.error('Error generating platform financial overview', { error: error.message });
      throw error;
    }
  }
}

module.exports = new FinancialAccountingService();
