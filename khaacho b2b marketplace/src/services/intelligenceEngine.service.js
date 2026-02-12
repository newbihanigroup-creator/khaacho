const prisma = require('../config/database');
const logger = require('../utils/logger');

/**
 * Intelligence Engine - Turns data into actionable insights
 * This is the brain that makes your system predictive and self-optimizing
 */
class IntelligenceEngineService {
  
  // ==================== RETAILER INTELLIGENCE ====================
  
  async analyzeRetailerIntelligence(retailerId) {
    const [retailer, orders, payments, creditHistory] = await Promise.all([
      prisma.retailer.findUnique({ where: { id: retailerId } }),
      prisma.order.findMany({
        where: { retailerId },
        orderBy: { createdAt: 'desc' },
        take: 100
      }),
      prisma.payment.findMany({
        where: { retailerId },
        orderBy: { createdAt: 'desc' },
        take: 50
      }),
      prisma.creditLedger.findMany({
        where: { retailerId },
        orderBy: { createdAt: 'desc' },
        take: 50
      })
    ]);

    const metrics = {
      avgMonthlyPurchase: this.calculateAvgMonthlyPurchase(orders),
      avgOrderValue: this.calculateAvgOrderValue(orders),
      orderFrequency: this.calculateOrderFrequency(orders),
      repaymentSpeed: this.calculateRepaymentSpeed(payments, orders),
      creditUtilizationRate: this.calculateCreditUtilization(retailer),
      seasonalSpikes: this.detectSeasonalSpikes(orders),
      lifetimeValue: this.calculateLifetimeValue(orders),
      growthRate: this.calculateGrowthRate(orders),
      churnRisk: this.calculateChurnRisk(orders, payments)
    };

    // Generate intelligence actions
    const actions = this.generateRetailerActions(retailerId, metrics, retailer);

    return { metrics, actions };
  }

  calculateAvgMonthlyPurchase(orders) {
    if (orders.length === 0) return 0;
    
    const completedOrders = orders.filter(o => o.status === 'COMPLETED');
    const totalValue = completedOrders.reduce((sum, o) => sum + parseFloat(o.total), 0);
    
    const oldestOrder = completedOrders[completedOrders.length - 1];
    if (!oldestOrder) return 0;
    
    const monthsActive = Math.max(1, this.getMonthsDiff(oldestOrder.createdAt, new Date()));
    return totalValue / monthsActive;
  }

  calculateAvgOrderValue(orders) {
    if (orders.length === 0) return 0;
    const total = orders.reduce((sum, o) => sum + parseFloat(o.total), 0);
    return total / orders.length;
  }

  calculateOrderFrequency(orders) {
    if (orders.length < 2) return 0;
    
    const sortedOrders = orders.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    const intervals = [];
    
    for (let i = 1; i < sortedOrders.length; i++) {
      const daysDiff = this.getDaysDiff(sortedOrders[i-1].createdAt, sortedOrders[i].createdAt);
      intervals.push(daysDiff);
    }
    
    return intervals.reduce((sum, i) => sum + i, 0) / intervals.length;
  }

  calculateRepaymentSpeed(payments, orders) {
    const completedOrders = orders.filter(o => o.status === 'COMPLETED' && o.deliveredAt);
    if (completedOrders.length === 0) return 0;
    
    let totalDelayDays = 0;
    let count = 0;
    
    for (const order of completedOrders) {
      const relatedPayments = payments.filter(p => p.orderId === order.id);
      if (relatedPayments.length > 0) {
        const firstPayment = relatedPayments[0];
        const delayDays = this.getDaysDiff(order.deliveredAt, firstPayment.createdAt);
        totalDelayDays += delayDays;
        count++;
      }
    }
    
    return count > 0 ? totalDelayDays / count : 0;
  }

  calculateCreditUtilization(retailer) {
    if (!retailer || parseFloat(retailer.creditLimit) === 0) return 0;
    return (parseFloat(retailer.outstandingDebt) / parseFloat(retailer.creditLimit)) * 100;
  }

