const OrderService = require('../../core/services/OrderService');
const ApiResponse = require('../../shared/utils/ApiResponse');
const asyncHandler = require('../../shared/utils/asyncHandler');
const prisma = require('../../infrastructure/database');

/**
 * Order Controller
 * Handles HTTP requests for order operations
 * NO business logic - only request/response handling
 */
class OrderController {
  constructor() {
    this.orderService = new OrderService(prisma);
  }

  /**
   * GET /api/orders/:id
   * Get order by ID
   */
  getOrderById = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const userId = req.user.id;
    const userRole = req.user.role;

    const order = await this.orderService.getOrderById(id, userId, userRole);

    return ApiResponse.success(res, order, 'Order retrieved successfully');
  });

  /**
   * GET /api/orders
   * Get orders list with pagination
   */
  getOrders = asyncHandler(async (req, res) => {
    const filters = {
      page: parseInt(req.query.page) || 1,
      limit: parseInt(req.query.limit) || 20,
      status: req.query.status,
      retailerId: req.query.retailerId,
      wholesalerId: req.query.wholesalerId,
      startDate: req.query.startDate,
      endDate: req.query.endDate,
    };

    const userId = req.user.id;
    const userRole = req.user.role;

    const result = await this.orderService.getOrders(filters, userId, userRole);

    return ApiResponse.paginated(
      res,
      result.orders,
      result.pagination,
      'Orders retrieved successfully'
    );
  });

  /**
   * POST /api/orders
   * Create new order
   */
  createOrder = asyncHandler(async (req, res) => {
    const orderData = {
      retailerId: req.body.retailerId || req.user.retailerProfile?.id,
      items: req.body.items,
      deliveryAddress: req.body.deliveryAddress,
      notes: req.body.notes,
    };

    const userId = req.user.id;
    const userRole = req.user.role;

    const order = await this.orderService.createOrder(orderData, userId, userRole);

    return ApiResponse.success(res, order, 'Order created successfully', 201);
  });

  /**
   * PATCH /api/orders/:id/status
   * Update order status
   */
  updateOrderStatus = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { status, notes } = req.body;
    const userId = req.user.id;
    const userRole = req.user.role;

    const order = await this.orderService.updateOrderStatus(
      id,
      status,
      notes,
      userId,
      userRole
    );

    return ApiResponse.success(res, order, 'Order status updated successfully');
  });

  /**
   * POST /api/orders/:id/cancel
   * Cancel order
   */
  cancelOrder = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { reason } = req.body;
    const userId = req.user.id;
    const userRole = req.user.role;

    const order = await this.orderService.cancelOrder(id, reason, userId, userRole);

    return ApiResponse.success(res, order, 'Order cancelled successfully');
  });

  /**
   * GET /api/orders/statistics
   * Get order statistics
   */
  getStatistics = asyncHandler(async (req, res) => {
    const filters = {
      retailerId: req.query.retailerId,
      wholesalerId: req.query.wholesalerId,
      startDate: req.query.startDate,
      endDate: req.query.endDate,
    };

    const userId = req.user.id;
    const userRole = req.user.role;

    const statistics = await this.orderService.getOrderStatistics(filters, userId, userRole);

    return ApiResponse.success(res, statistics, 'Statistics retrieved successfully');
  });
}

module.exports = new OrderController();
