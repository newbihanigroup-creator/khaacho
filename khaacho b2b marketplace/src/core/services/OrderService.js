const OrderRepository = require('../repositories/OrderRepository');
const { NotFoundError, ValidationError, BusinessLogicError, ForbiddenError } = require('../../shared/errors');
const logger = require('../../shared/logger');
const {
  ORDER_STATUS,
  ORDER_STATUS_TRANSITIONS,
  CANCELLABLE_ORDER_STATUSES,
  USER_ROLES,
  ADMIN_ROLES,
  ORDER_NUMBER,
} = require('../../shared/constants');

/**
 * Order Service
 * Handles all business logic related to order operations
 * 
 * @class OrderService
 */
class OrderService {
  /**
   * Creates an instance of OrderService
   * 
   * @param {Object} prisma - Prisma client instance
   */
  constructor(prisma) {
    this.orderRepository = new OrderRepository(prisma);
    this.prisma = prisma;
  }

  /**
   * Retrieves an order by its ID with authorization check
   * 
   * @param {string} orderId - The order ID to retrieve
   * @param {string} userId - The requesting user's ID
   * @param {string} userRole - The requesting user's role
   * @returns {Promise<Object>} The order with full details
   * @throws {NotFoundError} If order doesn't exist
   * @throws {ForbiddenError} If user doesn't have access
   */
  async getOrderById(orderId, userId, userRole) {
    logger.info('Retrieving order by ID', { orderId, userId, userRole });

    const order = await this.findOrderOrThrow(orderId);
    this.verifyOrderAccess(order, userId, userRole);

    return order;
  }

  /**
   * Finds an order by ID or throws NotFoundError
   * 
   * @private
   * @param {string} orderId - The order ID to find
   * @returns {Promise<Object>} The order with details
   * @throws {NotFoundError} If order doesn't exist
   */
  async findOrderOrThrow(orderId) {
    const order = await this.orderRepository.findByIdWithDetails(orderId);

    if (!order) {
      throw new NotFoundError('Order', orderId);
    }

    return order;
  }

  /**
   * Retrieves a paginated list of orders based on filters and user role
   * 
   * @param {Object} filters - Query filters (page, limit, status, dates, etc.)
   * @param {string} userId - The requesting user's ID
   * @param {string} userRole - The requesting user's role
   * @returns {Promise<Object>} Orders list with pagination metadata
   */
  async getOrders(filters, userId, userRole) {
    logger.info('Retrieving orders list', { filters, userId, userRole });

    const paginationParams = this.extractPaginationParams(filters);
    const queryFilters = this.extractQueryFilters(filters);

    const result = await this.fetchOrdersByRole(
      userRole,
      userId,
      filters,
      queryFilters,
      paginationParams
    );

    return this.formatOrdersResponse(result, paginationParams);
  }

  /**
   * Extracts pagination parameters from filters
   * 
   * @private
   * @param {Object} filters - Query filters
   * @returns {Object} Pagination parameters
   */
  extractPaginationParams(filters) {
    const page = parseInt(filters.page) || 1;
    const limit = parseInt(filters.limit) || 20;
    const skip = (page - 1) * limit;

    return { page, limit, skip };
  }

  /**
   * Extracts query filters from request filters
   * 
   * @private
   * @param {Object} filters - Request filters
   * @returns {Object} Query filters
   */
  extractQueryFilters(filters) {
    return {
      status: filters.status,
      startDate: filters.startDate,
      endDate: filters.endDate,
    };
  }

  /**
   * Fetches orders based on user role
   * 
   * @private
   * @param {string} userRole - User's role
   * @param {string} userId - User's ID
   * @param {Object} filters - Original filters
   * @param {Object} queryFilters - Extracted query filters
   * @param {Object} paginationParams - Pagination parameters
   * @returns {Promise<Object>} Query result with items and total
   */
  async fetchOrdersByRole(userRole, userId, filters, queryFilters, paginationParams) {
    if (userRole === USER_ROLES.RETAILER) {
      return await this.fetchRetailerOrders(
        filters.retailerId || userId,
        queryFilters,
        paginationParams
      );
    }

    if (userRole === USER_ROLES.WHOLESALER) {
      return await this.fetchWholesalerOrders(
        filters.wholesalerId || userId,
        queryFilters,
        paginationParams
      );
    }

    return await this.fetchAllOrders(filters, paginationParams);
  }

