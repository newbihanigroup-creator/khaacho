const riskManagementService = require('../services/riskManagement.service');
const ApiResponse = require('../utils/response');
const logger = require('../utils/logger');

class RiskManagementController {
  async getRetailerRiskProfile(req, res, next) {
    try {
      const { retailerId } = req.params;
      
      const profile = await riskManagementService.getRetailerRiskProfile(retailerId);
      
      return ApiResponse.success(res, profile, 'Risk profile retrieved successfully');
    } catch (error) {
      logger.error('Error getting retailer risk profile', { error: error.message });
      return ApiResponse.error(res, error.message, 500);
    }
  }

  async updateRiskProfileOnTransaction(req, res, next) {
    try {
      const { retailerId } = req.params;
      const { orderId, amount, paymentMethod, bankReference, receivedBy } = req.body;
      
      const result = await riskManagementService.updateRiskProfileOnTransaction(
        retailerId,
        { orderId, amount, paymentMethod, bankReference, receivedBy }
      );
      
      return ApiResponse.success(res, result, 'Risk profile updated successfully');
    } catch (error) {
      logger.error('Error updating risk profile', { error: error.message });
      return ApiResponse.error(res, error.message, 500);
    }
  }

  async getRiskDashboard(req, res, next) {
    try {
      const dashboard = await riskManagementService.getRiskDashboard();
      
      return ApiResponse.success(res, dashboard, 'Risk dashboard retrieved successfully');
    } catch (error) {
      logger.error('Error getting risk dashboard', { error: error.message });
      return ApiResponse.error(res, error.message, 500);
    }
  }

  async getHighRiskRetailers(req, res, next) {
    try {
      const { limit = 20 } = req.query;
      
      const highRiskRetailers = await riskManagementService.getHighRiskRetailers(limit);
      
      return ApiResponse.success(res, highRiskRetailers, 'High risk retailers retrieved successfully');
    } catch (error) {
      logger.error('Error getting high risk retailers', { error: error.message });
      return ApiResponse.error(res, error.message, 500);
    }
  }

  async getRiskFlags(req, res, next) {
    try {
      const { retailerId } = req.params;
      
      const flags = await riskManagementService.checkRiskFlags(retailerId);
      
      return ApiResponse.success(res, flags, 'Risk flags retrieved successfully');
    } catch (error) {
      logger.error('Error checking risk flags', { error: error.message });
      return ApiResponse.error(res, error.message, 500);
    }
  }

  async getFraudDetection(req, res, next) {
    try {
      const { retailerId } = req.params;
      
      const fraudIndicators = await riskManagementService.detectFraudPatterns(retailerId);
      
      return ApiResponse.success(res, fraudIndicators, 'Fraud detection completed');
    } catch (error) {
      logger.error('Error detecting fraud patterns', { error: error.message });
      return ApiResponse.error(res, error.message, 500);
    }
  }

  async createRiskProfile(req, res, next) {
    try {
      const { retailerId } = req.params;
      const { 
        businessName, 
        ownerName, 
        location, 
        businessType, 
        kycStatus, 
        bankAccountVerified 
      } = req.body;

      // Validate required fields
      if (!businessName || !ownerName || !retailerId) {
        return ApiResponse.error(res, 'Business name, owner name, and retailer ID are required');
      }

      // Check if profile already exists
      const existingProfile = await riskManagementService.getRetailerRiskProfile(retailerId);
      if (existingProfile) {
        return ApiResponse.error(res, 'Risk profile already exists for this retailer');
      }

      // Create new risk profile
      const profile = await prisma.retailerRiskProfile.create({
        data: {
          retailerId,
          businessName,
          ownerName,
          location,
          businessType: businessType || 'RETAILER',
          kycStatus: kycStatus || 'PENDING',
          bankAccountVerified: bankAccountVerified || false,
          creditLimit: 0,
          currentOutstanding: 0,
          availableCredit: 0,
          riskScore: 50,
          riskLevel: 'MEDIUM',
          lastPaymentDate: null,
          averagePaymentDays: 0,
          overdueDays: 0,
          totalOrders: 0,
          defaultFlag: false,
          fraudFlag: false,
          adminReviewRequired: false,
          createdAt: new Date(),
          updatedAt: new Date()
        }
      });

      return ApiResponse.success(res, profile, 'Risk profile created successfully');
    } catch (error) {
      logger.error('Error creating risk profile', { error: error.message });
      return ApiResponse.error(res, error.message, 500);
    }
  }

