const prisma = require('../config/database');
const logger = require('../utils/logger');
const { Storage } = require('@google-cloud/storage');

/**
 * Image Upload Service - Google Cloud Storage
 * Handles image uploads to GCS and creates UploadedOrder records
 */

class ImageUploadService {
  constructor() {
    this.initializeGCS();
  }

  /**
   * Initialize Google Cloud Storage
   */
  initializeGCS() {
    try {
      if (!process.env.GCS_BUCKET_NAME) {
        logger.warn('GCS_BUCKET_NAME not configured');
        return;
      }

      // Initialize GCS client
      const storageConfig = {};
      
      // If credentials are provided as JSON string
      if (process.env.GCS_CREDENTIALS) {
        try {
          storageConfig.credentials = JSON.parse(process.env.GCS_CREDENTIALS);
        } catch (error) {
          logger.error('Failed to parse GCS_CREDENTIALS', { error: error.message });
        }
      }
      
      // If key file path is provided
      if (process.env.GCS_KEY_FILE) {
        storageConfig.keyFilename = process.env.GCS_KEY_FILE;
      }

      // If project ID is provided
      if (process.env.GCS_PROJECT_ID) {
        storageConfig.projectId = process.env.GCS_PROJECT_ID;
      }

      this.storage = new Storage(storageConfig);
      this.bucketName = process.env.GCS_BUCKET_NAME;
      this.bucket = this.storage.bucket(this.bucketName);

      logger.info('Google Cloud Storage initialized successfully', {
        bucket: this.bucketName,
        projectId: storageConfig.projectId || 'default',
      });
    } catch (error) {
      logger.error('Failed to initialize Google Cloud Storage', {
        error: error.message,
        stack: error.stack,
      });
    }
  }

  /**
   * Upload image to Google Cloud Storage (private)
   */
  async uploadToGCS(fileBuffer, filename, mimetype) {
    if (!this.storage || !this.bucket) {
      throw new Error('Google Cloud Storage not initialized');
    }

    try {
      // Generate unique filename
      const timestamp = Date.now();
      const randomString = Math.random().toString(36).substring(2, 15);
      const sanitizedFilename = filename.replace(/[^a-zA-Z0-9.-]/g, '_');
      const gcsFilename = `orders/${timestamp}_${randomString}_${sanitizedFilename}`;

      logger.info('Uploading file to GCS', {
        filename: gcsFilename,
        mimetype,
        size: fileBuffer.length,
        bucket: this.bucketName,
      });

      // Create file reference
      const file = this.bucket.file(gcsFilename);

      // Upload file with metadata
      await file.save(fileBuffer, {
        metadata: {
          contentType: mimetype,
          metadata: {
            originalName: filename,
            uploadedAt: new Date().toISOString(),
          },
        },
        // Make file private (no public access)
        public: false,
        // Validate file integrity
        validation: 'crc32c',
      });

      // Generate signed URL for private access (valid for 1 hour)
      const [signedUrl] = await file.getSignedUrl({
        version: 'v4',
        action: 'read',
        expires: Date.now() + 60 * 60 * 1000, // 1 hour
      });

      logger.info('File uploaded to GCS successfully', {
        filename: gcsFilename,
        bucket: this.bucketName,
      });

      return {
        url: signedUrl,
        key: gcsFilename,
        bucket: this.bucketName,
        provider: 'gcs',
        publicUrl: `gs://${this.bucketName}/${gcsFilename}`,
      };
    } catch (error) {
      logger.error('GCS upload failed', {
        error: error.message,
        code: error.code,
        stack: error.stack,
      });
      throw new Error(`Failed to upload to Google Cloud Storage: ${error.message}`);
    }
  }