  detectSeasonalSpikes(orders) {
    const monthlyOrders = {};
    
    orders.forEach(order => {
      const month = new Date(order.createdAt).getMonth();
      monthlyOrders[month] = (monthlyOrders[month] || 0) + 1;
    });
    
    const avgOrders = Object.values(monthlyOrders).reduce((sum, count) => sum + count, 0) / 12;
    const spikes = [];
    
    Object.entries(monthlyOrders).forEach(([month, count]) => {
      if (count > avgOrders * 1.5) {
        spikes.push({ month: parseInt(month), orderCount: count, avgOrders });
      }
    });
    
    return spikes;
  }

  calculateLifetimeValue(orders) {
    const completedOrders = orders.filter(o => o.status === 'COMPLETED');
    return completedOrders.reduce((sum, o) => sum + parseFloat(o.total), 0);
  }

  calculateGrowthRate(orders) {
    if (orders.length < 2) return 0;
    
    const sortedOrders = orders.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    const midPoint = Math.floor(sortedOrders.length / 2);
    
    const firstHalf = sortedOrders.slice(0, midPoint);
    const secondHalf = sortedOrders.slice(midPoint);
    
    const firstHalfTotal = firstHalf.reduce((sum, o) => sum + parseFloat(o.total), 0);
    const secondHalfTotal = secondHalf.reduce((sum, o) => sum + parseFloat(o.total), 0);
    
    if (firstHalfTotal === 0) return 0;
    return ((secondHalfTotal - firstHalfTotal) / firstHalfTotal) * 100;
  }

  calculateChurnRisk(orders, payments) {
    if (orders.length === 0) return 0;
    
    const lastOrder = orders[0];
    const daysSinceLastOrder = this.getDaysDiff(lastOrder.createdAt, new Date());
    const avgFrequency = this.calculateOrderFrequency(orders);
    
    let riskScore = 0;
    
    // Risk increases if no order in 30% longer than average frequency
    if (daysSinceLastOrder > avgFrequency * 1.3) riskScore += 30;
    
    // Risk increases with late payments
    const latePayments = payments.filter(p => p.paymentStatus === 'OVERDUE').length;
    if (latePayments > 0) riskScore += Math.min(30, latePayments * 10);
    
    // Risk increases if order frequency is declining
    const recentOrders = orders.slice(0, 10);
    const olderOrders = orders.slice(10, 20);
    if (recentOrders.length < olderOrders.length * 0.7) riskScore += 20;
    
    return Math.min(100, riskScore);
  }

  generateRetailerActions(retailerId, metrics, retailer) {
    const actions = [];
    
    // Increase credit for high-value low-risk retailers
    if (metrics.lifetimeValue > 100000 && metrics.repaymentSpeed < 7 && metrics.churnRisk < 30) {
      actions.push({
        type: 'INCREASE_CREDIT_LIMIT',
        priority: 'HIGH',
        recommendation: `Increase credit limit by 20% for high-performing retailer. LTV: ${metrics.lifetimeValue}, Repayment: ${metrics.repaymentSpeed} days`,
        confidence: 85
      });
    }
    
    // Reduce credit for slow payers
    if (metrics.repaymentSpeed > 30 || metrics.creditUtilizationRate > 90) {
      actions.push({
        type: 'REDUCE_CREDIT_LIMIT',
        priority: 'HIGH',
        recommendation: `Reduce credit limit by 30%. Repayment delay: ${metrics.repaymentSpeed} days, Utilization: ${metrics.creditUtilizationRate}%`,
        confidence: 90
      });
    }
    
    // Churn prevention
    if (metrics.churnRisk > 60) {
      actions.push({
        type: 'CHURN_PREVENTION',
        priority: 'URGENT',
        recommendation: `High churn risk detected. Engage with personalized offer or check-in call.`,
        confidence: 75
      });
    }
    
    // Upsell opportunity
    if (metrics.growthRate > 50 && metrics.avgOrderValue < 50000) {
      actions.push({
        type: 'UPSELL_OPPORTUNITY',
        priority: 'MEDIUM',
        recommendation: `Growing retailer with low AOV. Suggest bulk purchase discounts or premium products.`,
        confidence: 70
      });
    }
    
    return actions;
  }

