const express = require('express');

/**
 * Health Routes
 * Public endpoints for health and readiness checks with production metrics
 * 
 * @param {Object} healthController - Health controller instance
 * @returns {express.Router} Express router
 */
function createHealthRoutes(healthController) {
  const router = express.Router();

  /**
   * GET /health
   * Basic health check - always returns quickly
   */
  router.get('/health', healthController.getHealth);

  /**
   * GET /ready
   * Comprehensive readiness check
   * Checks database, Redis, environment variables
   */
  router.get('/ready', healthController.getReadiness);

  /**
   * GET /health/metrics
   * Production metrics endpoint
   * Returns comprehensive system metrics:
   * - Database connection status and response time
   * - Queue backlog size by queue
   * - WhatsApp webhook latency
   * - Failed orders per hour
   * - OCR processing failures
   */
  router.get('/health/metrics', healthController.getMetrics);

  /**
   * GET /health/alerts
   * Active health alerts
   * Returns current alerts that need attention
   */
  router.get('/health/alerts', healthController.getAlerts);

  /**
   * GET /health/snapshot
   * Latest system health snapshot
   * Returns most recent complete health snapshot with overall health score
   */
  router.get('/health/snapshot', healthController.getSnapshot);

  /**
   * POST /health/alerts/:alertId/resolve
   * Resolve a health alert
   * Marks an alert as resolved (requires admin authentication in production)
   */
  router.post('/health/alerts/:alertId/resolve', healthController.resolveAlert);

  return router;
}

module.exports = createHealthRoutes;
