const prisma = require('../config/database');
const logger = require('../utils/logger');

class VendorIntelligenceService {
  async calculateVendorScore(vendorId) {
    try {
      console.log(`📊 Calculating vendor score for: ${vendorId}`);
      
      // Get vendor performance data
      const vendor = await prisma.vendor.findUnique({
        where: { id: vendorId },
        include: {
          rankings: true
        }
      });

      if (!vendor) {
        throw new Error('Vendor not found');
      }

      const ranking = vendor.rankings[0] || {
        vendorScore: 0,
        priceIndex: 50,
        acceptanceRate: 0,
        completionRate: 0,
        avgDeliveryTime: 24
      };

      // Calculate component scores
      const priceScore = this.calculatePriceScore(ranking.priceIndex);
      const acceptanceScore = this.calculateAcceptanceScore(ranking.acceptanceRate);
      const completionScore = this.calculateCompletionScore(ranking.completionRate);
      const deliveryScore = this.calculateDeliveryScore(ranking.avgDeliveryTime);

      // Weighted total score (max 100)
      const totalScore = (
        priceScore * 0.3 +      // 30% weight
        acceptanceScore * 0.25 +   // 25% weight
        completionScore * 0.25 +   // 25% weight
        deliveryScore * 0.2 +      // 20% weight
        50 // Base score for all vendors
      );

      return {
        vendorId,
        totalScore: Math.min(100, totalScore),
        priceScore,
        acceptanceScore,
        completionScore,
        deliveryScore,
        breakdown: {
          priceScore,
          acceptanceScore,
          completionScore,
          deliveryScore,
          weights: { price: 0.3, acceptance: 0.25, completion: 0.25, delivery: 0.2 }
        }
      };

    } catch (error) {
      logger.error('Error calculating vendor score', {
        vendorId,
        error: error.message
      });
      throw error;
    }
  }

  calculatePriceScore(priceIndex) {
    // Lower price index is better (more competitive)
    // Price index: 0 = cheapest, 100 = most expensive
    // Score: 100 - priceIndex
    return Math.max(0, 100 - priceIndex);
  }

  calculateAcceptanceScore(acceptanceRate) {
    // Higher acceptance rate is better
    return Math.min(100, acceptanceRate * 100);
  }

  calculateCompletionScore(completionRate) {
    // Higher completion rate is better
    return Math.min(100, completionRate * 100);
  }

  calculateDeliveryScore(avgDeliveryTime) {
    // Lower delivery time is better (faster delivery)
    // Score: max(0, 100 - (avgDeliveryTime * 4)) // 24 hours = 100, 12 hours = 50, etc.
    return Math.max(0, 100 - (avgDeliveryTime * 4));
  }

  async updateVendorPerformance(orderId, outcome, deliveryTime = null) {
    try {
      console.log(`📈 Updating vendor performance for order ${orderId}, outcome: ${outcome}`);
      
      const order = await prisma.order.findUnique({
        where: { id: orderId },
        include: {
          vendor: true
        }
      });

      if (!order || !order.vendorId) {
        throw new Error('Order or vendor not found');
      }

      // Update vendor ranking
      await prisma.$transaction(async (tx) => {
        // Get current ranking
        const currentRanking = await tx.vendorRanking.findUnique({
          where: { vendorId: order.vendorId }
        });

        if (!currentRanking) {
          // Create new ranking record
          await tx.vendorRanking.create({
            data: {
              vendorId: order.vendorId,
              vendorScore: 50, // Default score
              priceIndex: 50,
              acceptanceRate: 0,
              completionRate: 0,
              avgDeliveryTime: 24,
              totalOrders: 1,
              acceptedOrders: 0,
              completedOrders: 0,
              cancelledOrders: 0,
              rank: 999, // New vendor gets low rank initially
              createdAt: new Date(),
              updatedAt: new Date()
            }
          });
        } else {
          // Update existing ranking
          const newTotalOrders = currentRanking.totalOrders + 1;
          let newAcceptedOrders = currentRanking.acceptedOrders;
          let newCompletedOrders = currentRanking.completedOrders;
          let newCancelledOrders = currentRanking.cancelledOrders;

          if (outcome === 'ACCEPTED') {
            newAcceptedOrders = currentRanking.acceptedOrders + 1;
          } else if (outcome === 'COMPLETED') {
            newCompletedOrders = currentRanking.completedOrders + 1;
          } else if (outcome === 'CANCELLED') {
            newCancelledOrders = currentRanking.cancelledOrders + 1;
          }

          // Calculate new rates
          const newAcceptanceRate = newTotalOrders > 0 ? 
            (newAcceptedOrders / newTotalOrders) * 100 : 0;
          const newCompletionRate = newTotalOrders > 0 ? 
            (newCompletedOrders / newTotalOrders) * 100 : 0;

          // Calculate new average delivery time
          let newAvgDeliveryTime = currentRanking.avgDeliveryTime;
          if (deliveryTime && outcome === 'COMPLETED') {
            const totalDeliveryTime = currentRanking.avgDeliveryTime * (newTotalOrders - 1) + deliveryTime;
            newAvgDeliveryTime = totalDeliveryTime / newTotalOrders;
          }

          // Calculate new price index (market competitiveness)
          const newPriceIndex = await this.calculateMarketPriceIndex(order.vendorId);

          // Calculate new vendor score
          const priceScore = this.calculatePriceScore(newPriceIndex);
          const acceptanceScore = this.calculateAcceptanceScore(newAcceptanceRate);
          const completionScore = this.calculateCompletionScore(newCompletionRate);
          const deliveryScore = this.calculateDeliveryScore(newAvgDeliveryTime);

          const totalScore = (
            priceScore * 0.3 +
            acceptanceScore * 0.25 +
            completionScore * 0.25 +
            deliveryScore * 0.2 +
            50
          );

          await tx.vendorRanking.update({
            where: { vendorId: order.vendorId },
            data: {
              vendorScore: Math.min(100, totalScore),
              priceIndex: newPriceIndex,
              acceptanceRate: newAcceptanceRate,
              completionRate: newCompletionRate,
              avgDeliveryTime: newAvgDeliveryTime,
              totalOrders: newTotalOrders,
              acceptedOrders: newAcceptedOrders,
              completedOrders: newCompletedOrders,
              cancelledOrders: newCancelledOrders,
              rank: this.calculateNewRank(currentRanking.rank, totalScore),
              updatedAt: new Date()
            }
          });
        }
      });

      console.log('✅ Vendor performance updated successfully');
      return true;

    } catch (error) {
      logger.error('Error updating vendor performance', {
        orderId,
        outcome,
        error: error.message
      });
      throw error;
    }
  }

