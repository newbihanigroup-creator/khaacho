const express = require('express');
const router = express.Router();
const deliveryController = require('../controllers/delivery.controller');
const auth = require('../middleware/auth');

// Delivery management
router.post('/deliveries', auth.requireRole(['ADMIN', 'OPERATOR']), deliveryController.createDelivery);
router.get('/deliveries/active', auth.requireRole(['ADMIN', 'OPERATOR']), deliveryController.getActiveDeliveries);
router.get('/deliveries/:deliveryId', auth.requireRole(['ADMIN', 'OPERATOR', 'VENDOR']), deliveryController.getDeliveryById);
router.put('/deliveries/:deliveryId/status', auth.requireRole(['ADMIN', 'OPERATOR']), deliveryController.updateDeliveryStatus);

// Quick status updates
router.put('/deliveries/:deliveryId/picked-up', auth.requireRole(['ADMIN', 'OPERATOR']), deliveryController.markPickedUp);
router.put('/deliveries/:deliveryId/out-for-delivery', auth.requireRole(['ADMIN', 'OPERATOR']), deliveryController.markOutForDelivery);
router.put('/deliveries/:deliveryId/delivered', auth.requireRole(['ADMIN', 'OPERATOR']), deliveryController.markDelivered);
router.put('/deliveries/:deliveryId/failed', auth.requireRole(['ADMIN', 'OPERATOR']), deliveryController.markFailed);

// Delivery person management
router.post('/delivery-persons', auth.requireRole(['ADMIN']), deliveryController.createDeliveryPerson);
router.get('/delivery-persons/:deliveryPersonId/deliveries', auth.requireRole(['ADMIN', 'OPERATOR']), deliveryController.getDeliveriesForPerson);
router.get('/delivery-persons/:deliveryPersonId/performance', auth.requireRole(['ADMIN', 'OPERATOR']), deliveryController.getDeliveryPersonPerformance);

// Ratings
router.post('/deliveries/rate', auth.requireRole(['ADMIN', 'OPERATOR', 'RETAILER']), deliveryController.rateDelivery);

module.exports = router;
