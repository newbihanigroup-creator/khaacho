const ApiResponse = require('../../shared/utils/ApiResponse');
const asyncHandler = require('../../shared/utils/asyncHandler');

/**
 * Health Controller
 * Handles health and readiness check endpoints with production metrics
 * NO business logic - only request/response handling
 */
class HealthController {
  constructor(healthService) {
    this.healthService = healthService;
  }

  /**
   * GET /health
   * Basic health check - server is running
   * Returns immediately without blocking
   */
  getHealth = asyncHandler(async (req, res) => {
    const health = this.healthService.getHealth();
    return ApiResponse.success(res, health);
  });

  /**
   * GET /ready
   * Comprehensive readiness check
   * Checks database, Redis, and environment
   */
  getReadiness = asyncHandler(async (req, res) => {
    const readiness = await this.healthService.getReadiness();
    
    // Return 503 if not ready, 200 if ready
    const statusCode = readiness.status === 'ready' ? 200 : 503;
    
    return res.status(statusCode).json({
      success: readiness.status === 'ready',
      data: readiness,
    });
  });

  /**
   * GET /health/metrics
   * Production metrics endpoint
   * Returns comprehensive system metrics
   */
  getMetrics = asyncHandler(async (req, res) => {
    const metrics = await this.healthService.getMetrics();
    return ApiResponse.success(res, metrics);
  });

  /**
   * GET /health/alerts
   * Active health alerts
   * Returns current alerts that need attention
   */
  getAlerts = asyncHandler(async (req, res) => {
    const alerts = await this.healthService.getActiveAlerts();
    return ApiResponse.success(res, {
      alerts,
      count: alerts.length,
    });
  });

  /**
   * GET /health/snapshot
   * Latest system health snapshot
   * Returns most recent complete health snapshot
   */
  getSnapshot = asyncHandler(async (req, res) => {
    const snapshot = await this.healthService.getLatestSnapshot();
    
    if (!snapshot) {
      return ApiResponse.success(res, {
        message: 'No snapshot available yet',
        snapshot: null,
      });
    }

    return ApiResponse.success(res, snapshot);
  });

  /**
   * POST /health/alerts/:alertId/resolve
   * Resolve a health alert
   * Marks an alert as resolved
   */
  resolveAlert = asyncHandler(async (req, res) => {
    const { alertId } = req.params;
    
    await this.healthService.resolveAlert(alertId);
    
    return ApiResponse.success(res, {
      message: 'Alert resolved successfully',
      alertId,
    });
  });
}

module.exports = HealthController;