  // ==================== VENDOR INTELLIGENCE ====================
  
  async analyzeVendorIntelligence(vendorId) {
    const orders = await prisma.order.findMany({
      where: { vendorId },
      orderBy: { createdAt: 'desc' },
      take: 100
    });

    const metrics = {
      avgMarginPerProduct: await this.calculateVendorMargin(vendorId),
      priceVariation: await this.calculatePriceVariation(vendorId),
      fulfillmentRate: this.calculateFulfillmentRate(orders),
      avgAcceptTime: this.calculateAvgAcceptTime(orders),
      lateDeliveryRate: this.calculateLateDeliveryRate(orders),
      cancellationRate: this.calculateCancellationRate(orders)
    };

    const actions = this.generateVendorActions(vendorId, metrics);

    return { metrics, actions };
  }

  async calculateVendorMargin(vendorId) {
    const products = await prisma.vendorProduct.findMany({
      where: { vendorId },
      include: { product: true }
    });

    if (products.length === 0) return 0;

    const margins = products.map(vp => {
      const vendorPrice = parseFloat(vp.vendorPrice);
      const mrp = parseFloat(vp.mrp);
      return ((mrp - vendorPrice) / mrp) * 100;
    });

    return margins.reduce((sum, m) => sum + m, 0) / margins.length;
  }

  async calculatePriceVariation(vendorId) {
    const products = await prisma.vendorProduct.findMany({
      where: { vendorId },
      select: { productId: true, vendorPrice: true }
    });

    const variations = [];
    
    for (const vp of products) {
      const otherVendorPrices = await prisma.vendorProduct.findMany({
        where: {
          productId: vp.productId,
          vendorId: { not: vendorId }
        },
        select: { vendorPrice: true }
      });

      if (otherVendorPrices.length > 0) {
        const avgOtherPrice = otherVendorPrices.reduce((sum, p) => sum + parseFloat(p.vendorPrice), 0) / otherVendorPrices.length;
        const variation = ((parseFloat(vp.vendorPrice) - avgOtherPrice) / avgOtherPrice) * 100;
        variations.push(variation);
      }
    }

    return variations.length > 0 ? variations.reduce((sum, v) => sum + v, 0) / variations.length : 0;
  }

  calculateFulfillmentRate(orders) {
    if (orders.length === 0) return 0;
    const fulfilled = orders.filter(o => ['DELIVERED', 'COMPLETED'].includes(o.status)).length;
    return (fulfilled / orders.length) * 100;
  }

  calculateAvgAcceptTime(orders) {
    const acceptedOrders = orders.filter(o => o.confirmedAt);
    if (acceptedOrders.length === 0) return 0;

    const times = acceptedOrders.map(o => 
      this.getMinutesDiff(o.createdAt, o.confirmedAt)
    );

    return times.reduce((sum, t) => sum + t, 0) / times.length;
  }

  calculateLateDeliveryRate(orders) {
    const deliveredOrders = orders.filter(o => o.deliveredAt && o.expectedDelivery);
    if (deliveredOrders.length === 0) return 0;

    const lateDeliveries = deliveredOrders.filter(o => 
      new Date(o.deliveredAt) > new Date(o.expectedDelivery)
    ).length;

    return (lateDeliveries / deliveredOrders.length) * 100;
  }

  calculateCancellationRate(orders) {
    if (orders.length === 0) return 0;
    const cancelled = orders.filter(o => o.status === 'CANCELLED').length;
    return (cancelled / orders.length) * 100;
  }

