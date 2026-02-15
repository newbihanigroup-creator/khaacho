const prisma = require('../config/database');
const logger = require('../utils/logger');
const sharp = require('sharp');
const visionOCRService = require('./visionOCR.service');
const orderImageProcessingService = require('./orderImageProcessing.service');
const orderValidationService = require('./orderValidation.service');

/**
 * OCR Processing Pipeline Service
 * Complete pipeline: Upload → Resize → OCR → LLM Parse → Validate → Store
 * 
 * Features:
 * - Image resizing before OCR (cost optimization)
 * - Retry logic with exponential backoff
 * - Validation before order creation
 * - Complete audit trail
 */

class OCRPipelineService {
  constructor() {
    // Retry configuration
    this.retryConfig = {
      maxAttempts: 2, // Retry up to 2 times (3 total attempts)
      initialDelay: 2000, // 2 seconds
      maxDelay: 10000, // 10 seconds
      backoffMultiplier: 2, // Exponential backoff
    };

    // Image resize configuration
    this.resizeConfig = {
      maxWidth: 2048, // Max width in pixels
      maxHeight: 2048, // Max height in pixels
      quality: 85, // JPEG quality (1-100)
      format: 'jpeg', // Output format
    };
  }

  /**
   * Main pipeline entry point
   * @param {string} uploadedOrderId - ID of uploaded order
   * @returns {Promise<Object>} - Processing result
   */
  async processPipeline(uploadedOrderId) {
    logger.info('🚀 Starting OCR processing pipeline', { uploadedOrderId });

    const startTime = Date.now();
    let currentStep = 'initialization';

    try {
      // Step 1: Fetch uploaded order
      currentStep = 'fetch_order';
      const uploadedOrder = await this.fetchUploadedOrder(uploadedOrderId);
      logger.info('✅ Step 1: Fetched uploaded order', {
        uploadedOrderId,
        retailerId: uploadedOrder.retailerId,
      });

      // Step 2: Download and resize image
      currentStep = 'resize_image';
      const resizedImageBuffer = await this.downloadAndResizeImage(
        uploadedOrder.imageUrl,
        uploadedOrderId
      );
      logger.info('✅ Step 2: Image resized', {
        uploadedOrderId,
        originalSize: 'from GCS',
        resizedSize: resizedImageBuffer.length,
      });

      // Step 3: Upload resized image to GCS
      currentStep = 'upload_resized';
      const resizedImageUrl = await this.uploadResizedImage(
        resizedImageBuffer,
        uploadedOrder.imageKey,
        uploadedOrderId
      );
      logger.info('✅ Step 3: Resized image uploaded', {
        uploadedOrderId,
        resizedImageUrl,
      });

      // Step 4: Extract text with retry logic
      currentStep = 'ocr_extraction';
      const rawText = await this.extractTextWithRetry(
        resizedImageUrl,
        uploadedOrderId
      );
      logger.info('✅ Step 4: Text extracted', {
        uploadedOrderId,
        textLength: rawText.length,
      });

      // Step 5: Store raw text
      currentStep = 'store_raw_text';
      await this.storeRawText(uploadedOrderId, rawText);
      logger.info('✅ Step 5: Raw text stored', { uploadedOrderId });

      // Step 6: Parse with LLM (with retry)
      currentStep = 'llm_parsing';
      const parsedData = await this.parseWithLLMRetry(
        rawText,
        uploadedOrder,
        uploadedOrderId
      );
      logger.info('✅ Step 6: LLM parsing completed', {
        uploadedOrderId,
        itemsCount: parsedData.items?.length || 0,
      });

      // Step 7: Validate items
      currentStep = 'validation';
      const validationResult = await this.validateItems(
        parsedData.items,
        uploadedOrder.retailerId,
        uploadedOrderId
      );
      logger.info('✅ Step 7: Items validated', {
        uploadedOrderId,
        validItems: validationResult.validItems.length,
        invalidItems: validationResult.invalidItems.length,
      });

      // Step 8: Store final result
      currentStep = 'store_result';
      await this.storeFinalResult(
        uploadedOrderId,
        rawText,
        parsedData,
        validationResult,
        resizedImageUrl
      );
      logger.info('✅ Step 8: Final result stored', { uploadedOrderId });

      const duration = Date.now() - startTime;

      logger.info('🎉 OCR pipeline completed successfully', {
        uploadedOrderId,
        duration,
        itemsExtracted: parsedData.items?.length || 0,
        validItems: validationResult.validItems.length,
      });

      return {
        success: true,
        uploadedOrderId,
        rawText,
        parsedData,
        validationResult,
        resizedImageUrl,
        duration,
      };
    } catch (error) {
      const duration = Date.now() - startTime;

      logger.error('❌ OCR pipeline failed', {
        uploadedOrderId,
        currentStep,
        error: error.message,
        stack: error.stack,
        duration,
      });

      // Store failure
      await this.storeFailure(uploadedOrderId, currentStep, error);

      throw error;
    }
  }

