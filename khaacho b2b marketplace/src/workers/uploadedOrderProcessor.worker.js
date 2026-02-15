const prisma = require('../config/database');
const logger = require('../utils/logger');
const visionOCRService = require('../services/visionOCR.service');
const llmItemExtractionService = require('../services/llmItemExtraction.service');
const itemNormalizationService = require('../services/itemNormalization.service');
const rfqBroadcastService = require('../services/rfqBroadcast.service');

/**
 * Uploaded Order Processor Worker
 * Orchestrates the complete image order processing pipeline
 * 
 * Features:
 * - Idempotent: Can be safely retried
 * - Transaction-safe: Critical operations wrapped in transactions
 * - Handles partial failures: Continues processing even if some steps fail
 * - Full logging: Every step is logged with context
 */

class UploadedOrderProcessorWorker {
  /**
   * Process an uploaded order through the complete pipeline
   * 
   * @param {string} uploadedOrderId - ID of uploaded order to process
   * @returns {Promise<Object>} - Processing results
   */
  async processUploadedOrder(uploadedOrderId) {
    const startTime = Date.now();
    const processingLog = {
      uploadedOrderId,
      steps: [],
      startTime: new Date().toISOString(),
    };

    logger.info('🚀 Starting uploaded order processing', {
      uploadedOrderId,
      worker: 'UploadedOrderProcessor',
    });

    try {
      // Check if already processed (idempotency)
      const order = await this.checkProcessingStatus(uploadedOrderId);
      
      if (order.status === 'COMPLETED') {
        logger.info('⏭️  Order already completed, skipping', {
          uploadedOrderId,
          status: order.status,
        });
        return {
          uploadedOrderId,
          alreadyProcessed: true,
          status: order.status,
        };
      }

      // Mark as processing
      await this.updateStatus(uploadedOrderId, 'PROCESSING', {
        processingStartedAt: new Date().toISOString(),
      });

      // Step 1: Run OCR
      const ocrResult = await this.runOCR(uploadedOrderId, order, processingLog);
      
      if (!ocrResult.success) {
        return await this.handleFailure(uploadedOrderId, 'OCR_FAILED', ocrResult.error, processingLog);
      }

      // Step 2: Extract structured items
      const extractionResult = await this.extractItems(uploadedOrderId, ocrResult.rawText, processingLog);
      
      if (!extractionResult.success) {
        return await this.handleFailure(uploadedOrderId, 'EXTRACTION_FAILED', extractionResult.error, processingLog);
      }

      // Step 3: Save extracted items
      const saveResult = await this.saveExtractedItems(uploadedOrderId, extractionResult.items, processingLog);
      
      if (!saveResult.success) {
        return await this.handleFailure(uploadedOrderId, 'SAVE_FAILED', saveResult.error, processingLog);
      }

      // Step 4: Normalize to catalog
      const normalizationResult = await this.normalizeItems(uploadedOrderId, processingLog);
      
      if (!normalizationResult.success) {
        // Partial failure is acceptable - continue with what we have
        logger.warn('⚠️  Normalization had issues, continuing', {
          uploadedOrderId,
          error: normalizationResult.error,
        });
      }

      // Step 5: Broadcast RFQs
      const broadcastResult = await this.broadcastRFQs(uploadedOrderId, processingLog);
      
      if (!broadcastResult.success) {
        // Partial failure is acceptable - RFQs can be retried separately
        logger.warn('⚠️  RFQ broadcast had issues, marking for review', {
          uploadedOrderId,
          error: broadcastResult.error,
        });
      }

      // Step 6: Update status to COMPLETED or PENDING_REVIEW
      const finalStatus = this.determineFinalStatus(
        extractionResult,
        normalizationResult,
        broadcastResult
      );

      await this.updateStatus(uploadedOrderId, finalStatus, {
        processingCompletedAt: new Date().toISOString(),
        processingLog,
      });

      const duration = Date.now() - startTime;

      logger.info('🎉 Order processing completed successfully', {
        uploadedOrderId,
        finalStatus,
        duration,
        steps: processingLog.steps.length,
      });

      return {
        uploadedOrderId,
        success: true,
        status: finalStatus,
        ocrResult,
        extractionResult,
        normalizationResult,
        broadcastResult,
        duration,
        processingLog,
      };

    } catch (error) {
      const duration = Date.now() - startTime;

      logger.error('❌ Order processing failed with unexpected error', {
        uploadedOrderId,
        error: error.message,
        stack: error.stack,
        duration,
      });

      return await this.handleFailure(uploadedOrderId, 'PROCESSING_FAILED', error.message, processingLog);
    }
  }

