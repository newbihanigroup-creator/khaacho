const cron = require('node-cron');
const AggregationJobsService = require('../services/aggregationJobs.service');
const IntelligenceEngineService = require('../services/intelligenceEngine.service');
const prisma = require('../config/database');
const logger = require('../utils/logger');

/**
 * Analytics Worker - Scheduled jobs for data aggregation and intelligence
 * Runs daily at 2 AM to aggregate previous day's data
 * Runs monthly on 1st at 3 AM to aggregate previous month's data
 */
class AnalyticsWorker {
  constructor() {
    this.jobs = [];
  }

  start() {
    logger.info('Starting Analytics Worker...');

    // Daily aggregation - runs at 2:00 AM every day
    const dailyJob = cron.schedule('0 2 * * *', async () => {
      logger.info('Running daily aggregation job...');
      try {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        
        await AggregationJobsService.runDailyAggregations(yesterday);
        logger.info('Daily aggregation job completed successfully');
      } catch (error) {
        logger.error('Daily aggregation job failed:', error);
      }
    });

    // Monthly aggregation - runs at 3:00 AM on the 1st of each month
    const monthlyJob = cron.schedule('0 3 1 * *', async () => {
      logger.info('Running monthly aggregation job...');
      try {
        const lastMonth = new Date();
        lastMonth.setMonth(lastMonth.getMonth() - 1);
        
        const year = lastMonth.getFullYear();
        const month = lastMonth.getMonth() + 1;
        
        await AggregationJobsService.runMonthlyAggregations(year, month);
        logger.info('Monthly aggregation job completed successfully');
      } catch (error) {
        logger.error('Monthly aggregation job failed:', error);
      }
    });

    // Intelligence actions - runs every 6 hours
    const intelligenceJob = cron.schedule('0 */6 * * *', async () => {
      logger.info('Running intelligence actions job...');
      try {
        await this.generateIntelligenceActions();
        logger.info('Intelligence actions job completed successfully');
      } catch (error) {
        logger.error('Intelligence actions job failed:', error);
      }
    });

    // Demand forecasting - runs daily at 4:00 AM
    const forecastJob = cron.schedule('0 4 * * *', async () => {
      logger.info('Running demand forecasting job...');
      try {
        await this.generateDemandForecasts();
        logger.info('Demand forecasting job completed successfully');
      } catch (error) {
        logger.error('Demand forecasting job failed:', error);
      }
    });

    this.jobs = [dailyJob, monthlyJob, intelligenceJob, forecastJob];
    logger.info('Analytics Worker started successfully');
  }

  stop() {
    logger.info('Stopping Analytics Worker...');
    this.jobs.forEach(job => job.stop());
    logger.info('Analytics Worker stopped');
  }

  async generateIntelligenceActions() {
    // Analyze all active retailers
    const retailers = await prisma.retailer.findMany({
      where: { isActive: true },
      take: 100 // Process in batches
    });

    for (const retailer of retailers) {
      try {
        const { actions } = await IntelligenceEngineService.analyzeRetailerIntelligence(retailer.id);
        
        // Save actions to database
        for (const action of actions) {
          await prisma.$executeRawUnsafe(`
            INSERT INTO intelligence_actions (
              action_type, entity_type, entity_id, recommendation,
              priority, status, confidence_score, metadata
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          `,
            action.type,
            'RETAILER',
            retailer.id,
            action.recommendation,
            action.priority,
            'PENDING',
            action.confidence,
            JSON.stringify({ retailerId: retailer.id })
          );
        }
      } catch (error) {
        logger.error(`Failed to analyze retailer ${retailer.id}:`, error);
      }
    }

    // Analyze all active vendors
    const vendors = await prisma.vendor.findMany({
      where: { isApproved: true },
      take: 100
    });

    for (const vendor of vendors) {
      try {
        const { actions } = await IntelligenceEngineService.analyzeVendorIntelligence(vendor.id);
        
        for (const action of actions) {
          await prisma.$executeRawUnsafe(`
            INSERT INTO intelligence_actions (
              action_type, entity_type, entity_id, recommendation,
              priority, status, confidence_score, metadata
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          `,
            action.type,
            'VENDOR',
            vendor.id,
            action.recommendation,
            action.priority,
            'PENDING',
            action.confidence,
            JSON.stringify({ vendorId: vendor.id })
          );
        }
      } catch (error) {
        logger.error(`Failed to analyze vendor ${vendor.id}:`, error);
      }
    }

    logger.info(`Generated intelligence actions for ${retailers.length} retailers and ${vendors.length} vendors`);
  }

  async generateDemandForecasts() {
    // Get top 50 products by sales volume
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
      take: 50
    });

    for (const product of topProducts) {
      try {
        const forecast = await IntelligenceEngineService.forecastDemand(product.productId, 7);
        
        const forecastDate = new Date();
        forecastDate.setDate(forecastDate.getDate() + 7);

        await prisma.$executeRawUnsafe(`
          INSERT INTO product_demand_forecast (
            product_id, forecast_date, forecast_period,
            predicted_quantity, predicted_revenue, confidence_level,
            moving_avg_7_day, moving_avg_30_day, trend_slope, seasonal_factor
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          ON CONFLICT (product_id, forecast_date, forecast_period) DO UPDATE SET
            predicted_quantity = EXCLUDED.predicted_quantity,
            predicted_revenue = EXCLUDED.predicted_revenue,
            confidence_level = EXCLUDED.confidence_level,
            moving_avg_7_day = EXCLUDED.moving_avg_7_day,
            moving_avg_30_day = EXCLUDED.moving_avg_30_day,
            trend_slope = EXCLUDED.trend_slope,
            seasonal_factor = EXCLUDED.seasonal_factor
        `,
          product.productId,
          forecastDate,
          'NEXT_7_DAYS',
          forecast.predictedQuantity,
          forecast.predictedQuantity * 100, // Simplified revenue calculation
          forecast.confidence,
          forecast.movingAvg7Day,
          forecast.movingAvg30Day,
          forecast.trendSlope,
          forecast.seasonalIndex
        );
      } catch (error) {
        logger.error(`Failed to forecast product ${product.productId}:`, error);
      }
    }

    logger.info(`Generated demand forecasts for ${topProducts.length} products`);
  }

  // Manual trigger for testing
  async runNow() {
    logger.info('Running analytics jobs manually...');
    await AggregationJobsService.runDailyAggregations();
    await this.generateIntelligenceActions();
    await this.generateDemandForecasts();
    logger.info('Manual analytics jobs completed');
  }
}

module.exports = new AnalyticsWorker();