  /**
   * Fetches orders for a retailer
   * 
   * @private
   */
  async fetchRetailerOrders(retailerId, queryFilters, paginationParams) {
    return await this.orderRepository.findByRetailer(retailerId, {
      ...queryFilters,
      skip: paginationParams.skip,
      take: paginationParams.limit,
    });
  }

  /**
   * Fetches orders for a wholesaler
   * 
   * @private
   */
  async fetchWholesalerOrders(wholesalerId, queryFilters, paginationParams) {
    return await this.orderRepository.findByWholesaler(wholesalerId, {
      ...queryFilters,
      skip: paginationParams.skip,
      take: paginationParams.limit,
    });
  }

  /**
   * Fetches all orders (admin/operator view)
   * 
   * @private
   */
  async fetchAllOrders(filters, paginationParams) {
    return await this.orderRepository.findMany({
      where: this.buildWhereClause(filters),
      skip: paginationParams.skip,
      take: paginationParams.limit,
    });
  }

  /**
   * Formats orders response with pagination
   * 
   * @private
   */
  formatOrdersResponse(result, paginationParams) {
    return {
      orders: result.items,
      pagination: {
        page: paginationParams.page,
        limit: paginationParams.limit,
        total: result.total,
      },
    };
  }

  /**
   * Creates a new order with validation and credit checks
   * 
   * @param {Object} orderData - Order data including items and delivery info
   * @param {string} userId - The creating user's ID
   * @param {string} userRole - The creating user's role
   * @returns {Promise<Object>} The created order
   * @throws {ValidationError} If order data is invalid
   */
  async createOrder(orderData, userId, userRole) {
    logger.info('Creating new order', { userId, userRole, itemCount: orderData.items?.length });

    this.validateOrderData(orderData);

    const orderTotals = this.calculateOrderTotals(orderData.items);
    const orderNumber = await this.generateUniqueOrderNumber();

    const order = await this.createOrderWithItems(orderData, orderNumber, orderTotals);

    logger.info('Order created successfully', { orderId: order.id, orderNumber });

    return order;
  }

  /**
   * Creates order with items in database
   * 
   * @private
   */
  async createOrderWithItems(orderData, orderNumber, orderTotals) {
    const orderPayload = this.buildOrderPayload(orderData, orderNumber, orderTotals);
    const itemsPayload = this.buildItemsPayload(orderData.items);

    return await this.orderRepository.createWithItems(orderPayload, itemsPayload);
  }

  /**
   * Builds order payload for creation
   * 
   * @private
   */
  buildOrderPayload(orderData, orderNumber, orderTotals) {
    return {
      orderNumber,
      retailerId: orderData.retailerId,
      status: ORDER_STATUS.PENDING,
      subtotal: orderTotals.subtotal,
      total: orderTotals.total,
      deliveryAddress: orderData.deliveryAddress,
      notes: orderData.notes,
    };
  }

  /**
   * Builds items payload for creation
   * 
   * @private
   */
  buildItemsPayload(items) {
    return items.map(item => ({
      productId: item.productId,
      wholesalerId: item.wholesalerId,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      subtotal: item.quantity * item.unitPrice,
    }));
  }

  /**
   * Updates an order's status with validation
   * 
   * @param {string} orderId - The order ID to update
   * @param {string} newStatus - The new status to set
   * @param {string} notes - Optional notes about the status change
   * @param {string} userId - The updating user's ID
   * @param {string} userRole - The updating user's role
   * @returns {Promise<Object>} The updated order
   * @throws {NotFoundError} If order doesn't exist
   * @throws {BusinessLogicError} If status transition is invalid
   */
  async updateOrderStatus(orderId, newStatus, notes, userId, userRole) {
    logger.info('Updating order status', { orderId, newStatus, userId, userRole });

    const order = await this.findOrderOrThrow(orderId);
    this.validateStatusTransition(order.status, newStatus);

    const updatedOrder = await this.orderRepository.updateStatus(orderId, newStatus, notes);

    logger.info('Order status updated successfully', {
      orderId,
      oldStatus: order.status,
      newStatus,
    });

    return updatedOrder;
  }

