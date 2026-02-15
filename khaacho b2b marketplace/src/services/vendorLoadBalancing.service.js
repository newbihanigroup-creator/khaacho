const prisma = require('../config/database');
const logger = require('../shared/logger');
const vendorIntelligence = require('./vendorIntelligence.service');

/**
 * Vendor Load Balancing Service
 * 
 * Features:
 * - Prevents vendor overload (max X active orders per vendor)
 * - Automatically shifts orders to next ranked vendor
 * - Considers vendor working hours
 * - Prevents single vendor monopoly
 * - Fair distribution algorithm
 */

class VendorLoadBalancingService {
  constructor() {
    // Default configuration
    this.config = {
      maxActiveOrdersPerVendor: parseInt(process.env.MAX_ACTIVE_ORDERS_PER_VENDOR) || 10,
      maxPendingOrdersPerVendor: parseInt(process.env.MAX_PENDING_ORDERS_PER_VENDOR) || 5,
      monopolyPreventionThreshold: parseFloat(process.env.MONOPOLY_THRESHOLD) || 0.40, // 40% max share
      workingHoursEnabled: process.env.WORKING_HOURS_ENABLED !== 'false',
      defaultWorkingHours: {
        start: 9, // 9 AM
        end: 18, // 6 PM
      },
      loadBalancingStrategy: process.env.LOAD_BALANCING_STRATEGY || 'round-robin', // 'round-robin' or 'least-loaded'
    };
  }

  /**
   * Select vendor with load balancing
   * @param {string} productId - Product ID
   * @param {number} quantity - Required quantity
   * @param {Object} options - Selection options
   * @returns {Promise<Object>} - Selected vendor with load info
   */
  async selectVendorWithLoadBalancing(productId, quantity, options = {}) {
    const { retailerId, excludeVendors = [] } = options;

    logger.info('Starting vendor selection with load balancing', {
      productId,
      quantity,
      retailerId,
    });

    try {
      // Step 1: Get eligible vendors ranked by intelligence score
      const rankedVendors = await this.getRankedEligibleVendors(
        productId,
        quantity,
        excludeVendors
      );

      if (rankedVendors.length === 0) {
        throw new Error('No eligible vendors found');
      }

      logger.info('Found eligible vendors', {
        count: rankedVendors.length,
        productId,
      });

      // Step 2: Filter by working hours
      const vendorsInWorkingHours = await this.filterByWorkingHours(rankedVendors);

      if (vendorsInWorkingHours.length === 0) {
        logger.warn('No vendors in working hours, using all eligible vendors');
        // Fallback to all vendors if none in working hours
      }

      const candidateVendors = vendorsInWorkingHours.length > 0 
        ? vendorsInWorkingHours 
        : rankedVendors;

      // Step 3: Filter by load capacity
      const vendorsWithCapacity = await this.filterByLoadCapacity(candidateVendors);

      if (vendorsWithCapacity.length === 0) {
        logger.warn('All vendors at capacity, shifting to next ranked vendors');
        // Try to find any vendor with capacity from full list
        const anyWithCapacity = await this.filterByLoadCapacity(rankedVendors);
        
        if (anyWithCapacity.length === 0) {
          throw new Error('All vendors are at maximum capacity');
        }
        
        return await this.selectBestVendor(anyWithCapacity, productId);
      }

      // Step 4: Check monopoly prevention
      const vendorsAfterMonopolyCheck = await this.applyMonopolyPrevention(
        vendorsWithCapacity,
        productId
      );

      if (vendorsAfterMonopolyCheck.length === 0) {
        logger.warn('Monopoly prevention filtered all vendors, using original list');
        // Fallback if monopoly prevention is too strict
      }

      const finalCandidates = vendorsAfterMonopolyCheck.length > 0
        ? vendorsAfterMonopolyCheck
        : vendorsWithCapacity;

      // Step 5: Select best vendor using load balancing strategy
      const selectedVendor = await this.selectBestVendor(finalCandidates, productId);

      logger.info('Vendor selected with load balancing', {
        vendorId: selectedVendor.vendorId,
        vendorCode: selectedVendor.vendorCode,
        activeOrders: selectedVendor.activeOrdersCount,
        pendingOrders: selectedVendor.pendingOrdersCount,
        intelligenceScore: selectedVendor.intelligenceScore,
      });

      return selectedVendor;
    } catch (error) {
      logger.error('Vendor selection with load balancing failed', {
        productId,
        error: error.message,
        stack: error.stack,
      });
      throw error;
    }
  }

