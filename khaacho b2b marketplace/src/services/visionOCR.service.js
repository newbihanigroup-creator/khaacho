const vision = require('@google-cloud/vision');
const logger = require('../utils/logger');

/**
 * Vision OCR Service
 * Handles text extraction from images using Google Cloud Vision API
 */

class VisionOCRService {
  constructor() {
    this.initializeVisionClient();
  }

  /**
   * Initialize Google Cloud Vision client
   */
  initializeVisionClient() {
    try {
      const visionConfig = {};

      // If credentials are provided as JSON string
      if (process.env.GOOGLE_CLOUD_CREDENTIALS) {
        try {
          visionConfig.credentials = JSON.parse(process.env.GOOGLE_CLOUD_CREDENTIALS);
        } catch (error) {
          logger.error('Failed to parse GOOGLE_CLOUD_CREDENTIALS', { error: error.message });
        }
      }

      // If key file path is provided
      if (process.env.GOOGLE_CLOUD_KEY_FILE) {
        visionConfig.keyFilename = process.env.GOOGLE_CLOUD_KEY_FILE;
      }

      // If project ID is provided
      if (process.env.GOOGLE_CLOUD_PROJECT_ID) {
        visionConfig.projectId = process.env.GOOGLE_CLOUD_PROJECT_ID;
      }

      this.client = new vision.ImageAnnotatorClient(visionConfig);

      logger.info('Google Cloud Vision client initialized successfully', {
        projectId: visionConfig.projectId || 'default',
      });
    } catch (error) {
      logger.error('Failed to initialize Google Cloud Vision client', {
        error: error.message,
        stack: error.stack,
      });
      this.client = null;
    }
  }

  /**
   * Run OCR on image from Google Cloud Storage
   * 
   * @param {string} imageUrl - GCS URI (gs://bucket/file) or HTTPS URL
   * @returns {Promise<string>} - Extracted plain text
   * @throws {Error} - Structured error with code and details
   */
  async runOCRFromGCS(imageUrl) {
    const startTime = Date.now();

    try {
      // Validate client initialization
      if (!this.client) {
        throw this.createError(
          'VISION_NOT_INITIALIZED',
          'Google Cloud Vision client not initialized',
          { imageUrl }
        );
      }

      // Validate image URL
      if (!imageUrl || typeof imageUrl !== 'string') {
        throw this.createError(
          'INVALID_IMAGE_URL',
          'Image URL is required and must be a string',
          { imageUrl }
        );
      }

      // Validate GCS URI format
      if (!this.isValidGCSUri(imageUrl)) {
        throw this.createError(
          'INVALID_GCS_URI',
          'Image URL must be a valid GCS URI (gs://bucket/file) or HTTPS URL',
          { imageUrl }
        );
      }

      logger.info('Starting OCR text extraction', {
        imageUrl,
        uriType: imageUrl.startsWith('gs://') ? 'gcs' : 'https',
      });

      // Perform text detection
      const [result] = await this.client.textDetection(imageUrl);

      // Check for API errors
      if (result.error) {
        throw this.createError(
          'VISION_API_ERROR',
          result.error.message || 'Vision API returned an error',
          {
            imageUrl,
            errorCode: result.error.code,
            errorDetails: result.error.details,
          }
        );
      }

      // Extract full text annotation
      const fullTextAnnotation = result.fullTextAnnotation;

      if (!fullTextAnnotation || !fullTextAnnotation.text) {
        // Check if image has no text or low confidence
        const textAnnotations = result.textAnnotations || [];
        
        if (textAnnotations.length === 0) {
          logger.warn('No text detected in image', { imageUrl });
          return ''; // Return empty string for images with no text
        }

        // Fallback: concatenate individual text annotations
        const fallbackText = textAnnotations
          .slice(1) // Skip first element (full text)
          .map(annotation => annotation.description)
          .join(' ');

        if (fallbackText) {
          logger.warn('Using fallback text extraction', {
            imageUrl,
            textLength: fallbackText.length,
          });
          return fallbackText.trim();
        }

        logger.warn('No text content in fullTextAnnotation', { imageUrl });
        return '';
      }

      const extractedText = fullTextAnnotation.text.trim();

      // Check confidence (if available)
      const confidence = this.calculateConfidence(result);
      
      if (confidence !== null && confidence < 0.5) {
        logger.warn('Low confidence OCR result', {
          imageUrl,
          confidence,
          textLength: extractedText.length,
        });
      }

      const duration = Date.now() - startTime;

      logger.info('OCR text extraction completed', {
        imageUrl,
        textLength: extractedText.length,
        confidence,
        duration,
      });

      return extractedText;

    } catch (error) {
      const duration = Date.now() - startTime;

      // If already a structured error, re-throw
      if (error.code && error.isOCRError) {
        logger.error('OCR extraction failed', {
          imageUrl,
          errorCode: error.code,
          errorMessage: error.message,
          duration,
        });
        throw error;
      }

      // Handle Vision API specific errors
      if (error.code) {
        const errorCode = this.mapVisionErrorCode(error.code);
        throw this.createError(
          errorCode,
          error.message,
          {
            imageUrl,
            originalCode: error.code,
            duration,
          }
        );
      }

      // Generic error
      logger.error('Unexpected OCR error', {
        imageUrl,
        error: error.message,
        stack: error.stack,
        duration,
      });

      throw this.createError(
        'OCR_FAILED',
        `Failed to extract text from image: ${error.message}`,
        { imageUrl, originalError: error.message }
      );
    }
  }

