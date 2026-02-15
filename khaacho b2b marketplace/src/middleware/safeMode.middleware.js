/**
 * Safe Mode Middleware
 * 
 * Checks if safe mode is enabled and queues orders instead of processing them
 */

const safeModeService = require('../services/safeMode.service');
const logger = require('../shared/logger');

/**
 * Check safe mode for order creation
 * If enabled, queue the order and return special response
 */
async function checkSafeMode(req, res, next) {
  try {
    const isEnabled = await safeModeService.isEnabled();

    if (!isEnabled) {
      // Safe mode disabled, continue normal processing
      return next();
    }

    // Safe mode is enabled - queue the order
    logger.warn('Safe mode active - queuing order', {
      path: req.path,
      method: req.method,
      retailerId: req.user?.retailerId,
    });

    // Store safe mode flag in request for controller to handle
    req.safeModeEnabled = true;

    // Continue to controller which will handle queuing
    return next();
  } catch (error) {
    logger.error('Safe mode check failed', {
      error: error.message,
      stack: error.stack,
    });

    // Fail safe: continue normal processing if check fails
    return next();
  }
}

/**
 * Check safe mode for API endpoints
 * Returns 503 Service Unavailable if safe mode is enabled
 */
async function blockIfSafeMode(req, res, next) {
  try {
    const isEnabled = await safeModeService.isEnabled();

    if (!isEnabled) {
      return next();
    }

    // Safe mode is enabled - block request
    logger.warn('Safe mode active - blocking API request', {
      path: req.path,
      method: req.method,
    });

    const status = await safeModeService.getStatus();
    const message = status?.custom_message || 
      'System is currently in maintenance mode. Please try again later.';

    return res.status(503).json({
      success: false,
      error: 'SERVICE_UNAVAILABLE',
      message,
      safeModeEnabled: true,
      estimatedResumeTime: status?.auto_disable_at || null,
    });
  } catch (error) {
    logger.error('Safe mode check failed', {
      error: error.message,
    });

    // Fail safe: continue normal processing if check fails
    return next();
  }
}

module.exports = {
  checkSafeMode,
  blockIfSafeMode,
};