  calculateNewRank(currentRank, newScore) {
    // Simple rank calculation: higher score = better rank
    if (newScore > currentRank.vendorScore) {
      return Math.max(1, currentRank - 1);
    } else if (newScore < currentRank.vendorScore) {
      return Math.min(currentRank + 1, 999);
    } else {
      return currentRank;
    }
  }

  async calculateMarketPriceIndex(vendorId) {
    try {
      // Get vendor's average price for their products
      const avgVendorPrice = await prisma.vendorInventory.aggregate({
        where: {
          vendorId,
          status: 'AVAILABLE'
        },
        _avg: {
          price: true
        }
      });

      // Get market average price for same products
      const marketAvgPrice = await prisma.vendorInventory.aggregate({
        where: {
          status: 'AVAILABLE'
        },
        _avg: {
          price: true
        }
      });

      if (!avgVendorPrice._avg.price || !marketAvgPrice._avg.price) {
        return 50; // Default middle price index
      }

      // Calculate price index: how vendor's price compares to market
      // Lower price = lower index (more competitive)
      const priceIndex = (avgVendorPrice._avg.price / marketAvgPrice._avg.price) * 100;

      return Math.min(100, Math.max(0, 200 - priceIndex));

    } catch (error) {
      logger.error('Error calculating market price index', {
        vendorId,
        error: error.message
      });
      return 50;
    }
  }

  async getRankedVendors(limit = 20) {
    try {
      console.log('🏆 Getting ranked vendors...');
      
      const rankedVendors = await prisma.vendor.findMany({
        where: {
          isApproved: true,
          deletedAt: null
        },
        include: {
          rankings: {
            select: {
              vendorScore: true,
              rank: true,
              acceptanceRate: true,
              completionRate: true,
              avgDeliveryTime: true
            }
          },
          user: {
            select: {
              businessName: true,
              phoneNumber: true
            }
          }
        },
        orderBy: {
          rankings: {
            rank: 'asc'
          }
        },
        take: limit
      });

      return rankedVendors.map(vendor => ({
        vendorId: vendor.id,
        businessName: vendor.user.businessName,
        phoneNumber: vendor.user.phoneNumber,
        score: vendor.rankings[0]?.vendorScore || 0,
        rank: vendor.rankings[0]?.rank || 999,
        acceptanceRate: vendor.rankings[0]?.acceptanceRate || 0,
        completionRate: vendor.rankings[0]?.completionRate || 0,
        avgDeliveryTime: vendor.rankings[0]?.avgDeliveryTime || 0,
        performance: this.getPerformanceLevel(vendor.rankings[0]?.vendorScore || 0)
      }));

    } catch (error) {
      logger.error('Error getting ranked vendors', { error: error.message });
      return [];
    }
  }

