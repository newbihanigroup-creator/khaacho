const creditLedgerService = require('../services/creditLedger.service');
const paymentProcessingService = require('../services/paymentProcessing.service');
const ApiResponse = require('../utils/response');
const logger = require('../utils/logger');

class CreditLedgerController {
  async getDashboard(req, res, next) {
    try {
      const dashboardData = await creditLedgerService.getAdminDashboardData();
      
      return ApiResponse.success(res, dashboardData, 'Dashboard data retrieved successfully');
    } catch (error) {
      logger.error('Error getting dashboard data', { error: error.message });
      next(error);
    }
  }

  async getRetailerBalance(req, res, next) {
    try {
      const { retailerId } = req.params;
      
      const currentBalance = await creditLedgerService.getRetailerCurrentBalance(retailerId);
      const totalDue = await creditLedgerService.getRetailerTotalDue(retailerId);
      
      return ApiResponse.success(res, {
        retailerId,
        currentBalance,
        totalDue,
        isOverdue: totalDue.gt(0)
      }, 'Retailer balance retrieved successfully');
    } catch (error) {
      logger.error('Error getting retailer balance', { error: error.message });
      next(error);
    }
  }

  async getVendorReceivable(req, res, next) {
    try {
      const { vendorId } = req.params;
      
      const currentBalance = await creditLedgerService.getVendorCurrentBalance(vendorId);
      const receivable = await creditLedgerService.getVendorReceivable(vendorId);
      
      return ApiResponse.success(res, {
        vendorId,
        currentBalance,
        receivable,
        hasReceivable: receivable.gt(0)
      }, 'Vendor receivable retrieved successfully');
    } catch (error) {
      logger.error('Error getting vendor receivable', { error: error.message });
      next(error);
    }
  }

  async getRetailerLedger(req, res, next) {
    try {
      const { retailerId } = req.params;
      const { 
        limit = 50, 
        offset = 0, 
        startDate, 
        endDate 
      } = req.query;
      
      const history = await creditLedgerService.getRetailerLedgerHistory(retailerId, {
        limit: parseInt(limit),
        offset: parseInt(offset),
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined
      });
      
      return ApiResponse.success(res, {
        retailerId,
        entries: history,
        pagination: {
          limit: parseInt(limit),
          offset: parseInt(offset),
          count: history.length
        }
      }, 'Retailer ledger history retrieved successfully');
    } catch (error) {
      logger.error('Error getting retailer ledger', { error: error.message });
      next(error);
    }
  }

  async getVendorLedger(req, res, next) {
    try {
      const { vendorId } = req.params;
      const { 
        limit = 50, 
        offset = 0, 
        startDate, 
        endDate 
      } = req.query;
      
      const history = await creditLedgerService.getVendorLedgerHistory(vendorId, {
        limit: parseInt(limit),
        offset: parseInt(offset),
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined
      });
      
      return ApiResponse.success(res, {
        vendorId,
        entries: history,
        pagination: {
          limit: parseInt(limit),
          offset: parseInt(offset),
          count: history.length
        }
      }, 'Vendor ledger history retrieved successfully');
    } catch (error) {
      logger.error('Error getting vendor ledger', { error: error.message });
      next(error);
    }
  }

  async getOrderOutstandingBalance(req, res, next) {
    try {
      const { orderId } = req.params;
      
      const outstandingBalance = await creditLedgerService.getOrderOutstandingBalance(orderId);
      
      return ApiResponse.success(res, {
        orderId,
        outstandingBalance
      }, 'Order outstanding balance retrieved successfully');
    } catch (error) {
      logger.error('Error getting order outstanding balance', { error: error.message });
      next(error);
    }
  }

  async getPaymentHistory(req, res, next) {
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
      } = req.query;
      
      const payments = await paymentProcessingService.getPaymentHistory({
        orderId,
        retailerId,
        vendorId,
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined,
        method,
        limit: parseInt(limit),
        offset: parseInt(offset)
      });
      
      return ApiResponse.success(res, {
        payments,
        pagination: {
          limit: parseInt(limit),
          offset: parseInt(offset),
          count: payments.length
        }
      }, 'Payment history retrieved successfully');
    } catch (error) {
      logger.error('Error getting payment history', { error: error.message });
      next(error);
    }
  }

  async getPaymentSummary(req, res, next) {
    try {
      const { 
        retailerId, 
        vendorId, 
        startDate, 
        endDate 
      } = req.query;
      
      const summary = await paymentProcessingService.getPaymentSummary({
        retailerId,
        vendorId,
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined
      });
      
      return ApiResponse.success(res, summary, 'Payment summary retrieved successfully');
    } catch (error) {
      logger.error('Error getting payment summary', { error: error.message });
      next(error);
    }
  }

  async generatePaymentReport(req, res, next) {
    try {
      const { 
        retailerId, 
        vendorId, 
        startDate, 
        endDate 
      } = req.query;
      
      const report = await paymentProcessingService.generatePaymentReport({
        retailerId,
        vendorId,
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined
      });
      
      return ApiResponse.success(res, report, 'Payment report generated successfully');
    } catch (error) {
      logger.error('Error generating payment report', { error: error.message });
      next(error);
    }
  }

  async reconcilePayments(req, res, next) {
    try {
      const { orderId } = req.params;
      
      const reconciliation = await paymentProcessingService.reconcilePayments(orderId);
      
      return ApiResponse.success(res, reconciliation, 'Payment reconciliation completed');
    } catch (error) {
      logger.error('Error reconciling payments', { error: error.message });
      next(error);
    }
  }

  async processPayment(req, res, next) {
    try {
      const paymentData = req.body;
      
      const result = await paymentProcessingService.processPayment(paymentData);
      
      return ApiResponse.success(res, result, 'Payment processed successfully');
    } catch (error) {
      logger.error('Error processing payment', { error: error.message });
      next(error);
    }
  }

  async processBulkPayments(req, res, next) {
    try {
      const { payments } = req.body;
      
      if (!Array.isArray(payments)) {
        return ApiResponse.error(res, 'Payments must be an array', 400);
      }
      
      const results = await paymentProcessingService.processBulkPayments(payments);
      
      return ApiResponse.success(res, results, 'Bulk payments processed');
    } catch (error) {
      logger.error('Error processing bulk payments', { error: error.message });
      next(error);
    }
  }

  async getLedgerStats(req, res, next) {
    try {
      const { period = '30days' } = req.query;
      
      // Calculate date range based on period
      const now = new Date();
      let startDate;
      
      switch (period) {
        case '7days':
          startDate = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000));
          break;
        case '30days':
          startDate = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));
          break;
        case '90days':
          startDate = new Date(now.getTime() - (90 * 24 * 60 * 60 * 1000));
          break;
        case '1year':
          startDate = new Date(now.getTime() - (365 * 24 * 60 * 60 * 1000));
          break;
        default:
          startDate = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));
      }
      
      const dashboardData = await creditLedgerService.getAdminDashboardData();
      
      // Get period-specific stats
      const paymentSummary = await paymentProcessingService.getPaymentSummary({
        startDate,
        endDate: now
      });
      
      const stats = {
        period,
        dateRange: { startDate, endDate: now },
        currentTotals: dashboardData.summary,
        periodPayments: paymentSummary,
        topRetailers: dashboardData.topRetailers.slice(0, 5),
        topVendors: dashboardData.topVendors.slice(0, 5)
      };
      
      return ApiResponse.success(res, stats, 'Ledger statistics retrieved successfully');
    } catch (error) {
      logger.error('Error getting ledger stats', { error: error.message });
      next(error);
    }
  }
}

module.exports = new CreditLedgerController();
