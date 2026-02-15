const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const path = require('path');
const { AsyncLocalStorage } = require('async_hooks');

/**
 * Standardized Production Logger
 * 
 * Features:
 * - Structured logging with consistent context
 * - Request ID tracking across async operations
 * - Searchable fields: orderId, queueName, environment
 * - Separate log files by category
 * - Stack traces for all errors
 * - JSON format for log aggregation tools
 */

// Async context storage for request tracking
const asyncLocalStorage = new AsyncLocalStorage();

// Get environment
const environment = process.env.NODE_ENV || 'development';
const isProduction = environment === 'production';

/**
 * Custom format to add standard context to all logs
 */
const addStandardContext = winston.format((info) => {
  // Get context from async storage
  const store = asyncLocalStorage.getStore();
  
  // Add standard fields
  info.environment = environment;
  info.timestamp = new Date().toISOString();
  info.hostname = process.env.HOSTNAME || 'unknown';
  info.pid = process.pid;
  
  // Add request context if available
  if (store) {
    if (store.requestId) info.requestId = store.requestId;
    if (store.orderId) info.orderId = store.orderId;
    if (store.queueName) info.queueName = store.queueName;
    if (store.jobId) info.jobId = store.jobId;
    if (store.userId) info.userId = store.userId;
    if (store.retailerId) info.retailerId = store.retailerId;
    if (store.vendorId) info.vendorId = store.vendorId;
  }
  
  // Ensure stack trace is included for errors
  if (info.level === 'error' && info.error) {
    if (info.error.stack) {
      info.stack = info.error.stack;
    }
    if (info.error.message) {
      info.errorMessage = info.error.message;
    }
    if (info.error.code) {
      info.errorCode = info.error.code;
    }
  }
  
  return info;
});

