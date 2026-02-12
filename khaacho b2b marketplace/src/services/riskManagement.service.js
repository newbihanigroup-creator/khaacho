const prisma = require('../config/database');
const logger = require('../utils/logger');

class RiskManagementService {
  async calculateRiskScore(retailerId) {
    try {
      console.log(`🎯 Calculating risk score for retailer: ${retailerId}`);

      const retailer = await prisma.retailer.findUnique({
        where: { id: retailerId },
        include: {
          riskProfile: true,
          orders: {
            select: {
              total: true,
              createdAt: true
            }
          },
          payments: {
            select: {
              amount: true,
              processedAt: true,
              paymentStatus: true
            }
          }
        }
      });

      if (!retailer) {
        throw new Error('Retailer not found');
      }

      const profile = retailer.riskProfile[0];
      if (!profile) {
        throw new Error('Risk profile not found');
      }

      // Get payment history for last 6 months
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

      const paymentHistory = await prisma.payment.findMany({
        where: {
          retailerId,
          processedAt: {
            gte: sixMonthsAgo
          },
          paymentStatus: 'PROCESSED'
        },
        orderBy: { processedAt: 'desc' },
        take: 100
      });

      // Calculate component scores
      const paymentScore = this.calculatePaymentScore(paymentHistory);
      const overdueScore = this.calculateOverdueScore(profile.overdueDays);
      const orderFrequencyScore = this.calculateOrderFrequencyScore(profile.totalOrders, profile.lastPaymentDate);
      const repaymentConsistencyScore = this.calculateRepaymentConsistencyScore(paymentHistory);
      const accountAgeScore = this.calculateAccountAgeScore(profile.createdAt, profile.lastPaymentDate);

      // Weighted total score (0-100)
      const totalScore = (
        paymentScore * 25 +      // 25% weight
        overdueScore * 20 +      // 20% weight
        orderFrequencyScore * 15 +   // 15% weight
        repaymentConsistencyScore * 20 +   // 20% weight
        accountAgeScore * 20 +      // 20% weight
        50 // Base score for all retailers
      );

      // Determine risk level
      let riskLevel = 'MEDIUM';
      if (totalScore >= 80) {
        riskLevel = 'LOW';
      } else if (totalScore >= 60) {
        riskLevel = 'MEDIUM';
      } else if (totalScore >= 40) {
        riskLevel = 'HIGH';
      } else {
        riskLevel = 'BLOCKED';
      }

      // Update risk profile
      await prisma.retailerRiskProfile.update({
        where: { id: profile.id },
        data: {
          riskScore: Math.min(100, Math.max(0, totalScore)),
          riskLevel,
          lastScoreUpdate: new Date(),
          updatedAt: new Date()
        }
      });

      return {
        retailerId,
        totalScore,
        riskLevel,
        components: {
          paymentScore,
          overdueScore,
          orderFrequencyScore,
          repaymentConsistencyScore,
          accountAgeScore
        },
        breakdown: {
          weights: { payment: 25, overdue: 20, orderFrequency: 15, repaymentConsistency: 20, accountAge: 20 },
          baseScore: 50
        }
      };

    } catch (error) {
      logger.error('Error calculating risk score', {
        retailerId,
        error: error.message
      });
      throw error;
    }
  }

