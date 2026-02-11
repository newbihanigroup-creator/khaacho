const express = require('express');
const router = express.Router();
const financialAccountingController = require('../controllers/financialAccounting.controller');
const auth = require('../middleware/auth');

// Invoice management
router.post('/invoices/:orderId/generate', auth.requireRole(['ADMIN', 'OPERATOR', 'SYSTEM']), financialAccountingController.generateInvoice);
router.get('/invoices/:invoiceNumber', auth.requireRole(['ADMIN', 'OPERATOR', 'RETAILER', 'VENDOR']), financialAccountingController.getInvoiceDetails);
router.get('/invoices', auth.requireRole(['ADMIN', 'OPERATOR', 'RETAILER', 'VENDOR']), financialAccountingController.getInvoices);

// Payment processing
router.post('/payments/process', auth.requireRole(['ADMIN', 'OPERATOR', 'RETAILER', 'VENDOR']), financialAccountingController.processPayment);
router.get('/payments', auth.requireRole(['ADMIN', 'OPERATOR', 'RETAILER', 'VENDOR']), financialAccountingController.getPayments);

// Vendor settlements
router.post('/vendor-settlements/create', auth.requireRole(['ADMIN', 'OPERATOR']), financialAccountingController.createVendorSettlement);
router.get('/vendor-settlements', auth.requireRole(['ADMIN', 'OPERATOR', 'VENDOR']), financialAccountingController.getVendorSettlements);

// Financial reports
router.get('/reports/retailer/:retailerId', auth.requireRole(['ADMIN', 'OPERATOR', 'RETAILER']), financialAccountingController.getRetailerFinancialReports);
router.get('/reports/vendor/:vendorId', auth.requireRole(['ADMIN', 'OPERATOR', 'VENDOR']), financialAccountingController.getVendorFinancialReports);
router.get('/reports/platform/overview', auth.requireRole(['ADMIN', 'OPERATOR']), financialAccountingController.getPlatformFinancialOverview);

module.exports = router;
