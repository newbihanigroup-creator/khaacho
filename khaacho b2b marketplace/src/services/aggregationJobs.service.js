const prisma = require('../config/database');
const logger = require('../utils/logger');

/**
 * Aggregation Jobs - Daily/Weekly/Monthly data warehouse updates
 * These jobs transform operational data into analytics-ready summaries
 */
class AggregationJobsService {

  // ==================== DAILY SALES SUMMARY ====================
  
  async aggregateDailySales(date = new Date()) {
    const targetDate = new Date(date);
    targetDate.setHours(0, 0, 0, 0);
    
    const nextDate = new Date(targetDate);
    nextDate.setDate(nextDate.getDate() + 1);

    logger.info(`Aggregating daily sales for ${targetDate.toISOString().split('T')[0]}`);

    const [orders, payments, retailers, vendors] = await Promise.all([
      prisma.order.findMany({
        where: {
          createdAt: {
            gte: targetDate,
            lt: nextDate
          }
        }
      }),
      prisma.payment.findMany({
        where: {
          createdAt: {
            gte: targetDate,
            lt: nextDate
          }
        }
      }),
      prisma.retailer.findMany({
        where: {
          createdAt: {
            gte: targetDate,
            lt: nextDate
          }
        }
      }),
      prisma.vendor.findMany({
        where: {
          createdAt: {
            gte: targetDate,
            lt: nextDate
          }
        }
      })
    ]);

    const completedOrders = orders.filter(o => o.status === 'COMPLETED');
    const cancelledOrders = orders.filter(o => o.status === 'CANCELLED');

    const totalGMV = orders.reduce((sum, o) => sum + parseFloat(o.total), 0);
    const totalRevenue = completedOrders.reduce((sum, o) => sum + parseFloat(o.total), 0);
    const totalMargin = completedOrders.reduce((sum, o) => {
      const margin = parseFloat(o.total) * 0.15; // Simplified margin calculation
      return sum + margin;
    }, 0);

    const totalCreditIssued = orders.reduce((sum, o) => sum + parseFloat(o.creditUsed), 0);
    const totalPaymentsReceived = payments.reduce((sum, p) => sum + parseFloat(p.amount), 0);

    const activeRetailers = await prisma.retailer.count({
      where: {
        orders: {
          some: {
            createdAt: {
              gte: targetDate,
              lt: nextDate
            }
          }
        }
      }
    });

    const activeVendors = await prisma.vendor.count({
      where: {
        orders: {
          some: {
            createdAt: {
              gte: targetDate,
              lt: nextDate
            }
          }
        }
      }
    });

    const summary = {
      summary_date: targetDate,
      total_orders: orders.length,
      completed_orders: completedOrders.length,
      cancelled_orders: cancelledOrders.length,
      total_gmv: totalGMV,
      total_revenue: totalRevenue,
      total_margin: totalMargin,
      avg_order_value: orders.length > 0 ? totalGMV / orders.length : 0,
      total_credit_issued: totalCreditIssued,
      total_payments_received: totalPaymentsReceived,
      active_retailers: activeRetailers,
      active_vendors: activeVendors,
      new_retailers: retailers.length,
      updated_at: new Date()
    };

    await prisma.$executeRawUnsafe(`
      INSERT INTO daily_sales_summary (
        summary_date, total_orders, completed_orders, cancelled_orders,
        total_gmv, total_revenue, total_margin, avg_order_value,
        total_credit_issued, total_payments_received,
        active_retailers, active_vendors, new_retailers, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14
      )
      ON CONFLICT (summary_date) DO UPDATE SET
        total_orders = EXCLUDED.total_orders,
        completed_orders = EXCLUDED.completed_orders,
        cancelled_orders = EXCLUDED.cancelled_orders,
        total_gmv = EXCLUDED.total_gmv,
        total_revenue = EXCLUDED.total_revenue,
        total_margin = EXCLUDED.total_margin,
        avg_order_value = EXCLUDED.avg_order_value,
        total_credit_issued = EXCLUDED.total_credit_issued,
        total_payments_received = EXCLUDED.total_payments_received,
        active_retailers = EXCLUDED.active_retailers,
        active_vendors = EXCLUDED.active_vendors,
        new_retailers = EXCLUDED.new_retailers,
        updated_at = EXCLUDED.updated_at
    `, 
      targetDate, summary.total_orders, summary.completed_orders, summary.cancelled_orders,
      summary.total_gmv, summary.total_revenue, summary.total_margin, summary.avg_order_value,
      summary.total_credit_issued, summary.total_payments_received,
      summary.active_retailers, summary.active_vendors, summary.new_retailers, summary.updated_at
    );

    logger.info(`Daily sales aggregation completed for ${targetDate.toISOString().split('T')[0]}`);
    return summary;
  }