  calculatePaymentScore(paymentHistory) {
    if (paymentHistory.length === 0) return 50;

    let onTimePayments = 0;
    let totalAmount = new Decimal(0);
    let latePayments = 0;

    paymentHistory.forEach(payment => {
      totalAmount = totalAmount.add(payment.amount);

      // Check if payment was on time (within 7 days of due date)
      if (payment.processedAt) {
        const dueDate = payment.order?.dueDate;
        if (dueDate) {
          const daysLate = Math.floor((new Date() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
          if (daysLate <= 7) {
            onTimePayments++;
          } else if (daysLate <= 15) {
            onTimePayments += 0.5; // Partial credit for late payments
          } else if (daysLate <= 30) {
            latePayments++;
          } else {
            latePayments++;
          }
        }
      }
    });

    const onTimeRate = paymentHistory.length > 0 ? onTimePayments / paymentHistory.length : 0;

    // Score: 50 (base) + onTimeRate * 50 (max 50 points for perfect payments)
    return Math.min(100, Math.max(0, 50 + (onTimeRate * 50)));

  }

  calculateOverdueScore(overdueDays) {
    if (!overdueDays || overdueDays <= 0) return 10;

    if (overdueDays <= 7) return 5;
    if (overdueDays <= 15) return 0;
    if (overdueDays <= 30) return -10;
    if (overdueDays <= 60) return -20;
    return -40; // Over 60 days
  }

  calculateOrderFrequencyScore(totalOrders, lastPaymentDate) {
    if (totalOrders === 0 || !lastPaymentDate) return 5;

    const daysSinceFirstOrder = Math.floor((Date.now() - lastPaymentDate.getTime()) / (1000 * 60 * 60 * 24));
    const monthsSinceFirstOrder = daysSinceFirstOrder / 30;

    // Score based on order frequency (more orders = higher score)
    if (monthsSinceFirstOrder >= 12) return 15;
    if (monthsSinceFirstOrder >= 6) return 10;
    if (monthsSinceFirstOrder >= 3) return 5;
    return 0;
  }

  calculateRepaymentConsistencyScore(paymentHistory) {
    if (paymentHistory.length === 0) return 10;

    let consistentPayments = 0;
    let totalPayments = 0;

    paymentHistory.forEach(payment => {
      totalPayments++;

      // Check if payment was on time
      if (payment.processedAt) {
        const dueDate = payment.order?.dueDate;
        if (dueDate) {
          const daysLate = Math.floor((new Date() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
          if (daysLate <= 7) {
            consistentPayments++;
          }
        }
      }
    });

    const consistencyRate = totalPayments > 0 ? consistentPayments / totalPayments : 0;

    // Score: 50 (base) + consistencyRate * 50 (max 50 points for consistent payments)
    return Math.min(100, Math.max(0, 50 + (consistencyRate * 50)));

  }

  calculateAccountAgeScore(createdAt, lastPaymentDate) {
    if (!createdAt || !lastPaymentDate) return 10;

    const daysSinceCreation = Math.floor((Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24));
    const daysSinceLastPayment = lastPaymentDate ?
      Math.floor((Date.now() - lastPaymentDate.getTime()) / (1000 * 60 * 60 * 24)) : 0;

    // Score based on account age (newer accounts = lower risk)
    if (daysSinceCreation >= 730) return -20;
    if (daysSinceCreation >= 365) return -10;
    if (daysSinceCreation >= 180) return 0;
    if (daysSinceCreation >= 90) return 5;
    return 10;
  }

  async updateRiskProfileOnTransaction(retailerId, transactionData) {
    try {
      console.log(`🔄 Updating risk profile for retailer: ${retailerId}`);

      const profile = await prisma.retailerRiskProfile.findUnique({
        where: { retailerId },
        include: {
          retailer: {
            select: {
              creditLimit: true,
              outstandingDebt: true
            }
          }
        }
      });

      if (!profile) {
        throw new Error('Risk profile not found');
      }

      // Get updated financial data
      const [newOutstanding, newAvailableCredit] = await this.getUpdatedFinancials(retailerId);

      // Update financial metrics
      const newTotalOrders = profile.totalOrders + 1;
      const newAveragePaymentDays = await this.calculateAveragePaymentDays(retailerId);
      const newOverdueDays = this.calculateOverdueDays(retailerId);

      // Calculate new risk score
      const newScore = await this.calculateRiskScore(retailerId);

      // Determine new risk level
      let newRiskLevel = 'MEDIUM';
      if (newScore >= 80) {
        newRiskLevel = 'LOW';
      } else if (newScore >= 60) {
        newRiskLevel = 'MEDIUM';
      } else if (newScore >= 40) {
        newRiskLevel = 'HIGH';
      } else {
        newRiskLevel = 'BLOCKED';
      }

      // Update risk profile
      await prisma.retailerRiskProfile.update({
        where: { id: profile.id },
        data: {
          currentOutstanding: newOutstanding,
          availableCredit: newAvailableCredit,
          riskScore: newScore,
          riskLevel: newRiskLevel,
          lastPaymentDate: profile.lastPaymentDate,
          averagePaymentDays: newAveragePaymentDays,
          overdueDays: newOverdueDays,
          totalOrders: newTotalOrders,
          lastScoreUpdate: new Date(),
          updatedAt: new Date()
        }
      });

      // Check for risk flags
      await this.checkRiskFlags(profile.id, newOutstanding, newRiskLevel);

      console.log(`✅ Risk profile updated: score=${newScore}, level=${newRiskLevel}`);
      return {
        retailerId,
        previousScore: profile.riskScore,
        newScore,
        riskLevel: newRiskLevel,
        riskFlags: {
          defaultFlag: newOutstanding.gt(profile.creditLimit.mul(0.9)),
          fraudFlag: profile.fraudFlag,
          adminReviewRequired: profile.adminReviewRequired
        }
      };

    } catch (error) {
      logger.error('Error updating risk profile', {
        retailerId,
        error: error.message
      });
      throw error;
    }
  }

  async getUpdatedFinancials(retailerId) {
    try {
      const retailer = await prisma.retailer.findUnique({
        where: { id: retailerId },
        include: {
          orders: {
            select: {
              total: true
            }
          },
          payments: {
            select: {
              amount: true,
              processedAt: true,
              paymentStatus: true
            }
          }
        }
      });

      if (!retailer) {
        return { newOutstanding: new Decimal(0), newAvailableCredit: new Decimal(0) };
      }

      const totalOrders = retailer.orders?.total || 0;
      const totalPaid = retailer.payments?.reduce((sum, p) => sum.add(p.amount), new Decimal(0)) || new Decimal(0);
      const outstandingDebt = retailer.outstandingDebt || new Decimal(0);
      const creditLimit = retailer.creditLimit || new Decimal(0);

      return {
        newOutstanding: outstandingDebt,
        newAvailableCredit: creditLimit.sub(outstandingDebt)
      };

    } catch (error) {
      logger.error('Error getting updated financials', {
        retailerId,
        error: error.message
      });
      throw error;
    }
  }

  async calculateAveragePaymentDays(retailerId) {
    try {
      const payments = await prisma.payment.findMany({
        where: {
          retailerId,
          paymentStatus: 'PROCESSED',
          processedAt: { not: null }
        },
        include: {
          order: {
            select: {
              dueDate: true
            }
          }
        },
        orderBy: { processedAt: 'desc' },
        take: 100
      });

      if (payments.length === 0) return 0;

      let totalDaysLate = 0;
      let totalPayments = 0;

      payments.forEach(payment => {
        totalPayments++;

        const dueDate = payment.order?.dueDate;
        if (dueDate) {
          const daysLate = Math.floor((new Date() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
          totalDaysLate += daysLate;
        }
      });

      const averageDays = totalPayments > 0 ? totalDaysLate / totalPayments : 0;
      return averageDays;

    } catch (error) {
      logger.error('Error calculating average payment days', {
        retailerId,
        error: error.message
      });
      return 0;
    }
  }

  async calculateOverdueDays(retailerId) {
    try {
      const retailer = await prisma.retailer.findUnique({
        where: { id: retailerId },
        include: {
          orders: {
            select: {
              dueDate: true
            }
          }
        }
      });

      if (!retailer || !retailer.orders) {
        return 0;
      }

      let totalOverdueDays = 0;
      let totalOrders = 0;

      retailer.orders.forEach(order => {
        if (order.status === 'COMPLETED' || order.status === 'DELIVERED') {
          totalOrders++;

          const dueDate = order.dueDate || new Date();
          if (dueDate) {
            const daysOverdue = Math.floor((Date.now() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
            if (daysOverdue > 0) {
              totalOverdueDays += daysOverdue;
            }
          }
        }
      });

      return totalOrders > 0 ? totalOverdueDays / totalOrders : 0;

    } catch (error) {
      logger.error('Error calculating overdue days', {
        retailerId,
        error: error.message
      });
      return 0;
    }
  }

  async checkRiskFlags(riskProfileId, outstandingDebt, riskLevel) {
    try {
      const updates = {};

      // Check for default flag (over 90% of credit limit)
      if (outstandingDebt.gt(0)) {
        const creditLimit = await prisma.retailer.findUnique({
          where: { id: riskProfileId },
          select: { creditLimit: true }
        });

        if (creditLimit && outstandingDebt.div(creditLimit).gt(0.9)) {
          updates.defaultFlag = true;
        }
      }

      // Check for fraud patterns
      const fraudFlag = await this.detectFraudPatterns(riskProfileId);
      if (fraudFlag) {
        updates.fraudFlag = true;
        updates.adminReviewRequired = true;
      }

      // Apply updates if any
      if (Object.keys(updates).length > 0) {
        await prisma.retailerRiskProfile.update({
          where: { id: riskProfileId },
          data: {
            ...updates,
            updatedAt: new Date()
          }
        });
      }

      return updates;

    } catch (error) {
      logger.error('Error checking risk flags', {
        riskProfileId,
        error: error.message
      });
      return {};
    }
  }

  async detectFraudPatterns(retailerId) {
    try {
      // Get recent orders for pattern analysis
      const recentOrders = await prisma.order.findMany({
        where: {
          retailerId,
          createdAt: {
            gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // Last 30 days
          }
        },
        orderBy: { createdAt: 'desc' },
        take: 50
      });

      // Check for suspicious patterns
      const fraudIndicators = {
        suddenLargeOrderSpike: false,
        rapidOrderFrequency: false,
        multipleAccountsSameDevice: false,
        rapidCreditUsage: false
      };

      // Analyze order patterns
      const orderAmounts = recentOrders.map(o => parseFloat(o.total.toString() || '0'));
      const orderTimes = recentOrders.map(o => o.createdAt.getTime());

      // Check for sudden large order spike
      if (orderAmounts.length > 5) {
        const avgAmount = orderAmounts.reduce((sum, a) => sum + a, 0) / orderAmounts.length;
        const maxAmount = Math.max(...orderAmounts);

        if (maxAmount > avgAmount * 3) {
          fraudIndicators.suddenLargeOrderSpike = true;
        }
      }

      // Check for rapid order frequency
      if (orderTimes.length > 1) {
        const timeDifferences = [];
        for (let i = 1; i < orderTimes.length; i++) {
          const timeDiff = (orderTimes[i] - orderTimes[i - 1]) / (1000 * 60 * 1000);
          timeDifferences.push(timeDiff);
        }

        const avgTimeDiff = timeDifferences.reduce((sum, diff) => sum + diff, 0) / timeDifferences.length;

        // If average time between orders is less than 1 hour, it's suspicious
        if (avgTimeDiff < 3600000) { // 1 hour in milliseconds
          fraudIndicators.rapidOrderFrequency = true;
        }
      }

      return fraudIndicators;

    } catch (error) {
      logger.error('Error detecting fraud patterns', {
        retailerId,
        error: error.message
      });
      return {
        suddenLargeOrderSpike: false,
        rapidOrderFrequency: false,
        multipleAccountsSameDevice: false,
        rapidCreditUsage: false
      };
    }
  }

  async getRetailerRiskProfile(retailerId) {
    try {
      const profile = await prisma.retailerRiskProfile.findUnique({
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
      });

      if (!profile) {
        throw new Error('Risk profile not found');
      }

      return profile;

    } catch (error) {
      logger.error('Error getting retailer risk profile', {
        retailerId,
        error: error.message
      });
      throw error;
    }
  }

  async getRiskDashboard() {
    try {
      console.log('📊 Generating risk dashboard...');

      const [riskProfiles, summaryStats] = await Promise.all([
        prisma.retailerRiskProfile.findMany({
          where: {
            retailer: {
              deletedAt: null
            }
          },
          include: {
            retailer: {
              include: {
                user: {
                  select: {
                    businessName: true
                  }
                }
              }
            }
          },
          orderBy: { riskScore: 'desc' },
          take: 50
        }),

        prisma.retailerRiskProfile.aggregate({
          where: {
            retailer: {
              deletedAt: null
            }
          },
          _count: {
            id: true,
            defaultFlag: true,
            fraudFlag: true,
            adminReviewRequired: true
          },
          _avg: {
            riskScore: true
          },
          _sum: {
            currentOutstanding: true,
            creditLimit: true
          }
        })
      ]);

      // Calculate risk distribution
      const riskDistribution = {
        low: summaryStats._count.id - summaryStats._count.riskScore >= 80,
        medium: summaryStats._count.id - summaryStats._count.riskScore >= 60 && summaryStats._count.riskScore < 80,
        high: summaryStats._count.riskScore >= 40 && summaryStats._count.riskScore < 60,
        critical: summaryStats._count.riskScore < 40,
        blocked: summaryStats._count.riskScore < 40
      };

      const highRiskProfiles = await prisma.retailerRiskProfile.findMany({
        where: {
          riskLevel: 'HIGH',
          retailer: {
            deletedAt: null
          }
        },
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
        },
        orderBy: { riskScore: 'desc' },
        take: 20
      });

      const blockedProfiles = await prisma.retailerRiskProfile.findMany({
        where: {
          riskLevel: 'BLOCKED',
          retailer: {
            deletedAt: null
          }
        },
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
        },
        orderBy: { lastScoreUpdate: 'desc' },
        take: 20
      });

      const dashboard = {
        summary: {
          totalRetailers: summaryStats._count.id,
          totalCreditExposure: summaryStats._sum.currentOutstanding,
          averageRiskScore: summaryStats._avg.riskScore,
          totalOverdueAmount: summaryStats._sum.currentOutstanding,
          averageOverdueDays: 0,
          flaggedAccounts: (summaryStats._count.defaultFlag || 0) + (summaryStats._count.fraudFlag || 0) + (summaryStats._count.adminReviewRequired || 0)
        },
        riskDistribution,
        highRiskProfiles: highRiskProfiles.map(profile => ({
          retailerId: profile.retailerId,
          businessName: profile.retailer.user.businessName,
          businessType: profile.businessType,
          riskScore: profile.riskScore,
          riskLevel: profile.riskLevel,
          outstandingDebt: profile.currentOutstanding,
          creditLimit: profile.creditLimit,
          overdueDays: profile.overdueDays,
          fraudFlag: profile.fraudFlag,
          adminReviewRequired: profile.adminReviewRequired,
          lastScoreUpdate: profile.lastScoreUpdate
        })),
        blockedProfiles: blockedProfiles.map(profile => ({
          retailerId: profile.retailerId,
          businessName: profile.retailer.user.businessName,
          businessType: profile.businessType,
          riskScore: profile.riskScore,
          riskLevel: profile.riskLevel,
          outstandingDebt: profile.currentOutstanding,
          creditLimit: profile.creditLimit,
          overdueDays: profile.overdueDays,
          fraudFlag: profile.fraudFlag,
          adminReviewRequired: profile.adminReviewRequired,
          lastScoreUpdate: profile.lastScoreUpdate
        })),
        recentRiskUpdates: highRiskProfiles.slice(0, 10).map(profile => ({
          retailerId: profile.retailerId,
          businessName: profile.retailer.user.businessName,
          previousScore: profile.riskScore,
          newScore: profile.riskScore,
          riskLevel: profile.riskLevel,
          changeReason: this.getRiskChangeReason(profile.riskScore, profile.riskScore, profile.riskLevel),
          changedAt: profile.lastScoreUpdate
        }))
      };

      console.log('✅ Risk dashboard generated');
      return dashboard;

    } catch (error) {
      logger.error('Error generating risk dashboard', { error: error.message });
      throw error;
    }
  }

  getRiskChangeReason(previousScore, newScore, newLevel) {
    if (newScore > previousScore) {
      return 'Score improved';
    } else if (newScore < previousScore) {
      return 'Score declined';
    } else if (newLevel === 'BLOCKED' && previousScore > 40) {
      return 'Blocked due to high risk';
    } else if (newLevel === 'HIGH' && previousScore >= 40) {
      return 'High risk detected';
    } else if (newLevel === 'LOW' && previousScore < 80) {
      return 'Low risk achieved';
    } else {
      return 'Risk level maintained';
    }
  }
}

module.exports = new RiskManagementService();