  getPerformanceLevel(score) {
    if (score >= 80) return 'EXCELLENT';
    if (score >= 70) return 'VERY_GOOD';
    if (score >= 60) return 'GOOD';
    if (score >= 50) return 'AVERAGE';
    if (score >= 40) return 'BELOW_AVERAGE';
    if (score >= 30) return 'POOR';
    return 'VERY_POOR';
  }

  async getVendorPerformanceDashboard() {
    try {
      console.log('📊 Generating vendor performance dashboard...');
      
      const [topVendors, riskVendors, performanceStats] = await Promise.all([
        this.getRankedVendors(10),
        this.getRiskVendors(),
        this.getPerformanceStats()
      ]);

      const dashboard = {
        topPerformers: topVendors,
        vendorsAtRisk: riskVendors,
        performance: performanceStats,
        insights: this.generateInsights(performanceStats),
        generatedAt: new Date()
      };

      console.log('✅ Vendor performance dashboard generated');
      return dashboard;

    } catch (error) {
      logger.error('Error generating vendor performance dashboard', { error: error.message });
      throw error;
    }
  }

  async getRiskVendors() {
    try {
      // Get vendors with poor performance
      const riskVendors = await prisma.vendor.findMany({
        where: {
          isApproved: true,
          deletedAt: null,
          rankings: {
            vendorScore: {
              lt: 40 // Poor performance
            }
          }
        },
        include: {
          rankings: {
            select: {
              vendorScore: true,
              rank: true,
              acceptanceRate: true,
              completionRate: true,
              avgDeliveryTime: true
            }
          },
          user: {
            select: {
              businessName: true,
              phoneNumber: true
            }
          }
        },
        orderBy: {
          rankings: {
            rank: 'asc'
          }
        },
        take: 20
      });

      return riskVendors.map(vendor => ({
        vendorId: vendor.id,
        businessName: vendor.user.businessName,
        phoneNumber: vendor.user.phoneNumber,
        score: vendor.rankings[0]?.vendorScore || 0,
        rank: vendor.rankings[0]?.rank || 999,
        riskLevel: this.getPerformanceLevel(vendor.rankings[0]?.vendorScore || 0),
        issues: this.identifyPerformanceIssues(vendor.rankings[0])
      }));

    } catch (error) {
      logger.error('Error getting risk vendors', { error: error.message });
      return [];
    }
  }

  identifyPerformanceIssues(ranking) {
    const issues = [];
    
    if (ranking.acceptanceRate < 50) {
      issues.push('Low acceptance rate');
    }
    
    if (ranking.completionRate < 60) {
      issues.push('Low completion rate');
    }
    
    if (ranking.avgDeliveryTime > 48) {
      issues.push('Slow delivery');
    }
    
    if (ranking.priceIndex > 80) {
      issues.push('High prices');
    }
    
    return issues;
  }

  async getPerformanceStats() {
    try {
      const stats = await prisma.vendorRanking.aggregate({
        where: {
          vendor: {
            isApproved: true,
            deletedAt: null
          }
        },
        _avg: {
          vendorScore: true,
          priceIndex: true,
          acceptanceRate: true,
          completionRate: true,
          avgDeliveryTime: true
        },
        _count: {
          id: true
        }
      });

      return {
        totalVendors: stats._count.id || 0,
        avgVendorScore: stats._avg.vendorScore || 0,
        avgPriceIndex: stats._avg.priceIndex || 50,
        avgAcceptanceRate: stats._avg.acceptanceRate || 0,
        avgCompletionRate: stats._avg.completionRate || 0,
        avgDeliveryTime: stats._avg.avgDeliveryTime || 0,
        performance: {
          excellent: stats._count.id ? (stats._avg.vendorScore >= 80 ? stats._count.id : 0) : 0,
          good: stats._count.id ? (stats._avg.vendorScore >= 60 && stats._avg.vendorScore < 80 ? stats._count.id : 0) : 0,
          average: stats._count.id ? (stats._avg.vendorScore >= 40 && stats._avg.vendorScore < 60 ? stats._count.id : 0) : 0,
          poor: stats._count.id ? (stats._avg.vendorScore < 40 ? stats._count.id : 0) : 0
        }
      };
    } catch (error) {
      logger.error('Error getting performance stats', { error: error.message });
      return null;
    }
  }

  generateInsights(stats) {
    const insights = [];
    
    if (stats.avgAcceptanceRate < 50) {
      insights.push('Consider vendor training or support to improve acceptance rates');
    }
    
    if (stats.avgCompletionRate < 70) {
      insights.push('Address delivery delays to improve completion rates');
    }
    
    if (stats.avgPriceIndex > 70) {
      insights.push('Some vendors have significantly higher prices - investigate pricing strategy');
    }
    
    if (stats.avgDeliveryTime > 36) {
      insights.push('Average delivery time is 36+ hours - consider logistics optimization');
    }
    
    return insights;
  }
}

module.exports = new VendorIntelligenceService();
