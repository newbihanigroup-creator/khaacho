const creditControlService = require('../services/creditControl.service');
const ApiResponse = require('../utils/response');
const logger = require('../utils/logger');

class CreditControlController {
  async getRetailerCreditStatus(req, res, next) {
    try {
      const { retailerId } = req.params;
      
      const creditStatus = await creditControlService.getRetailerCreditStatus(retailerId);
      
      return ApiResponse.success(res, creditStatus, 'Retailer credit status retrieved successfully');
    } catch (error) {
      logger.error('Error getting retailer credit status', { error: error.message });
      return ApiResponse.error(res, error.message, 500);
    }
  }

  async updateRetailerCreditLimit(req, res, next) {
    try {
      const { retailerId } = req.params;
      const { newCreditLimit } = req.body;
      
      if (!newCreditLimit || newCreditLimit <= 0) {
        return ApiResponse.error(res, 'Valid credit limit is required', 400);
      }

      const result = await creditControlService.updateRetailerCreditLimit(
        retailerId,
        newCreditLimit,
        req.user
      );

      return ApiResponse.success(res, result, 'Credit limit updated successfully');
    } catch (error) {
      logger.error('Error updating retailer credit limit', { error: error.message });
      return ApiResponse.error(res, error.message, 500);
    }
  }

  async unblockRetailer(req, res, next) {
    try {
      const { retailerId } = req.params;
      const { reason } = req.body;
      
      const result = await creditControlService.unblockRetailer(
        retailerId,
        reason || 'Manually unblocked by admin',
        req.user
      );

      return ApiResponse.success(res, result, 'Retailer unblocked successfully');
    } catch (error) {
      logger.error('Error unblocking retailer', { error: error.message });
      return ApiResponse.error(res, error.message, 500);
    }
  }

  async getCreditControlDashboard(req, res, next) {
    try {
      console.log('📊 Generating credit control dashboard...');
      
      const dashboard = await creditControlService.getCreditControlDashboard();
      
      return ApiResponse.success(res, dashboard, 'Credit control dashboard retrieved successfully');
    } catch (error) {
      logger.error('Error generating credit control dashboard', { error: error.message });
      return ApiResponse.error(res, error.message, 500);
    }
  }

  async checkBlockedRetailers(req, res, next) {
    try {
      console.log('🔍 Checking for retailers to block...');
      
      const blockingResults = await creditControlService.checkAndUpdateBlockedRetailers();
      
      return ApiResponse.success(res, {
        blockedCount: blockingResults.length,
        blockedRetailers: blockingResults
      }, 'Retailer blocking check completed');
    } catch (error) {
      logger.error('Error checking blocked retailers', { error: error.message });
      return ApiResponse.error(res, error.message, 500);
    }
  }

  async validateOrderCredit(req, res, next) {
    try {
      const { retailerId, orderAmount } = req.body;
      
      if (!retailerId || !orderAmount) {
        return ApiResponse.error(res, 'Retailer ID and order amount are required', 400);
      }

      const validation = await creditControlService.validateCreditLimit(retailerId, orderAmount);
      
      return ApiResponse.success(res, validation, 'Credit validation completed');
    } catch (error) {
      logger.error('Error validating order credit', { error: error.message });
      return ApiResponse.error(res, error.message, 500);
    }
  }

