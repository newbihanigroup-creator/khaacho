const prisma = require('../config/database');

class AnalyticsService {
  async getOrderTrends(startDate, endDate, groupBy = 'day') {
    const orders = await prisma.order.findMany({
      where: {
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
      },
      select: {
        createdAt: true,
        status: true,
        total: true,
      },
    });

    const grouped = this.groupByPeriod(orders, groupBy);
    return grouped;
  }

  async getProductPerformance(limit = 20) {
    const products = await prisma.orderItem.groupBy({
      by: ['productId'],
      _sum: {
        quantity: true,
        total: true,
      },
      _count: {
        id: true,
      },
      orderBy: {
        _sum: {
          total: 'desc',
        },
      },
      take: limit,
    });

    const productDetails = await Promise.all(
      products.map(async (p) => {
        const product = await prisma.product.findUnique({
          where: { id: p.productId },
          select: {
            name: true,
            productCode: true,
            category: true,
          },
        });

        return {
          ...product,
          totalQuantitySold: p._sum.quantity,
          totalRevenue: parseFloat(p._sum.total || 0),
          orderCount: p._count.id,
        };
      })
    );

    return productDetails;
  }

  async getRetailerAnalytics(retailerId) {
    const [orders, payments, creditHistory] = await Promise.all([
      prisma.order.findMany({
        where: { retailerId },
        select: {
          createdAt: true,
          total: true,
          status: true,
          deliveredAt: true,
        },
      }),
      prisma.payment.findMany({
        where: { retailerId },
        select: {
          amount: true,
          createdAt: true,
          paymentMethod: true,
        },
      }),
      prisma.creditLedger.findMany({
        where: { retailerId },
        orderBy: { createdAt: 'asc' },
        select: {
          createdAt: true,
          runningBalance: true,
          transactionType: true,
        },
      }),
    ]);

    const completedOrders = orders.filter(o => o.status === 'COMPLETED');
    const avgDeliveryTime = this.calculateAvgDeliveryTime(completedOrders);
    const orderFrequency = this.calculateOrderFrequency(orders);
    const paymentBehavior = this.analyzePaymentBehavior(payments);
    const creditTrend = this.analyzeCreditTrend(creditHistory);

    return {
      totalOrders: orders.length,
      completedOrders: completedOrders.length,
      avgDeliveryTime,
      orderFrequency,
      paymentBehavior,
      creditTrend,
    };
  }

  async getVendorAnalytics(vendorId) {
    const [orders, products] = await Promise.all([
      prisma.order.findMany({
        where: { vendorId },
        select: {
          createdAt: true,
          total: true,
          status: true,
          confirmedAt: true,
          deliveredAt: true,
        },
      }),
      prisma.vendorProduct.findMany({
        where: { vendorId },
        select: {
          stock: true,
          minStock: true,
          product: {
            select: {
              name: true,
              productCode: true,
            },
          },
        },
      }),
    ]);

    const fulfillmentRate = this.calculateFulfillmentRate(orders);
    const avgProcessingTime = this.calculateAvgProcessingTime(orders);
    const lowStockProducts = products.filter(p => p.stock <= p.minStock);

    return {
      totalOrders: orders.length,
      fulfillmentRate,
      avgProcessingTime,
      lowStockProducts: lowStockProducts.length,
      lowStockDetails: lowStockProducts.map(p => ({
        name: p.product.name,
        code: p.product.productCode,
        currentStock: p.stock,
        minStock: p.minStock,
      })),
    };
  }

  groupByPeriod(data, period) {
    const grouped = {};

    data.forEach(item => {
      const date = new Date(item.createdAt);
      let key;

      switch (period) {
        case 'hour':
          key = `${date.toISOString().slice(0, 13)}:00`;
          break;
        case 'day':
          key = date.toISOString().slice(0, 10);
          break;
        case 'week':
          const weekStart = new Date(date);
          weekStart.setDate(date.getDate() - date.getDay());
          key = weekStart.toISOString().slice(0, 10);
          break;
        case 'month':
          key = date.toISOString().slice(0, 7);
          break;
        default:
          key = date.toISOString().slice(0, 10);
      }

      if (!grouped[key]) {
        grouped[key] = {
          period: key,
          count: 0,
          totalValue: 0,
          statuses: {},
        };
      }

      grouped[key].count++;
      grouped[key].totalValue += parseFloat(item.total);
      grouped[key].statuses[item.status] = (grouped[key].statuses[item.status] || 0) + 1;
    });

    return Object.values(grouped).sort((a, b) => a.period.localeCompare(b.period));
  }

  calculateAvgDeliveryTime(orders) {
    const deliveryTimes = orders
      .filter(o => o.deliveredAt)
      .map(o => {
        const created = new Date(o.createdAt);
        const delivered = new Date(o.deliveredAt);
        return (delivered - created) / (1000 * 60 * 60 * 24); // days
      });

    if (deliveryTimes.length === 0) return 0;
    return deliveryTimes.reduce((sum, t) => sum + t, 0) / deliveryTimes.length;
  }