// JSON format for file logs
const jsonFormat = winston.format.combine(
  addStandardContext(),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// Console format (human-readable for development)
const consoleFormat = winston.format.combine(
  addStandardContext(),
  winston.format.colorize(),
  winston.format.printf(({ timestamp, level, message, requestId, orderId, queueName, ...meta }) => {
    let msg = `${timestamp} [${level}]`;
    
    // Add context identifiers
    if (requestId) msg += ` [req:${requestId.substring(0, 8)}]`;
    if (orderId) msg += ` [order:${orderId.substring(0, 8)}]`;
    if (queueName) msg += ` [queue:${queueName}]`;
    
    msg += `: ${message}`;
    
    // Add metadata
    const metaKeys = Object.keys(meta).filter(k => 
      !['environment', 'hostname', 'pid', 'service', 'timestamp', 'level'].includes(k)
    );
    if (metaKeys.length > 0) {
      const cleanMeta = {};
      metaKeys.forEach(k => cleanMeta[k] = meta[k]);
      msg += ` ${JSON.stringify(cleanMeta)}`;
    }
    
    return msg;
  })
);

// Create base logger
const baseLogger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: jsonFormat,
  defaultMeta: { 
    service: 'khaacho-api',
    version: process.env.npm_package_version || '1.0.0',
  },
  transports: [
    // Console transport (human-readable in dev, JSON in prod)
    new winston.transports.Console({
      format: isProduction ? jsonFormat : consoleFormat,
    }),

    // Error log file
    new DailyRotateFile({
      filename: path.join('logs', 'error-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      level: 'error',
      maxFiles: '30d',
      maxSize: '50m',
      format: jsonFormat,
    }),

    // Combined log file
    new DailyRotateFile({
      filename: path.join('logs', 'combined-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxFiles: '30d',
      maxSize: '50m',
      format: jsonFormat,
    }),

    // Orders log file (searchable for failed orders)
    new DailyRotateFile({
      filename: path.join('logs', 'orders-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxFiles: '30d',
      maxSize: '50m',
      format: jsonFormat,
      level: 'info',
    }),

    // WhatsApp log file (searchable for failed messages)
    new DailyRotateFile({
      filename: path.join('logs', 'whatsapp-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxFiles: '30d',
      maxSize: '50m',
      format: jsonFormat,
      level: 'info',
    }),

    // Rejections log file
    new DailyRotateFile({
      filename: path.join('logs', 'rejections-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxFiles: '30d',
      maxSize: '50m',
      format: jsonFormat,
      level: 'warn',
    }),

    // Exceptions log file
    new DailyRotateFile({
      filename: path.join('logs', 'exceptions-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxFiles: '30d',
      maxSize: '50m',
      format: jsonFormat,
    }),
  ],
  // Handle uncaught exceptions and rejections
  exceptionHandlers: [
    new winston.transports.File({ 
      filename: path.join('logs', 'exceptions.log'),
      format: jsonFormat,
    }),
  ],
  rejectionHandlers: [
    new winston.transports.File({ 
      filename: path.join('logs', 'rejections.log'),
      format: jsonFormat,
    }),
  ],
});

/**
 * Enhanced Logger with Context Management
 */
class Logger {
  constructor() {
    this.winston = baseLogger;
    this.asyncLocalStorage = asyncLocalStorage;
  }

  /**
   * Set context for current async operation
   */
  setContext(context) {
    const store = this.asyncLocalStorage.getStore() || {};
    Object.assign(store, context);
  }

  /**
   * Run function with context
   */
  runWithContext(context, fn) {
    return this.asyncLocalStorage.run(context, fn);
  }

  /**
   * Get current context
   */
  getContext() {
    return this.asyncLocalStorage.getStore() || {};
  }

  /**
   * Log info level
   */
  info(message, meta = {}) {
    this.winston.info(message, this._enrichMeta(meta));
  }

  /**
   * Log warn level
   */
  warn(message, meta = {}) {
    this.winston.warn(message, this._enrichMeta(meta));
  }

  /**
   * Log error level with stack trace
   */
  error(message, meta = {}) {
    const enrichedMeta = this._enrichMeta(meta);
    
    // Ensure error object is properly logged
    if (meta.error instanceof Error) {
      enrichedMeta.error = {
        message: meta.error.message,
        stack: meta.error.stack,
        code: meta.error.code,
        name: meta.error.name,
      };
    }
    
    // Ensure stack trace is captured
    if (!enrichedMeta.stack && meta.stack) {
      enrichedMeta.stack = meta.stack;
    }
    
    this.winston.error(message, enrichedMeta);
  }

  /**
   * Log debug level
   */
  debug(message, meta = {}) {
    this.winston.debug(message, this._enrichMeta(meta));
  }

  /**
   * Enrich metadata with context
   */
  _enrichMeta(meta) {
    const context = this.getContext();
    return { ...context, ...meta };
  }

  /**
   * Log order event (searchable)
   */
  logOrder(message, meta = {}) {
    this.info(message, {
      ...meta,
      category: 'order',
      searchable: 'order',
    });
  }

  /**
   * Log failed order (searchable)
   */
  logOrderFailure(message, meta = {}) {
    this.error(message, {
      ...meta,
      category: 'order',
      searchable: 'order_failure',
      failureType: 'order',
    });
  }

  /**
   * Log WhatsApp event (searchable)
   */
  logWhatsApp(message, meta = {}) {
    this.info(message, {
      ...meta,
      category: 'whatsapp',
      searchable: 'whatsapp',
    });
  }

  /**
   * Log failed WhatsApp message (searchable)
   */
  logWhatsAppFailure(message, meta = {}) {
    this.error(message, {
      ...meta,
      category: 'whatsapp',
      searchable: 'whatsapp_failure',
      failureType: 'whatsapp',
    });
  }

  /**
   * Log OCR event (searchable)
   */
  logOCR(message, meta = {}) {
    this.info(message, {
      ...meta,
      category: 'ocr',
      searchable: 'ocr',
    });
  }

  /**
   * Log OCR failure (searchable)
   */
  logOCRFailure(message, meta = {}) {
    this.error(message, {
      ...meta,
      category: 'ocr',
      searchable: 'ocr_failure',
      failureType: 'ocr',
    });
  }

  /**
   * Log queue job event
   */
  logQueueJob(message, meta = {}) {
    this.info(message, {
      ...meta,
      category: 'queue',
      searchable: 'queue_job',
    });
  }

  /**
   * Log queue job failure
   */
  logQueueJobFailure(message, meta = {}) {
    this.error(message, {
      ...meta,
      category: 'queue',
      searchable: 'queue_failure',
      failureType: 'queue',
    });
  }

  /**
   * Log HTTP request
   */
  logRequest(req, message = 'Request received') {
    const requestId = req.id || req.headers['x-request-id'] || this._generateId();
    
    // Set context for this request
    this.setContext({
      requestId,
      userId: req.user?.id,
      retailerId: req.user?.retailerId,
      vendorId: req.user?.vendorId,
    });
    
    this.info(message, {
      method: req.method,
      path: req.path,
      ip: req.ip,
      userAgent: req.get('user-agent'),
      category: 'http',
    });
    
    return requestId;
  }

  /**
   * Log HTTP response
   */
  logResponse(req, res, duration) {
    this.info('Request completed', {
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      category: 'http',
    });
  }

  /**
   * Generate unique ID
   */
  _generateId() {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
  }
}

// Export singleton instance
const logger = new Logger();

module.exports = logger;
