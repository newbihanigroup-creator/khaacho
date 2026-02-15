const prisma = require('../config/database');
const logger = require('../shared/logger');
const creditScoringService = require('./creditScoring.service');
const Decimal = require('decimal.js');

/**
 * Enhanced Credit Scoring Service
 * 
 * Features:
 * - Automatic credit limit increases for reliable retailers
 * - Order restrictions based on credit scores
 * - Real-time credit score monitoring
 * - Automatic credit limit adjustments
 */

class EnhancedCreditScoringService {
  /**
   * Check if order should be restricted based on credit score
   */
  async checkOrderRestriction(retailerId, orderAmount) {
    try {
      logger.info('Checking order restriction', {
        retailerId,
        orderAmount,
      });

      const result = await prisma.$queryRaw`
        SELECT * FROM check_order_restriction(
          ${retailerId}::uuid,
          ${orderAmount}::decimal
        )
      `;

      const restriction = result[0];

      // Log the restriction check
      await this.logOrderRestriction({
        retailerId,
        orderAmount,
        restrictionType: restriction.restriction_type,
        creditScore: restriction.credit_score,
        wasBlocked: !restriction.can_order,
        blockReason: restriction.reason,
      });

      return {
        canOrder: restriction.can_order,
        restrictionType: restriction.restriction_type,
        reason: restriction.reason,
        requiresApproval: restriction.requires_approval,
        creditScore: restriction.credit_score,
        scoreCategory: restriction.score_category,
      };
    } catch (error) {
      logger.error('Order restriction check failed', {
        retailerId,
        orderAmount,
        error: error.message,
      });
      throw error;
    }
  }


  /**
   * Calculate and apply automatic credit limit adjustment
   */
  async processAutomaticCreditAdjustment(retailerId) {
    try {
      logger.info('Processing automatic credit adjustment', { retailerId });

      // Calculate recommended adjustment
      const result = await prisma.$queryRaw`
        SELECT * FROM calculate_credit_limit_adjustment(${retailerId}::uuid)
      `;

      const adjustment = result[0];

      if (!adjustment.should_adjust) {
        logger.info('No credit adjustment needed', {
          retailerId,
          currentLimit: adjustment.current_limit,
        });
        return {
          adjusted: false,
          reason: adjustment.reason,
        };
      }

      // Apply the adjustment
      const newLimit = new Decimal(adjustment.recommended_limit);
      
      await prisma.$transaction(async (tx) => {
        // Update retailer credit limit
        await tx.retailer.update({
          where: { id: retailerId },
          data: {
            creditLimit: newLimit,
            creditAvailable: newLimit.sub(
              await this.getOutstandingDebt(retailerId)
            ),
          },
        });

        // Log the adjustment
        await tx.creditLimitAdjustment.create({
          data: {
            retailerId,
            previousLimit: new Decimal(adjustment.current_limit),
            newLimit,
            adjustmentAmount: new Decimal(adjustment.adjustment_amount),
            adjustmentPercentage: new Decimal(adjustment.adjustment_percentage),
            adjustmentType: adjustment.adjustment_type,
            triggerReason: adjustment.reason,
            creditScoreAtAdjustment: adjustment.credit_score,
            isAutomatic: true,
            approvedAt: new Date(),
          },
        });
      });

      logger.info('Credit limit adjusted automatically', {
        retailerId,
        previousLimit: adjustment.current_limit,
        newLimit: adjustment.recommended_limit,
        adjustmentType: adjustment.adjustment_type,
      });

      return {
        adjusted: true,
        adjustmentType: adjustment.adjustment_type,
        previousLimit: adjustment.current_limit,
        newLimit: adjustment.recommended_limit,
        adjustmentAmount: adjustment.adjustment_amount,
        reason: adjustment.reason,
      };
    } catch (error) {
      logger.error('Automatic credit adjustment failed', {
        retailerId,
        error: error.message,
      });
      throw error;
    }
  }


