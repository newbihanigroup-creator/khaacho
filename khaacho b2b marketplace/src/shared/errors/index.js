const AppError = require('./AppError');

/**
 * Validation Error (400)
 */
class ValidationError extends AppError {
  constructor(message, details = {}) {
    super(message, 400, 'VALIDATION_ERROR', details);
  }
}

/**
 * Not Found Error (404)
 */
class NotFoundError extends AppError {
  constructor(resource, identifier) {
    super(
      `${resource} not found${identifier ? `: ${identifier}` : ''}`,
      404,
      'NOT_FOUND',
      { resource, identifier }
    );
  }
}

/**
 * Unauthorized Error (401)
 */
class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

/**
 * Forbidden Error (403)
 */
class ForbiddenError extends AppError {
  constructor(message = 'Access forbidden') {
    super(message, 403, 'FORBIDDEN');
  }
}

/**
 * Conflict Error (409)
 */
class ConflictError extends AppError {
  constructor(message, details = {}) {
    super(message, 409, 'CONFLICT', details);
  }
}

/**
 * Business Logic Error (422)
 */
class BusinessLogicError extends AppError {
  constructor(message, details = {}) {
    super(message, 422, 'BUSINESS_LOGIC_ERROR', details);
  }
}

/**
 * External Service Error (502)
 */
class ExternalServiceError extends AppError {
  constructor(service, message, details = {}) {
    super(
      `External service error: ${service} - ${message}`,
      502,
      'EXTERNAL_SERVICE_ERROR',
      { service, ...details }
    );
  }
}

/**
 * Database Error (500)
 */
class DatabaseError extends AppError {
  constructor(message, details = {}) {
    super(message, 500, 'DATABASE_ERROR', details);
  }
}

module.exports = {
  AppError,
  ValidationError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError,
  ConflictError,
  BusinessLogicError,
  ExternalServiceError,
  DatabaseError,
};
