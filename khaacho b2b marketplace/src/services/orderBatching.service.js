/**
 * Order Batching Service
 * 
 * Combines orders from nearby buyers to reduce delivery costs
 * - Geographic proximity batching
 * - Product grouping for bulk orders
 * - Cost optimization
 * - Savings tracking
 */

const prisma = require('../config/database');
const logger = require('../shared/logger');

class OrderBatchingService {
  constructor() {
    this.config = null;
  }

  /**
   * Get batching configuration
   */
  async getConfig() {
    if (!this.config) {
      const config = await prisma.batchingConfig.findFirst({
        where: { isActive: true },
        orderBy: { createdAt: 'desc' },
      });
      
      this.config = config || this.getDefaultConfig();
    }
    
    return this.config;
  }

  /**
   * Get default configuration
   */
  getDefaultConfig() {
    return {
      maxDistanceKm: 5.00,
      minOrdersPerBatch: 3,
      maxOrdersPerBatch: 20,
      batchWindowMinutes: 60,
      maxWaitTimeMinutes: 120,
      enableProductGrouping: true,
      minSameProductOrders: 2,
      baseDeliveryCost: 50.00,
      costPerKm: 5.00,
      costPerStop: 10.00,
      bulkDiscountThreshold: 5,
      bulkDiscountPercentage: 5.00,
    };
  }