  /**
   * Get signed URL for private file access
   */
  async getSignedUrl(gcsFilename, expirationMinutes = 60) {
    if (!this.storage || !this.bucket) {
      throw new Error('Google Cloud Storage not initialized');
    }

    try {
      const file = this.bucket.file(gcsFilename);

      const [signedUrl] = await file.getSignedUrl({
        version: 'v4',
        action: 'read',
        expires: Date.now() + expirationMinutes * 60 * 1000,
      });

      return signedUrl;
    } catch (error) {
      logger.error('Failed to generate signed URL', {
        filename: gcsFilename,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Create UploadedOrder record
   */
  async createUploadedOrder(imageUrl, imageKey, retailerId = null) {
    try {
      const uploadedOrder = await prisma.uploadedOrder.create({
        data: {
          imageUrl,
          imageKey,
          retailerId,
          status: 'PROCESSING',
        },
      });

      logger.info('UploadedOrder created', {
        id: uploadedOrder.id,
        retailerId,
        imageKey,
      });

      return uploadedOrder;
    } catch (error) {
      logger.error('Failed to create UploadedOrder', {
        error: error.message,
        imageKey,
        retailerId,
      });
      throw error;
    }
  }

  /**
   * Trigger background job to process image
   */
  async triggerImageProcessing(uploadedOrderId) {
    try {
      logger.info('Triggering image processing job', { uploadedOrderId });

      const { getQueueManager } = require('../queues/initializeQueues');
      const queueMgr = getQueueManager();

      // Add job to IMAGE_PROCESSING queue
      await queueMgr.addJob(
        'IMAGE_PROCESSING',
        'process-image-order',
        { uploadedOrderId },
        {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 5000, // Start with 5 seconds
          },
          removeOnComplete: 100,
          removeOnFail: false, // Keep failed jobs for debugging
        }
      );

      logger.info('Image processing job queued successfully', { uploadedOrderId });
    } catch (error) {
      logger.error('Failed to queue image processing job', {
        uploadedOrderId,
        error: error.message,
      });
      
      // Fallback: Try to process synchronously if queue fails
      logger.warn('Attempting synchronous processing as fallback');
      try {
        const imageProcessingProcessor = require('../queues/processors/imageProcessingProcessor');
        await imageProcessingProcessor({ data: { uploadedOrderId } });
        logger.info('Synchronous processing completed', { uploadedOrderId });
      } catch (syncError) {
        logger.error('Synchronous processing also failed', {
          uploadedOrderId,
          error: syncError.message,
        });
        // Don't throw - allow the upload to succeed even if processing fails
      }
    }
  }

  /**
   * Main method: Upload image and create order record
   */
  async processImageUpload(file, retailerId = null) {
    try {
      // Validate file
      if (!file || !file.buffer) {
        throw new Error('No file provided');
      }

      // Validate file type
      const allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
      if (!allowedMimeTypes.includes(file.mimetype)) {
        throw new Error(`Invalid file type: ${file.mimetype}. Allowed: ${allowedMimeTypes.join(', ')}`);
      }

      // Validate file size (max 10MB)
      const maxSize = 10 * 1024 * 1024; // 10MB
      if (file.size > maxSize) {
        throw new Error(`File too large: ${file.size} bytes. Max: ${maxSize} bytes`);
      }

      logger.info('Processing image upload', {
        filename: file.originalname,
        mimetype: file.mimetype,
        size: file.size,
        retailerId,
      });

      // Upload image to GCS
      const uploadResult = await this.uploadToGCS(
        file.buffer,
        file.originalname,
        file.mimetype
      );

      // Create UploadedOrder record
      const uploadedOrder = await this.createUploadedOrder(
        uploadResult.url,
        uploadResult.key,
        retailerId
      );

      // Trigger background processing
      await this.triggerImageProcessing(uploadedOrder.id);

      return {
        success: true,
        uploadedOrderId: uploadedOrder.id,
        imageUrl: uploadResult.url,
        imageKey: uploadResult.key,
        status: 'PROCESSING',
      };
    } catch (error) {
      logger.error('Image upload processing failed', {
        error: error.message,
        stack: error.stack,
        retailerId,
      });
      throw error;
    }
  }

  /**
   * Get uploaded order by ID
   */
  async getUploadedOrder(uploadedOrderId) {
    try {
      const uploadedOrder = await prisma.uploadedOrder.findUnique({
        where: { id: uploadedOrderId },
        include: {
          retailer: {
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  phoneNumber: true,
                },
              },
            },
          },
          order: {
            select: {
              id: true,
              orderNumber: true,
              status: true,
              total: true,
            },
          },
        },
      });

      if (!uploadedOrder) {
        throw new Error('UploadedOrder not found');
      }

      // Refresh signed URL if needed (for private files)
      if (uploadedOrder.imageKey && uploadedOrder.status === 'COMPLETED') {
        try {
          const freshUrl = await this.getSignedUrl(uploadedOrder.imageKey, 60);
          uploadedOrder.imageUrl = freshUrl;
        } catch (error) {
          logger.warn('Failed to refresh signed URL', {
            uploadedOrderId,
            error: error.message,
          });
        }
      }

      return uploadedOrder;
    } catch (error) {
      logger.error('Failed to get UploadedOrder', {
        uploadedOrderId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Update uploaded order status
   */
  async updateUploadedOrderStatus(uploadedOrderId, status, data = {}) {
    try {
      const uploadedOrder = await prisma.uploadedOrder.update({
        where: { id: uploadedOrderId },
        data: {
          status,
          ...data,
          processedAt: status === 'COMPLETED' || status === 'FAILED' ? new Date() : undefined,
        },
      });

      logger.info('UploadedOrder status updated', {
        uploadedOrderId,
        status,
      });

      return uploadedOrder;
    } catch (error) {
      logger.error('Failed to update UploadedOrder status', {
        uploadedOrderId,
        status,
        error: error.message,
      });
      throw error;
    }
  }
}

module.exports = new ImageUploadService();