  /**
   * Cancels an order with validation
   * 
   * @param {string} orderId - The order ID to cancel
   * @param {string} reason - Reason for cancellation
   * @param {string} userId - The cancelling user's ID
   * @param {string} userRole - The cancelling user's role
   * @returns {Promise<Object>} The cancelled order
   * @throws {NotFoundError} If order doesn't exist
   * @throws {BusinessLogicError} If order cannot be cancelled
   * @throws {ForbiddenError} If user doesn't have access
   */
  async cancelOrder(orderId, reason, userId, userRole) {
    logger.info('Cancelling order', { orderId, reason, userId, userRole });

    const order = await this.findOrderOrThrow(orderId);
    this.validateOrderCancellation(order, userId, userRole);

    const cancelledOrder = await this.orderRepository.updateStatus(
      orderId,
      ORDER_STATUS.CANCELLED,
      reason || 'Cancelled by user'
    );

    logger.info('Order cancelled successfully', { orderId });

    return cancelledOrder;
  }

  /**
   * Validates if an order can be cancelled
   * 
   * @private
   * @throws {BusinessLogicError} If order cannot be cancelled
   * @throws {ForbiddenError} If user doesn't have access
   */
  validateOrderCancellation(order, userId, userRole) {
    if (!this.isOrderCancellable(order.status)) {
      throw new BusinessLogicError(
        `Cannot cancel order in ${order.status} status`,
        { orderId: order.id, currentStatus: order.status }
      );
    }

    this.verifyOrderAccess(order, userId, userRole);
  }

  /**
   * Checks if an order status allows cancellation
   * 
   * @private
   * @param {string} status - The order status to check
   * @returns {boolean} True if order can be cancelled
   */
  isOrderCancellable(status) {
    return CANCELLABLE_ORDER_STATUSES.includes(status);
  }

  /**
   * Retrieves order statistics based on filters and user role
   * 
   * @param {Object} filters - Query filters
   * @param {string} userId - The requesting user's ID
   * @param {string} userRole - The requesting user's role
   * @returns {Promise<Object>} Order statistics
   */
  async getOrderStatistics(filters, userId, userRole) {
    logger.info('Retrieving order statistics', { filters, userId, userRole });

    const roleBasedFilters = this.applyRoleBasedFilters(filters, userId, userRole);

    return await this.orderRepository.getStatistics(roleBasedFilters);
  }