  /**
   * Update credit score and trigger automatic adjustments
   */
  async updateCreditScoreAndAdjust(retailerId) {
    try {
      logger.info('Updating credit score with auto-adjustment', {
        retailerId,
      });

      // Calculate new credit score
      const scoreData = await creditScoringService.calculateCreditScore(
        retailerId
      );

      // Save score history
      await creditScoringService.saveScoreHistory(retailerId, scoreData);

      // Get score trend
      const trend = await creditScoringService.getScoreTrend(retailerId, 30);

      // Update retailer with trend
      await prisma.retailer.update({
        where: { id: retailerId },
        data: {
          creditScore: scoreData.score,
          scoreTrend: trend.trend,
          lastScoreCalculation: new Date(),
        },
      });

      // Check if automatic adjustment is needed
      const adjustmentResult = await this.processAutomaticCreditAdjustment(
        retailerId
      );

      return {
        score: scoreData.score,
        scoreCategory: scoreData.explanation.category,
        trend: trend.trend,
        trendChange: trend.change,
        adjustment: adjustmentResult,
      };
    } catch (error) {
      logger.error('Credit score update with adjustment failed', {
        retailerId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Process all retailers for automatic adjustments
   */
  async processAllAutomaticAdjustments() {
    try {
      logger.info('Processing automatic adjustments for all retailers');

      const retailers = await prisma.retailer.findMany({
        where: {
          isApproved: true,
          deletedAt: null,
          creditStatus: 'ACTIVE',
        },
        select: { id: true, retailerCode: true },
      });

      const results = {
        total: retailers.length,
        increased: 0,
        decreased: 0,
        noChange: 0,
        errors: 0,
      };

      for (const retailer of retailers) {
        try {
          const result = await this.updateCreditScoreAndAdjust(retailer.id);
          
          if (result.adjustment.adjusted) {
            if (result.adjustment.adjustmentType === 'AUTOMATIC_INCREASE') {
              results.increased++;
            } else if (result.adjustment.adjustmentType === 'AUTOMATIC_DECREASE') {
              results.decreased++;
            }
          } else {
            results.noChange++;
          }
        } catch (error) {
          logger.error('Failed to process retailer', {
            retailerId: retailer.id,
            error: error.message,
          });
          results.errors++;
        }
      }

      logger.info('Automatic adjustments completed', results);
      return results;
    } catch (error) {
      logger.error('Batch automatic adjustment failed', {
        error: error.message,
      });
      throw error;
    }
  }


  /**
   * Get retailer credit score summary
   */
  async getRetailerCreditSummary(retailerId) {
    try {
      const summary = await prisma.$queryRaw`
        SELECT * FROM retailer_credit_score_summary
        WHERE retailer_id = ${retailerId}::uuid
      `;

      if (summary.length === 0) {
        throw new Error('Retailer not found');
      }

      return {
        retailerId: summary[0].retailer_id,
        retailerCode: summary[0].retailer_code,
        businessName: summary[0].business_name,
        city: summary[0].city,
        state: summary[0].state,
        creditScore: summary[0].credit_score,
        lastScoreCalculation: summary[0].last_score_calculation,
        scoreTrend: summary[0].score_trend,
        scoreCategory: summary[0].score_category,
        creditLimit: parseFloat(summary[0].credit_limit),
        outstandingDebt: parseFloat(summary[0].outstanding_debt),
        creditAvailable: parseFloat(summary[0].credit_available),
        creditUtilizationPercent: parseFloat(summary[0].credit_utilization_percent),
        maxOrderAmount: summary[0].max_order_amount ? parseFloat(summary[0].max_order_amount) : null,
        requiresApproval: summary[0].requires_approval,
        allowCreditOrders: summary[0].allow_credit_orders,
        autoIncreaseEnabled: summary[0].auto_increase_enabled,
        autoIncreasePercentage: summary[0].auto_increase_percentage ? parseFloat(summary[0].auto_increase_percentage) : null,
        ordersLast30Days: Number(summary[0].orders_last_30_days),
        cancellationsLast30Days: Number(summary[0].cancellations_last_30_days),
        lastPaymentDate: summary[0].last_payment_date,
        daysSinceLastPayment: summary[0].days_since_last_payment,
        creditStatus: summary[0].credit_status,
        blockedAt: summary[0].blocked_at,
        blockedReason: summary[0].blocked_reason,
      };
    } catch (error) {
      logger.error('Failed to get credit summary', {
        retailerId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get credit limit adjustment history
   */
  async getCreditAdjustmentHistory(retailerId, limit = 50) {
    try {
      const history = await prisma.creditLimitAdjustment.findMany({
        where: { retailerId },
        orderBy: { createdAt: 'desc' },
        take: limit,
      });

      return history.map(h => ({
        id: h.id,
        previousLimit: parseFloat(h.previousLimit),
        newLimit: parseFloat(h.newLimit),
        adjustmentAmount: parseFloat(h.adjustmentAmount),
        adjustmentPercentage: parseFloat(h.adjustmentPercentage),
        adjustmentType: h.adjustmentType,
        triggerReason: h.triggerReason,
        creditScoreAtAdjustment: h.creditScoreAtAdjustment,
        isAutomatic: h.isAutomatic,
        approvedBy: h.approvedBy,
        approvedAt: h.approvedAt,
        createdAt: h.createdAt,
      }));
    } catch (error) {
      logger.error('Failed to get adjustment history', {
        retailerId,
        error: error.message,
      });
      throw error;
    }
  }


  /**
   * Get order restrictions log
   */
  async getOrderRestrictionsLog(retailerId, limit = 50) {
    try {
      const log = await prisma.orderRestrictionsLog.findMany({
        where: { retailerId },
        orderBy: { createdAt: 'desc' },
        take: limit,
      });

      return log.map(l => ({
        id: l.id,
        orderId: l.orderId,
        restrictionType: l.restrictionType,
        creditScore: l.creditScore,
        orderAmount: l.orderAmount ? parseFloat(l.orderAmount) : null,
        availableCredit: l.availableCredit ? parseFloat(l.availableCredit) : null,
        wasBlocked: l.wasBlocked,
        blockReason: l.blockReason,
        overrideBy: l.overrideBy,
        overrideReason: l.overrideReason,
        createdAt: l.createdAt,
      }));
    } catch (error) {
      logger.error('Failed to get restrictions log', {
        retailerId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Log order restriction check
   */
  async logOrderRestriction(data) {
    try {
      await prisma.orderRestrictionsLog.create({
        data: {
          retailerId: data.retailerId,
          orderId: data.orderId || null,
          restrictionType: data.restrictionType,
          creditScore: data.creditScore,
          orderAmount: data.orderAmount ? new Decimal(data.orderAmount) : null,
          availableCredit: data.availableCredit ? new Decimal(data.availableCredit) : null,
          wasBlocked: data.wasBlocked,
          blockReason: data.blockReason,
          overrideBy: data.overrideBy || null,
          overrideReason: data.overrideReason || null,
          metadata: data.metadata || {},
        },
      });
    } catch (error) {
      logger.error('Failed to log order restriction', {
        data,
        error: error.message,
      });
      // Don't throw - logging failure shouldn't break order flow
    }
  }

  /**
   * Get outstanding debt for retailer
   */
  async getOutstandingDebt(retailerId) {
    const retailer = await prisma.retailer.findUnique({
      where: { id: retailerId },
      select: { outstandingDebt: true },
    });
    return retailer ? new Decimal(retailer.outstandingDebt) : new Decimal(0);
  }

  /**
   * Manual credit limit adjustment (admin)
   */
  async manualCreditAdjustment(retailerId, newLimit, reason, approvedBy) {
    try {
      logger.info('Manual credit limit adjustment', {
        retailerId,
        newLimit,
        approvedBy,
      });

      const retailer = await prisma.retailer.findUnique({
        where: { id: retailerId },
        select: { creditLimit: true, outstandingDebt: true, creditScore: true },
      });

      if (!retailer) {
        throw new Error('Retailer not found');
      }

      const previousLimit = new Decimal(retailer.creditLimit);
      const newLimitDecimal = new Decimal(newLimit);
      const adjustmentAmount = newLimitDecimal.sub(previousLimit);
      const adjustmentPercentage = previousLimit.gt(0)
        ? adjustmentAmount.div(previousLimit).mul(100)
        : new Decimal(0);

      await prisma.$transaction(async (tx) => {
        // Update credit limit
        await tx.retailer.update({
          where: { id: retailerId },
          data: {
            creditLimit: newLimitDecimal,
            creditAvailable: newLimitDecimal.sub(retailer.outstandingDebt),
          },
        });

        // Log adjustment
        await tx.creditLimitAdjustment.create({
          data: {
            retailerId,
            previousLimit,
            newLimit: newLimitDecimal,
            adjustmentAmount,
            adjustmentPercentage,
            adjustmentType: 'MANUAL',
            triggerReason: reason,
            creditScoreAtAdjustment: retailer.creditScore,
            isAutomatic: false,
            approvedBy,
            approvedAt: new Date(),
          },
        });
      });

      logger.info('Manual credit adjustment completed', {
        retailerId,
        previousLimit: previousLimit.toString(),
        newLimit: newLimitDecimal.toString(),
      });

      return {
        previousLimit: parseFloat(previousLimit),
        newLimit: parseFloat(newLimitDecimal),
        adjustmentAmount: parseFloat(adjustmentAmount),
        adjustmentPercentage: parseFloat(adjustmentPercentage),
      };
    } catch (error) {
      logger.error('Manual credit adjustment failed', {
        retailerId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get credit score statistics
   */
  async getCreditScoreStatistics() {
    try {
      const stats = await prisma.$queryRaw`
        SELECT 
          COUNT(*) as total_retailers,
          AVG(credit_score)::INTEGER as avg_score,
          MIN(credit_score) as min_score,
          MAX(credit_score) as max_score,
          COUNT(CASE WHEN credit_score >= 750 THEN 1 END) as excellent_count,
          COUNT(CASE WHEN credit_score >= 650 AND credit_score < 750 THEN 1 END) as good_count,
          COUNT(CASE WHEN credit_score >= 550 AND credit_score < 650 THEN 1 END) as fair_count,
          COUNT(CASE WHEN credit_score >= 450 AND credit_score < 550 THEN 1 END) as poor_count,
          COUNT(CASE WHEN credit_score < 450 THEN 1 END) as very_poor_count,
          COUNT(CASE WHEN score_trend = 'increasing' THEN 1 END) as increasing_trend,
          COUNT(CASE WHEN score_trend = 'decreasing' THEN 1 END) as decreasing_trend,
          COUNT(CASE WHEN score_trend = 'stable' THEN 1 END) as stable_trend
        FROM retailers
        WHERE deleted_at IS NULL AND is_approved = true
      `;

      return {
        totalRetailers: Number(stats[0].total_retailers),
        avgScore: Number(stats[0].avg_score),
        minScore: Number(stats[0].min_score),
        maxScore: Number(stats[0].max_score),
        distribution: {
          excellent: Number(stats[0].excellent_count),
          good: Number(stats[0].good_count),
          fair: Number(stats[0].fair_count),
          poor: Number(stats[0].poor_count),
          veryPoor: Number(stats[0].very_poor_count),
        },
        trends: {
          increasing: Number(stats[0].increasing_trend),
          decreasing: Number(stats[0].decreasing_trend),
          stable: Number(stats[0].stable_trend),
        },
      };
    } catch (error) {
      logger.error('Failed to get credit score statistics', {
        error: error.message,
      });
      throw error;
    }
  }
}

module.exports = new EnhancedCreditScoringService();