  /**
   * Create batch from pending orders
   */
  async createBatch(vendorId, centerLocation) {
    try {
      const config = await this.getConfig();
      const { latitude, longitude } = centerLocation;

      // Define batch window
      const batchWindowStart = new Date();
      const batchWindowEnd = new Date(
        batchWindowStart.getTime() + config.batchWindowMinutes * 60 * 1000
      );

      // Find nearby orders
      const nearbyOrders = await this.findNearbyOrders({
        vendorId,
        centerLat: latitude,
        centerLon: longitude,
        maxDistanceKm: config.maxDistanceKm,
        timeWindowStart: batchWindowStart,
        timeWindowEnd: batchWindowEnd,
      });

      if (nearbyOrders.length < config.minOrdersPerBatch) {
        logger.info('Not enough orders for batching', {
          vendorId,
          ordersFound: nearbyOrders.length,
          minRequired: config.minOrdersPerBatch,
        });
        return null;
      }

      // Create batch
      const batch = await this.createBatchRecord({
        vendorId,
        centerLocation,
        batchWindowStart,
        batchWindowEnd,
        orders: nearbyOrders.slice(0, config.maxOrdersPerBatch),
      });

      logger.info('Batch created', {
        batchId: batch.id,
        batchNumber: batch.batchNumber,
        totalOrders: batch.totalOrders,
        estimatedSavings: batch.costSavings,
      });

      return batch;
    } catch (error) {
      logger.error('Failed to create batch', {
        vendorId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Find nearby orders for batching
   */
  async findNearbyOrders(params) {
    const {
      vendorId,
      centerLat,
      centerLon,
      maxDistanceKm,
      timeWindowStart,
      timeWindowEnd,
    } = params;

    try {
      const orders = await prisma.$queryRaw`
        SELECT * FROM find_nearby_orders(
          ${vendorId}::uuid,
          ${centerLat}::decimal,
          ${centerLon}::decimal,
          ${maxDistanceKm}::decimal,
          ${timeWindowStart}::timestamp,
          ${timeWindowEnd}::timestamp
        )
      `;

      return orders;
    } catch (error) {
      logger.error('Failed to find nearby orders', {
        vendorId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Create batch record
   */
  async createBatchRecord(data) {
    const { vendorId, centerLocation, batchWindowStart, batchWindowEnd, orders } = data;

    try {
      const batchNumber = await this.generateBatchNumber();

      // Calculate totals
      const totalOrders = orders.length;
      const totalValue = orders.reduce((sum, o) => sum + parseFloat(o.order_value), 0);
      const totalItems = orders.reduce((sum, o) => sum + o.item_count, 0);

      // Create batch
      const batch = await prisma.orderBatches.create({
        data: {
          batchNumber,
          vendorId,
          deliveryLatitude: centerLocation.latitude,
          deliveryLongitude: centerLocation.longitude,
          deliveryRadiusKm: await this.calculateBatchRadius(orders, centerLocation),
          status: 'PENDING',
          totalOrders,
          totalItems,
          totalValue,
          batchWindowStart,
          batchWindowEnd,
        },
      });

      // Add orders to batch
      await this.addOrdersToBatch(batch.id, orders, centerLocation);

      // Group products
      await this.groupBatchProducts(batch.id);

      // Calculate and record savings
      await this.calculateBatchSavings(batch.id);

      // Reload batch with updated data
      return await prisma.orderBatches.findUnique({
        where: { id: batch.id },
        include: {
          batchOrderItems: {
            include: {
              order: true,
              retailer: true,
            },
          },
          batchProductGroups: {
            include: {
              product: true,
            },
          },
        },
      });
    } catch (error) {
      logger.error('Failed to create batch record', {
        vendorId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Add orders to batch
   */
  async addOrdersToBatch(batchId, orders, centerLocation) {
    try {
      const batchItems = orders.map((order, index) => ({
        batchId,
        orderId: order.order_id,
        retailerId: order.retailer_id,
        deliveryLatitude: order.delivery_latitude,
        deliveryLongitude: order.delivery_longitude,
        distanceFromCenterKm: order.distance_km,
        deliverySequence: index + 1,
        orderValue: order.order_value,
        itemCount: order.item_count,
      }));

      await prisma.batchOrderItems.createMany({
        data: batchItems,
      });

      logger.info('Orders added to batch', {
        batchId,
        orderCount: orders.length,
      });
    } catch (error) {
      logger.error('Failed to add orders to batch', {
        batchId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Group products in batch
   */
  async groupBatchProducts(batchId) {
    try {
      // Get all order items in batch
      const batchOrders = await prisma.batchOrderItems.findMany({
        where: { batchId },
        include: {
          order: {
            include: {
              items: {
                include: {
                  product: true,
                },
              },
            },
          },
        },
      });

      // Group by product
      const productGroups = {};
      
      for (const batchOrder of batchOrders) {
        for (const item of batchOrder.order.items) {
          const productId = item.productId;
          
          if (!productGroups[productId]) {
            productGroups[productId] = {
              productId,
              totalQuantity: 0,
              totalOrders: 0,
              unitPrice: parseFloat(item.unitPrice),
              orders: new Set(),
            };
          }
          
          productGroups[productId].totalQuantity += item.quantity;
          productGroups[productId].orders.add(batchOrder.orderId);
        }
      }

      // Create product group records
      const config = await this.getConfig();
      
      for (const [productId, group] of Object.entries(productGroups)) {
        const totalOrders = group.orders.size;
        const totalValue = group.totalQuantity * group.unitPrice;
        
        // Calculate bulk discount
        let bulkDiscountPercentage = 0;
        let bulkDiscountAmount = 0;
        
        if (totalOrders >= config.bulkDiscountThreshold) {
          bulkDiscountPercentage = config.bulkDiscountPercentage;
          bulkDiscountAmount = totalValue * (bulkDiscountPercentage / 100);
        }

        await prisma.batchProductGroups.create({
          data: {
            batchId,
            productId,
            totalQuantity: group.totalQuantity,
            totalOrders,
            unitPrice: group.unitPrice,
            totalValue,
            bulkDiscountPercentage,
            bulkDiscountAmount,
          },
        });
      }

      logger.info('Products grouped in batch', {
        batchId,
        productCount: Object.keys(productGroups).length,
      });
    } catch (error) {
      logger.error('Failed to group batch products', {
        batchId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Calculate batch savings
   */
  async calculateBatchSavings(batchId) {
    try {
      await prisma.$queryRaw`
        SELECT record_batch_savings(${batchId}::uuid)
      `;

      logger.info('Batch savings calculated', { batchId });
    } catch (error) {
      logger.error('Failed to calculate batch savings', {
        batchId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Calculate batch radius
   */
  async calculateBatchRadius(orders, centerLocation) {
    if (orders.length === 0) return 0;

    const maxDistance = Math.max(...orders.map(o => parseFloat(o.distance_km)));
    return maxDistance;
  }

  /**
   * Generate batch number
   */
  async generateBatchNumber() {
    const prefix = 'BATCH';
    const date = new Date();
    const year = date.getFullYear().toString().slice(-2);
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    
    return `${prefix}${year}${month}${day}${random}`;
  }

  /**
   * Confirm batch
   */
  async confirmBatch(batchId) {
    try {
      const batch = await prisma.orderBatches.update({
        where: { id: batchId },
        data: {
          status: 'CONFIRMED',
          confirmedAt: new Date(),
          updatedAt: new Date(),
        },
      });

      // Update order statuses
      await prisma.orders.updateMany({
        where: {
          id: {
            in: await this.getBatchOrderIds(batchId),
          },
        },
        data: {
          status: 'CONFIRMED',
          updatedAt: new Date(),
        },
      });

      logger.info('Batch confirmed', {
        batchId,
        batchNumber: batch.batchNumber,
      });

      return batch;
    } catch (error) {
      logger.error('Failed to confirm batch', {
        batchId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Dispatch batch
   */
  async dispatchBatch(batchId, deliveryDetails) {
    try {
      const batch = await prisma.orderBatches.update({
        where: { id: batchId },
        data: {
          status: 'DISPATCHED',
          dispatchedAt: new Date(),
          deliveryVehicleType: deliveryDetails.vehicleType,
          deliveryDriverId: deliveryDetails.driverId,
          deliveryRouteOptimization: deliveryDetails.routeOptimization,
          updatedAt: new Date(),
        },
      });

      logger.info('Batch dispatched', {
        batchId,
        batchNumber: batch.batchNumber,
        vehicleType: deliveryDetails.vehicleType,
      });

      return batch;
    } catch (error) {
      logger.error('Failed to dispatch batch', {
        batchId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Mark batch as delivered
   */
  async markBatchDelivered(batchId) {
    try {
      const batch = await prisma.orderBatches.update({
        where: { id: batchId },
        data: {
          status: 'DELIVERED',
          deliveredAt: new Date(),
          updatedAt: new Date(),
        },
      });

      // Update order statuses
      await prisma.orders.updateMany({
        where: {
          id: {
            in: await this.getBatchOrderIds(batchId),
          },
        },
        data: {
          status: 'DELIVERED',
          deliveredAt: new Date(),
          updatedAt: new Date(),
        },
      });

      logger.info('Batch delivered', {
        batchId,
        batchNumber: batch.batchNumber,
      });

      return batch;
    } catch (error) {
      logger.error('Failed to mark batch as delivered', {
        batchId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get batch order IDs
   */
  async getBatchOrderIds(batchId) {
    const items = await prisma.batchOrderItems.findMany({
      where: { batchId },
      select: { orderId: true },
    });
    
    return items.map(item => item.orderId);
  }

  /**
   * Get batch details
   */
  async getBatchDetails(batchId) {
    try {
      const batch = await prisma.orderBatches.findUnique({
        where: { id: batchId },
        include: {
          vendor: {
            include: {
              user: {
                select: {
                  businessName: true,
                  phoneNumber: true,
                },
              },
            },
          },
          batchOrderItems: {
            include: {
              order: {
                include: {
                  items: true,
                },
              },
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
            orderBy: {
              deliverySequence: 'asc',
            },
          },
          batchProductGroups: {
            include: {
              product: true,
            },
          },
        },
      });

      return batch;
    } catch (error) {
      logger.error('Failed to get batch details', {
        batchId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get active batches
   */
  async getActiveBatches(vendorId = null) {
    try {
      const batches = await prisma.$queryRaw`
        SELECT * FROM active_batches_summary
        ${vendorId ? prisma.Prisma.sql`WHERE vendor_id = ${vendorId}::uuid` : prisma.Prisma.empty}
        ORDER BY batch_window_end ASC
      `;

      return batches;
    } catch (error) {
      logger.error('Failed to get active batches', {
        vendorId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get batch savings summary
   */
  async getBatchSavingsSummary(days = 30) {
    try {
      const summary = await prisma.$queryRaw`
        SELECT * FROM batch_savings_summary
        WHERE date >= NOW() - INTERVAL '${days} days'
        ORDER BY date DESC
      `;

      return summary;
    } catch (error) {
      logger.error('Failed to get batch savings summary', {
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get product batching efficiency
   */
  async getProductBatchingEfficiency() {
    try {
      const efficiency = await prisma.$queryRaw`
        SELECT * FROM product_batching_efficiency
        LIMIT 50
      `;

      return efficiency;
    } catch (error) {
      logger.error('Failed to get product batching efficiency', {
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Auto-batch pending orders
   * Automatically creates batches for pending orders
   */
  async autoBatchPendingOrders(vendorId) {
    try {
      logger.info('Starting auto-batching for vendor', { vendorId });

      // Get pending orders
      const pendingOrders = await prisma.orders.findMany({
        where: {
          vendorId,
          status: 'PENDING',
        },
        include: {
          retailer: true,
        },
      });

      if (pendingOrders.length === 0) {
        logger.info('No pending orders to batch', { vendorId });
        return [];
      }

      // Calculate center point (average of all locations)
      const validOrders = pendingOrders.filter(
        o => o.retailer.deliveryLatitude && o.retailer.deliveryLongitude
      );

      if (validOrders.length === 0) {
        logger.warn('No orders with valid locations', { vendorId });
        return [];
      }

      const centerLat = validOrders.reduce(
        (sum, o) => sum + parseFloat(o.retailer.deliveryLatitude), 0
      ) / validOrders.length;

      const centerLon = validOrders.reduce(
        (sum, o) => sum + parseFloat(o.retailer.deliveryLongitude), 0
      ) / validOrders.length;

      // Create batch
      const batch = await this.createBatch(vendorId, {
        latitude: centerLat,
        longitude: centerLon,
      });

      if (batch) {
        logger.info('Auto-batch created', {
          vendorId,
          batchId: batch.id,
          ordersCount: batch.totalOrders,
        });
        
        return [batch];
      }

      return [];
    } catch (error) {
      logger.error('Failed to auto-batch pending orders', {
        vendorId,
        error: error.message,
      });
      throw error;
    }
  }
}

module.exports = new OrderBatchingService();
