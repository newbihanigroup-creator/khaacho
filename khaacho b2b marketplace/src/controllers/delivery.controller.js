const deliveryService = require('../services/delivery.service');
const ApiResponse = require('../utils/response');
const logger = require('../utils/logger');

class DeliveryController {
  /**
   * Create delivery assignment
   */
  async createDelivery(req, res, next) {
    try {
      const deliveryData = req.body;
      
      const delivery = await deliveryService.createDelivery(deliveryData);
      
      return ApiResponse.success(res, delivery, 'Delivery created successfully', 201);
    } catch (error) {
      logger.error('Error creating delivery', { error: error.message });
      next(error);
    }
  }

  /**
   * Update delivery status
   */
  async updateDeliveryStatus(req, res, next) {
    try {
      const { deliveryId } = req.params;
      const { status, ...updateData } = req.body;
      
      if (!status) {
        return ApiResponse.error(res, 'Status is required', 400);
      }
      
      const delivery = await deliveryService.updateDeliveryStatus(deliveryId, status, updateData);
      
      return ApiResponse.success(res, delivery, 'Delivery status updated successfully');
    } catch (error) {
      logger.error('Error updating delivery status', { error: error.message });
      next(error);
    }
  }

  /**
   * Get delivery by ID
   */
  async getDeliveryById(req, res, next) {
    try {
      const { deliveryId } = req.params;
      
      const delivery = await deliveryService.getDeliveryById(deliveryId);
      
      if (!delivery) {
        return ApiResponse.error(res, 'Delivery not found', 404);
      }
      
      return ApiResponse.success(res, delivery, 'Delivery retrieved successfully');
    } catch (error) {
      logger.error('Error getting delivery', { error: error.message });
      next(error);
    }
  }

  /**
   * Get deliveries for delivery person
   */
  async getDeliveriesForPerson(req, res, next) {
    try {
      const { deliveryPersonId } = req.params;
      const { status, limit, offset } = req.query;
      
      const deliveries = await deliveryService.getDeliveriesForPerson(deliveryPersonId, {
        status,
        limit: limit ? parseInt(limit) : undefined,
        offset: offset ? parseInt(offset) : undefined
      });
      
      return ApiResponse.success(res, {
        deliveries,
        count: deliveries.length
      }, 'Deliveries retrieved successfully');
    } catch (error) {
      logger.error('Error getting deliveries for person', { error: error.message });
      next(error);
    }
  }

  /**
   * Get active deliveries
   */
  async getActiveDeliveries(req, res, next) {
    try {
      const deliveries = await deliveryService.getActiveDeliveries();
      
      return ApiResponse.success(res, {
        deliveries,
        count: deliveries.length
      }, 'Active deliveries retrieved successfully');
    } catch (error) {
      logger.error('Error getting active deliveries', { error: error.message });
      next(error);
    }
  }

  /**
   * Get delivery person performance
   */
  async getDeliveryPersonPerformance(req, res, next) {
    try {
      const { deliveryPersonId } = req.params;
      
      const performance = await deliveryService.getDeliveryPersonPerformance(deliveryPersonId);
      
      if (!performance) {
        return ApiResponse.error(res, 'Delivery person not found', 404);
      }
      
      return ApiResponse.success(res, performance, 'Performance data retrieved successfully');
    } catch (error) {
      logger.error('Error getting delivery person performance', { error: error.message });
      next(error);
    }
  }

  /**
   * Create delivery person
   */
  async createDeliveryPerson(req, res, next) {
    try {
      const personData = req.body;
      
      const person = await deliveryService.createDeliveryPerson(personData);
      
      return ApiResponse.success(res, person, 'Delivery person created successfully', 201);
    } catch (error) {
      logger.error('Error creating delivery person', { error: error.message });
      next(error);
    }
  }

  /**
   * Rate delivery
   */
  async rateDelivery(req, res, next) {
    try {
      const ratingData = req.body;
      
      const result = await deliveryService.rateDelivery(ratingData);
      
      return ApiResponse.success(res, result, 'Delivery rated successfully');
    } catch (error) {
      logger.error('Error rating delivery', { error: error.message });
      next(error);
    }
  }

  /**
   * Mark as picked up
   */
  async markPickedUp(req, res, next) {
    try {
      const { deliveryId } = req.params;
      const { location, notes } = req.body;
      
      const delivery = await deliveryService.updateDeliveryStatus(deliveryId, 'PICKED_UP', {
        location,
        notes
      });
      
      return ApiResponse.success(res, delivery, 'Delivery marked as picked up');
    } catch (error) {
      logger.error('Error marking delivery as picked up', { error: error.message });
      next(error);
    }
  }

  /**
   * Mark as out for delivery
   */
  async markOutForDelivery(req, res, next) {
    try {
      const { deliveryId } = req.params;
      const { location, notes } = req.body;
      
      const delivery = await deliveryService.updateDeliveryStatus(deliveryId, 'OUT_FOR_DELIVERY', {
        location,
        notes
      });
      
      return ApiResponse.success(res, delivery, 'Delivery marked as out for delivery');
    } catch (error) {
      logger.error('Error marking delivery as out for delivery', { error: error.message });
      next(error);
    }
  }

  /**
   * Mark as delivered
   */
  async markDelivered(req, res, next) {
    try {
      const { deliveryId } = req.params;
      const { location, notes, signatureUrl, photoUrl } = req.body;
      
      const delivery = await deliveryService.updateDeliveryStatus(deliveryId, 'DELIVERED', {
        location,
        notes,
        signatureUrl,
        photoUrl,
        deliveryNotes: notes
      });
      
      return ApiResponse.success(res, delivery, 'Delivery marked as delivered - Credit ledger updated');
    } catch (error) {
      logger.error('Error marking delivery as delivered', { error: error.message });
      next(error);
    }
  }

  /**
   * Mark as failed
   */
  async markFailed(req, res, next) {
    try {
      const { deliveryId } = req.params;
      const { location, failureReason } = req.body;
      
      if (!failureReason) {
        return ApiResponse.error(res, 'Failure reason is required', 400);
      }
      
      const delivery = await deliveryService.updateDeliveryStatus(deliveryId, 'FAILED', {
        location,
        failureReason
      });
      
      return ApiResponse.success(res, delivery, 'Delivery marked as failed');
    } catch (error) {
      logger.error('Error marking delivery as failed', { error: error.message });
      next(error);
    }
  }
}

module.exports = new DeliveryController();
