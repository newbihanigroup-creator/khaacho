const orderStatusTransitionService = require('../services/orderStatusTransition.service');
const ApiResponse = require('../utils/response');
const logger = require('../utils/logger');

class OrderStatusController {
  async updateOrderStatus(req, res, next) {
    try {
      const { orderId } = req.params;
      const { newStatus, notes, estimatedDeliveryTime, deliveryAgentId } = req.body;
      
      if (!newStatus) {
        return ApiResponse.error(res, 'New status is required', 400);
      }

      const result = await orderStatusTransitionService.updateOrderStatus(
        orderId,
        newStatus,
        req.user,
        { notes, estimatedDeliveryTime, deliveryAgentId }
      );

      return ApiResponse.success(res, result, 'Order status updated successfully');
    } catch (error) {
      logger.error('Error updating order status', { error: error.message });
      return ApiResponse.error(res, error.message, 400);
    }
  }

  async vendorUpdateStatus(req, res, next) {
    try {
      const { orderId } = req.params;
      const { newStatus, notes } = req.body;
      
      if (!newStatus) {
        return ApiResponse.error(res, 'New status is required', 400);
      }

      // Vendors can only update up to DISPATCHED
      const allowedVendorStatuses = ['PACKING', 'DISPATCHED'];
      if (!allowedVendorStatuses.includes(newStatus)) {
        return ApiResponse.error(res, 'Vendors can only update status to PACKING or DISPATCHED', 403);
      }

      const result = await orderStatusTransitionService.updateOrderStatus(
        orderId,
        newStatus,
        req.user,
        { notes }
      );

      return ApiResponse.success(res, result, 'Order status updated successfully');
    } catch (error) {
      logger.error('Error updating order status by vendor', { error: error.message });
      return ApiResponse.error(res, error.message, 400);
    }
  }

  async adminUpdateStatus(req, res, next) {
    try {
      const { orderId } = req.params;
      const { newStatus, notes, estimatedDeliveryTime, deliveryAgentId } = req.body;
      
      if (!newStatus) {
        return ApiResponse.error(res, 'New status is required', 400);
      }

      const result = await orderStatusTransitionService.updateOrderStatus(
        orderId,
        newStatus,
        req.user,
        { notes, estimatedDeliveryTime, deliveryAgentId }
      );

      return ApiResponse.success(res, result, 'Order status updated successfully');
    } catch (error) {
      logger.error('Error updating order status by admin', { error: error.message });
      return ApiResponse.error(res, error.message, 400);
    }
  }

  async confirmOrderCompletion(req, res, next) {
    try {
      const { orderId } = req.params;
      
      const result = await orderStatusTransitionService.confirmOrderCompletion(
        orderId,
        req.user
      );

      return ApiResponse.success(res, result, 'Order confirmed as completed');
    } catch (error) {
      logger.error('Error confirming order completion', { error: error.message });
      return ApiResponse.error(res, error.message, 400);
    }
  }

  async getValidTransitions(req, res, next) {
    try {
      const { currentStatus } = req.query;
      
      if (!currentStatus) {
        return ApiResponse.error(res, 'Current status is required', 400);
      }

      const transitions = await orderStatusTransitionService.getValidTransitions(currentStatus);
      const permissions = await orderStatusTransitionService.getRolePermissions(currentStatus);

      return ApiResponse.success(res, {
        currentStatus,
        validTransitions: transitions,
        rolePermissions: permissions
      }, 'Valid transitions retrieved successfully');
    } catch (error) {
      logger.error('Error getting valid transitions', { error: error.message });
      return ApiResponse.error(res, error.message, 500);
    }
  }

  async getDelayedOrders(req, res, next) {
    try {
      const { delayHours = 24 } = req.query;
      
      const delayedOrders = await orderStatusTransitionService.getDelayedOrders(
        parseInt(delayHours)
      );

      return ApiResponse.success(res, {
        delayHours: parseInt(delayHours),
        delayedOrders,
        totalDelayed: delayedOrders.length
      }, 'Delayed orders retrieved successfully');
    } catch (error) {
      logger.error('Error getting delayed orders', { error: error.message });
      return ApiResponse.error(res, error.message, 500);
    }
  }

  async getOrderStatusDistribution(req, res, next) {
    try {
      const distribution = await orderStatusTransitionService.getOrderStatusDistribution();
      
      return ApiResponse.success(res, {
        distribution,
        totalOrders: Object.values(distribution).reduce((sum, count) => sum + count, 0)
      }, 'Order status distribution retrieved successfully');
    } catch (error) {
      logger.error('Error getting order status distribution', { error: error.message });
      return ApiResponse.error(res, error.message, 500);
    }
  }

  async getDeliveryDashboard(req, res, next) {
    try {
      console.log('📊 Generating delivery dashboard...');
      
      // Get status distribution
      const distribution = await orderStatusTransitionService.getOrderStatusDistribution();
      
      // Get delayed orders
      const delayedOrders = await orderStatusTransitionService.getDelayedOrders(24);
      const criticalDelays = await orderStatusTransitionService.getDelayedOrders(48);
      
      // Calculate metrics
      const totalOrders = Object.values(distribution).reduce((sum, count) => sum + count, 0);
      const activeOrders = (distribution.ACCEPTED || 0) + (distribution.PACKING || 0) + 
                          (distribution.DISPATCHED || 0) + (distribution.OUT_FOR_DELIVERY || 0);
      
      const dashboard = {
        summary: {
          totalOrders,
          activeOrders,
          delayedOrders: delayedOrders.length,
          criticalDelays: criticalDelays.length,
          deliveryRate: totalOrders > 0 ? ((distribution.DELIVERED || 0) / totalOrders * 100).toFixed(2) : 0,
          completionRate: totalOrders > 0 ? ((distribution.COMPLETED || 0) / totalOrders * 100).toFixed(2) : 0
        },
        statusDistribution: distribution,
        delayedOrders: delayedOrders.slice(0, 10), // Top 10 delayed orders
        criticalDelays: criticalDelays.slice(0, 5),  // Top 5 critical delays
        statusFlow: {
          placed: distribution.PLACED || 0,
          pending: distribution.PENDING || 0,
          accepted: distribution.ACCEPTED || 0,
          packing: distribution.PACKING || 0,
          dispatched: distribution.DISPATCHED || 0,
          outForDelivery: distribution.OUT_FOR_DELIVERY || 0,
          delivered: distribution.DELIVERED || 0,
          completed: distribution.COMPLETED || 0
        },
        generatedAt: new Date()
      };

      return ApiResponse.success(res, dashboard, 'Delivery dashboard retrieved successfully');
    } catch (error) {
      logger.error('Error generating delivery dashboard', { error: error.message });
      return ApiResponse.error(res, error.message, 500);
    }
  }
}

module.exports = new OrderStatusController();
