const { query, param } = require('express-validator');
const AnalyticsService = require('../services/analytics.service');
const IntelligenceEngineService = require('../services/intelligenceEngine.service');
const AggregationJobsService = require('../services/aggregationJobs.service');
const ApiResponse = require('../utils/response');

class AnalyticsController {
  orderTrendsValidation = [
    query('startDate').isISO8601().withMessage('Invalid start date'),
    query('endDate').isISO8601().withMessage('Invalid end date'),
    query('groupBy').optional().isIn(['hour', 'day', 'week', 'month']).withMessage('Invalid groupBy value'),
  ];

  async getOrderTrends(req, res, next) {
    try {
      const { startDate, endDate, groupBy = 'day' } = req.query;
      const trends = await AnalyticsService.getOrderTrends(
        new Date(startDate),
        new Date(endDate),
        groupBy
      );
      return ApiResponse.success(res, trends, 'Order trends retrieved');
    } catch (error) {
      next(error);
    }
  }

  async getProductPerformance(req, res, next) {
    try {
      const { limit = 20 } = req.query;
      const performance = await AnalyticsService.getProductPerformance(parseInt(limit));
      return ApiResponse.success(res, performance, 'Product performance retrieved');
    } catch (error) {
      next(error);
    }
  }

  async getRetailerAnalytics(req, res, next) {
    try {
      const { id } = req.params;
      const analytics = await AnalyticsService.getRetailerAnalytics(id);
      return ApiResponse.success(res, analytics, 'Retailer analytics retrieved');
    } catch (error) {
      next(error);
    }
  }

  async getVendorAnalytics(req, res, next) {
    try {
      const { id } = req.params;
      const analytics = await AnalyticsService.getVendorAnalytics(id);
      return ApiResponse.success(res, analytics, 'Vendor analytics retrieved');
    } catch (error) {
      next(error);
    }
  }

  // ==================== INTELLIGENCE ENDPOINTS ====================

  async getCEODashboard(req, res, next) {
    try {
      const { days = 30 } = req.query;
      const dashboard = await AnalyticsService.getCEODashboard(parseInt(days));
      return ApiResponse.success(res, dashboard, 'CEO dashboard retrieved');
    } catch (error) {
      next(error);
    }
  }

  async getRetailerIntelligence(req, res, next) {
    try {
      const { id } = req.params;
      const intelligence = await IntelligenceEngineService.analyzeRetailerIntelligence(id);
      return ApiResponse.success(res, intelligence, 'Retailer intelligence retrieved');
    } catch (error) {
      next(error);
    }
  }

  async getVendorIntelligence(req, res, next) {
    try {
      const { id } = req.params;
      const intelligence = await IntelligenceEngineService.analyzeVendorIntelligence(id);
      return ApiResponse.success(res, intelligence, 'Vendor intelligence retrieved');
    } catch (error) {
      next(error);
    }
  }

  async getInventoryIntelligence(req, res, next) {
    try {
      const { id } = req.params;
      const intelligence = await IntelligenceEngineService.analyzeInventoryIntelligence(id);
      return ApiResponse.success(res, intelligence, 'Inventory intelligence retrieved');
    } catch (error) {
      next(error);
    }
  }

  async getCreditIntelligence(req, res, next) {
    try {
      const intelligence = await IntelligenceEngineService.analyzeCreditIntelligence();
      return ApiResponse.success(res, intelligence, 'Credit intelligence retrieved');
    } catch (error) {
      next(error);
    }
  }

  async getDemandForecast(req, res, next) {
    try {
      const { id } = req.params;
      const { days = 7 } = req.query;
      const forecast = await IntelligenceEngineService.forecastDemand(id, parseInt(days));
      return ApiResponse.success(res, forecast, 'Demand forecast retrieved');
    } catch (error) {
      next(error);
    }
  }

  async getTop20Forecast(req, res, next) {
    try {
      const forecast = await AnalyticsService.getTop20ProductsForecast();
      return ApiResponse.success(res, forecast, 'Top 20 products forecast retrieved');
    } catch (error) {
      next(error);
    }
  }

  // ==================== AGGREGATION JOB TRIGGERS ====================

  async runDailyAggregation(req, res, next) {
    try {
      const { date } = req.query;
      const targetDate = date ? new Date(date) : new Date();
      const result = await AggregationJobsService.runDailyAggregations(targetDate);
      return ApiResponse.success(res, result, 'Daily aggregation completed');
    } catch (error) {
      next(error);
    }
  }

  async runMonthlyAggregation(req, res, next) {
    try {
      const { year, month } = req.query;
      const result = await AggregationJobsService.runMonthlyAggregations(
        parseInt(year),
        parseInt(month)
      );
      return ApiResponse.success(res, result, 'Monthly aggregation completed');
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new AnalyticsController();