  calculateOrderFrequency(orders) {
    if (orders.length < 2) return 0;

    const sortedOrders = orders.sort((a, b) => 
      new Date(a.createdAt) - new Date(b.createdAt)
    );

    const intervals = [];
    for (let i = 1; i < sortedOrders.length; i++) {
      const prev = new Date(sortedOrders[i - 1].createdAt);
      const curr = new Date(sortedOrders[i].createdAt);
      intervals.push((curr - prev) / (1000 * 60 * 60 * 24)); // days
    }

    return intervals.reduce((sum, i) => sum + i, 0) / intervals.length;
  }

  analyzePaymentBehavior(payments) {
    const total = payments.length;
    if (total === 0) return { avgPaymentAmount: 0, preferredMethod: null };

    const avgAmount = payments.reduce((sum, p) => sum + parseFloat(p.amount), 0) / total;
    
    const methodCounts = {};
    payments.forEach(p => {
      methodCounts[p.paymentMethod] = (methodCounts[p.paymentMethod] || 0) + 1;
    });

    const preferredMethod = Object.entries(methodCounts)
      .sort((a, b) => b[1] - a[1])[0]?.[0];

    return {
      avgPaymentAmount: avgAmount,
      preferredMethod,
      totalPayments: total,
    };
  }

  analyzeCreditTrend(creditHistory) {
    if (creditHistory.length === 0) return { trend: 'stable', currentBalance: 0 };

    const currentBalance = parseFloat(creditHistory[creditHistory.length - 1].runningBalance);
    
    if (creditHistory.length < 2) {
      return { trend: 'stable', currentBalance };
    }

    const midPoint = Math.floor(creditHistory.length / 2);
    const firstHalf = creditHistory.slice(0, midPoint);
    const secondHalf = creditHistory.slice(midPoint);

    const avgFirst = firstHalf.reduce((sum, c) => sum + parseFloat(c.runningBalance), 0) / firstHalf.length;
    const avgSecond = secondHalf.reduce((sum, c) => sum + parseFloat(c.runningBalance), 0) / secondHalf.length;

    let trend = 'stable';
    if (avgSecond > avgFirst * 1.1) trend = 'increasing';
    else if (avgSecond < avgFirst * 0.9) trend = 'decreasing';

    return { trend, currentBalance };
  }

  calculateFulfillmentRate(orders) {
    const total = orders.length;
    if (total === 0) return 0;

    const fulfilled = orders.filter(o => 
      ['DELIVERED', 'COMPLETED'].includes(o.status)
    ).length;

    return (fulfilled / total) * 100;
  }

  calculateAvgProcessingTime(orders) {
    const processingTimes = orders
      .filter(o => o.confirmedAt && o.deliveredAt)
      .map(o => {
        const confirmed = new Date(o.confirmedAt);
        const delivered = new Date(o.deliveredAt);
        return (delivered - confirmed) / (1000 * 60 * 60 * 24); // days
      });

    if (processingTimes.length === 0) return 0;
    return processingTimes.reduce((sum, t) => sum + t, 0) / processingTimes.length;
  }

  // ==================== CEO DASHBOARD INTELLIGENCE ====================

  async getCEODashboard(days = 30) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const [
      platformMetrics,
      revenueGrowth,
      riskMetrics,
      topPerformers,
      alerts
    ] = await Promise.all([
      this.getPlatformMetrics(startDate),
      this.getRevenueGrowth(startDate),
      this.getRiskMetrics(),
      this.getTopPerformers(),
      this.getIntelligenceAlerts()
    ]);

