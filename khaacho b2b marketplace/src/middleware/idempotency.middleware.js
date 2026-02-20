const IdempotencyService = require('../services/idempotency.service');
const { ValidationError } = require('../utils/errors');
const logger = require('../utils/logger');

class IdempotencyMiddleware {
  static requireIdempotencyKey() {
    return (req, res, next) => {
      const idempotencyKey = req.headers['x-idempotency-key'];

      if (!idempotencyKey) {
        return res.status(400).json({
          success: false,
          message: 'Idempotency key is required',
          code: 'IDEMPOTENCY_KEY_REQUIRED'
        });
      }

      // Store the key on request object for later use
      req.idempotencyKey = idempotencyKey;
      next();
    };
  }

  static async checkKey() {
    return async (req, res, next) => {
      try {
        const idempotencyKey = req.idempotencyKey;
        
        if (!idempotencyKey) {
          return next();
        }

        const userId = req.user?.id;
        const keyStatus = await IdempotencyService.checkOrCreateKey(idempotencyKey, userId);

        if (keyStatus.exists && keyStatus.status === 'completed') {
          logger.info('Returning cached response for idempotency key', {
            key: idempotencyKey,
            userId,
            status: keyStatus.status
          });

          return res.status(200).json({
            success: true,
            message: 'Request already processed',
            data: keyStatus.response,
            idempotency: true
          });
        }

        if (keyStatus.exists && keyStatus.status === 'processing') {
          logger.warn('Request is still processing', {
            key: idempotencyKey,
            userId,
            status: keyStatus.status
          });

          return res.status(409).json({
            success: false,
            message: 'Request is already being processed',
            code: 'REQUEST_PROCESSING',
            idempotency: true
          });
        }

        // Store the key status for later use in controllers
        req.idempotencyKeyStatus = keyStatus;
        next();
      } catch (error) {
        logger.logError(error, {
          context: 'idempotency_middleware',
          key: req.idempotencyKey
        });

        return res.status(500).json({
          success: false,
          message: 'Internal server error',
          code: 'IDEMPOTENCY_ERROR'
        });
      }
    };
  }

  static async markCompleted() {
    return async (req, res, next) => {
      try {
        const idempotencyKey = req.idempotencyKey;
        const responseData = req.idempotencyResponse;

        if (idempotencyKey && responseData) {
          await IdempotencyService.markCompleted(idempotencyKey, responseData);
          
          logger.info('Marked idempotency key as completed', {
            key: idempotencyKey
          });
        }

        next();
      } catch (error) {
        logger.logError(error, {
          context: 'idempotency_mark_completed_middleware',
          key: req.idempotencyKey
        });

        // Don't fail the response - just log the error
        next();
      }
    };
  }

  static async markFailed() {
    return async (req, res, next) => {
      try {
        const idempotencyKey = req.idempotencyKey;
        const error = req.idempotencyError;

        if (idempotencyKey && error) {
          await IdempotencyService.markFailed(idempotencyKey, error);
          
          logger.info('Marked idempotency key as failed', {
            key: idempotencyKey,
            error: error.message
          });
        }

        next();
      } catch (middlewareError) {
        logger.logError(middlewareError, {
          context: 'idempotency_mark_failed_middleware',
          key: req.idempotencyKey
        });

        // Don't fail the response - just log the error
        next();
      }
    };
  }
}

module.exports = IdempotencyMiddleware;