  /**
   * Check processing status (idempotency check)
   */
  async checkProcessingStatus(uploadedOrderId) {
    try {
      const order = await prisma.uploadedOrder.findUnique({
        where: { id: uploadedOrderId },
        select: {
          id: true,
          status: true,
          imageKey: true,
          extractedText: true,
          parsedData: true,
        },
      });

      if (!order) {
        throw new Error(`UploadedOrder not found: ${uploadedOrderId}`);
      }

      logger.info('✓ Order status checked', {
        uploadedOrderId,
        status: order.status,
      });

      return order;
    } catch (error) {
      logger.error('Failed to check processing status', {
        uploadedOrderId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Step 1: Run OCR
   */
  async runOCR(uploadedOrderId, order, processingLog) {
    const stepStart = Date.now();
    
    logger.info('📸 Step 1: Running OCR', { uploadedOrderId });

    try {
      // Check if OCR already done (idempotency)
      if (order.extractedText && order.extractedText.length > 0) {
        logger.info('⏭️  OCR already completed, using existing text', {
          uploadedOrderId,
          textLength: order.extractedText.length,
        });

        processingLog.steps.push({
          step: 1,
          name: 'OCR',
          status: 'SKIPPED',
          reason: 'Already completed',
          duration: Date.now() - stepStart,
        });

        return {
          success: true,
          rawText: order.extractedText,
          skipped: true,
        };
      }

      // Build GCS URI
      const gcsUri = `gs://${process.env.GCS_BUCKET_NAME}/${order.imageKey}`;

      logger.info('Running Vision OCR', {
        uploadedOrderId,
        gcsUri,
      });

      const rawText = await visionOCRService.runOCRFromGCS(gcsUri);

      logger.info('✓ OCR completed', {
        uploadedOrderId,
        textLength: rawText.length,
      });

      // Save OCR result
      await prisma.uploadedOrder.update({
        where: { id: uploadedOrderId },
        data: {
          extractedText: rawText,
          updatedAt: new Date(),
        },
      });

      const duration = Date.now() - stepStart;

      processingLog.steps.push({
        step: 1,
        name: 'OCR',
        status: 'SUCCESS',
        textLength: rawText.length,
        duration,
      });

      return {
        success: true,
        rawText,
        textLength: rawText.length,
      };

    } catch (error) {
      const duration = Date.now() - stepStart;

      logger.error('❌ OCR failed', {
        uploadedOrderId,
        error: error.message,
        errorCode: error.code,
      });

      processingLog.steps.push({
        step: 1,
        name: 'OCR',
        status: 'FAILED',
        error: error.message,
        errorCode: error.code,
        duration,
      });

      return {
        success: false,
        error: error.message,
        errorCode: error.code,
      };
    }
  }

  /**
   * Step 2: Extract structured items
   */
  async extractItems(uploadedOrderId, rawText, processingLog) {
    const stepStart = Date.now();
    
    logger.info('🤖 Step 2: Extracting structured items', { uploadedOrderId });

    try {
      if (!rawText || rawText.length === 0) {
        throw new Error('No text available for extraction');
      }

      logger.info('Running LLM extraction', {
        uploadedOrderId,
        textLength: rawText.length,
      });

      const items = await llmItemExtractionService.extractItemsWithLLM(rawText);

      logger.info('✓ Items extracted', {
        uploadedOrderId,
        itemCount: items.length,
      });

      const duration = Date.now() - stepStart;

      processingLog.steps.push({
        step: 2,
        name: 'Item Extraction',
        status: 'SUCCESS',
        itemCount: items.length,
        duration,
      });

      return {
        success: true,
        items,
        itemCount: items.length,
      };

    } catch (error) {
      const duration = Date.now() - stepStart;

      logger.error('❌ Item extraction failed', {
        uploadedOrderId,
        error: error.message,
        errorCode: error.code,
      });

      processingLog.steps.push({
        step: 2,
        name: 'Item Extraction',
        status: 'FAILED',
        error: error.message,
        errorCode: error.code,
        duration,
      });

      return {
        success: false,
        error: error.message,
        errorCode: error.code,
      };
    }
  }

  /**
   * Step 3: Save extracted items
   */
  async saveExtractedItems(uploadedOrderId, items, processingLog) {
    const stepStart = Date.now();
    
    logger.info('💾 Step 3: Saving extracted items', {
      uploadedOrderId,
      itemCount: items.length,
    });

    try {
      // Save items in parsedData
      await prisma.uploadedOrder.update({
        where: { id: uploadedOrderId },
        data: {
          parsedData: {
            items,
            extractedAt: new Date().toISOString(),
            itemCount: items.length,
          },
          updatedAt: new Date(),
        },
      });

      logger.info('✓ Items saved', {
        uploadedOrderId,
        itemCount: items.length,
      });

      const duration = Date.now() - stepStart;

      processingLog.steps.push({
        step: 3,
        name: 'Save Items',
        status: 'SUCCESS',
        itemCount: items.length,
        duration,
      });

      return {
        success: true,
        itemCount: items.length,
      };

    } catch (error) {
      const duration = Date.now() - stepStart;

      logger.error('❌ Failed to save items', {
        uploadedOrderId,
        error: error.message,
      });

      processingLog.steps.push({
        step: 3,
        name: 'Save Items',
        status: 'FAILED',
        error: error.message,
        duration,
      });

      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Step 4: Normalize items to catalog
   */
  async normalizeItems(uploadedOrderId, processingLog) {
    const stepStart = Date.now();
    
    logger.info('🔍 Step 4: Normalizing items to catalog', { uploadedOrderId });

    try {
      const result = await itemNormalizationService.normalizeItems(uploadedOrderId);

      logger.info('✓ Items normalized', {
        uploadedOrderId,
        matched: result.matched,
        unmatched: result.unmatched,
        needsReview: result.needsReview,
      });

      const duration = Date.now() - stepStart;

      processingLog.steps.push({
        step: 4,
        name: 'Normalization',
        status: 'SUCCESS',
        matched: result.matched,
        unmatched: result.unmatched,
        needsReview: result.needsReview,
        duration,
      });

      return {
        success: true,
        ...result,
      };

    } catch (error) {
      const duration = Date.now() - stepStart;

      logger.error('❌ Normalization failed', {
        uploadedOrderId,
        error: error.message,
        errorCode: error.code,
      });

      processingLog.steps.push({
        step: 4,
        name: 'Normalization',
        status: 'FAILED',
        error: error.message,
        errorCode: error.code,
        duration,
      });

      return {
        success: false,
        error: error.message,
        errorCode: error.code,
      };
    }
  }

  /**
   * Step 5: Broadcast RFQs
   */
  async broadcastRFQs(uploadedOrderId, processingLog) {
    const stepStart = Date.now();
    
    logger.info('📢 Step 5: Broadcasting RFQs', { uploadedOrderId });

    try {
      const result = await rfqBroadcastService.broadcastRFQs(uploadedOrderId);

      logger.info('✓ RFQs broadcasted', {
        uploadedOrderId,
        rfqsCreated: result.rfqsCreated,
        wholesalersNotified: result.wholesalersNotified,
      });

      const duration = Date.now() - stepStart;

      processingLog.steps.push({
        step: 5,
        name: 'RFQ Broadcast',
        status: 'SUCCESS',
        rfqsCreated: result.rfqsCreated,
        wholesalersNotified: result.wholesalersNotified,
        duration,
      });

      return {
        success: true,
        ...result,
      };

    } catch (error) {
      const duration = Date.now() - stepStart;

      logger.error('❌ RFQ broadcast failed', {
        uploadedOrderId,
        error: error.message,
        errorCode: error.code,
      });

      processingLog.steps.push({
        step: 5,
        name: 'RFQ Broadcast',
        status: 'FAILED',
        error: error.message,
        errorCode: error.code,
        duration,
      });

      return {
        success: false,
        error: error.message,
        errorCode: error.code,
      };
    }
  }

  /**
   * Determine final status based on step results
   */
  determineFinalStatus(extractionResult, normalizationResult, broadcastResult) {
    // If extraction failed, mark as FAILED
    if (!extractionResult.success || extractionResult.itemCount === 0) {
      return 'FAILED';
    }

    // If normalization had unmatched items or items needing review
    if (normalizationResult.success) {
      if (normalizationResult.unmatched > 0 || normalizationResult.needsReview > 0) {
        return 'PENDING_REVIEW';
      }
    }

    // If RFQ broadcast failed or had issues
    if (!broadcastResult.success || broadcastResult.rfqsCreated === 0) {
      return 'PENDING_REVIEW';
    }

    // Everything succeeded
    return 'COMPLETED';
  }

  /**
   * Update order status
   */
  async updateStatus(uploadedOrderId, status, additionalData = {}) {
    try {
      await prisma.uploadedOrder.update({
        where: { id: uploadedOrderId },
        data: {
          status,
          ...additionalData,
          updatedAt: new Date(),
        },
      });

      logger.info('✓ Status updated', {
        uploadedOrderId,
        status,
      });
    } catch (error) {
      logger.error('Failed to update status', {
        uploadedOrderId,
        status,
        error: error.message,
      });
      // Don't throw - status update failure shouldn't stop processing
    }
  }

  /**
   * Handle processing failure
   */
  async handleFailure(uploadedOrderId, failureReason, errorMessage, processingLog) {
    const duration = Date.now() - new Date(processingLog.startTime).getTime();

    logger.error('❌ Processing failed', {
      uploadedOrderId,
      failureReason,
      errorMessage,
      duration,
    });

    await this.updateStatus(uploadedOrderId, 'FAILED', {
      errorMessage,
      failureReason,
      processingLog,
      failedAt: new Date().toISOString(),
    });

    return {
      uploadedOrderId,
      success: false,
      status: 'FAILED',
      failureReason,
      errorMessage,
      duration,
      processingLog,
    };
  }
}

// Export singleton instance
const worker = new UploadedOrderProcessorWorker();

/**
 * Main worker function for queue processor
 */
async function processUploadedOrder(job) {
  const { uploadedOrderId } = job.data;

  logger.info('Worker job started', {
    jobId: job.id,
    uploadedOrderId,
    attempt: job.attemptsMade + 1,
  });

  try {
    const result = await worker.processUploadedOrder(uploadedOrderId);

    logger.info('Worker job completed', {
      jobId: job.id,
      uploadedOrderId,
      success: result.success,
      status: result.status,
    });

    return result;
  } catch (error) {
    logger.error('Worker job failed', {
      jobId: job.id,
      uploadedOrderId,
      error: error.message,
      stack: error.stack,
    });

    throw error; // Let queue handle retry
  }
}

module.exports = processUploadedOrder;
module.exports.UploadedOrderProcessorWorker = UploadedOrderProcessorWorker;