    return {
      platformMetrics,
      revenueGrowth,
      riskMetrics,
      topPerformers,
      alerts,
      generatedAt: new Date()
    };
  }

  async getPlatformMetrics(startDate) {
    const orders = await prisma.order.findMany({
      where: {
        createdAt: { gte: startDate }
      }
    });

    const completedOrders = orders.filter(o => o.status === 'COMPLETED');
    const gmv = completedOrders.reduce((sum, o) => sum + parseFloat(o.total), 0);
    const netMargin = gmv * 0.15; // Simplified

    const [retailers, vendors, creditData] = await Promise.all([
      prisma.retailer.count({ where: { isActive: true } }),
      prisma.vendor.count({ where: { isApproved: true } }),
      prisma.retailer.aggregate({
        _sum: {
          outstandingDebt: true,
          creditLimit: true
        }
      })
    ]);

    const totalCreditExposure = parseFloat(creditData._sum.outstandingDebt || 0);
    const totalCreditLimit = parseFloat(creditData._sum.creditLimit || 0);
    const creditExposureRatio = totalCreditLimit > 0 ? (totalCreditExposure / totalCreditLimit) * 100 : 0;

    return {
      grossMerchandiseValue: gmv,
      netMargin,
      netMarginPercentage: gmv > 0 ? (netMargin / gmv) * 100 : 0,
      totalOrders: orders.length,
      completedOrders: completedOrders.length,
      activeRetailers: retailers,
      activeVendors: vendors,
      creditExposureRatio,
      revenuePerRetailer: retailers > 0 ? gmv / retailers : 0
    };
  }

  async getRevenueGrowth(startDate) {
    const midPoint = new Date(startDate);
    midPoint.setDate(midPoint.getDate() + Math.floor((new Date() - startDate) / (1000 * 60 * 60 * 24) / 2));

    const [firstHalf, secondHalf] = await Promise.all([
      prisma.order.findMany({
        where: {
          createdAt: { gte: startDate, lt: midPoint },
          status: 'COMPLETED'
        }
      }),
      prisma.order.findMany({
        where: {
          createdAt: { gte: midPoint },
          status: 'COMPLETED'
        }
      })
    ]);

    const firstHalfRevenue = firstHalf.reduce((sum, o) => sum + parseFloat(o.total), 0);
    const secondHalfRevenue = secondHalf.reduce((sum, o) => sum + parseFloat(o.total), 0);

    const growthRate = firstHalfRevenue > 0 ? ((secondHalfRevenue - firstHalfRevenue) / firstHalfRevenue) * 100 : 0;

    return {
      firstHalfRevenue,
      secondHalfRevenue,
      growthRate,
      trend: growthRate > 10 ? 'STRONG_GROWTH' : growthRate > 0 ? 'GROWTH' : 'DECLINE'
    };
  }

  async getRiskMetrics() {
    const [highRiskRetailers, overdueOrders, creditData] = await Promise.all([
      prisma.retailer.count({
        where: {
          creditScore: { lt: 500 },
          outstandingDebt: { gt: 0 }
        }
      }),
      prisma.order.count({
        where: {
          status: 'COMPLETED',
          paymentStatus: 'OVERDUE'
        }
      }),
      prisma.retailer.aggregate({
        where: {
          outstandingDebt: { gt: 0 }
        },
        _sum: {
          outstandingDebt: true
        }
      })
    ]);

    const totalOutstanding = parseFloat(creditData._sum.outstandingDebt || 0);

    return {
      highRiskRetailers,
      overdueOrders,
      totalOutstanding,
      riskLevel: highRiskRetailers > 10 ? 'HIGH' : highRiskRetailers > 5 ? 'MEDIUM' : 'LOW'
    };
  }

  async getTopPerformers() {
    const [topRetailers, topVendors, topProducts] = await Promise.all([
      prisma.retailer.findMany({
        take: 5,
        orderBy: { totalSpent: 'desc' },
        include: {
          user: {
            select: { name: true, businessName: true }
          }
        }
      }),
      prisma.vendor.findMany({
        take: 5,
        orderBy: { totalSales: 'desc' },
        include: {
          user: {
            select: { name: true, businessName: true }
          }
        }
      }),
      prisma.orderItem.groupBy({
        by: ['productId'],
        _sum: {
          quantity: true,
          total: true
        },
        orderBy: {
          _sum: {
            total: 'desc'
          }
        },
        take: 5
      })
    ]);

    const topProductsWithDetails = await Promise.all(
      topProducts.map(async (p) => {
        const product = await prisma.product.findUnique({
          where: { id: p.productId },
          select: { name: true, productCode: true }
        });
        return {
          ...product,
          totalRevenue: parseFloat(p._sum.total || 0),
          totalQuantity: p._sum.quantity
        };
      })
    );

    return {
      topRetailers,
      topVendors,
      topProducts: topProductsWithDetails
    };
  }

  async getIntelligenceAlerts() {
    // Query intelligence_actions table for pending high-priority actions
    const alerts = await prisma.$queryRawUnsafe(`
      SELECT * FROM intelligence_actions
      WHERE status = 'PENDING'
      AND priority IN ('HIGH', 'URGENT')
      ORDER BY created_at DESC
      LIMIT 10
    `);

    return alerts || [];
  }

  // ==================== DEMAND FORECASTING ====================

  async getTop20ProductsForecast() {
    const topProducts = await prisma.orderItem.groupBy({
      by: ['productId'],
      _sum: {
        quantity: true
      },
      orderBy: {
        _sum: {
          quantity: 'desc'
        }
      },
      take: 20
    });

    const forecasts = await Promise.all(
      topProducts.map(async (p) => {
        const product = await prisma.product.findUnique({
          where: { id: p.productId },
          select: { name: true, productCode: true }
        });

        const orderItems = await prisma.orderItem.findMany({
          where: { productId: p.productId },
          orderBy: { createdAt: 'desc' },
          take: 30
        });

        const last7Days = orderItems.filter(item => {
          const daysDiff = (new Date() - new Date(item.createdAt)) / (1000 * 60 * 60 * 24);
          return daysDiff <= 7;
        });

        const avgDailyDemand = last7Days.reduce((sum, item) => sum + item.quantity, 0) / 7;
        const predictedNext7Days = Math.round(avgDailyDemand * 7);

        return {
          ...product,
          currentDemand: p._sum.quantity,
          avgDailyDemand,
          predictedNext7Days
        };
      })
    );

    return forecasts;
  }
}

module.exports = new AnalyticsService();