  async updateRiskProfile(req, res, next) {
    try {
      const { retailerId } = req.params;
      const updates = req.body;
      
      const result = await riskManagementService.updateRiskProfileOnTransaction(retailerId, updates);
      
      return ApiResponse.success(res, result, 'Risk profile updated successfully');
    } catch (error) {
      logger.error('Error updating risk profile', { error: error.message });
      return ApiResponse.error(res, error.message, 500);
    }
  }

  async getBankReadyDataExports(req, res, next) {
    try {
      const { retailerId, startDate, endDate } = req.query;
      
      // Get financial data for bank integration
      const [invoices, payments, profile] = await Promise.all([
        prisma.invoice.findMany({
          where: {
            retailerId,
            createdAt: {
              gte: startDate || undefined,
              lte: endDate || undefined
            }
          },
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
                    businessName: true,
                    phoneNumber: true
                  }
                }
              }
            }
          },
          orderBy: { createdAt: 'desc' }
        }),

        prisma.payment.findMany({
          where: {
            retailerId,
            processedAt: {
              gte: startDate || undefined,
              lte: endDate || undefined
            }
          },
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
                    businessName: true,
                    phoneNumber: true
                  }
                }
              }
            }
          },
          orderBy: { createdAt: 'desc' }
        }),

        prisma.retailerRiskProfile.findMany({
          where: { retailerId },
          include: {
            retailer: {
              include: {
                user: {
                  select: {
                    businessName: true,
                    phoneNumber: true
                  }
                }
              }
            }
          }
        })
      ]);

      // Calculate bank-ready metrics
      const monthlyPurchaseVolume = invoices.reduce((sum, inv) => inv.totalAmount, new Decimal(0));
      const totalPayments = payments.reduce((sum, p) => sum.add(p.amount), new Decimal(0));
      const repaymentSuccessRate = payments.length > 0 ? 
        payments.filter(p => p.paymentStatus === 'PROCESSED').length / payments.length : 0;

      const cashVsCreditRatio = totalPurchaseVolume.gt(0) ? 
        payments.filter(p => p.paymentMethod === 'CASH').length / payments.length : 0;

      const data = {
        retailerId,
        period: { startDate, endDate },
        summary: {
          monthlyPurchaseVolume,
          totalPayments,
          repaymentSuccessRate,
          cashVsCreditRatio,
          averageOrderValue: invoices.length > 0 ? monthlyPurchaseVolume.div(invoices.length) : new Decimal(0),
          outstandingBalance: profile.currentOutstanding,
          creditLimit: profile.creditLimit,
          riskScore: profile.riskScore,
          riskLevel: profile.riskLevel
        },
        invoices: invoices.map(inv => ({
          invoiceNumber: inv.invoiceNumber,
          orderNumber: inv.order?.orderNumber,
          amount: inv.totalAmount,
          status: inv.status,
          dueDate: inv.dueDate,
          createdAt: inv.createdAt
        })),
        payments: payments.map(p => ({
          paymentNumber: p.paymentNumber,
          orderNumber: p.order?.orderNumber,
          amount: p.amount,
          paymentMethod: p.paymentMethod,
          status: p.paymentStatus,
          processedAt: p.processedAt,
          createdAt: p.createdAt
        })),
        profile: {
          businessName: profile.businessName,
          businessType: profile.businessType,
          kycStatus: profile.kycStatus,
          bankAccountVerified: profile.bankAccountVerified,
          creditLimit: profile.creditLimit,
          outstandingDebt: profile.currentOutstanding,
          availableCredit: profile.availableCredit,
          riskScore: profile.riskScore,
          riskLevel: profile.riskLevel,
          lastPaymentDate: profile.lastPaymentDate,
          averagePaymentDays: profile.averagePaymentDays,
          totalOrders: profile.totalOrders,
          defaultFlag: profile.defaultFlag,
          fraudFlag: profile.fraudFlag,
          adminReviewRequired: profile.adminReviewRequired
        }
      };

      return ApiResponse.success(res, data, 'Bank-ready data exported successfully');
    } catch (error) {
      logger.error('Error exporting bank-ready data', { error: error.message });
      return ApiResponse.error(res, error.message, 500);
    }
  }

  async setRiskFlag(req, res, next) {
    try {
      const { retailerId } = req.params;
      const { flagType, reason } = req.body;
      
      const profile = await riskManagementService.getRetailerRiskProfile(retailerId);
      
      if (!profile) {
        return ApiResponse.error(res, 'Risk profile not found');
      }

      const updates = {};
      
      if (flagType === 'DEFAULT') {
        updates.defaultFlag = false;
        updates.adminReviewRequired = false;
      } else if (flagType === 'FRAUD') {
        updates.fraudFlag = true;
        updates.adminReviewRequired = true;
        updates.adminReviewRequired = true;
      } else if (flagType === 'ADMIN_REVIEW') {
        updates.fraudFlag = false;
        updates.adminReviewRequired = false;
      }

      if (Object.keys(updates).length > 0) {
        await riskManagementService.updateRiskProfileOnTransaction(retailerId, updates);
      }

      return ApiResponse.success(res, 'Risk flag updated successfully');
    } catch (error) {
      logger.error('Error setting risk flag', { error: error.message });
      return ApiResponse.error(res, error.message, 500);
    }
  }

  async getRiskTrends(req, res, next) {
    try {
      const { retailerId, period = '30days' } = req.query;
      
      const startDate = period === '30days' ? 
        new Date(Date.now() - (30 * 24 * 60 * 60 * 1000)) : 
        new Date(Date.now() - (90 * 24 * 60 * 60 * 1000));

      const [profileHistory, summary] = await Promise.all([
        riskManagementService.getRetailerRiskProfile(retailerId),
        riskManagementService.getRiskDashboard()
      ]);

      const trends = {
        period,
        scoreHistory: profileHistory.map(profile => ({
          date: profile.lastScoreUpdate,
          score: profile.riskScore,
          riskLevel: profile.riskLevel,
          changeReason: riskManagementService.getRiskChangeReason(profile.riskScore, profile.riskLevel)
        })),
        summary: {
          averageRiskScore: profileHistory.reduce((sum, p) => sum + p.riskScore, 0) / profileHistory.length,
          currentScore: profile.riskScore,
          riskTrend: profileHistory.length > 1 ? 
            (profileHistory[profileHistory.length - 1].riskScore - profileHistory[profileHistory.length - 1].riskScore) / (profileHistory[profileHistory.length - 1]) : 0
          : 0
        }
      };

      return ApiResponse.success(res, trends, 'Risk trends retrieved successfully');
    } catch (error) {
      logger.error('Error getting risk trends', { error: error.message });
      return ApiResponse.error(res, error.message, 500);
    }
  }

  async getRiskAlerts(req, res, next) {
    try {
      const { retailerId } = req.params;
      
      const profile = await riskManagementService.getRetailerRiskProfile(retailerId);
      
      const alerts = {
        creditLimitWarning: profile.creditAvailable.lt(profile.creditLimit.mul(0.1)),
        overdueWarning: profile.overdueDays > 7,
        fraudAlert: profile.fraudFlag,
        adminReviewRequired: profile.adminReviewRequired,
        defaultFlag: profile.defaultFlag
      };

      return ApiResponse.success(res, alerts, 'Risk alerts retrieved successfully');
    } catch (error) {
      logger.error('Error getting risk alerts', { error: error.message });
      return ApiResponse.error(res, error.message, 500);
    }
  }

  async createRiskAlert(req, res, next) {
    try {
      const { retailerId } = req.params;
      const { alertType, message } = req.body;
      
      const profile = await riskManagementService.getRetailerRiskProfile(retailerId);
      
      if (!profile) {
        return ApiResponse.error(res, 'Risk profile not found');
      }

      // Create alert record
      const alert = await prisma.riskAlert.create({
        data: {
          retailerId,
          alertType,
          message,
          severity: alertType === 'HIGH_RISK' ? 'HIGH' : 'MEDIUM',
          isAcknowledged: false,
          createdAt: new Date(),
          updatedAt: new Date()
        }
      });

      // Update risk profile if needed
      if (alertType === 'HIGH_RISK') {
        await riskManagementService.updateRiskProfileOnTransaction(retailerId, {
          fraudFlag: true,
          adminReviewRequired: true
        });
      }

      return ApiResponse.success(res, alert, 'Risk alert created successfully');
    } catch (error) {
      logger.error('Error creating risk alert', { error: error.message });
      return ApiResponse.error(res, error.message, 500);
    }
  }
}

module.exports = new RiskManagementController();