  /**
   * Get ranked eligible vendors
   */
  async getRankedEligibleVendors(productId, quantity, excludeVendors = []) {
    try {
      const vendors = await prisma.$queryRaw`
        SELECT 
          v.id as vendor_id,
          v.vendor_code,
          v.rating,
          u.name as vendor_name,
          u.business_name,
          u.city,
          u.state,
          u.phone_number,
          
          -- Product details
          vp.id as vendor_product_id,
          vp.vendor_price,
          vp.stock,
          vp.is_available,
          
          -- Intelligence metrics
          vm.intelligence_score,
          vm.delivery_success_rate,
          vm.order_acceptance_rate,
          vm.average_response_time,
          
          -- Load metrics
          COALESCE(
            (SELECT COUNT(*) FROM orders o 
             WHERE o.vendor_id = v.id 
             AND o.status IN ('CONFIRMED', 'ACCEPTED', 'DISPATCHED')),
            0
          ) as active_orders_count,
          
          COALESCE(
            (SELECT COUNT(*) FROM orders o 
             WHERE o.vendor_id = v.id 
             AND o.status = 'CONFIRMED'),
            0
          ) as pending_orders_count,
          
          -- Working hours
          v.working_hours_start,
          v.working_hours_end,
          v.timezone
          
        FROM vendor_products vp
        INNER JOIN vendors v ON vp.vendor_id = v.id
        INNER JOIN users u ON v.user_id = u.id
        LEFT JOIN vendor_metrics vm ON vm.vendor_id = v.id
        
        WHERE vp.product_id = ${productId}::uuid
          AND vp.is_available = true
          AND vp.stock >= ${quantity}
          AND vp.deleted_at IS NULL
          AND v.is_approved = true
          AND v.deleted_at IS NULL
          AND u.is_active = true
          ${excludeVendors.length > 0 ? prisma.Prisma.sql`AND v.id NOT IN (${prisma.Prisma.join(excludeVendors.map(id => prisma.Prisma.sql`${id}::uuid`))})` : prisma.Prisma.empty}
        
        ORDER BY COALESCE(vm.intelligence_score, v.rating * 20, 0) DESC
      `;

      return vendors.map(v => ({
        vendorId: v.vendor_id,
        vendorCode: v.vendor_code,
        vendorName: v.vendor_name,
        businessName: v.business_name,
        city: v.city,
        state: v.state,
        phoneNumber: v.phone_number,
        vendorProductId: v.vendor_product_id,
        price: parseFloat(v.vendor_price),
        stock: v.stock,
        isAvailable: v.is_available,
        intelligenceScore: parseFloat(v.intelligence_score) || 0,
        deliverySuccessRate: parseFloat(v.delivery_success_rate) || 0,
        orderAcceptanceRate: parseFloat(v.order_acceptance_rate) || 0,
        averageResponseTime: parseFloat(v.average_response_time) || 0,
        activeOrdersCount: Number(v.active_orders_count),
        pendingOrdersCount: Number(v.pending_orders_count),
        workingHoursStart: v.working_hours_start,
        workingHoursEnd: v.working_hours_end,
        timezone: v.timezone,
      }));
    } catch (error) {
      logger.error('Failed to get ranked eligible vendors', {
        productId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Filter vendors by working hours
   */
  async filterByWorkingHours(vendors) {
    if (!this.config.workingHoursEnabled) {
      return vendors;
    }

    const now = new Date();
    const currentHour = now.getHours();

    return vendors.filter(vendor => {
      const startHour = vendor.workingHoursStart || this.config.defaultWorkingHours.start;
      const endHour = vendor.workingHoursEnd || this.config.defaultWorkingHours.end;

      // Check if current time is within working hours
      const isWithinHours = currentHour >= startHour && currentHour < endHour;

      if (!isWithinHours) {
        logger.debug('Vendor outside working hours', {
          vendorId: vendor.vendorId,
          vendorCode: vendor.vendorCode,
          currentHour,
          workingHours: `${startHour}-${endHour}`,
        });
      }

      return isWithinHours;
    });
  }

  /**
   * Filter vendors by load capacity
   */
  async filterByLoadCapacity(vendors) {
    return vendors.filter(vendor => {
      const hasActiveCapacity = vendor.activeOrdersCount < this.config.maxActiveOrdersPerVendor;
      const hasPendingCapacity = vendor.pendingOrdersCount < this.config.maxPendingOrdersPerVendor;

      if (!hasActiveCapacity || !hasPendingCapacity) {
        logger.debug('Vendor at capacity', {
          vendorId: vendor.vendorId,
          vendorCode: vendor.vendorCode,
          activeOrders: vendor.activeOrdersCount,
          maxActive: this.config.maxActiveOrdersPerVendor,
          pendingOrders: vendor.pendingOrdersCount,
          maxPending: this.config.maxPendingOrdersPerVendor,
        });
      }

      return hasActiveCapacity && hasPendingCapacity;
    });
  }

  /**
   * Apply monopoly prevention
   * Prevents single vendor from dominating orders
   */
  async applyMonopolyPrevention(vendors, productId) {
    try {
      // Get total orders for this product in last 30 days
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const orderStats = await prisma.$queryRaw`
        SELECT 
          o.vendor_id,
          COUNT(*) as order_count
        FROM orders o
        INNER JOIN order_items oi ON oi.order_id = o.id
        WHERE oi.product_id = ${productId}::uuid
          AND o.created_at >= ${thirtyDaysAgo}
          AND o.status NOT IN ('CANCELLED', 'REJECTED')
        GROUP BY o.vendor_id
      `;

      const totalOrders = orderStats.reduce((sum, stat) => sum + Number(stat.order_count), 0);

      if (totalOrders === 0) {
        // No history, no monopoly concern
        return vendors;
      }

      // Calculate each vendor's share
      const vendorShares = new Map();
      orderStats.forEach(stat => {
        const share = Number(stat.order_count) / totalOrders;
        vendorShares.set(stat.vendor_id, share);
      });

      // Filter out vendors exceeding monopoly threshold
      return vendors.filter(vendor => {
        const currentShare = vendorShares.get(vendor.vendorId) || 0;
        const exceedsThreshold = currentShare >= this.config.monopolyPreventionThreshold;

        if (exceedsThreshold) {
          logger.info('Vendor filtered by monopoly prevention', {
            vendorId: vendor.vendorId,
            vendorCode: vendor.vendorCode,
            currentShare: `${(currentShare * 100).toFixed(2)}%`,
            threshold: `${(this.config.monopolyPreventionThreshold * 100).toFixed(2)}%`,
          });
        }

        return !exceedsThreshold;
      });
    } catch (error) {
      logger.error('Monopoly prevention check failed', {
        productId,
        error: error.message,
      });
      // On error, return all vendors to avoid blocking orders
      return vendors;
    }
  }

  /**
   * Select best vendor using load balancing strategy
   */
  async selectBestVendor(vendors, productId) {
    if (vendors.length === 0) {
      throw new Error('No vendors available for selection');
    }

    if (vendors.length === 1) {
      return vendors[0];
    }

    if (this.config.loadBalancingStrategy === 'least-loaded') {
      return this.selectLeastLoadedVendor(vendors);
    } else {
      return this.selectRoundRobinVendor(vendors, productId);
    }
  }

  /**
   * Select least loaded vendor
   * Prioritizes vendors with fewer active orders
   */
  selectLeastLoadedVendor(vendors) {
    // Sort by load (ascending), then by intelligence score (descending)
    const sorted = [...vendors].sort((a, b) => {
      const loadDiff = a.activeOrdersCount - b.activeOrdersCount;
      if (loadDiff !== 0) return loadDiff;
      
      return b.intelligenceScore - a.intelligenceScore;
    });

    return sorted[0];
  }

  /**
   * Select vendor using round-robin
   * Distributes orders evenly across vendors
   */
  async selectRoundRobinVendor(vendors, productId) {
    try {
      // Get last selected vendor for this product
      const lastSelection = await prisma.vendorLoadBalancingLog.findFirst({
        where: { productId },
        orderBy: { createdAt: 'desc' },
      });

      if (!lastSelection) {
        // First selection, choose highest ranked
        return vendors[0];
      }

      // Find next vendor in rotation
      const lastVendorIndex = vendors.findIndex(
        v => v.vendorId === lastSelection.selectedVendorId
      );

      if (lastVendorIndex === -1 || lastVendorIndex === vendors.length - 1) {
        // Last vendor not in list or was last in list, start from beginning
        return vendors[0];
      }

      // Select next vendor
      return vendors[lastVendorIndex + 1];
    } catch (error) {
      logger.error('Round-robin selection failed, using first vendor', {
        productId,
        error: error.message,
      });
      return vendors[0];
    }
  }

  /**
   * Log load balancing decision
   */
  async logLoadBalancingDecision(data) {
    const {
      orderId,
      productId,
      selectedVendorId,
      candidateVendors,
      strategy,
      reason,
    } = data;

    try {
      await prisma.vendorLoadBalancingLog.create({
        data: {
          orderId: orderId || null,
          productId,
          selectedVendorId,
          candidateVendors: {
            vendors: candidateVendors.map(v => ({
              vendorId: v.vendorId,
              vendorCode: v.vendorCode,
              activeOrders: v.activeOrdersCount,
              pendingOrders: v.pendingOrdersCount,
              intelligenceScore: v.intelligenceScore,
            })),
            count: candidateVendors.length,
          },
          strategy,
          reason,
          configSnapshot: this.config,
        },
      });

      logger.info('Load balancing decision logged', {
        orderId,
        productId,
        selectedVendorId,
        strategy,
      });
    } catch (error) {
      logger.error('Failed to log load balancing decision', {
        orderId,
        productId,
        error: error.message,
      });
      // Don't throw - logging failure shouldn't break order processing
    }
  }

  /**
   * Get vendor load statistics
   */
  async getVendorLoadStatistics(vendorId = null) {
    try {
      let whereClause = prisma.Prisma.sql`WHERE v.deleted_at IS NULL AND v.is_approved = true`;
      
      if (vendorId) {
        whereClause = prisma.Prisma.sql`WHERE v.id = ${vendorId}::uuid`;
      }

      const stats = await prisma.$queryRaw`
        SELECT 
          v.id as vendor_id,
          v.vendor_code,
          u.business_name,
          
          -- Active orders
          COALESCE(
            (SELECT COUNT(*) FROM orders o 
             WHERE o.vendor_id = v.id 
             AND o.status IN ('CONFIRMED', 'ACCEPTED', 'DISPATCHED')),
            0
          ) as active_orders,
          
          -- Pending orders
          COALESCE(
            (SELECT COUNT(*) FROM orders o 
             WHERE o.vendor_id = v.id 
             AND o.status = 'CONFIRMED'),
            0
          ) as pending_orders,
          
          -- Capacity utilization
          ROUND(
            COALESCE(
              (SELECT COUNT(*) FROM orders o 
               WHERE o.vendor_id = v.id 
               AND o.status IN ('CONFIRMED', 'ACCEPTED', 'DISPATCHED')),
              0
            )::numeric / ${this.config.maxActiveOrdersPerVendor}::numeric * 100,
            2
          ) as capacity_utilization_percent,
          
          -- Working hours status
          CASE 
            WHEN EXTRACT(HOUR FROM CURRENT_TIMESTAMP) >= COALESCE(v.working_hours_start, ${this.config.defaultWorkingHours.start})
              AND EXTRACT(HOUR FROM CURRENT_TIMESTAMP) < COALESCE(v.working_hours_end, ${this.config.defaultWorkingHours.end})
            THEN true
            ELSE false
          END as is_in_working_hours
          
        FROM vendors v
        INNER JOIN users u ON v.user_id = u.id
        ${whereClause}
        ORDER BY active_orders DESC
      `;

      return stats.map(s => ({
        vendorId: s.vendor_id,
        vendorCode: s.vendor_code,
        businessName: s.business_name,
        activeOrders: Number(s.active_orders),
        pendingOrders: Number(s.pending_orders),
        maxActiveOrders: this.config.maxActiveOrdersPerVendor,
        maxPendingOrders: this.config.maxPendingOrdersPerVendor,
        capacityUtilization: parseFloat(s.capacity_utilization_percent),
        hasCapacity: Number(s.active_orders) < this.config.maxActiveOrdersPerVendor,
        isInWorkingHours: s.is_in_working_hours,
      }));
    } catch (error) {
      logger.error('Failed to get vendor load statistics', {
        vendorId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get monopoly statistics
   */
  async getMonopolyStatistics(productId = null, days = 30) {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      let productFilter = prisma.Prisma.empty;
      if (productId) {
        productFilter = prisma.Prisma.sql`AND oi.product_id = ${productId}::uuid`;
      }

      const stats = await prisma.$queryRaw`
        SELECT 
          v.id as vendor_id,
          v.vendor_code,
          u.business_name,
          oi.product_id,
          p.name as product_name,
          COUNT(DISTINCT o.id) as order_count,
          ROUND(
            COUNT(DISTINCT o.id)::numeric / 
            (SELECT COUNT(DISTINCT o2.id) FROM orders o2 
             INNER JOIN order_items oi2 ON oi2.order_id = o2.id
             WHERE o2.created_at >= ${startDate}
             AND o2.status NOT IN ('CANCELLED', 'REJECTED')
             ${productFilter})::numeric * 100,
            2
          ) as market_share_percent
        FROM orders o
        INNER JOIN order_items oi ON oi.order_id = o.id
        INNER JOIN vendors v ON o.vendor_id = v.id
        INNER JOIN users u ON v.user_id = u.id
        INNER JOIN products p ON oi.product_id = p.id
        WHERE o.created_at >= ${startDate}
          AND o.status NOT IN ('CANCELLED', 'REJECTED')
          ${productFilter}
        GROUP BY v.id, v.vendor_code, u.business_name, oi.product_id, p.name
        ORDER BY market_share_percent DESC
      `;

      return stats.map(s => ({
        vendorId: s.vendor_id,
        vendorCode: s.vendor_code,
        businessName: s.business_name,
        productId: s.product_id,
        productName: s.product_name,
        orderCount: Number(s.order_count),
        marketShare: parseFloat(s.market_share_percent),
        exceedsThreshold: parseFloat(s.market_share_percent) >= (this.config.monopolyPreventionThreshold * 100),
      }));
    } catch (error) {
      logger.error('Failed to get monopoly statistics', {
        productId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Update configuration
   */
  updateConfiguration(newConfig) {
    this.config = {
      ...this.config,
      ...newConfig,
    };
    logger.info('Load balancing configuration updated', { config: this.config });
  }

  /**
   * Get current configuration
   */
  getConfiguration() {
    return { ...this.config };
  }
}

module.exports = new VendorLoadBalancingService();
