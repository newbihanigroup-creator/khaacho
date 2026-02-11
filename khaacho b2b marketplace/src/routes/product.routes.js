const express = require('express');
const productController = require('../controllers/product.controller');
const { authenticate, authorize } = require('../middleware/auth');
const validate = require('../middleware/validation');
const { body } = require('express-validator');

const router = express.Router();

// Validation rules
const createValidation = [
  body('name').notEmpty().withMessage('Product name is required'),
  body('sku').notEmpty().withMessage('SKU is required'),
  body('unit').notEmpty().withMessage('Unit is required'),
  body('price').isFloat({ min: 0 }).withMessage('Price must be a positive number'),
  body('stock').isInt({ min: 0 }).withMessage('Stock must be a non-negative integer'),
];

router.post(
    '/',
    authenticate,
    authorize('VENDOR'),
    createValidation,
    validate,
    productController.createProduct.bind(productController)
);

router.get(
    '/',
    authenticate,
    productController.getProducts.bind(productController)
);

router.patch(
    '/:id',
    authenticate,
    authorize('VENDOR', 'ADMIN'),
    productController.updateProduct.bind(productController)
);

module.exports = router;
