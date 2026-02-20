const prisma = require('../config/database');
const { ValidationError } = require('../utils/errors');
const logger = require('../utils/logger');

class IdempotencyService {
  async checkOrCreateKey(idempotencyKey, userId) {
    if (!idempotencyKey) {
      throw new ValidationError('Idempotency key is required');
    }

    // Check if key already exists
    const existingKey = await prisma.idempotencyKey.findUnique({
      where: { key: idempotencyKey },
    });

    if (existingKey) {
      if (existingKey.status === 'completed') {
        logger.info('Idempotency key found, returning cached response', {
          key: idempotencyKey,
          userId,
          status: existingKey.status
        });
        return {
          exists: true,
          status: existingKey.status,
          response: existingKey.response,
        };
      } else if (existingKey.status === 'processing') {
        logger.warn('Idempotency key is still processing', {
          key: idempotencyKey,
          userId,
          status: existingKey.status
        });
        throw new ValidationError('Request is already being processed');
      } else {
        // Failed status, allow retry
        logger.info('Idempotency key found with failed status, allowing retry', {
          key: idempotencyKey,
          userId,
          status: existingKey.status
        });
        await prisma.idempotencyKey.update({
          where: { key: idempotencyKey },
          data: { status: 'processing', response: null },
        });
        return { exists: false, status: 'processing' };
      }
    }

    // Create new idempotency key
    await prisma.idempotencyKey.create({
      data: {
        key: idempotencyKey,
        userId,
        status: 'processing',
      },
    });

    logger.info('Created new idempotency key', {
      key: idempotencyKey,
      userId,
      status: 'processing'
    });

    return { exists: false, status: 'processing' };
  }

  async markCompleted(idempotencyKey, response) {
    try {
      await prisma.idempotencyKey.update({
        where: { key: idempotencyKey },
        data: {
          status: 'completed',
          response: response,
        },
      });

      logger.info('Idempotency key marked as completed', {
        key: idempotencyKey,
        status: 'completed'
      });
    } catch (error) {
      logger.logError(error, {
        context: 'idempotency_mark_completed',
        key: idempotencyKey
      });
      // Don't throw error - this is not critical for the main operation
    }
  }

  async markFailed(idempotencyKey, error) {
    try {
      await prisma.idempotencyKey.update({
        where: { key: idempotencyKey },
        data: {
          status: 'failed',
          response: {
            error: error.message,
            stack: error.stack,
            code: error.code,
          },
        },
      });

      logger.info('Idempotency key marked as failed', {
        key: idempotencyKey,
        status: 'failed',
        error: error.message
      });
    } catch (updateError) {
      logger.logError(updateError, {
        context: 'idempotency_mark_failed',
        key: idempotencyKey
      });
      // Don't throw error - this is not critical for the main operation
    }
  }

  async cleanupOldKeys(daysOld = 7) {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysOld);

      const deletedKeys = await prisma.idempotencyKey.deleteMany({
        where: {
          createdAt: {
            lt: cutoffDate,
          },
          status: 'completed',
        },
      });

      logger.info('Cleaned up old idempotency keys', {
        deletedCount: deletedKeys.count,
        cutoffDate,
        daysOld
      });

      return deletedKeys.count;
    } catch (error) {
      logger.logError(error, {
        context: 'idempotency_cleanup',
        daysOld
      });
      throw error;
    }
  }

  async getKeyStatus(idempotencyKey) {
    const key = await prisma.idempotencyKey.findUnique({
      where: { key: idempotencyKey },
      select: {
        id: true,
        key: true,
        status: true,
        createdAt: true,
        response: true,
      },
    });

    if (!key) {
      throw new ValidationError('Idempotency key not found');
    }

    return key;
  }
}

module.exports = new IdempotencyService();
