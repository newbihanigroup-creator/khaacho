const express = require('express');
const AuthController = require('../controllers/auth.controller');
const { authenticate } = require('../middleware/auth');
const validate = require('../middleware/validation');
const { body } = require('express-validator');

const router = express.Router();

// Validation rules
const registerValidation = [
  body('phoneNumber').isMobilePhone('any').withMessage('Invalid phone number'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('name').notEmpty().withMessage('Name is required'),
  body('role').isIn(['VENDOR', 'RETAILER', 'ADMIN']).withMessage('Invalid role'),
];

const loginValidation = [
  body('phoneNumber').isMobilePhone('any').withMessage('Invalid phone number'),
  body('password').notEmpty().withMessage('Password is required'),
];

router.post('/register', registerValidation, validate, AuthController.register.bind(AuthController));
router.post('/login', loginValidation, validate, AuthController.login.bind(AuthController));
router.get('/profile', authenticate, AuthController.getProfile.bind(AuthController));

module.exports = router;