  generateVendorActions(vendorId, metrics) {
    const actions = [];

    // Drop underperforming vendors
    if (metrics.fulfillmentRate < 70 || metrics.cancellationRate > 20) {
      actions.push({
        type: 'VENDOR_PERFORMANCE_WARNING',
        priority: 'HIGH',
        recommendation: `Vendor underperforming. Fulfillment: ${metrics.fulfillmentRate}%, Cancellation: ${metrics.cancellationRate}%. Consider reducing order allocation.`,
        confidence: 85
      });
    }

    // Promote reliable vendors
    if (metrics.fulfillmentRate > 95 && metrics.lateDeliveryRate < 5) {
      actions.push({
        type: 'PROMOTE_VENDOR',
        priority: 'MEDIUM',
        recommendation: `Excellent vendor performance. Increase order allocation and consider preferred vendor status.`,
        confidence: 90
      });
    }

    // Price renegotiation
    if (metrics.priceVariation > 10) {
      actions.push({
        type: 'PRICE_RENEGOTIATION',
        priority: 'MEDIUM',
        recommendation: `Vendor prices ${metrics.priceVariation > 0 ? 'higher' : 'lower'} than market average by ${Math.abs(metrics.priceVariation).toFixed(1)}%. Consider renegotiation.`,
        confidence: 75
      });
    }

    return actions;
  }

  // ==================== INVENTORY INTELLIGENCE ====================
  
  async analyzeInventoryIntelligence(productId) {
    const [orderItems, vendorProducts] = await Promise.all([
      prisma.orderItem.findMany({
        where: { productId },
        include: { order: true },
        orderBy: { createdAt: 'desc' },
        take: 100
      }),
      prisma.vendorProduct.findMany({
        where: { productId },
        include: { vendor: true }
      })
    ]);

    const metrics = {
      inventoryTurnoverRatio: this.calculateTurnoverRatio(orderItems),
      daysOfStockLeft: this.calculateDaysOfStock(orderItems, vendorProducts),
      stockoutFrequency: this.calculateStockoutFrequency(vendorProducts),
      velocityCategory: this.categorizeVelocity(orderItems),
      demandTrend: this.analyzeDemandTrend(orderItems)
    };

    const actions = this.generateInventoryActions(productId, metrics, vendorProducts);

    return { metrics, actions };
  }

  calculateTurnoverRatio(orderItems) {
    if (orderItems.length === 0) return 0;
    
    const last30Days = orderItems.filter(item => 
      this.getDaysDiff(item.createdAt, new Date()) <= 30
    );

    const totalSold = last30Days.reduce((sum, item) => sum + item.quantity, 0);
    return totalSold / 30; // Daily turnover
  }

  calculateDaysOfStock(orderItems, vendorProducts) {
    const totalStock = vendorProducts.reduce((sum, vp) => sum + vp.stock, 0);
    const dailyTurnover = this.calculateTurnoverRatio(orderItems);
    
    if (dailyTurnover === 0) return 999;
    return Math.floor(totalStock / dailyTurnover);
  }

  calculateStockoutFrequency(vendorProducts) {
    const outOfStock = vendorProducts.filter(vp => vp.stock === 0).length;
    return vendorProducts.length > 0 ? (outOfStock / vendorProducts.length) * 100 : 0;
  }

  categorizeVelocity(orderItems) {
    const last30Days = orderItems.filter(item => 
      this.getDaysDiff(item.createdAt, new Date()) <= 30
    );

    const totalQuantity = last30Days.reduce((sum, item) => sum + item.quantity, 0);

    if (totalQuantity > 100) return 'FAST_MOVING';
    if (totalQuantity > 30) return 'MEDIUM_MOVING';
    return 'SLOW_MOVING';
  }