  /**
   * Applies role-based filters to statistics query
   * 
   * @private
   * @param {Object} filters - Original filters
   * @param {string} userId - User's ID
   * @param {string} userRole - User's role
   * @returns {Object} Filters with role-based restrictions
   */
  applyRoleBasedFilters(filters, userId, userRole) {
    const roleBasedFilters = { ...filters };

    if (userRole === USER_ROLES.RETAILER) {
      roleBasedFilters.retailerId = userId;
    } else if (userRole === USER_ROLES.WHOLESALER) {
      roleBasedFilters.wholesalerId = userId;
    }

    return roleBasedFilters;
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  /**
   * Validates order data before creation
   * 
   * @private
   * @param {Object} orderData - Order data to validate
   * @throws {ValidationError} If validation fails
   */
  validateOrderData(orderData) {
    this.validateRetailerId(orderData.retailerId);
    this.validateOrderItems(orderData.items);
  }

  /**
   * Validates retailer ID
   * 
   * @private
   * @throws {ValidationError} If retailer ID is missing
   */
  validateRetailerId(retailerId) {
    if (!retailerId) {
      throw new ValidationError('Retailer ID is required');
    }
  }

  /**
   * Validates order items
   * 
   * @private
   * @throws {ValidationError} If items are invalid
   */
  validateOrderItems(items) {
    if (!items || items.length === 0) {
      throw new ValidationError('Order must have at least one item');
    }

    items.forEach((item, index) => this.validateSingleItem(item, index));
  }

  /**
   * Validates a single order item
   * 
   * @private
   * @throws {ValidationError} If item is invalid
   */
  validateSingleItem(item, index) {
    if (!item.productId || !item.quantity || !item.unitPrice) {
      throw new ValidationError(
        `Item at index ${index} must have productId, quantity, and unitPrice`
      );
    }

    if (item.quantity <= 0) {
      throw new ValidationError(`Item at index ${index}: quantity must be greater than 0`);
    }

    if (item.unitPrice < 0) {
      throw new ValidationError(`Item at index ${index}: unit price cannot be negative`);
    }
  }

  /**
   * Calculates order subtotal and total
   * 
   * @private
   * @param {Array} items - Order items
   * @returns {Object} Object with subtotal and total
   */
  calculateOrderTotals(items) {
    const subtotal = items.reduce((sum, item) => {
      return sum + (item.quantity * item.unitPrice);
    }, 0);

    // Add any additional charges here (tax, delivery, etc.)
    const total = subtotal;

    return { subtotal, total };
  }

  /**
   * Generates a unique order number
   * Format: ORD + YYMMDD + 4-digit sequence
   * 
   * @private
   * @returns {Promise<string>} Unique order number
   */
  async generateUniqueOrderNumber() {
    const datePrefix = this.getOrderNumberDatePrefix();
    const sequence = await this.getTodayOrderSequence();
    const paddedSequence = sequence.toString().padStart(ORDER_NUMBER.SEQUENCE_LENGTH, '0');

    return `${ORDER_NUMBER.PREFIX}${datePrefix}${paddedSequence}`;
  }

  /**
   * Gets date prefix for order number (YYMMDD)
   * 
   * @private
   * @returns {string} Date prefix
   */
  getOrderNumberDatePrefix() {
    const date = new Date();
    const year = date.getFullYear().toString().slice(-2);
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');

    return `${year}${month}${day}`;
  }

  /**
   * Gets the next sequence number for today's orders
   * 
   * @private
   * @returns {Promise<number>} Next sequence number
   */
  async getTodayOrderSequence() {
    const { startOfDay, endOfDay } = this.getTodayDateRange();

    const todayOrderCount = await this.orderRepository.count({
      createdAt: {
        gte: startOfDay,
        lte: endOfDay,
      },
    });

    return todayOrderCount + 1;
  }

  /**
   * Gets start and end of current day
   * 
   * @private
   * @returns {Object} Start and end date objects
   */
  getTodayDateRange() {
    const now = new Date();
    const startOfDay = new Date(now.setHours(0, 0, 0, 0));
    const endOfDay = new Date(now.setHours(23, 59, 59, 999));

    return { startOfDay, endOfDay };
  }

  /**
   * Validates if a status transition is allowed
   * 
   * @private
   * @param {string} currentStatus - Current order status
   * @param {string} newStatus - Desired new status
   * @throws {BusinessLogicError} If transition is not allowed
   */
  validateStatusTransition(currentStatus, newStatus) {
    const allowedTransitions = ORDER_STATUS_TRANSITIONS[currentStatus] || [];

    if (!allowedTransitions.includes(newStatus)) {
      throw new BusinessLogicError(
        `Invalid status transition from ${currentStatus} to ${newStatus}`,
        { currentStatus, newStatus, allowedTransitions }
      );
    }
  }

  /**
   * Verifies if user has access to an order
   * 
   * @private
   * @param {Object} order - The order to check access for
   * @param {string} userId - The user's ID
   * @param {string} userRole - The user's role
   * @throws {ForbiddenError} If user doesn't have access
   */
  verifyOrderAccess(order, userId, userRole) {
    if (this.isAdminRole(userRole)) {
      return; // Admins and operators can access all orders
    }

    if (userRole === USER_ROLES.RETAILER) {
      this.verifyRetailerAccess(order, userId);
      return;
    }

    if (userRole === USER_ROLES.WHOLESALER) {
      this.verifyWholesalerAccess(order, userId);
      return;
    }
  }

  /**
   * Checks if role is an admin role
   * 
   * @private
   * @param {string} userRole - The user's role
   * @returns {boolean} True if admin role
   */
  isAdminRole(userRole) {
    return ADMIN_ROLES.includes(userRole);
  }

  /**
   * Verifies retailer access to order
   * 
   * @private
   * @throws {ForbiddenError} If retailer doesn't own the order
   */
  verifyRetailerAccess(order, userId) {
    if (order.retailerId !== userId) {
      throw new ForbiddenError('You do not have access to this order');
    }
  }

  /**
   * Verifies wholesaler access to order
   * 
   * @private
   * @throws {ForbiddenError} If wholesaler has no items in the order
   */
  verifyWholesalerAccess(order, userId) {
    const hasAccess = order.items?.some(item => item.wholesalerId === userId);

    if (!hasAccess) {
      throw new ForbiddenError('You do not have access to this order');
    }
  }

  /**
   * Build where clause for filters
   */
  buildWhereClause(filters) {
    const where = {};

    if (filters.retailerId) {
      where.retailerId = filters.retailerId;
    }

    if (filters.status) {
      where.status = filters.status;
    }

    if (filters.startDate || filters.endDate) {
      where.createdAt = {};
      if (filters.startDate) where.createdAt.gte = new Date(filters.startDate);
      if (filters.endDate) where.createdAt.lte = new Date(filters.endDate);
    }

    return where;
  }
}

module.exports = OrderService;