  async getHighRiskRetailers(req, res, next) {
    try {
      const { limit = 20 } = req.query;
      
      const retailers = await prisma.retailer.findMany({
        where: {
          creditStatus: 'ACTIVE',
          outstandingDebt: { gt: 0 }
        },
        select: {
          id: true,
          user: {
            select: {
              businessName: true,
              phoneNumber: true
            }
          },
          creditLimit: true,
          creditUsed: true,
          creditAvailable: true,
          outstandingDebt: true,
          lastPaymentDate: true,
          riskScore: true
        },
        orderBy: {
          outstandingDebt: 'desc'
        },
        take: parseInt(limit)
      });

      const retailersWithRisk = retailers.map(retailer => {
        const creditUtilization = retailer.creditLimit.gt(0) ? 
          retailer.outstandingDebt.div(retailer.creditLimit).mul(100) : 
          new (require('decimal.js'))(0);

        return {
          ...retailer,
          creditUtilization,
          riskLevel: this.getRiskLevel(creditUtilization),
          daysSinceLastPayment: retailer.lastPaymentDate ? 
            Math.floor((Date.now() - retailer.lastPaymentDate.getTime()) / (1000 * 60 * 60 * 24)) : 
            null
        };
      });

      return ApiResponse.success(res, {
        retailers: retailersWithRisk,
        totalHighRisk: retailersWithRisk.length
      }, 'High risk retailers retrieved successfully');
    } catch (error) {
      logger.error('Error getting high risk retailers', { error: error.message });
      return ApiResponse.error(res, error.message, 500);
    }
  }

  getRiskLevel(creditUtilization) {
    if (creditUtilization.lt(50)) return 'LOW';
    if (creditUtilization.lt(80)) return 'MEDIUM';
    if (creditUtilization.lt(100)) return 'HIGH';
    return 'CRITICAL';
  }

  async getCreditAnalytics(req, res, next) {
    try {
      const { period = '30days' } = req.query;
      
      // Calculate date range
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
        default:
          startDate = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));
      }

      const analytics = await prisma.retailer.findMany({
        where: {
          createdAt: {
            gte: startDate
          }
        },
        select: {
          id: true,
          user: {
            select: {
              businessName: true
            }
          },
          creditLimit: true,
          creditUsed: true,
          outstandingDebt: true,
          creditStatus: true,
          blockedAt: true,
          lastPaymentDate: true
        }
      });

      // Calculate analytics
      const totalRetailers = analytics.length;
      const activeRetailers = analytics.filter(r => r.creditStatus === 'ACTIVE').length;
      const blockedRetailers = analytics.filter(r => r.creditStatus === 'BLOCKED').length;
      const totalCreditLimit = analytics.reduce((sum, r) => sum.add(r.creditLimit), new (require('decimal.js'))(0));
      const totalOutstandingDebt = analytics.reduce((sum, r) => sum.add(r.outstandingDebt), new (require('decimal.js'))(0));
      const totalCreditAvailable = analytics.reduce((sum, r) => sum.add(r.creditAvailable), new (require('decimal.js'))(0));

      const analyticsData = {
        period,
        dateRange: { startDate, endDate: now },
        summary: {
          totalRetailers,
          activeRetailers,
          blockedRetailers,
          totalCreditLimit,
          totalOutstandingDebt,
          totalCreditAvailable,
          averageDebtPerRetailer: totalRetailers > 0 ? 
            totalOutstandingDebt.div(totalRetailers) : 
            new (require('decimal.js'))(0),
          creditUtilizationRate: totalCreditLimit.gt(0) ? 
            totalOutstandingDebt.div(totalCreditLimit).mul(100) : 
            new (require('decimal.js'))(0)
        },
        retailerBreakdown: analytics.map(r => ({
          retailerId: r.id,
          businessName: r.user.businessName,
          creditStatus: r.creditStatus,
          creditLimit: r.creditLimit,
          creditUsed: r.creditUsed,
          creditAvailable: r.creditAvailable,
          outstandingDebt: r.outstandingDebt,
          creditUtilization: r.creditLimit.gt(0) ? 
            r.outstandingDebt.div(r.creditLimit).mul(100) : 
            new (require('decimal.js'))(0),
          isBlocked: r.creditStatus === 'BLOCKED',
          blockedAt: r.blockedAt,
          daysSinceLastPayment: r.lastPaymentDate ? 
            Math.floor((Date.now() - r.lastPaymentDate.getTime()) / (1000 * 60 * 60 * 24)) : 
            null
        }))
      };

      return ApiResponse.success(res, analyticsData, 'Credit analytics retrieved successfully');
    } catch (error) {
      logger.error('Error getting credit analytics', { error: error.message });
      return ApiResponse.error(res, error.message, 500);
    }
  }
}

module.exports = new CreditControlController();
