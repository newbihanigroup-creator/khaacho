const express = require('express');
const multer = require('multer');
const imageUploadController = require('../controllers/imageUpload.controller');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

// Configure multer for memory storage (we'll upload to cloud)
const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max
  },
  fileFilter: (req, file, cb) => {
    // Accept images only
    const allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    
    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Invalid file type: ${file.mimetype}. Allowed: ${allowedMimeTypes.join(', ')}`), false);
    }
  },
});

/**
 * @route   POST /api/orders/upload-image
 * @desc    Upload order image
 * @access  Private (Retailer, Admin, Operator)
 * @body    multipart/form-data with 'image' field
 * @body    retailerId (optional, for admin/operator)
 */
router.post(
  '/upload-image',
  authenticate,
  authorize('RETAILER', 'ADMIN', 'OPERATOR'),
  upload.single('image'),
  imageUploadController.uploadOrderImage
);

/**
 * @route   GET /api/orders/upload-image/:id
 * @desc    Get uploaded order by ID
 * @access  Private (Retailer can only see their own, Admin/Operator can see all)
 */
router.get(
  '/upload-image/:id',
  authenticate,
  authorize('RETAILER', 'ADMIN', 'OPERATOR'),
  imageUploadController.getUploadedOrder
);

/**
 * @route   GET /api/orders/upload-image
 * @desc    List uploaded orders
 * @access  Private (Retailer sees their own, Admin/Operator see all)
 * @query   page, limit, status, retailerId
 */
router.get(
  '/upload-image',
  authenticate,
  authorize('RETAILER', 'ADMIN', 'OPERATOR'),
  imageUploadController.listUploadedOrders
);

module.exports = router;
