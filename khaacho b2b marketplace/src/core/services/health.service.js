const logger = require('../../shared/logger');
const { TIME } = require('../../shared/constants');

/**
 * Health Check Service
 * Production-grade health and readiness checks with metrics tracking
 * 
 * @class HealthService
 */
class HealthService {
  constructor(prisma, redis = null) {
    this.prisma = prisma;
    this.redis = redis;
    this.startTime = Date.now();
    
    // Health check configuration
    this.config = {
      database: {
        timeout: 5000, // 5 seconds
        retries: 1,
      },
      redis: {
        timeout: 3000, // 3 seconds
        retries: 1,
      },
      metrics: {
        cacheTTL: 30000, // 30 seconds cache for metrics
      },
    };
    
    // Cache for health check results (prevent hammering)
    this.cache = {
      database: { status: null, timestamp: 0, ttl: 10000 }, // 10s cache
      redis: { status: null, timestamp: 0, ttl: 10000 },
      metrics: { data: null, timestamp: 0, ttl: 30000 }, // 30s cache for metrics
    };
  }

  /**
   * Basic health check - server is running
   * This should always return quickly
   * 
   * @returns {Object} Health status
   */
  getHealth() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: this.getUptime(),
    };
  }

  /**
   * Comprehensive readiness check
   * Checks all critical dependencies
   * 
   * @returns {Promise<Object>} Readiness status with details
   */
  async getReadiness() {
    const startTime = Date.now();
    
    try {
      // Run all checks in parallel with timeout protection
      const [databaseStatus, redisStatus, envStatus] = await Promise.all([
        this.checkDatabaseWithTimeout(),
        this.checkRedisWithTimeout(),
        this.checkEnvironmentVariables(),
      ]);

      const isReady = databaseStatus && envStatus;
      const status = isReady ? 'ready' : 'not_ready';

      const result = {
        status,
        checks: {
          database: databaseStatus,
          redis: redisStatus,
          environment: envStatus,
        },
        uptime: this.getUptime(),
        timestamp: new Date().toISOString(),
        responseTime: Date.now() - startTime,
      };

      // Log readiness failures
      if (!isReady) {
        logger.warn('Readiness check failed', {
          status,
          database: databaseStatus,
          redis: redisStatus,
          environment: envStatus,
          responseTime: result.responseTime,
        });
      }

      return result;
    } catch (error) {
      logger.error('Readiness check error', {
        error: error.message,
        stack: error.stack,
      });

      return {
        status: 'not_ready',
        checks: {
          database: false,
          redis: false,
          environment: false,
        },
        uptime: this.getUptime(),
        timestamp: new Date().toISOString(),
        error: error.message,
        responseTime: Date.now() - startTime,
      };
    }
  }

  /**
   * Check database connection with timeout
   * Uses caching to prevent hammering the database
   * 
   * @private
   * @returns {Promise<boolean>} Database status
   */
  async checkDatabaseWithTimeout() {
    // Check cache first
    if (this.isCacheValid('database')) {
      return this.cache.database.status;
    }

    try {
      const result = await this.withTimeout(
        this.checkDatabase(),
        this.config.database.timeout,
        'Database check timeout'
      );

      // Update cache
      this.updateCache('database', result);

      return result;
    } catch (error) {
      logger.error('Database health check failed', {
        error: error.message,
        timeout: this.config.database.timeout,
      });

      // Update cache with failure
      this.updateCache('database', false);

      return false;
    }
  }

  /**
   * Check database connection
   * Performs a simple query to verify connectivity
   * 
   * @private
   * @returns {Promise<boolean>} Database status
   */
  async checkDatabase() {
    try {
      // Simple query that doesn't block event loop
      await this.prisma.$queryRaw`SELECT 1 as health_check`;
      
      logger.debug('Database health check passed');
      return true;
    } catch (error) {
      logger.error('Database connection failed', {
        error: error.message,
        code: error.code,
      });
      return false;
    }
  }

  /**
   * Check Redis connection with timeout
   * Uses caching to prevent hammering Redis
   * 
   * @private
   * @returns {Promise<boolean>} Redis status
   */
  async checkRedisWithTimeout() {
    // If Redis is not configured, return true (optional dependency)
    if (!this.redis) {
      logger.debug('Redis not configured, skipping check');
      return true;
    }

    // Check cache first
    if (this.isCacheValid('redis')) {
      return this.cache.redis.status;
    }

    try {
      const result = await this.withTimeout(
        this.checkRedis(),
        this.config.redis.timeout,
        'Redis check timeout'
      );

      // Update cache
      this.updateCache('redis', result);

      return result;
    } catch (error) {
      logger.error('Redis health check failed', {
        error: error.message,
        timeout: this.config.redis.timeout,
      });

      // Update cache with failure
      this.updateCache('redis', false);

      // Redis is optional, so we return true but log the failure
      return true;
    }
  }

  /**
   * Check Redis connection
   * Performs a simple ping to verify connectivity
   * 
   * @private
   * @returns {Promise<boolean>} Redis status
   */
  async checkRedis() {
    try {
      // Simple ping that doesn't block event loop
      const result = await this.redis.ping();
      
      if (result === 'PONG') {
        logger.debug('Redis health check passed');
        return true;
      }

      logger.warn('Redis ping returned unexpected result', { result });
      return false;
    } catch (error) {
      logger.error('Redis connection failed', {
        error: error.message,
        code: error.code,
      });
      return false;
    }
  }

  /**
   * Check critical environment variables
   * Verifies that required configuration is present
   * 
   * @private
   * @returns {boolean} Environment status
   */
  checkEnvironmentVariables() {
    const requiredVars = [
      'NODE_ENV',
      'DATABASE_URL',
      'JWT_SECRET',
    ];

    const missingVars = requiredVars.filter(varName => !process.env[varName]);

    if (missingVars.length > 0) {
      logger.error('Missing required environment variables', {
        missing: missingVars,
      });
      return false;
    }

    logger.debug('Environment variables check passed');
    return true;
  }

  /**
   * Get application uptime in seconds
   * 
   * @private
   * @returns {number} Uptime in seconds
   */
  getUptime() {
    return Math.floor((Date.now() - this.startTime) / TIME.ONE_SECOND_MS);
  }

  /**
   * Execute a promise with timeout
   * Prevents health checks from blocking indefinitely
   * 
   * @private
   * @param {Promise} promise - Promise to execute
   * @param {number} timeoutMs - Timeout in milliseconds
   * @param {string} timeoutMessage - Error message for timeout
   * @returns {Promise} Promise that resolves or times out
   */
  withTimeout(promise, timeoutMs, timeoutMessage) {
    return Promise.race([
      promise,
      new Promise((_, reject) => {
        setTimeout(() => {
          reject(new Error(timeoutMessage));
        }, timeoutMs);
      }),
    ]);
  }

  /**
   * Check if cache is valid
   * 
   * @private
   * @param {string} key - Cache key
   * @returns {boolean} True if cache is valid
   */
  isCacheValid(key) {
    const cache = this.cache[key];
    if (!cache) return false;

    const age = Date.now() - cache.timestamp;
    return age < cache.ttl && cache.status !== null;
  }

  /**
   * Update cache with new value
   * 
   * @private
   * @param {string} key - Cache key
   * @param {boolean} status - Status to cache
   */
  updateCache(key, status) {
    if (this.cache[key]) {
      this.cache[key].status = status;
      this.cache[key].timestamp = Date.now();
    }
  }

  /**
   * Clear all caches
   * Useful for testing or forcing fresh checks
   */
  clearCache() {
    Object.keys(this.cache).forEach(key => {
      this.cache[key].status = null;
      this.cache[key].data = null;
      this.cache[key].timestamp = 0;
    });
  }

  /**
   * Get production metrics
   * Returns comprehensive metrics for monitoring
   * 
   * @returns {Promise<Object>} Production metrics
   */
  async getMetrics() {
    // Check cache first
    if (this.isCacheValid('metrics')) {
      logger.debug('Returning cached metrics');
      return this.cache.metrics.data;
    }

    const startTime = Date.now();

    try {
      logger.info('Collecting production metrics');

      // Collect all metrics in parallel
      const [
        queueBacklog,
        webhookLatency,
        failedOrders,
        ocrFailures,
        databaseResponseTime,
        redisResponseTime,
      ] = await Promise.all([
        this.getQueueBacklog(),
        this.getWebhookLatency(),
        this.getFailedOrdersCount(),
        this.getOCRFailures(),
        this.measureDatabaseResponseTime(),
        this.measureRedisResponseTime(),
      ]);

      const metrics = {
        timestamp: new Date().toISOString(),
        uptime: this.getUptime(),
        database: {
          status: databaseResponseTime !== null,
          responseTimeMs: databaseResponseTime,
        },
        redis: {
          status: redisResponseTime !== null,
          responseTimeMs: redisResponseTime,
        },
        queues: queueBacklog,
        webhooks: webhookLatency,
        orders: failedOrders,
        ocr: ocrFailures,
        collectionTime: Date.now() - startTime,
      };

      // Update cache
      this.cache.metrics.data = metrics;
      this.cache.metrics.timestamp = Date.now();

      // Record metrics in database (async, don't wait)
      this.recordMetricsInDatabase(metrics).catch(error => {
        logger.error('Failed to record metrics in database', {
          error: error.message,
        });
      });

      logger.info('Production metrics collected', {
        collectionTime: metrics.collectionTime,
      });

      return metrics;
    } catch (error) {
      logger.error('Failed to collect production metrics', {
        error: error.message,
        stack: error.stack,
      });

      throw error;
    }
  }

  /**
   * Get queue backlog size
   * Returns pending and failed jobs per queue
   * 
   * @private
   * @returns {Promise<Object>} Queue backlog data
   */
  async getQueueBacklog() {
    try {
      const result = await this.prisma.$queryRaw`
        SELECT * FROM get_queue_backlog_size()
      `;

      const totalBacklog = result.reduce((sum, queue) => {
        return sum + Number(queue.pending_count) + Number(queue.failed_count);
      }, 0);

      const byQueue = result.reduce((acc, queue) => {
        acc[queue.queue_name] = {
          pending: Number(queue.pending_count),
          failed: Number(queue.failed_count),
          total: Number(queue.total_count),
        };
        return acc;
      }, {});

      return {
        total: totalBacklog,
        byQueue,
        status: totalBacklog > 5000 ? 'critical' : totalBacklog > 1000 ? 'warning' : 'normal',
      };
    } catch (error) {
      logger.error('Failed to get queue backlog', {
        error: error.message,
      });

      return {
        total: 0,
        byQueue: {},
        status: 'unknown',
        error: error.message,
      };
    }
  }

  /**
   * Get webhook latency statistics
   * Returns average latency for last hour
   * 
   * @private
   * @returns {Promise<Object>} Webhook latency data
   */
  async getWebhookLatency() {
    try {
      const result = await this.prisma.$queryRaw`
        SELECT * FROM get_webhook_latency_stats(1)
      `;

      if (result.length === 0) {
        return {
          avgLatencyMs: 0,
          p95LatencyMs: 0,
          p99LatencyMs: 0,
          maxLatencyMs: 0,
          totalRequests: 0,
          bySource: {},
          status: 'normal',
        };
      }

      // Calculate overall average
      const totalRequests = result.reduce((sum, row) => sum + Number(row.total_requests), 0);
      const weightedSum = result.reduce((sum, row) => {
        return sum + (Number(row.avg_latency_ms) * Number(row.total_requests));
      }, 0);
      const overallAvg = totalRequests > 0 ? weightedSum / totalRequests : 0;

      const bySource = result.reduce((acc, row) => {
        acc[row.webhook_source] = {
          avgLatencyMs: Number(row.avg_latency_ms),
          p50LatencyMs: Number(row.p50_latency_ms),
          p95LatencyMs: Number(row.p95_latency_ms),
          p99LatencyMs: Number(row.p99_latency_ms),
          maxLatencyMs: Number(row.max_latency_ms),
          totalRequests: Number(row.total_requests),
        };
        return acc;
      }, {});

      return {
        avgLatencyMs: Math.round(overallAvg),
        p95LatencyMs: Math.max(...result.map(r => Number(r.p95_latency_ms))),
        p99LatencyMs: Math.max(...result.map(r => Number(r.p99_latency_ms))),
        maxLatencyMs: Math.max(...result.map(r => Number(r.max_latency_ms))),
        totalRequests,
        bySource,
        status: overallAvg > 2000 ? 'critical' : overallAvg > 1000 ? 'warning' : 'normal',
      };
    } catch (error) {
      logger.error('Failed to get webhook latency', {
        error: error.message,
      });

      return {
        avgLatencyMs: 0,
        p95LatencyMs: 0,
        p99LatencyMs: 0,
        maxLatencyMs: 0,
        totalRequests: 0,
        bySource: {},
        status: 'unknown',
        error: error.message,
      };
    }
  }

  /**
   * Get failed orders count
   * Returns count of failed orders in last hour
   * 
   * @private
   * @returns {Promise<Object>} Failed orders data
   */
  async getFailedOrdersCount() {
    try {
      const result = await this.prisma.$queryRaw`
        SELECT * FROM get_failed_orders_count(1)
      `;

      const data = result[0] || { failed_count: 0, cancelled_count: 0, total_failed: 0 };
      const totalFailed = Number(data.total_failed);

      return {
        failedCount: Number(data.failed_count),
        cancelledCount: Number(data.cancelled_count),
        totalCount: totalFailed,
        status: totalFailed > 50 ? 'critical' : totalFailed > 10 ? 'warning' : 'normal',
      };
    } catch (error) {
      logger.error('Failed to get failed orders count', {
        error: error.message,
      });

      return {
        failedCount: 0,
        cancelledCount: 0,
        totalCount: 0,
        status: 'unknown',
        error: error.message,
      };
    }
  }

  /**
   * Get OCR processing failures
   * Returns count of OCR failures in last hour
   * 
   * @private
   * @returns {Promise<Object>} OCR failures data
   */
  async getOCRFailures() {
    try {
      const result = await this.prisma.$queryRaw`
        SELECT * FROM get_ocr_failures_count(1)
      `;

      const data = result[0] || { failed_count: 0, total_processed: 0, failure_rate: 0 };
      const failedCount = Number(data.failed_count);
      const failureRate = Number(data.failure_rate);

      return {
        failedCount,
        totalProcessed: Number(data.total_processed),
        failureRate,
        status: failedCount > 20 ? 'critical' : failedCount > 5 ? 'warning' : 'normal',
      };
    } catch (error) {
      logger.error('Failed to get OCR failures', {
        error: error.message,
      });

      return {
        failedCount: 0,
        totalProcessed: 0,
        failureRate: 0,
        status: 'unknown',
        error: error.message,
      };
    }
  }

  /**
   * Measure database response time
   * 
   * @private
   * @returns {Promise<number|null>} Response time in ms or null if failed
   */
  async measureDatabaseResponseTime() {
    const startTime = Date.now();

    try {
      await this.prisma.$queryRaw`SELECT 1 as health_check`;
      return Date.now() - startTime;
    } catch (error) {
      logger.error('Database response time measurement failed', {
        error: error.message,
      });
      return null;
    }
  }

  /**
   * Measure Redis response time
   * 
   * @private
   * @returns {Promise<number|null>} Response time in ms or null if failed
   */
  async measureRedisResponseTime() {
    if (!this.redis) {
      return null;
    }

    const startTime = Date.now();

    try {
      await this.redis.ping();
      return Date.now() - startTime;
    } catch (error) {
      logger.error('Redis response time measurement failed', {
        error: error.message,
      });
      return null;
    }
  }

  /**
   * Record metrics in database
   * Stores metrics for historical tracking and alerting
   * 
   * @private
   * @param {Object} metrics - Metrics to record
   */
  async recordMetricsInDatabase(metrics) {
    try {
      // Record individual metrics
      const promises = [];

      // Queue backlog
      if (metrics.queues.total !== undefined) {
        promises.push(
          this.prisma.$queryRaw`
            SELECT record_health_metric(
              'queue_backlog_total',
              ${metrics.queues.total}::DECIMAL,
              'count',
              ${JSON.stringify(metrics.queues.byQueue)}::jsonb
            )
          `
        );
      }

      // Webhook latency
      if (metrics.webhooks.avgLatencyMs !== undefined) {
        promises.push(
          this.prisma.$queryRaw`
            SELECT record_health_metric(
              'webhook_latency_ms',
              ${metrics.webhooks.avgLatencyMs}::DECIMAL,
              'milliseconds',
              ${JSON.stringify(metrics.webhooks.bySource)}::jsonb
            )
          `
        );
      }

      // Failed orders
      if (metrics.orders.totalCount !== undefined) {
        promises.push(
          this.prisma.$queryRaw`
            SELECT record_health_metric(
              'failed_orders_per_hour',
              ${metrics.orders.totalCount}::DECIMAL,
              'count',
              ${JSON.stringify({ failed: metrics.orders.failedCount, cancelled: metrics.orders.cancelledCount })}::jsonb
            )
          `
        );
      }

      // OCR failures
      if (metrics.ocr.failedCount !== undefined) {
        promises.push(
          this.prisma.$queryRaw`
            SELECT record_health_metric(
              'ocr_failures_per_hour',
              ${metrics.ocr.failedCount}::DECIMAL,
              'count',
              ${JSON.stringify({ total: metrics.ocr.totalProcessed, rate: metrics.ocr.failureRate })}::jsonb
            )
          `
        );
      }

      // Database response time
      if (metrics.database.responseTimeMs !== null) {
        promises.push(
          this.prisma.$queryRaw`
            SELECT record_health_metric(
              'database_response_time_ms',
              ${metrics.database.responseTimeMs}::DECIMAL,
              'milliseconds',
              '{}'::jsonb
            )
          `
        );
      }

      // Redis response time
      if (metrics.redis.responseTimeMs !== null) {
        promises.push(
          this.prisma.$queryRaw`
            SELECT record_health_metric(
              'redis_response_time_ms',
              ${metrics.redis.responseTimeMs}::DECIMAL,
              'milliseconds',
              '{}'::jsonb
            )
          `
        );
      }

      await Promise.all(promises);

      // Create system health snapshot
      await this.prisma.$queryRaw`
        SELECT create_system_health_snapshot(
          ${metrics.database.status}::BOOLEAN,
          ${metrics.database.responseTimeMs}::INTEGER,
          ${metrics.redis.status}::BOOLEAN,
          ${metrics.redis.responseTimeMs}::INTEGER,
          ${metrics.queues.total}::INTEGER,
          ${JSON.stringify(metrics.queues.byQueue)}::jsonb,
          ${metrics.webhooks.avgLatencyMs}::DECIMAL,
          ${metrics.orders.totalCount}::INTEGER,
          ${metrics.ocr.failedCount}::INTEGER
        )
      `;

      logger.debug('Metrics recorded in database');
    } catch (error) {
      logger.error('Failed to record metrics in database', {
        error: error.message,
        stack: error.stack,
      });
      // Don't throw - recording failure shouldn't break health check
    }
  }

  /**
   * Get active alerts
   * Returns current health alerts
   * 
   * @returns {Promise<Array>} Active alerts
   */
  async getActiveAlerts() {
    try {
      const alerts = await this.prisma.$queryRaw`
        SELECT * FROM active_health_alerts
        LIMIT 50
      `;

      return alerts;
    } catch (error) {
      logger.error('Failed to get active alerts', {
        error: error.message,
      });

      return [];
    }
  }

  /**
   * Get latest system health snapshot
   * 
   * @returns {Promise<Object|null>} Latest snapshot
   */
  async getLatestSnapshot() {
    try {
      const result = await this.prisma.$queryRaw`
        SELECT * FROM latest_system_health
      `;

      return result[0] || null;
    } catch (error) {
      logger.error('Failed to get latest snapshot', {
        error: error.message,
      });

      return null;
    }
  }

  /**
   * Resolve health alert
   * 
   * @param {string} alertId - Alert ID to resolve
   */
  async resolveAlert(alertId) {
    try {
      await this.prisma.$executeRaw`
        UPDATE health_alerts
        SET resolved = true,
            resolved_at = NOW(),
            updated_at = NOW()
        WHERE id = ${alertId}::uuid
      `;

      logger.info('Health alert resolved', { alertId });
    } catch (error) {
      logger.error('Failed to resolve alert', {
        alertId,
        error: error.message,
      });

      throw error;
    }
  }
}

module.exports = HealthService;
