const financialAccountingService = require('../services/financialAccounting.service');
const ApiResponse = require('../utils/response');
const logger = require('../utils/logger');

class FinancialAccountingController {
  async generateInvoice(req, res, next) {
    try {
      const { orderId } = req.params;
      
      const invoice = await financialAccountingService.generateInvoiceOnDelivery(orderId);
      
      return ApiResponse.success(res, invoice, 'Invoice generated successfully');
    } catch (error) {
      logger.error('Error generating invoice', { error: error.message });
      return ApiResponse.error(res, error.message, 500);
    }
  }

  async processPayment(req, res, next) {
    try {
      const paymentData = req.body;
      
      const result = await financialAccountingService.processPayment(paymentData);
      
      return ApiResponse.success(res, result, 'Payment processed successfully');
    } catch (error) {
      logger.error('Error processing payment', { error: error.message });
      return ApiResponse.error(res, error.message, 500);
    }
  }

  async createVendorSettlement(req, res, next) {
    try {
      const settlementData = req.body;
      
      const settlement = await financialAccountingService.createVendorSettlement(settlementData);
      
      return ApiResponse.success(res, settlement, 'Vendor settlement created successfully');
    } catch (error) {
      logger.error('Error creating vendor settlement', { error: error.message });
      return ApiResponse.error(res, error.message, 500);
    }
  }

  async getRetailerFinancialReports(req, res, next) {
    try {
      const { retailerId } = req.params;
      const { startDate, endDate, includeInvoices, includePayments } = req.query;
      
      const reports = await financialAccountingService.getFinancialReports(retailerId, {
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined,
        includeInvoices: includeInvoices !== 'false',
        includePayments: includePayments !== 'false'
      });
      
      return ApiResponse.success(res, reports, 'Retailer financial reports retrieved successfully');
    } catch (error) {
      logger.error('Error getting retailer financial reports', { error: error.message });
      return ApiResponse.error(res, error.message, 500);
    }
  }

  async getVendorFinancialReports(req, res, next) {
    try {
      const { vendorId } = req.params;
      const { startDate, endDate } = req.query;
      
      const reports = await financialAccountingService.getVendorFinancialReports(vendorId, {
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined
      });
      
      return ApiResponse.success(res, reports, 'Vendor financial reports retrieved successfully');
    } catch (error) {
      logger.error('Error getting vendor financial reports', { error: error.message });
      return ApiResponse.error(res, error.message, 500);
    }
  }

  async getPlatformFinancialOverview(req, res, next) {
    try {
      const { startDate, endDate } = req.query;
      
      const overview = await financialAccountingService.getPlatformFinancialOverview({
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined
      });
      
      return ApiResponse.success(res, overview, 'Platform financial overview retrieved successfully');
    } catch (error) {
      logger.error('Error getting platform financial overview', { error: error.message });
      return ApiResponse.error(res, error.message, 500);
    }
  }

  async getInvoiceDetails(req, res, next) {
    try {
      const { invoiceNumber } = req.params;
      
      const invoice = await prisma.invoice.findUnique({
        where: { invoiceNumber },
        include: {
          order: {
            select: {
              orderNumber: true,
              total: true,
              createdAt: true,
              items: {
                select: {
                  productName: true,
                  quantity: true,
                  unitPrice: true
                }
              }
            }
          },
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
          },
          payments: {
            select: {
              paymentNumber: true,
              amount: true,
              paymentMethod: true,
              processedAt: true,
              createdAt: true
            },
            orderBy: {
              createdAt: 'desc'
            },
            take: 10
          }
        }
      });

      if (!invoice) {
        return ApiResponse.error(res, 'Invoice not found', 404);
      }

      return ApiResponse.success(res, invoice, 'Invoice details retrieved successfully');
    } catch (error) {
      logger.error('Error getting invoice details', { error: error.message });
      return ApiResponse.error(res, error.message, 500);
    }
  }

  async getInvoices(req, res, next) {
    try {
      const { retailerId, vendorId, status, page = 1, limit = 20 } = req.query;
      
      const whereClause = {};
      
      if (retailerId) {
        whereClause.retailerId = retailerId;
      }
      
      if (vendorId) {
        whereClause.vendorId = vendorId;
      }
      
      if (status) {
        whereClause.status = status;
      }

      const invoices = await prisma.invoice.findMany({
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
        orderBy: { createdAt: 'desc' },
        skip: (parseInt(page) - 1) * parseInt(limit),
        take: parseInt(limit)
      });

      const totalCount = await prisma.invoice.count({ where: whereClause });

      return ApiResponse.success(res, {
        invoices,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          totalCount,
          totalPages: Math.ceil(totalCount / parseInt(limit))
        }
      }, 'Invoices retrieved successfully');
    } catch (error) {
      logger.error('Error getting invoices', { error: error.message });
      return ApiResponse.error(res, error.message, 500);
    }
  }

  async getPayments(req, res, next) {
    try {
      const { retailerId, vendorId, paymentMethod, status, page = 1, limit = 20 } = req.query;
      
      const whereClause = {};
      
      if (retailerId) {
        whereClause.retailerId = retailerId;
      }
      
      if (vendorId) {
        whereClause.vendorId = vendorId;
      }
      
      if (paymentMethod) {
        whereClause.paymentMethod = paymentMethod;
      }
      
      if (status) {
        whereClause.paymentStatus = status;
      }

      const payments = await prisma.payment.findMany({
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
        orderBy: { createdAt: 'desc' },
        skip: (parseInt(page) - 1) * parseInt(limit),
        take: parseInt(limit)
      });

      const totalCount = await prisma.payment.count({ where: whereClause });

      return ApiResponse.success(res, {
        payments,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          totalCount,
          totalPages: Math.ceil(totalCount / parseInt(limit))
        }
      }, 'Payments retrieved successfully');
    } catch (error) {
      logger.error('Error getting payments', { error: error.message });
      return ApiResponse.error(res, error.message, 500);
    }
  }

  async getVendorSettlements(req, res, next) {
    try {
      const { vendorId, status, page = 1, limit = 20 } = req.query;
      
      const whereClause = {};
      
      if (vendorId) {
        whereClause.vendorId = vendorId;
      }
      
      if (status) {
        whereClause.status = status;
      }

      const settlements = await prisma.vendorSettlement.findMany({
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
        orderBy: { createdAt: 'desc' },
        skip: (parseInt(page) - 1) * parseInt(limit),
        take: parseInt(limit)
      });

      const totalCount = await prisma.vendorSettlement.count({ where: whereClause });

      return ApiResponse.success(res, {
        settlements,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          totalCount,
          totalPages: Math.ceil(totalCount / parseInt(limit))
        }
      }, 'Vendor settlements retrieved successfully');
    } catch (error) {
      logger.error('Error getting vendor settlements', { error: error.message });
      return ApiResponse.error(res, error.message, 500);
    }
  }
}

module.exports = new FinancialAccountingController();