  analyzeDemandTrend(orderItems) {
    if (orderItems.length < 10) return 'STABLE';

    const recent = orderItems.slice(0, Math.floor(orderItems.length / 2));
    const older = orderItems.slice(Math.floor(orderItems.length / 2));

    const recentQty = recent.reduce((sum, item) => sum + item.quantity, 0);
    const olderQty = older.reduce((sum, item) => sum + item.quantity, 0);

    if (recentQty > olderQty * 1.2) return 'INCREASING';
    if (recentQty < olderQty * 0.8) return 'DECREASING';
    return 'STABLE';
  }

  generateInventoryActions(productId, metrics, vendorProducts) {
    const actions = [];

    // Low stock alert
    if (metrics.daysOfStockLeft < 7) {
      actions.push({
        type: 'LOW_STOCK_ALERT',
        priority: 'URGENT',
        recommendation: `Critical stock level. Only ${metrics.daysOfStockLeft} days remaining. Reorder immediately.`,
        confidence: 95
      });
    }

    // Stockout prevention
    if (metrics.stockoutFrequency > 30) {
      actions.push({
        type: 'STOCKOUT_PREVENTION',
        priority: 'HIGH',
        recommendation: `Frequent stockouts detected (${metrics.stockoutFrequency.toFixed(1)}%). Increase safety stock levels.`,
        confidence: 85
      });
    }

    // Slow-moving inventory
    if (metrics.velocityCategory === 'SLOW_MOVING' && metrics.demandTrend === 'DECREASING') {
      actions.push({
        type: 'SLOW_MOVING_INVENTORY',
        priority: 'MEDIUM',
        recommendation: `Slow-moving product with declining demand. Consider promotional pricing or discontinuation.`,
        confidence: 75
      });
    }

    return actions;
  }

  // ==================== CREDIT INTELLIGENCE ====================
  
  async analyzeCreditIntelligence() {
    const retailers = await prisma.retailer.findMany({
      where: { outstandingDebt: { gt: 0 } },
      include: {
        orders: {
          where: { status: 'COMPLETED' },
          orderBy: { deliveredAt: 'desc' }
        },
        payments: {
          orderBy: { createdAt: 'desc' }
        }
      }
    });

    const summary = {
      totalCreditExposure: 0,
      agingBuckets: { '0-7': 0, '8-15': 0, '16-30': 0, '30+': 0 },
      defaultRate: 0,
      recoveryRate: 0,
      expectedInflow7Days: 0,
      expectedInflow30Days: 0
    };

    retailers.forEach(retailer => {
      const outstanding = parseFloat(retailer.outstandingDebt);
      summary.totalCreditExposure += outstanding;

      // Aging analysis
      const oldestUnpaidOrder = retailer.orders.find(o => parseFloat(o.dueAmount) > 0);
      if (oldestUnpaidOrder && oldestUnpaidOrder.deliveredAt) {
        const daysPastDue = this.getDaysDiff(oldestUnpaidOrder.deliveredAt, new Date());
        
        if (daysPastDue <= 7) summary.agingBuckets['0-7'] += outstanding;
        else if (daysPastDue <= 15) summary.agingBuckets['8-15'] += outstanding;
        else if (daysPastDue <= 30) summary.agingBuckets['16-30'] += outstanding;
        else summary.agingBuckets['30+'] += outstanding;
      }

      // Expected inflow (simplified)
      if (retailer.creditScore > 600) {
        summary.expectedInflow7Days += outstanding * 0.3;
        summary.expectedInflow30Days += outstanding * 0.7;
      }
    });

    return summary;
  }

  // ==================== DEMAND FORECASTING ====================
  