  // ==================== MONTHLY RETAILER SUMMARY ====================
  
  async aggregateMonthlyRetailers(year, month) {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 1);

    logger.info(`Aggregating monthly retailer summary for ${year}-${month}`);

    const retailers = await prisma.retailer.findMany({
      include: {
        orders: {
          where: {
            createdAt: {
              gte: startDate,
              lt: endDate
            }
          }
        },
        payments: {
          where: {
            createdAt: {
              gte: startDate,
              lt: endDate
            }
          }
        }
      }
    });

    for (const retailer of retailers) {
      if (retailer.orders.length === 0) continue;

      const totalPurchaseValue = retailer.orders.reduce((sum, o) => sum + parseFloat(o.total), 0);
      const avgOrderValue = totalPurchaseValue / retailer.orders.length;

      // Calculate order frequency
      const orderDates = retailer.orders.map(o => new Date(o.createdAt)).sort((a, b) => a - b);
      let totalInterval = 0;
      for (let i = 1; i < orderDates.length; i++) {
        totalInterval += (orderDates[i] - orderDates[i-1]) / (1000 * 60 * 60 * 24);
      }
      const orderFrequency = orderDates.length > 1 ? totalInterval / (orderDates.length - 1) : 0;

      // Calculate payment delay
      let totalDelayDays = 0;
      let paymentCount = 0;
      for (const order of retailer.orders) {
        if (order.deliveredAt) {
          const relatedPayments = retailer.payments.filter(p => p.orderId === order.id);
          if (relatedPayments.length > 0) {
            const firstPayment = relatedPayments[0];
            const delayDays = (new Date(firstPayment.createdAt) - new Date(order.deliveredAt)) / (1000 * 60 * 60 * 24);
            totalDelayDays += delayDays;
            paymentCount++;
          }
        }
      }
      const avgPaymentDelayDays = paymentCount > 0 ? totalDelayDays / paymentCount : 0;

      const creditUtilizationRate = parseFloat(retailer.creditLimit) > 0 ?
        (parseFloat(retailer.outstandingDebt) / parseFloat(retailer.creditLimit)) * 100 : 0;

      // Calculate growth rate (compare to previous month)
      const prevMonthStart = new Date(year, month - 2, 1);
      const prevMonthEnd = new Date(year, month - 1, 1);
      const prevMonthOrders = await prisma.order.count({
        where: {
          retailerId: retailer.id,
          createdAt: {
            gte: prevMonthStart,
            lt: prevMonthEnd
          }
        }
      });

      const growthRate = prevMonthOrders > 0 ?
        ((retailer.orders.length - prevMonthOrders) / prevMonthOrders) * 100 : 0;

      // Simple churn risk calculation
      const daysSinceLastOrder = retailer.lastOrderAt ?
        (new Date() - new Date(retailer.lastOrderAt)) / (1000 * 60 * 60 * 24) : 999;
      const churnRiskScore = daysSinceLastOrder > 30 ? Math.min(100, daysSinceLastOrder) : 0;

      const lifetimeValue = parseFloat(retailer.totalSpent);

      await prisma.$executeRawUnsafe(`
        INSERT INTO monthly_retailer_summary (
          retailer_id, summary_month, total_orders, total_purchase_value,
          avg_order_value, order_frequency, total_payments, avg_payment_delay_days,
          credit_utilization_rate, repayment_speed_score, growth_rate,
          churn_risk_score, lifetime_value, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14
        )
        ON CONFLICT (retailer_id, summary_month) DO UPDATE SET
          total_orders = EXCLUDED.total_orders,
          total_purchase_value = EXCLUDED.total_purchase_value,
          avg_order_value = EXCLUDED.avg_order_value,
          order_frequency = EXCLUDED.order_frequency,
          total_payments = EXCLUDED.total_payments,
          avg_payment_delay_days = EXCLUDED.avg_payment_delay_days,
          credit_utilization_rate = EXCLUDED.credit_utilization_rate,
          repayment_speed_score = EXCLUDED.repayment_speed_score,
          growth_rate = EXCLUDED.growth_rate,
          churn_risk_score = EXCLUDED.churn_risk_score,
          lifetime_value = EXCLUDED.lifetime_value,
          updated_at = EXCLUDED.updated_at
      `,
        retailer.id, startDate, retailer.orders.length, totalPurchaseValue,
        avgOrderValue, orderFrequency, retailer.payments.length, avgPaymentDelayDays,
        creditUtilizationRate, Math.max(0, 100 - avgPaymentDelayDays), growthRate,
        churnRiskScore, lifetimeValue, new Date()
      );
    }

