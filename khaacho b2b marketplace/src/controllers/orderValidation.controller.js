const orderValidationService = require('../services/orderValidation.service');
const logger = require('../shared/logger');
const { asyncHandler } = require('../shared/utils/asyncHandler');
const ApiResponse = require('../shared/utils/ApiResponse');
const Decimal = require('decimal.js');

/**
 * Order Validation Controller
 * Handles HTTP requests for order validation
 */
class OrderValidationController {
  /**
   * Validate order credit
   * POST /api/v1/order-validation/validate
   */
  validateCredit = asyncHandler(async (req, res) => {
    const { retailerId, orderAmount } = req.body;

    if (!retailerId || !orderAmount) {
      return res.status(400).json(
        ApiResponse.error('Retailer ID and order amount are required', 'VALIDATION_ERROR')
      );
    }

    const validation = await orderValidationService.validateOrderCredit(
      retailerId,
      new Decimal(orderAmount)
    );

    if (!validation.isValid) {
      return res.status(200).json(
        ApiResponse.success({
          ...validation,
          canProceed: false,
        })
      );
    }

    return res.status(200).json(
      ApiResponse.success({
        ...validation,
        canProceed: true,
      })
    );
  });

  /**
   * Get rejected orders
   * GET /api/v1/order-validation/rejected
   */
  getRejectedOrders = asyncHandler(async (req, res) => {
    const {
      retailerId,
      rejectionReason,
      isReviewed,
      page = 1,
      limit = 20,
    } = req.query;

    const filters = {};
    if (retailerId) filters.retailerId = retailerId;
    if (rejectionReason) filters.rejectionReason = rejectionReason;
    if (isReviewed !== undefined) filters.isReviewed = isReviewed === 'true';

    const result = await orderValidationService.getRejectedOrders(
      filters,
      parseInt(page),
      parseInt(limit)
    );

    return res.status(200).json(ApiResponse.success(result));
  });

  /**
   * Get rejected order by ID
   * GET /api/v1/order-validation/rejected/:id
   */
  getRejectedOrderById = asyncHandler(async (req, res) => {
    const { id } = req.params;

    const rejectedOrder = await prisma.rejectedOrder.findUnique({
      where: { id },
      include: {
        retailer: {
          include: {
            user: {
              select: {
                businessName: true,
                phoneNumber: true,
              },
            },
          },
        },
      },
    });

    if (!rejectedOrder) {
      return res.status(404).json(
        ApiResponse.error('Rejected order not found', 'NOT_FOUND')
      );
    }

    return res.status(200).json(ApiResponse.success(rejectedOrder));
  });

  /**
   * Mark rejected order as reviewed
   * PUT /api/v1/order-validation/rejected/:id/review
   */
  markAsReviewed = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { reviewNotes } = req.body;
    const reviewedBy = req.user?.id || 'system';

    const rejectedOrder = await orderValidationService.markAsReviewed(
      id,
      reviewedBy,
      reviewNotes
    );

    return res.status(200).json(
      ApiResponse.success(rejectedOrder, 'Rejected order marked as reviewed')
    );
  });

  /**
   * Get rejection statistics
   * GET /api/v1/order-validation/stats
   */
  getRejectionStats = asyncHandler(async (req, res) => {
    const { startDate, endDate, retailerId } = req.query;

    const where = {};
    if (retailerId) where.retailerId = retailerId;
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate);
    }

    const [
      totalRejected,
      byReason,
      totalRequested,
      totalShortfall,
      reviewedCount,
    ] = await Promise.all([
      // Total rejected orders
      prisma.rejectedOrder.count({ where }),

      // Group by rejection reason
      prisma.rejectedOrder.groupBy({
        by: ['rejectionReason'],
        where,
        _count: {
          id: true,
        },
      }),

      // Total requested amount
      prisma.rejectedOrder.aggregate({
        where,
        _sum: {
          requestedAmount: true,
        },
      }),

      // Total shortfall
      prisma.rejectedOrder.aggregate({
        where,
        _sum: {
          shortfall: true,
        },
      }),

      // Reviewed count
      prisma.rejectedOrder.count({
        where: {
          ...where,
          isReviewed: true,
        },
      }),
    ]);

    const stats = {
      totalRejected,
      reviewedCount,
      pendingReview: totalRejected - reviewedCount,
      totalRequestedAmount: totalRequested._sum.requestedAmount?.toString() || '0',
      totalShortfall: totalShortfall._sum.shortfall?.toString() || '0',
      byReason: byReason.map((r) => ({
        reason: r.rejectionReason,
        count: r._count.id,
      })),
    };

    return res.status(200).json(ApiResponse.success(stats));
  });
}

module.exports = new OrderValidationController();