  async forecastDemand(productId, days = 7) {
    const orderItems = await prisma.orderItem.findMany({
      where: { productId },
      include: { order: true },
      orderBy: { createdAt: 'desc' },
      take: 90
    });

    const dailySales = this.aggregateDailySales(orderItems);
    
    const forecast = {
      movingAvg7Day: this.calculateMovingAverage(dailySales, 7),
      movingAvg30Day: this.calculateMovingAverage(dailySales, 30),
      trendSlope: this.calculateTrendSlope(dailySales),
      seasonalIndex: this.calculateSeasonalIndex(dailySales),
      predictedQuantity: 0,
      confidence: 0
    };

    // Simple forecast: weighted average of recent trends
    forecast.predictedQuantity = Math.round(
      (forecast.movingAvg7Day * 0.6 + forecast.movingAvg30Day * 0.4) * 
      forecast.seasonalIndex * 
      (1 + forecast.trendSlope) * 
      days
    );

    forecast.confidence = this.calculateForecastConfidence(dailySales);

    return forecast;
  }

  aggregateDailySales(orderItems) {
    const dailySales = {};
    
    orderItems.forEach(item => {
      const date = new Date(item.createdAt).toISOString().split('T')[0];
      dailySales[date] = (dailySales[date] || 0) + item.quantity;
    });

    return Object.entries(dailySales)
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([date, quantity]) => ({ date, quantity }));
  }

  calculateMovingAverage(dailySales, period) {
    if (dailySales.length < period) return 0;
    
    const recent = dailySales.slice(0, period);
    const total = recent.reduce((sum, day) => sum + day.quantity, 0);
    return total / period;
  }

  calculateTrendSlope(dailySales) {
    if (dailySales.length < 14) return 0;

    const recent = dailySales.slice(0, 7);
    const older = dailySales.slice(7, 14);

    const recentAvg = recent.reduce((sum, day) => sum + day.quantity, 0) / 7;
    const olderAvg = older.reduce((sum, day) => sum + day.quantity, 0) / 7;

    if (olderAvg === 0) return 0;
    return (recentAvg - olderAvg) / olderAvg;
  }

  calculateSeasonalIndex(dailySales) {
    // Simplified seasonal index based on day of week
    const today = new Date().getDay();
    const weekdayAvg = {};
    
    dailySales.forEach(day => {
      const weekday = new Date(day.date).getDay();
      if (!weekdayAvg[weekday]) weekdayAvg[weekday] = [];
      weekdayAvg[weekday].push(day.quantity);
    });

    const overallAvg = dailySales.reduce((sum, day) => sum + day.quantity, 0) / dailySales.length;
    const todayAvg = weekdayAvg[today] ? 
      weekdayAvg[today].reduce((sum, q) => sum + q, 0) / weekdayAvg[today].length : 
      overallAvg;

    return overallAvg > 0 ? todayAvg / overallAvg : 1.0;
  }

  calculateForecastConfidence(dailySales) {
    if (dailySales.length < 30) return 50;
    
    const quantities = dailySales.map(d => d.quantity);
    const avg = quantities.reduce((sum, q) => sum + q, 0) / quantities.length;
    const variance = quantities.reduce((sum, q) => sum + Math.pow(q - avg, 2), 0) / quantities.length;
    const stdDev = Math.sqrt(variance);
    
    const coefficientOfVariation = avg > 0 ? (stdDev / avg) : 1;
    
    // Lower variation = higher confidence
    return Math.max(50, Math.min(95, 100 - (coefficientOfVariation * 50)));
  }

  // ==================== HELPER FUNCTIONS ====================
  
  getDaysDiff(date1, date2) {
    const d1 = new Date(date1);
    const d2 = new Date(date2);
    return Math.floor((d2 - d1) / (1000 * 60 * 60 * 24));
  }

  getMonthsDiff(date1, date2) {
    const d1 = new Date(date1);
    const d2 = new Date(date2);
    return Math.max(1, (d2.getFullYear() - d1.getFullYear()) * 12 + (d2.getMonth() - d1.getMonth()));
  }

  getMinutesDiff(date1, date2) {
    const d1 = new Date(date1);
    const d2 = new Date(date2);
    return Math.floor((d2 - d1) / (1000 * 60));
  }
}

module.exports = new IntelligenceEngineService();