    logger.info(`Monthly retailer aggregation completed for ${year}-${month}`);
  }

  // ==================== CREDIT EXPOSURE SUMMARY ====================
  
  async aggregateCreditExposure(date = new Date()) {
    const targetDate = new Date(date);
    targetDate.setHours(0, 0, 0, 0);

    logger.info(`Aggregating credit exposure for ${targetDate.toISOString().split('T')[0]}`);

    const retailers = await prisma.retailer.findMany({
      where: {
        outstandingDebt: { gt: 0 }
      },
      include: {
        orders: {
          where: {
            status: 'COMPLETED',
            deliveredAt: { not: null }
          },
          orderBy: { deliveredAt: 'asc' }
        }
      }
    });

    let totalCreditIssued = 0;
    let totalOutstanding = 0;
    let totalOverdue = 0;
    let aging_0_7 = 0;
    let aging_8_15 = 0;
    let aging_16_30 = 0;
    let aging_30_plus = 0;
    let highRiskExposure = 0;
    let mediumRiskExposure = 0;
    let lowRiskExposure = 0;

    retailers.forEach(retailer => {
      const outstanding = parseFloat(retailer.outstandingDebt);
      const creditLimit = parseFloat(retailer.creditLimit);
      
      totalCreditIssued += creditLimit;
      totalOutstanding += outstanding;

      // Aging analysis
      const oldestUnpaidOrder = retailer.orders.find(o => parseFloat(o.dueAmount) > 0);
      if (oldestUnpaidOrder && oldestUnpaidOrder.deliveredAt) {
        const daysPastDue = Math.floor((targetDate - new Date(oldestUnpaidOrder.deliveredAt)) / (1000 * 60 * 60 * 24));
        
        if (daysPastDue > 0) totalOverdue += outstanding;
        
        if (daysPastDue <= 7) aging_0_7 += outstanding;
        else if (daysPastDue <= 15) aging_8_15 += outstanding;
        else if (daysPastDue <= 30) aging_16_30 += outstanding;
        else aging_30_plus += outstanding;
      }

      // Risk categorization
      if (retailer.creditScore < 500) highRiskExposure += outstanding;
      else if (retailer.creditScore < 700) mediumRiskExposure += outstanding;
      else lowRiskExposure += outstanding;
    });

    // Calculate expected inflow (simplified)
    const expectedInflow7Days = lowRiskExposure * 0.4 + mediumRiskExposure * 0.2;
    const expectedInflow30Days = lowRiskExposure * 0.8 + mediumRiskExposure * 0.5 + highRiskExposure * 0.2;

    const defaultRate = totalCreditIssued > 0 ? (aging_30_plus / totalCreditIssued) * 100 : 0;
    const recoveryRate = totalOverdue > 0 ? ((totalOverdue - aging_30_plus) / totalOverdue) * 100 : 0;
    const creditUtilizationAvg = totalCreditIssued > 0 ? (totalOutstanding / totalCreditIssued) * 100 : 0;

    await prisma.$executeRawUnsafe(`
      INSERT INTO credit_exposure_summary (
        summary_date, total_credit_issued, total_outstanding, total_overdue,
        aging_0_7_days, aging_8_15_days, aging_16_30_days, aging_30_plus_days,
        high_risk_exposure, medium_risk_exposure, low_risk_exposure,
        default_rate, recovery_rate, credit_utilization_avg,
        expected_inflow_7_days, expected_inflow_30_days, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17
      )
      ON CONFLICT (summary_date) DO UPDATE SET
        total_credit_issued = EXCLUDED.total_credit_issued,
        total_outstanding = EXCLUDED.total_outstanding,
        total_overdue = EXCLUDED.total_overdue,
        aging_0_7_days = EXCLUDED.aging_0_7_days,
        aging_8_15_days = EXCLUDED.aging_8_15_days,
        aging_16_30_days = EXCLUDED.aging_16_30_days,
        aging_30_plus_days = EXCLUDED.aging_30_plus_days,
        high_risk_exposure = EXCLUDED.high_risk_exposure,
        medium_risk_exposure = EXCLUDED.medium_risk_exposure,
        low_risk_exposure = EXCLUDED.low_risk_exposure,
        default_rate = EXCLUDED.default_rate,
        recovery_rate = EXCLUDED.recovery_rate,
        credit_utilization_avg = EXCLUDED.credit_utilization_avg,
        expected_inflow_7_days = EXCLUDED.expected_inflow_7_days,
        expected_inflow_30_days = EXCLUDED.expected_inflow_30_days,
        updated_at = EXCLUDED.updated_at
    `,
      targetDate, totalCreditIssued, totalOutstanding, totalOverdue,
      aging_0_7, aging_8_15, aging_16_30, aging_30_plus,
      highRiskExposure, mediumRiskExposure, lowRiskExposure,
      defaultRate, recoveryRate, creditUtilizationAvg,
      expectedInflow7Days, expectedInflow30Days, new Date()
    );

    logger.info(`Credit exposure aggregation completed`);
  }

  // ==================== PLATFORM INTELLIGENCE METRICS ====================
  
  async aggregatePlatformMetrics(date = new Date()) {
    const targetDate = new Date(date);
    targetDate.setHours(0, 0, 0, 0);

    logger.info(`Aggregating platform intelligence metrics for ${targetDate.toISOString().split('T')[0]}`);

    const last30Days = new Date(targetDate);
    last30Days.setDate(last30Days.getDate() - 30);

    const [orders, retailers, vendors, creditExposure] = await Promise.all([
      prisma.order.findMany({
        where: {
          createdAt: {
            gte: last30Days,
            lt: targetDate
          }
        }
      }),
      prisma.retailer.findMany({
        where: { isActive: true }
      }),
      prisma.vendor.findMany({
        where: { isApproved: true }
      }),
      prisma.retailer.aggregate({
        _sum: {
          outstandingDebt: true,
          creditLimit: true
        }
      })
    ]);

    const completedOrders = orders.filter(o => o.status === 'COMPLETED');
    const grossMerchandiseValue = completedOrders.reduce((sum, o) => sum + parseFloat(o.total), 0);
    const netMargin = grossMerchandiseValue * 0.15; // Simplified margin
    const netMarginPercentage = grossMerchandiseValue > 0 ? (netMargin / grossMerchandiseValue) * 100 : 0;

    const totalCreditExposure = parseFloat(creditExposure._sum.outstandingDebt || 0);
    const totalCreditLimit = parseFloat(creditExposure._sum.creditLimit || 0);
    const creditExposureRatio = totalCreditLimit > 0 ? (totalCreditExposure / totalCreditLimit) * 100 : 0;

    // Cash conversion cycle (simplified)
    const avgPaymentDelay = 15; // Simplified - should calculate from actual data
    const avgInventoryDays = 7;
    const cashConversionCycleDays = avgInventoryDays + avgPaymentDelay;

    const activeRetailers = retailers.filter(r => {
      return r.lastOrderAt && (targetDate - new Date(r.lastOrderAt)) / (1000 * 60 * 60 * 24) <= 30;
    }).length;

    const activeVendors = vendors.filter(v => v.isApproved).length;
    const vendorActivationRate = vendors.length > 0 ? (activeVendors / vendors.length) * 100 : 0;

    const revenuePerRetailer = activeRetailers > 0 ? grossMerchandiseValue / activeRetailers : 0;

    const avgOrderFrequency = activeRetailers > 0 ? orders.length / activeRetailers / 30 : 0;

    // Simplified churn rate
    const inactiveRetailers = retailers.filter(r => {
      return !r.lastOrderAt || (targetDate - new Date(r.lastOrderAt)) / (1000 * 60 * 60 * 24) > 60;
    }).length;
    const retailerChurnRate = retailers.length > 0 ? (inactiveRetailers / retailers.length) * 100 : 0;

    // Vendor reliability score
    const vendorReliabilityScore = 85; // Simplified - should calculate from vendor performance data

    await prisma.$executeRawUnsafe(`
      INSERT INTO platform_intelligence_metrics (
        metric_date, gross_merchandise_value, net_margin, net_margin_percentage,
        total_credit_exposure, credit_exposure_ratio, cash_conversion_cycle_days,
        active_retailers, active_vendors, vendor_activation_rate,
        revenue_per_retailer, avg_order_frequency, retailer_churn_rate,
        vendor_reliability_score, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15
      )
      ON CONFLICT (metric_date) DO UPDATE SET
        gross_merchandise_value = EXCLUDED.gross_merchandise_value,
        net_margin = EXCLUDED.net_margin,
        net_margin_percentage = EXCLUDED.net_margin_percentage,
        total_credit_exposure = EXCLUDED.total_credit_exposure,
        credit_exposure_ratio = EXCLUDED.credit_exposure_ratio,
        cash_conversion_cycle_days = EXCLUDED.cash_conversion_cycle_days,
        active_retailers = EXCLUDED.active_retailers,
        active_vendors = EXCLUDED.active_vendors,
        vendor_activation_rate = EXCLUDED.vendor_activation_rate,
        revenue_per_retailer = EXCLUDED.revenue_per_retailer,
        avg_order_frequency = EXCLUDED.avg_order_frequency,
        retailer_churn_rate = EXCLUDED.retailer_churn_rate,
        vendor_reliability_score = EXCLUDED.vendor_reliability_score,
        updated_at = EXCLUDED.updated_at
    `,
      targetDate, grossMerchandiseValue, netMargin, netMarginPercentage,
      totalCreditExposure, creditExposureRatio, cashConversionCycleDays,
      activeRetailers, activeVendors, vendorActivationRate,
      revenuePerRetailer, avgOrderFrequency, retailerChurnRate,
      vendorReliabilityScore, new Date()
    );

    logger.info(`Platform intelligence metrics aggregation completed`);
  }

  // ==================== RUN ALL DAILY JOBS ====================
  
  async runDailyAggregations(date = new Date()) {
    logger.info('Starting daily aggregation jobs...');
    
    try {
      await this.aggregateDailySales(date);
      await this.aggregateCreditExposure(date);
      await this.aggregatePlatformMetrics(date);
      
      logger.info('Daily aggregation jobs completed successfully');
      return { success: true, date };
    } catch (error) {
      logger.error('Daily aggregation jobs failed:', error);
      throw error;
    }
  }

  // ==================== RUN MONTHLY JOBS ====================
  
  async runMonthlyAggregations(year, month) {
    logger.info(`Starting monthly aggregation jobs for ${year}-${month}...`);
    
    try {
      await this.aggregateMonthlyRetailers(year, month);
      
      logger.info('Monthly aggregation jobs completed successfully');
      return { success: true, year, month };
    } catch (error) {
      logger.error('Monthly aggregation jobs failed:', error);
      throw error;
    }
  }
}

module.exports = new AggregationJobsService();
