const vendorIntelligenceService = require('../services/vendorIntelligence.service');
const ApiResponse = require('../utils/response');
const logger = require('../utils/logger');

class VendorIntelligenceController {
  async getVendorPerformance(req, res, next) {
    try {
      const { vendorId } = req.params;
      
      const performance = await vendorIntelligenceService.getVendorPerformanceDashboard();
      
      return ApiResponse.success(res, performance, 'Vendor performance retrieved successfully');
    } catch (error) {
      logger.error('Error getting vendor performance', { error: error.message });
      return ApiResponse.error(res, error.message, 500);
    }
  }

  async getRankedVendors(req, res, next) {
    try {
      const { limit = 20 } = req.query;
      
      const rankedVendors = await vendorIntelligenceService.getRankedVendors(parseInt(limit));
      
      return ApiResponse.success(res, {
        vendors: rankedVendors,
        total: rankedVendors.length,
        limit: parseInt(limit)
      }, 'Ranked vendors retrieved successfully');
    } catch (error) {
      logger.error('Error getting ranked vendors', { error: error.message });
      return ApiResponse.error(res, error.message, 500);
    }
  }

  async getVendorScore(req, res, next) {
    try {
      const { vendorId } = req.params;
      
      const score = await vendorIntelligenceService.calculateVendorScore(vendorId);
      
      return ApiResponse.success(res, {
        vendorId,
        score
      }, 'Vendor score calculated successfully');
    } catch (error) {
      logger.error('Error calculating vendor score', { error: error.message });
      return ApiResponse.error(res, error.message, 500);
    }
  }

  async updateVendorPerformance(req, res, next) {
    try {
      const { vendorId } = req.params;
      const { orderId, outcome, deliveryTime } = req.body;
      
      if (!orderId || !outcome) {
        return ApiResponse.error(res, 'Order ID and outcome are required', 400);
      }

      const result = await vendorIntelligenceService.updateVendorPerformance(
        orderId,
        outcome
      );

      return ApiResponse.success(res, result, 'Vendor performance updated successfully');
    } catch (error) {
      logger.error('Error updating vendor performance', { error: error.message });
      return ApiResponse.error(res, error.message, 500);
    }
  }

  async getPerformanceStats(req, res, next) {
    try {
      const stats = await vendorIntelligenceService.getPerformanceStats();
      
      return ApiResponse.success(res, stats, 'Performance stats retrieved successfully');
    } catch (error) {
      logger.error('Error getting performance stats', { error: error.message });
      return ApiResponse.error(res, error.message, 500);
    }
  }

  async getRiskVendors(req, res, next) {
    try {
      const riskVendors = await vendorIntelligenceService.getRiskVendors();
      
      return ApiResponse.success(res, {
        vendors: riskVendors,
        totalAtRisk: riskVendors.length
      }, 'Risk vendors retrieved successfully');
    } catch (error) {
      logger.error('Error getting risk vendors', { error: error.message });
      return ApiResponse.error(res, error.message, 500);
    }
  }

  async getMarketInsights(req, res, next) {
    try {
      // Get performance stats to generate insights
      const stats = await vendorIntelligenceService.getPerformanceStats();
      const insights = vendorIntelligenceService.generateInsights(stats);
      
      return ApiResponse.success(res, {
        stats,
        insights,
        recommendations: [
          'Consider implementing vendor training programs to improve acceptance rates',
          'Address delivery delays to improve completion rates',
          'Review pricing strategy - some vendors may be overpriced'
        ]
      }, 'Market insights generated successfully');
    } catch (error) {
      logger.error('Error generating market insights', { error: error.message });
      return ApiResponse.error(res, error.message, 500);
    }
  }

  async recalculateVendorScores(req, res, next) {
    try {
      console.log('🔄 Recalculating all vendor scores...');
      
      // Get all approved vendors
      const vendors = await prisma.vendor.findMany({
        where: {
          isApproved: true,
          deletedAt: null
        },
        include: {
          rankings: true
        }
      });

      const results = [];
      
      for (const vendor of vendors) {
        try {
          const score = await vendorIntelligenceService.calculateVendorScore(vendor.id);
          
          // Update vendor ranking
          await prisma.vendorRanking.update({
            where: { vendorId: vendor.id },
            data: {
              vendorScore: score,
              rank: this.calculateNewRank(vendor.rankings[0]?.rank || 999, score),
              lastUpdated: new Date(),
              updatedAt: new Date()
            }
          });
          
          results.push({
            vendorId: vendor.id,
            businessName: vendor.user?.businessName || 'Unknown',
            newScore: score,
            previousScore: vendor.rankings[0]?.vendorScore || 0,
            rank: this.calculateNewRank(vendor.rankings[0]?.rank || 999, score)
          success: true
          });
          
        } catch (error) {
          logger.error('Error recalculating vendor score', {
            vendorId: vendor.id,
            error: error.message
          });
          
          results.push({
            vendorId: vendor.id,
            businessName: vendor.user?.businessName || 'Unknown',
            success: false,
            error: error.message
          });
        }
      }

      console.log(`✅ Vendor score recalculation completed: ${results.filter(r => r.success).length}/${results.length} successful`);
      
      return ApiResponse.success(res, {
        totalVendors: vendors.length,
        successfulUpdates: results.filter(r => r.success).length,
        failedUpdates: results.filter(r => !r.success).length,
        results
      }, 'Vendor scores recalculated successfully');
    } catch (error) {
      logger.error('Error recalculating vendor scores', { error: error.message });
      return ApiResponse.error(res, error.message, 500);
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
}

module.exports = new VendorIntelligenceController();
