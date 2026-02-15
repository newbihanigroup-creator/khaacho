const vision = require('@google-cloud/vision');
const logger = require('../../../shared/logger');
const { ExternalServiceError } = require('../../../shared/errors');

/**
 * Google Vision OCR Service
 * External service for OCR text extraction
 */
class VisionOCRService {
  constructor() {
    this.initializeClient();
  }

  /**
   * Initialize Vision API client
   */
  initializeClient() {
    try {
      const config = {};

      if (process.env.GOOGLE_CLOUD_CREDENTIALS) {
        config.credentials = JSON.parse(process.env.GOOGLE_CLOUD_CREDENTIALS);
      }

      if (process.env.GOOGLE_CLOUD_PROJECT_ID) {
        config.projectId = process.env.GOOGLE_CLOUD_PROJECT_ID;
      }

      this.client = new vision.ImageAnnotatorClient(config);
      this.isConfigured = true;

      logger.info('Vision OCR service initialized');
    } catch (error) {
      logger.warn('Vision OCR service not configured', { error: error.message });
      this.isConfigured = false;
    }
  }

  /**
   * Extract text from image using GCS URI
   */
  async extractTextFromGCS(gcsUri) {
    if (!this.isConfigured) {
      throw new ExternalServiceError(
        'Google Vision',
        'Vision API not configured',
        { hint: 'Set GOOGLE_CLOUD_CREDENTIALS environment variable' }
      );
    }

    try {
      logger.info('Running OCR on GCS image', { gcsUri });

      const [result] = await this.client.textDetection(gcsUri);
      const detections = result.textAnnotations;

      if (!detections || detections.length === 0) {
        logger.warn('No text detected in image', { gcsUri });
        return {
          text: '',
          confidence: 0,
        };
      }

      // First annotation contains full text
      const fullText = detections[0].description;
      
      // Calculate average confidence
      const confidence = this.calculateConfidence(result);

      logger.info('OCR completed successfully', {
        gcsUri,
        textLength: fullText.length,
        confidence,
      });

      return {
        text: fullText,
        confidence,
      };
    } catch (error) {
      logger.error('Vision OCR failed', {
        gcsUri,
        error: error.message,
        code: error.code,
      });

      throw new ExternalServiceError(
        'Google Vision',
        error.message,
        { gcsUri, code: error.code }
      );
    }
  }

  /**
   * Extract text from image buffer
   */
  async extractTextFromBuffer(imageBuffer) {
    if (!this.isConfigured) {
      throw new ExternalServiceError(
        'Google Vision',
        'Vision API not configured'
      );
    }

    try {
      logger.info('Running OCR on image buffer', {
        size: imageBuffer.length,
      });

      const [result] = await this.client.textDetection(imageBuffer);
      const detections = result.textAnnotations;

      if (!detections || detections.length === 0) {
        return {
          text: '',
          confidence: 0,
        };
      }

      const fullText = detections[0].description;
      const confidence = this.calculateConfidence(result);

      logger.info('OCR completed successfully', {
        textLength: fullText.length,
        confidence,
      });

      return {
        text: fullText,
        confidence,
      };
    } catch (error) {
      logger.error('Vision OCR failed', { error: error.message });

      throw new ExternalServiceError(
        'Google Vision',
        error.message,
        { code: error.code }
      );
    }
  }

  /**
   * Batch OCR processing
   */
  async extractTextBatch(gcsUris) {
    if (!this.isConfigured) {
      throw new ExternalServiceError(
        'Google Vision',
        'Vision API not configured'
      );
    }

    try {
      logger.info('Running batch OCR', { count: gcsUris.length });

      const results = await Promise.all(
        gcsUris.map(uri => this.extractTextFromGCS(uri))
      );

      return results;
    } catch (error) {
      logger.error('Batch OCR failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Calculate average confidence score
   */
  calculateConfidence(result) {
    const detections = result.textAnnotations;
    
    if (!detections || detections.length <= 1) {
      return 0.5; // Default confidence
    }

    // Skip first annotation (full text), calculate average of word confidences
    const wordDetections = detections.slice(1);
    const totalConfidence = wordDetections.reduce((sum, detection) => {
      return sum + (detection.confidence || 0.5);
    }, 0);

    return totalConfidence / wordDetections.length;
  }

  /**
   * Check if service is configured
   */
  isAvailable() {
    return this.isConfigured;
  }

  /**
   * Get service health status
   */
  getHealthStatus() {
    return {
      service: 'Google Vision OCR',
      configured: this.isConfigured,
      available: this.isConfigured,
    };
  }
}

// Export singleton instance
module.exports = new VisionOCRService();
