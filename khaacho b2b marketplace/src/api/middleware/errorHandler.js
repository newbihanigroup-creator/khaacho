const logger = require('../../shared/logger');
const { AppError } = require('../../shared/errors');

/**
 * Centralized Error Handler Middleware
 * Handles all errors and sends appropriate responses
 * 
 * Features:
 * - Catches all async errors
 * - Logs stack traces to production logs
 * - Returns safe JSON responses
 * - Never exposes internal details to clients
 * - Handles Prisma, validation, and unknown errors
 */
const errorHandler = (err, req, res, next) => {
  // Log full error details (including stack trace) to logs
  logger.error('Error occurred', {
    error: err.message,
    stack: err.stack,
    code: err.code,
    name: err.name,
    path: req.path,
    method: req.method,
    body: req.body,
    query: req.query,
    params: req.params,
    userId: req.user?.id,
    ip: req.ip,
    userAgent: req.get('user-agent'),
  });

  // Handle operational errors (AppError instances)
  if (err.isOperational) {
    return res.status(err.statusCode).json({
      success: false,
      error: {
        message: err.message,
        code: err.code,
      },
    });
  }

  // Handle Prisma errors
  if (err.code && err.code.startsWith('P')) {
    return handlePrismaError(err, req, res);
  }

  // Handle validation errors (from express-validator or Joi)
  if (err.name === 'ValidationError' || err.isJoi) {
    return handleValidationError(err, res);
  }

  // Handle JWT errors
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      success: false,
      error: {
        message: 'Invalid authentication token',
        code: 'INVALID_TOKEN',
      },
    });
  }

  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({
      success: false,
      error: {
        message: 'Authentication token has expired',
        code: 'TOKEN_EXPIRED',
      },
    });
  }

  // Handle Multer errors (file upload)
  if (err.name === 'MulterError') {
    return handleMulterError(err, res);
  }

  // Handle syntax errors (malformed JSON)
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({
      success: false,
      error: {
        message: 'Invalid JSON in request body',
        code: 'INVALID_JSON',
      },
    });
  }

  // Handle unexpected errors (programming errors)
  // NEVER expose stack traces or internal details to clients
  logger.error('Unexpected error - this should be investigated', {
    error: err.message,
    stack: err.stack,
    name: err.name,
  });

  return res.status(500).json({
    success: false,
    error: {
      message: 'An unexpected error occurred',
      code: 'INTERNAL_ERROR',
    },
  });
};

/**
 * Handle Prisma-specific errors
 * Maps Prisma error codes to user-friendly messages
 * 
 * @param {Error} err - Prisma error
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
function handlePrismaError(err, req, res) {
  // Log Prisma error details for debugging
  logger.error('Prisma error', {
    code: err.code,
    meta: err.meta,
    message: err.message,
  });

  // Map Prisma error codes to user-friendly responses
  const prismaErrorMap = {
    // Unique constraint violation
    P2002: {
      status: 409,
      message: 'A record with this value already exists',
      code: 'DUPLICATE_ENTRY',
    },
    // Record not found
    P2025: {
      status: 404,
      message: 'The requested record was not found',
      code: 'NOT_FOUND',
    },
    // Foreign key constraint failed
    P2003: {
      status: 400,
      message: 'Invalid reference to related record',
      code: 'INVALID_REFERENCE',
    },
    // Invalid relation
    P2014: {
      status: 400,
      message: 'Invalid relationship between records',
      code: 'INVALID_RELATION',
    },
    // Required field missing
    P2011: {
      status: 400,
      message: 'Required field is missing',
      code: 'MISSING_FIELD',
    },
    // Value too long
    P2000: {
      status: 400,
      message: 'Value is too long for the field',
      code: 'VALUE_TOO_LONG',
    },
    // Record to update not found
    P2016: {
      status: 404,
      message: 'Record to update not found',
      code: 'NOT_FOUND',
    },
    // Record to delete not found
    P2018: {
      status: 404,
      message: 'Record to delete not found',
      code: 'NOT_FOUND',
    },
    // Connection error
    P1001: {
      status: 503,
      message: 'Database connection failed',
      code: 'DATABASE_UNAVAILABLE',
    },
    // Connection timeout
    P1008: {
      status: 503,
      message: 'Database connection timeout',
      code: 'DATABASE_TIMEOUT',
    },
    // Authentication failed
    P1002: {
      status: 503,
      message: 'Database authentication failed',
      code: 'DATABASE_AUTH_FAILED',
    },
  };

  const errorInfo = prismaErrorMap[err.code] || {
    status: 500,
    message: 'A database error occurred',
    code: 'DATABASE_ERROR',
  };

  return res.status(errorInfo.status).json({
    success: false,
    error: {
      message: errorInfo.message,
      code: errorInfo.code,
    },
  });
}

/**
 * Handle validation errors
 * Supports express-validator and Joi validation libraries
 * 
 * @param {Error} err - Validation error
 * @param {Object} res - Express response
 */
function handleValidationError(err, res) {
  let message = 'Validation failed';
  let details = {};

  // Handle express-validator errors
  if (err.array && typeof err.array === 'function') {
    const errors = err.array();
    message = 'Request validation failed';
    details = errors.reduce((acc, error) => {
      acc[error.param] = error.msg;
      return acc;
    }, {});
  }
  // Handle Joi validation errors
  else if (err.isJoi && err.details) {
    message = 'Request validation failed';
    details = err.details.reduce((acc, detail) => {
      const field = detail.path.join('.');
      acc[field] = detail.message;
      return acc;
    }, {});
  }
  // Handle generic validation errors
  else if (err.errors) {
    details = err.errors;
  }

  return res.status(400).json({
    success: false,
    error: {
      message,
      code: 'VALIDATION_ERROR',
    },
  });
}

/**
 * Handle Multer file upload errors
 * 
 * @param {Error} err - Multer error
 * @param {Object} res - Express response
 */
function handleMulterError(err, res) {
  const multerErrorMap = {
    LIMIT_FILE_SIZE: {
      message: 'File size exceeds the maximum allowed limit',
      code: 'FILE_TOO_LARGE',
    },
    LIMIT_FILE_COUNT: {
      message: 'Too many files uploaded',
      code: 'TOO_MANY_FILES',
    },
    LIMIT_UNEXPECTED_FILE: {
      message: 'Unexpected file field',
      code: 'UNEXPECTED_FILE',
    },
  };

  const errorInfo = multerErrorMap[err.code] || {
    message: 'File upload error',
    code: 'UPLOAD_ERROR',
  };

  return res.status(400).json({
    success: false,
    error: {
      message: errorInfo.message,
      code: errorInfo.code,
    },
  });
}

/**
 * 404 Not Found Handler
 * Handles requests to non-existent routes
 */
const notFoundHandler = (req, res) => {
  res.status(404).json({
    success: false,
    error: {
      message: `Route not found: ${req.method} ${req.path}`,
      code: 'ROUTE_NOT_FOUND',
    },
  });
};

/**
 * Async error wrapper (re-export for convenience)
 * Use this to wrap async route handlers
 */
const asyncHandler = require('../../shared/utils/asyncHandler');

module.exports = {
  errorHandler,
  notFoundHandler,
  asyncHandler,
};
