const express = require('express');
const router = express.Router();
const creditLedgerController = require('../controllers/creditLedger.controller');
const auth = require('../middleware/auth');

// Admin Dashboard
router.get('/dashboard', auth.requireRole(['ADMIN', 'OPERATOR']), creditLedgerController.getDashboard);

// Ledger Statistics
router.get('/stats', auth.requireRole(['ADMIN', 'OPERATOR']), creditLedgerController.getLedgerStats);

// Retailer Ledger
router.get('/retailer/:retailerId/balance', auth.requireRole(['ADMIN', 'OPERATOR', 'RETAILER']), creditLedgerController.getRetailerBalance);
router.get('/retailer/:retailerId/ledger', auth.requireRole(['ADMIN', 'OPERATOR', 'RETAILER']), creditLedgerController.getRetailerLedger);

// Vendor Ledger
router.get('/vendor/:vendorId/receivable', auth.requireRole(['ADMIN', 'OPERATOR', 'VENDOR']), creditLedgerController.getVendorReceivable);
router.get('/vendor/:vendorId/ledger', auth.requireRole(['ADMIN', 'OPERATOR', 'VENDOR']), creditLedgerController.getVendorLedger);

// Order Balance
router.get('/order/:orderId/outstanding', auth.requireRole(['ADMIN', 'OPERATOR', 'RETAILER', 'VENDOR']), creditLedgerController.getOrderOutstandingBalance);

// Payment Management
router.get('/payments/history', auth.requireRole(['ADMIN', 'OPERATOR', 'RETAILER', 'VENDOR']), creditLedgerController.getPaymentHistory);
router.get('/payments/summary', auth.requireRole(['ADMIN', 'OPERATOR']), creditLedgerController.getPaymentSummary);
router.get('/payments/report', auth.requireRole(['ADMIN', 'OPERATOR']), creditLedgerController.generatePaymentReport);
router.post('/payments/process', auth.requireRole(['ADMIN', 'OPERATOR']), creditLedgerController.processPayment);
router.post('/payments/bulk', auth.requireRole(['ADMIN', 'OPERATOR']), creditLedgerController.processBulkPayments);

// Payment Reconciliation
router.get('/order/:orderId/reconcile', auth.requireRole(['ADMIN', 'OPERATOR']), creditLedgerController.reconcilePayments);

module.exports = router;
