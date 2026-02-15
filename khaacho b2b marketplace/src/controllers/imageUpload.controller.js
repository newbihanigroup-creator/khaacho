const imageUploadService = require('../services/imageUpload.service');
const ApiResponse = require('../utils/response');
const logger = require('../utils/logger');

class ImageUploadController {
  /**
   * POST /api/orders/upload-image
   * Upload order image and create UploadedOrder record
   */
  async uploadOrderImage(req, res, next) {
    try {
      // Check if file was uploaded
      if (!req.file) {
        return ApiResponse.error(res, 'No image file provided', 400);
      }

      // Get retailer ID from authenticated user or request body
      let retailerId = null;
      
      if (req.user?.retailerProfile?.id) {
        // If user is authenticated as retailer
        retailerId = req.user.retailerProfile.id;
      } else if (req.body.retailerId) {
        // If retailer ID provided in request (for admin/operator)
        retailerId = req.body.retailerId;
      }

      logger.info('Image upload request received', {
        filename: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size,
        retailerId,
        userId: req.user?.id,
      });

      // Process image upload
      const result = await imageUploadService.processImageUpload(req.file, retailerId);

      return ApiResponse.success(
        res,
        {
          uploadedOrderId: result.uploadedOrderId,
          imageUrl: result.imageUrl,
          status: result.status,
        },
        'Image uploaded successfully. Processing in background.',
        201
      );
    } catch (error) {
      logger.error('Image upload failed', {
        error: error.message,
        stack: error.stack,
        file: req.file?.originalname,
      });

      // Handle specific errors
      if (error.message.includes('Invalid file type')) {
        return ApiResponse.error(res, error.message, 400);
      }
      
      if (error.message.includes('File too large')) {
        return ApiResponse.error(res, error.message, 413);
      }

      if (error.message.includes('not initialized')) {
        return ApiResponse.error(res, 'Image upload service not configured', 503);
      }

      next(error);
    }
  }

  /**
   * GET /api/orders/upload-image/:id
   * Get uploaded order status
   */
  async getUploadedOrder(req, res, next) {
    try {
      const { id } = req.params;

      const uploadedOrder = await imageUploadService.getUploadedOrder(id);

      // Check authorization
      if (req.user?.role === 'RETAILER' && 
          uploadedOrder.retailerId !== req.user.retailerProfile?.id) {
        return ApiResponse.error(res, 'Unauthorized access', 403);
      }

      return ApiResponse.success(res, uploadedOrder, 'Uploaded order retrieved successfully');
    } catch (error) {
      if (error.message === 'UploadedOrder not found') {
        return ApiResponse.error(res, 'Uploaded order not found', 404);
      }
      next(error);
    }
  }

  /**
   * GET /api/orders/upload-image
   * List uploaded orders (with pagination)
   */
  async listUploadedOrders(req, res, next) {
    try {
      const { page = 1, limit = 20, status, retailerId } = req.query;
      
      const skip = (parseInt(page) - 1) * parseInt(limit);
      const take = parseInt(limit);

      // Build where clause
      const where = {};
      
      if (status) {
        where.status = status;
      }
      
      if (retailerId) {
        where.retailerId = retailerId;
      }
      
      // If user is retailer, only show their orders
      if (req.user?.role === 'RETAILER') {
        where.retailerId = req.user.retailerProfile?.id;
      }

      const [uploadedOrders, total] = await Promise.all([
        prisma.uploadedOrder.findMany({
          where,
          skip,
          take,
          orderBy: { createdAt: 'desc' },
          include: {
            retailer: {
              select: {
                id: true,
                shopName: true,
                retailerCode: true,
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
        }),
        prisma.uploadedOrder.count({ where }),
      ]);

      return ApiResponse.success(
        res,
        {
          uploadedOrders,
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total,
            totalPages: Math.ceil(total / parseInt(limit)),
          },
        },
        'Uploaded orders retrieved successfully'
      );
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new ImageUploadController();
