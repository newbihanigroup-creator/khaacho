const ocrPipelineService = require('../../services/ocrPipeline.service');
const logger = require('../../utils/logger');

/**
 * Image Processing Queue Processor
 * 
 * Complete OCR Pipeline:
 * 1. Download and resize image (cost optimization)
 * 2. OCR text extraction with retry (Google Vision)
 * 3. LLM item extraction with retry (OpenAI/Anthropic/Gemini)
 * 4. Item validation (credit limits, product matching)
 * 5. Store results with audit trail
 * 
 * Features:
 * - Image resizing before OCR (reduces API costs)
 * - Retry logic with exponential backoff (2 retries)
 * - Idempotent: Can be safely retried
 * - Transaction-safe: Critical operations wrapped in transactions
 * - Full logging: Every step is logged with context
 */

async function imageProcessingProcessor(job) {
  const { uploadedOrderId } = job.data;

  logger.info('Image processing job started', {
    jobId: job.id,
    uploadedOrderId,
  });

  try {
    // Run complete OCR pipeline
    const result = await ocrPipelineService.processPipeline(uploadedOrderId);

    logger.info('Image processing job completed', {
      jobId: job.id,
      uploadedOrderId,
      success: result.success,
      itemsExtracted: result.parsedData?.items?.length || 0,
      validItems: result.validationResult?.validItems?.length || 0,
      duration: result.duration,
    });

    return result;
  } catch (error) {
    logger.error('Image processing job failed', {
      jobId: job.id,
      uploadedOrderId,
      error: error.message,
      stack: error.stack,
    });

    throw error; // Will trigger retry
  }
}

module.exports = imageProcessingProcessor;
