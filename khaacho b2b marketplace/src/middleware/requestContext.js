const logger = require('../shared/logger');
const { v4: uuidv4 } = require('crypto').randomUUID ? require('crypto') : require('uuid');

/**
 * Request Context Middleware
 * Automatically sets logging context for each request
 */

function requestContextMiddleware(req, res, next) {
  // Generate or use existing request ID
  const requestId = req.headers['x-request-id'] || 
                   req.id || 
                   (typeof uuidv4 === 'function' ? uuidv4() : `${Date.now()}-${Math.random().toString(36).substring(2)}`);
  
  // Set request ID in header for response
  res.setHeader('X-Request-ID', requestId);
  
  // Build context
  const context = {
    requestId,
    method: req.method,
    path: req.path,
    ip: req.ip || req.connection.remoteAddress,
  };
  
  // Add user context if authenticated
  if (req.user) {
    context.userId = req.user.id;
    if (req.user.retailerId) context.retailerId = req.user.retailerId;
    if (req.user.vendorId) context.vendorId = req.user.vendorId;
    if (req.user.role) context.userRole = req.user.role;
  }
  
  // Add order ID from params or body
  if (req.params.orderId) {
    context.orderId = req.params.orderId;
  } else if (req.body && req.body.orderId) {
    context.orderId = req.body.orderId;
  }
  
  // Run request with context
  logger.runWithContext(context, () => {
    // Log request
    logger.info('HTTP request received', {
      method: req.method,
      path: req.path,
      query: req.query,
      userAgent: req.get('user-agent'),
    });
    
    // Track response time
    const startTime = Date.now();
    
    // Log response when finished
    res.on('finish', () => {
      const duration = Date.now() - startTime;
      
      const logLevel = res.statusCode >= 500 ? 'error' : 
                      res.statusCode >= 400 ? 'warn' : 'info';
      
      logger[logLevel]('HTTP request completed', {
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        duration,
      });
    });
    
    next();
  });
}

module.exports = requestContextMiddleware;
