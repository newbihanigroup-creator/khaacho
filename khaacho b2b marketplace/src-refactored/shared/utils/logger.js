const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');

// Define log format
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json()
);

// Console format (human-readable for development)
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    let msg = `${timestamp} [${level}]: ${message}`;
    if (Object.keys(meta).length > 0) {
      msg += ` ${JSON.stringify(meta)}`;
    }
    return msg;
  })
);

// Create transports
const transports = [];

// Console transport (always enabled)
transports.push(
  new winston.transports.Console({
    format: process.env.NODE_ENV === 'production' ? logFormat : consoleFormat,
    level: process.env.LOG_LEVEL || 'info',
  })
);

// File transports (production only)
if (process.env.NODE_ENV === 'production') {
  // Error logs
  transports.push(
    new DailyRotateFile({
      filename: 'logs/error-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      level: 'error',
      format: logFormat,
      maxSize: '20m',
      maxFiles: '30d',
      zippedArchive: true,
    })
  );
  
  // Combined logs
  transports.push(
    new DailyRotateFile({
      filename: 'logs/combined-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      format: logFormat,
      maxSize: '20m',
      maxFiles: '14d',
      zippedArchive: true,
    })
  );
}

// Create logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: logFormat,
  defaultMeta: {
    service: process.env.SERVICE_NAME || 'khaacho-api',
    environment: process.env.NODE_ENV || 'development',
  },
  transports,
  exitOnError: false,
});

// Add correlation ID support
logger.addCorrelationId = (correlationId) => {
  return logger.child({ correlationId });
};

// Helper methods
logger.logRequest = (req, res, duration) => {
  logger.info('HTTP Request', {
    method: req.method,
    path: req.path,
    status: res.statusCode,
    duration,
    ip: req.ip,
    userAgent: req.get('user-agent'),
    userId: req.user?.id,
  });
};

logger.logError = (error, context = {}) => {
  logger.error(error.message, {
    error: {
      name: error.name,
      message: error.message,
      stack: error.stack,
      code: error.code,
    },
    ...context,
  });
};

logger.logJob = (jobName, status, duration, metadata = {}) => {
  logger.info('Job processed', {
    jobName,
    status,
    duration,
    ...metadata,
  });
};

// Stream for Morgan (HTTP request logging)
logger.stream = {
  write: (message) => {
    logger.info(message.trim());
  },
};

module.exports = logger;