  /**
   * Validate GCS URI format
   * 
   * @param {string} uri - URI to validate
   * @returns {boolean}
   */
  isValidGCSUri(uri) {
    if (!uri) return false;

    // Accept GCS URIs (gs://bucket/file)
    if (uri.startsWith('gs://')) {
      return /^gs:\/\/[a-z0-9][a-z0-9._-]{1,61}[a-z0-9]\/.*/.test(uri);
    }

    // Accept HTTPS URLs (for signed URLs)
    if (uri.startsWith('https://')) {
      return true;
    }

    return false;
  }

  /**
   * Calculate overall confidence from Vision API result
   * 
   * @param {Object} result - Vision API result
   * @returns {number|null} - Confidence score (0-1) or null if not available
   */
  calculateConfidence(result) {
    try {
      const textAnnotations = result.textAnnotations || [];
      
      if (textAnnotations.length === 0) {
        return null;
      }

      // Calculate average confidence from all annotations
      let totalConfidence = 0;
      let count = 0;

      for (const annotation of textAnnotations) {
        if (annotation.confidence !== undefined && annotation.confidence !== null) {
          totalConfidence += annotation.confidence;
          count++;
        }
      }

      if (count === 0) {
        return null;
      }

      return totalConfidence / count;
    } catch (error) {
      logger.warn('Failed to calculate confidence', { error: error.message });
      return null;
    }
  }

  /**
   * Map Vision API error codes to custom error codes
   * 
   * @param {number} visionErrorCode - Vision API error code
   * @returns {string} - Custom error code
   */
  mapVisionErrorCode(visionErrorCode) {
    const errorMap = {
      3: 'INVALID_ARGUMENT', // Invalid request
      5: 'NOT_FOUND', // Image not found
      7: 'PERMISSION_DENIED', // Permission denied
      8: 'RESOURCE_EXHAUSTED', // Quota exceeded
      13: 'INTERNAL_ERROR', // Internal error
      14: 'UNAVAILABLE', // Service unavailable
    };

    return errorMap[visionErrorCode] || 'VISION_API_ERROR';
  }

  /**
   * Create structured error object
   * 
   * @param {string} code - Error code
   * @param {string} message - Error message
   * @param {Object} details - Additional error details
   * @returns {Error} - Structured error
   */
  createError(code, message, details = {}) {
    const error = new Error(message);
    error.code = code;
    error.details = details;
    error.isOCRError = true;
    error.timestamp = new Date().toISOString();
    return error;
  }

  /**
   * Batch OCR processing for multiple images
   * 
   * @param {string[]} imageUrls - Array of GCS URIs
   * @returns {Promise<Array>} - Array of results with text or errors
   */
  async runBatchOCR(imageUrls) {
    if (!Array.isArray(imageUrls) || imageUrls.length === 0) {
      throw this.createError(
        'INVALID_INPUT',
        'imageUrls must be a non-empty array',
        { imageUrls }
      );
    }

    logger.info('Starting batch OCR processing', {
      count: imageUrls.length,
    });

    const results = await Promise.allSettled(
      imageUrls.map(url => this.runOCRFromGCS(url))
    );

    const processed = results.map((result, index) => {
      if (result.status === 'fulfilled') {
        return {
          imageUrl: imageUrls[index],
          success: true,
          text: result.value,
          textLength: result.value.length,
        };
      } else {
        return {
          imageUrl: imageUrls[index],
          success: false,
          error: {
            code: result.reason.code || 'UNKNOWN_ERROR',
            message: result.reason.message,
            details: result.reason.details,
          },
        };
      }
    });

    const successCount = processed.filter(r => r.success).length;
    const failureCount = processed.filter(r => !r.success).length;

    logger.info('Batch OCR processing completed', {
      total: imageUrls.length,
      success: successCount,
      failed: failureCount,
    });

    return processed;
  }

  /**
   * Get service health status
   * 
   * @returns {Object} - Health status
   */
  getHealthStatus() {
    return {
      initialized: this.client !== null,
      service: 'Google Cloud Vision API',
      timestamp: new Date().toISOString(),
    };
  }
}

// Export singleton instance
module.exports = new VisionOCRService();