  /**
   * Step 1: Fetch uploaded order
   */
  async fetchUploadedOrder(uploadedOrderId) {
    try {
      const uploadedOrder = await prisma.uploadedOrder.findUnique({
        where: { id: uploadedOrderId },
        include: {
          retailer: {
            include: {
              user: true,
            },
          },
        },
      });

      if (!uploadedOrder) {
        throw new Error(`UploadedOrder not found: ${uploadedOrderId}`);
      }

      return uploadedOrder;
    } catch (error) {
      logger.error('Failed to fetch uploaded order', {
        uploadedOrderId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Step 2: Download and resize image
   */
  async downloadAndResizeImage(imageUrl, uploadedOrderId) {
    try {
      logger.info('Downloading and resizing image', {
        uploadedOrderId,
        imageUrl,
      });

      // Download image from GCS
      const { Storage } = require('@google-cloud/storage');
      const storage = new Storage();

      // Extract bucket and file path from GCS URL
      let bucket, filePath;
      
      if (imageUrl.startsWith('gs://')) {
        const parts = imageUrl.replace('gs://', '').split('/');
        bucket = parts[0];
        filePath = parts.slice(1).join('/');
      } else if (imageUrl.includes('storage.googleapis.com')) {
        // Parse signed URL
        const url = new URL(imageUrl);
        const pathParts = url.pathname.split('/');
        bucket = pathParts[1];
        filePath = pathParts.slice(2).join('/');
      } else {
        throw new Error('Invalid GCS URL format');
      }

      logger.info('Downloading from GCS', { bucket, filePath });

      const file = storage.bucket(bucket).file(filePath);
      const [imageBuffer] = await file.download();

      logger.info('Image downloaded', {
        uploadedOrderId,
        originalSize: imageBuffer.length,
      });

      // Resize image using sharp
      const resizedBuffer = await sharp(imageBuffer)
        .resize(this.resizeConfig.maxWidth, this.resizeConfig.maxHeight, {
          fit: 'inside', // Maintain aspect ratio
          withoutEnlargement: true, // Don't upscale small images
        })
        .jpeg({
          quality: this.resizeConfig.quality,
          progressive: true,
        })
        .toBuffer();

      const compressionRatio = (
        ((imageBuffer.length - resizedBuffer.length) / imageBuffer.length) * 100
      ).toFixed(2);

      logger.info('Image resized successfully', {
        uploadedOrderId,
        originalSize: imageBuffer.length,
        resizedSize: resizedBuffer.length,
        compressionRatio: `${compressionRatio}%`,
      });

      return resizedBuffer;
    } catch (error) {
      logger.error('Image resize failed', {
        uploadedOrderId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Step 3: Upload resized image to GCS
   */
  async uploadResizedImage(imageBuffer, originalKey, uploadedOrderId) {
    try {
      const { Storage } = require('@google-cloud/storage');
      const storage = new Storage();
      const bucketName = process.env.GCS_BUCKET_NAME;

      // Generate resized image key
      const resizedKey = originalKey.replace(/(\.[^.]+)$/, '_resized$1');

      logger.info('Uploading resized image', {
        uploadedOrderId,
        resizedKey,
        size: imageBuffer.length,
      });

      const file = storage.bucket(bucketName).file(resizedKey);

      await file.save(imageBuffer, {
        metadata: {
          contentType: 'image/jpeg',
          metadata: {
            originalKey,
            resized: 'true',
            uploadedOrderId,
          },
        },
        public: false,
      });

      // Generate signed URL
      const [signedUrl] = await file.getSignedUrl({
        version: 'v4',
        action: 'read',
        expires: Date.now() + 24 * 60 * 60 * 1000, // 24 hours
      });

      logger.info('Resized image uploaded', {
        uploadedOrderId,
        resizedKey,
        signedUrl: signedUrl.substring(0, 100) + '...',
      });

      return `gs://${bucketName}/${resizedKey}`;
    } catch (error) {
      logger.error('Failed to upload resized image', {
        uploadedOrderId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Step 4: Extract text with retry logic
   */
  async extractTextWithRetry(imageUrl, uploadedOrderId) {
    let attempt = 0;
    let lastError;

    while (attempt <= this.retryConfig.maxAttempts) {
      try {
        logger.info('OCR extraction attempt', {
          uploadedOrderId,
          attempt: attempt + 1,
          maxAttempts: this.retryConfig.maxAttempts + 1,
        });

        const rawText = await visionOCRService.runOCRFromGCS(imageUrl);

        if (attempt > 0) {
          logger.info('OCR extraction succeeded after retry', {
            uploadedOrderId,
            attempt: attempt + 1,
          });
        }

        return rawText;
      } catch (error) {
        lastError = error;
        attempt++;

        logger.warn('OCR extraction failed', {
          uploadedOrderId,
          attempt,
          error: error.message,
          willRetry: attempt <= this.retryConfig.maxAttempts,
        });

        if (attempt <= this.retryConfig.maxAttempts) {
          const delay = Math.min(
            this.retryConfig.initialDelay * Math.pow(this.retryConfig.backoffMultiplier, attempt - 1),
            this.retryConfig.maxDelay
          );

          logger.info('Waiting before retry', {
            uploadedOrderId,
            delay,
            nextAttempt: attempt + 1,
          });

          await this.sleep(delay);
        }
      }
    }

    // All retries exhausted
    logger.error('OCR extraction failed after all retries', {
      uploadedOrderId,
      totalAttempts: attempt,
      lastError: lastError.message,
    });

    throw lastError;
  }

  /**
   * Step 5: Store raw text
   */
  async storeRawText(uploadedOrderId, rawText) {
    try {
      await prisma.uploadedOrder.update({
        where: { id: uploadedOrderId },
        data: {
          extractedText: rawText,
          updatedAt: new Date(),
        },
      });
    } catch (error) {
      logger.error('Failed to store raw text', {
        uploadedOrderId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Step 6: Parse with LLM (with retry)
   */
  async parseWithLLMRetry(rawText, uploadedOrder, uploadedOrderId) {
    let attempt = 0;
    let lastError;

    while (attempt <= this.retryConfig.maxAttempts) {
      try {
        logger.info('LLM parsing attempt', {
          uploadedOrderId,
          attempt: attempt + 1,
          maxAttempts: this.retryConfig.maxAttempts + 1,
        });

        const parsedData = await orderImageProcessingService.extractOrderDataWithLLM(
          rawText,
          uploadedOrder
        );

        if (attempt > 0) {
          logger.info('LLM parsing succeeded after retry', {
            uploadedOrderId,
            attempt: attempt + 1,
          });
        }

        return parsedData;
      } catch (error) {
        lastError = error;
        attempt++;

        logger.warn('LLM parsing failed', {
          uploadedOrderId,
          attempt,
          error: error.message,
          willRetry: attempt <= this.retryConfig.maxAttempts,
        });

        if (attempt <= this.retryConfig.maxAttempts) {
          const delay = Math.min(
            this.retryConfig.initialDelay * Math.pow(this.retryConfig.backoffMultiplier, attempt - 1),
            this.retryConfig.maxDelay
          );

          await this.sleep(delay);
        }
      }
    }

    // All retries exhausted - use fallback
    logger.warn('LLM parsing failed after all retries, using fallback', {
      uploadedOrderId,
      totalAttempts: attempt,
    });

    return await orderImageProcessingService.extractWithRules(rawText, uploadedOrder);
  }

  /**
   * Step 7: Validate items
   */
  async validateItems(items, retailerId, uploadedOrderId) {
    try {
      if (!items || items.length === 0) {
        return {
          validItems: [],
          invalidItems: [],
          totalValue: 0,
        };
      }

      logger.info('Validating extracted items', {
        uploadedOrderId,
        itemCount: items.length,
      });

      const validItems = [];
      const invalidItems = [];
      let totalValue = 0;

      for (const item of items) {
        try {
          // Basic validation
          if (!item.productName || !item.quantity || item.quantity <= 0) {
            invalidItems.push({
              ...item,
              reason: 'Missing or invalid required fields',
            });
            continue;
          }

          // Validate against retailer credit if needed
          if (retailerId && item.price > 0) {
            const itemTotal = item.price * item.quantity;
            totalValue += itemTotal;
          }

          validItems.push(item);
        } catch (error) {
          logger.warn('Item validation failed', {
            uploadedOrderId,
            item,
            error: error.message,
          });
          invalidItems.push({
            ...item,
            reason: error.message,
          });
        }
      }

      // Check retailer credit limit if applicable
      if (retailerId && totalValue > 0) {
        try {
          const validation = await orderValidationService.validateOrder({
            retailerId,
            total: totalValue,
          });

          if (!validation.isValid) {
            logger.warn('Order exceeds credit limit', {
              uploadedOrderId,
              retailerId,
              totalValue,
              reason: validation.reason,
            });
          }
        } catch (error) {
          logger.warn('Credit validation failed', {
            uploadedOrderId,
            error: error.message,
          });
        }
      }

      logger.info('Item validation completed', {
        uploadedOrderId,
        validItems: validItems.length,
        invalidItems: invalidItems.length,
        totalValue,
      });

      return {
        validItems,
        invalidItems,
        totalValue,
      };
    } catch (error) {
      logger.error('Validation failed', {
        uploadedOrderId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Step 8: Store final result
   */
  async storeFinalResult(uploadedOrderId, rawText, parsedData, validationResult, resizedImageUrl) {
    try {
      const hasValidItems = validationResult.validItems.length > 0;
      const status = hasValidItems ? 'COMPLETED' : 'FAILED';

      await prisma.uploadedOrder.update({
        where: { id: uploadedOrderId },
        data: {
          status,
          extractedText: rawText,
          parsedData: {
            ...parsedData,
            validation: validationResult,
          },
          resizedImageUrl,
          errorMessage: !hasValidItems ? 'No valid items extracted' : null,
          processedAt: new Date(),
          updatedAt: new Date(),
        },
      });

      logger.info('Final result stored', {
        uploadedOrderId,
        status,
        validItems: validationResult.validItems.length,
      });
    } catch (error) {
      logger.error('Failed to store final result', {
        uploadedOrderId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Store failure information
   */
  async storeFailure(uploadedOrderId, failedStep, error) {
    try {
      await prisma.uploadedOrder.update({
        where: { id: uploadedOrderId },
        data: {
          status: 'FAILED',
          errorMessage: `Failed at step: ${failedStep}. Error: ${error.message}`,
          processedAt: new Date(),
          updatedAt: new Date(),
        },
      });
    } catch (updateError) {
      logger.error('Failed to store failure', {
        uploadedOrderId,
        error: updateError.message,
      });
    }
  }

  /**
   * Sleep utility
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get pipeline configuration
   */
  getConfiguration() {
    return {
      retry: this.retryConfig,
      resize: this.resizeConfig,
    };
  }

  /**
   * Update retry configuration
   */
  updateRetryConfig(config) {
    this.retryConfig = {
      ...this.retryConfig,
      ...config,
    };
    logger.info('Retry configuration updated', this.retryConfig);
  }

  /**
   * Update resize configuration
   */
  updateResizeConfig(config) {
    this.resizeConfig = {
      ...this.resizeConfig,
      ...config,
    };
    logger.info('Resize configuration updated', this.resizeConfig);
  }
}

module.exports = new OCRPipelineService();
