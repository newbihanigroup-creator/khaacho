const { PrismaClient } = require('@prisma/client');
const logger = require('../utils/logger');

const prisma = new PrismaClient();

class VendorPerformanceService {
  /**
   * Calculate and update vendor performance metrics
   */
  async calculateVendorPerformance(vendorId) {
    try {
      // Call the database function to update metrics
      await prisma.$executeRawUnsafe(
        `SELECT update_vendor_performance_metrics($1::uuid)`,
        vendorId
      );

      // Fetch the updated performance data
      const performance = await prisma.$queryRawUnsafe(
        `SELECT * FROM vendor_performance WHERE vendor_id = $1::uuid AND calculation_period = 'all_time'`,
        vendorId
      );

      return performance[0] || null;
    } catch (error) {
      logger.error('Error calculating vendor performance', {
        vendorId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get vendor performance metrics
   */
  async getVendorPerformance(vendorId, period = 'all_time') {
    try {
      const performance = await prisma.$queryRawUnsafe(
        `SELECT * FROM vendor_performance WHERE vendor_id = $1::uuid AND calculation_period = $2`,
        vendorId,
        period
      );

      if (!performance || performance.length === 0) {
        // Calculate if not exists
        await this.calculateVendorPerformance(vendorId);
        return await this.getVendorPerformance(vendorId, period);
      }

      return performance[0];
    } catch (error) {
      logger.error('Error getting vendor performance', {
        vendorId,
        period,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get performance metrics for all vendors
   */
  async getAllVendorsPerformance(options = {}) {
    try {
      const {
        period = 'all_time',
        sortBy = 'reliability_score',
        sortOrder = 'DESC',
        limit = 100,
        offset = 0,
      } = options;

      const validSortFields = [
        'reliability_score',
        'acceptance_rate',
        'completion_rate',
        'avg_fulfillment_time',
        'cancellation_rate',
        'price_competitiveness_index',
      ];

      const sortField = validSortFields.includes(sortBy) ? sortBy : 'reliability_score';
      const order = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

      const performances = await prisma.$queryRawUnsafe(
        `SELECT 
          vp.*,
          v.id as vendor_id,
          u.name as vendor_name,
          u.business_name,
          u.city,
          v.rating as vendor_rating
        FROM vendor_performance vp
        JOIN vendors v ON vp.vendor_id = v.id
        JOIN users u ON v.user_id = u.id
        WHERE vp.calculation_period = $1
        AND v.deleted_at IS NULL
        AND u.is_active = true
        ORDER BY vp.${sortField} ${order}
        LIMIT $2 OFFSET $3`,
        period,
        limit,
        offset
      );

      return performances;
    } catch (error) {
      logger.error('Error getting all vendors performance', {
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get vendor performance history (trends)
   */
  async getVendorPerformanceHistory(vendorId, options = {}) {
    try {
      const {
        periodType = 'monthly',
        startDate,
        endDate,
        limit = 12,
      } = options;

      let query = `
        SELECT * FROM vendor_performance_history
        WHERE vendor_id = $1::uuid
        AND period_type = $2
      `;

      const params = [vendorId, periodType];
      let paramIndex = 3;

      if (startDate) {
        query += ` AND period_start >= $${paramIndex}::date`;
        params.push(startDate);
        paramIndex++;
      }

      if (endDate) {
        query += ` AND period_end <= $${paramIndex}::date`;
        params.push(endDate);
        paramIndex++;
      }

      query += ` ORDER BY period_start DESC LIMIT $${paramIndex}`;
      params.push(limit);

      const history = await prisma.$queryRawUnsafe(query, ...params);

      return history;
    } catch (error) {
      logger.error('Error getting vendor performance history', {
        vendorId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get vendor performance events
   */
  async getVendorPerformanceEvents(vendorId, options = {}) {
    try {
      const {
        eventType,
        limit = 50,
        offset = 0,
      } = options;

      let query = `
        SELECT 
          vpe.*,
          o.order_number
        FROM vendor_performance_events vpe
        LEFT JOIN orders o ON vpe.order_id = o.id
        WHERE vpe.vendor_id = $1::uuid
      `;

      const params = [vendorId];
      let paramIndex = 2;

      if (eventType) {
        query += ` AND vpe.event_type = $${paramIndex}`;
        params.push(eventType);
        paramIndex++;
      }

      query += ` ORDER BY vpe.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
      params.push(limit, offset);

      const events = await prisma.$queryRawUnsafe(query, ...params);

      return events;
    } catch (error) {
      logger.error('Error getting vendor performance events', {
        vendorId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Update vendor price comparison
   */
  async updateVendorPriceComparison(productId, vendorId, vendorPrice) {
    try {
      // Calculate market average price for this product
      const marketAvg = await prisma.$queryRawUnsafe(
        `SELECT AVG(vendor_price) as avg_price
         FROM vendor_price_comparison
         WHERE product_id = $1::uuid`,
        productId
      );

      const marketAvgPrice = marketAvg[0]?.avg_price || vendorPrice;
      const priceDeviation = ((vendorPrice - marketAvgPrice) / marketAvgPrice) * 100;
      const isCompetitive = Math.abs(priceDeviation) <= 10;

      // Upsert price comparison
      await prisma.$executeRawUnsafe(
        `INSERT INTO vendor_price_comparison (
          product_id, vendor_id, vendor_price, market_avg_price, 
          price_deviation, is_competitive, last_updated
        ) VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, CURRENT_TIMESTAMP)
        ON CONFLICT (product_id, vendor_id)
        DO UPDATE SET
          vendor_price = EXCLUDED.vendor_price,
          market_avg_price = EXCLUDED.market_avg_price,
          price_deviation = EXCLUDED.price_deviation,
          is_competitive = EXCLUDED.is_competitive,
          last_updated = EXCLUDED.last_updated`,
        productId,
        vendorId,
        vendorPrice,
        marketAvgPrice,
        priceDeviation,
        isCompetitive
      );

      return {
        productId,
        vendorId,
        vendorPrice,
        marketAvgPrice,
        priceDeviation,
        isCompetitive,
      };
    } catch (error) {
      logger.error('Error updating vendor price comparison', {
        productId,
        vendorId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get vendor price competitiveness
   */
  async getVendorPriceCompetitiveness(vendorId) {
    try {
      const prices = await prisma.$queryRawUnsafe(
        `SELECT 
          vpc.*,
          p.name as product_name,
          p.product_code
        FROM vendor_price_comparison vpc
        JOIN products p ON vpc.product_id = p.id
        WHERE vpc.vendor_id = $1::uuid
        ORDER BY vpc.price_deviation ASC`,
        vendorId
      );

      return prices;
    } catch (error) {
      logger.error('Error getting vendor price competitiveness', {
        vendorId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get vendor performance dashboard data
   */
  async getVendorPerformanceDashboard(vendorId) {
    try {
      // Get current performance
      const performance = await this.getVendorPerformance(vendorId);

      // Get recent history (last 6 months)
      const history = await this.getVendorPerformanceHistory(vendorId, {
        periodType: 'monthly',
        limit: 6,
      });

      // Get recent events
      const events = await this.getVendorPerformanceEvents(vendorId, {
        limit: 10,
      });

      // Get price competitiveness
      const priceData = await this.getVendorPriceCompetitiveness(vendorId);

      // Get vendor details
      const vendor = await prisma.vendor.findUnique({
        where: { id: vendorId },
        include: {
          user: {
            select: {
              name: true,
              businessName: true,
              city: true,
              phoneNumber: true,
              email: true,
            },
          },
        },
      });

      // Calculate performance grade
      const grade = this.calculatePerformanceGrade(performance?.reliability_score || 0);

      // Get pending orders count
      const pendingOrders = await prisma.vendorOrderAcceptance.count({
        where: {
          vendorId,
          status: 'pending',
        },
      });

      return {
        vendor: {
          id: vendor.id,
          name: vendor.user.name,
          businessName: vendor.user.businessName,
          city: vendor.user.city,
          phoneNumber: vendor.user.phoneNumber,
          email: vendor.user.email,
          rating: vendor.rating,
        },
        performance: {
          ...performance,
          grade,
          pendingOrders,
        },
        history: history.reverse(), // Oldest to newest
        recentEvents: events,
        priceCompetitiveness: {
          products: priceData,
          averageDeviation: priceData.length > 0
            ? priceData.reduce((sum, p) => sum + parseFloat(p.price_deviation), 0) / priceData.length
            : 0,
          competitiveCount: priceData.filter(p => p.is_competitive).length,
          totalProducts: priceData.length,
        },
      };
    } catch (error) {
      logger.error('Error getting vendor performance dashboard', {
        vendorId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get performance comparison for multiple vendors
   */
  async compareVendors(vendorIds) {
    try {
      const performances = await Promise.all(
        vendorIds.map(id => this.getVendorPerformance(id))
      );

      const vendors = await prisma.vendor.findMany({
        where: {
          id: { in: vendorIds },
        },
        include: {
          user: {
            select: {
              name: true,
              businessName: true,
            },
          },
        },
      });

      return vendorIds.map((id, index) => ({
        vendorId: id,
        vendorName: vendors[index]?.user.name,
        businessName: vendors[index]?.user.businessName,
        performance: performances[index],
        grade: this.calculatePerformanceGrade(performances[index]?.reliability_score || 0),
      }));
    } catch (error) {
      logger.error('Error comparing vendors', {
        vendorIds,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Calculate performance grade based on reliability score
   */
  calculatePerformanceGrade(score) {
    if (score >= 90) return { grade: 'A+', label: 'Excellent', color: '#10b981' };
    if (score >= 80) return { grade: 'A', label: 'Very Good', color: '#22c55e' };
    if (score >= 70) return { grade: 'B', label: 'Good', color: '#84cc16' };
    if (score >= 60) return { grade: 'C', label: 'Fair', color: '#eab308' };
    if (score >= 50) return { grade: 'D', label: 'Poor', color: '#f97316' };
    return { grade: 'F', label: 'Very Poor', color: '#ef4444' };
  }

  /**
   * Get top performing vendors
   */
  async getTopPerformers(limit = 10) {
    try {
      return await this.getAllVendorsPerformance({
        sortBy: 'reliability_score',
        sortOrder: 'DESC',
        limit,
      });
    } catch (error) {
      logger.error('Error getting top performers', {
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get vendors needing attention (low performance)
   */
  async getVendorsNeedingAttention(threshold = 60) {
    try {
      const vendors = await prisma.$queryRawUnsafe(
        `SELECT 
          vp.*,
          v.id as vendor_id,
          u.name as vendor_name,
          u.business_name,
          u.city
        FROM vendor_performance vp
        JOIN vendors v ON vp.vendor_id = v.id
        JOIN users u ON v.user_id = u.id
        WHERE vp.calculation_period = 'all_time'
        AND vp.reliability_score < $1
        AND v.deleted_at IS NULL
        AND u.is_active = true
        ORDER BY vp.reliability_score ASC`,
        threshold
      );

      return vendors;
    } catch (error) {
      logger.error('Error getting vendors needing attention', {
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Recalculate all vendor performances (for batch processing)
   */
  async recalculateAllVendors() {
    try {
      const vendors = await prisma.vendor.findMany({
        where: {
          deletedAt: null,
          isApproved: true,
        },
        select: { id: true },
      });

      logger.info(`Recalculating performance for ${vendors.length} vendors`);

      const results = [];
      for (const vendor of vendors) {
        try {
          const performance = await this.calculateVendorPerformance(vendor.id);
          results.push({
            vendorId: vendor.id,
            success: true,
            performance,
          });
        } catch (error) {
          logger.error(`Failed to calculate performance for vendor ${vendor.id}`, {
            error: error.message,
          });
          results.push({
            vendorId: vendor.id,
            success: false,
            error: error.message,
          });
        }
      }

      const successCount = results.filter(r => r.success).length;
      logger.info(`Performance recalculation complete: ${successCount}/${vendors.length} successful`);

      return {
        total: vendors.length,
        successful: successCount,
        failed: vendors.length - successCount,
        results,
      };
    } catch (error) {
      logger.error('Error recalculating all vendors', {
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Log performance event manually
   */
  async logPerformanceEvent(vendorId, orderId, eventType, eventData = {}) {
    try {
      await prisma.$executeRawUnsafe(
        `INSERT INTO vendor_performance_events (
          vendor_id, order_id, event_type, event_data,
          affects_acceptance, affects_completion, 
          affects_fulfillment_time, affects_cancellation
        ) VALUES ($1::uuid, $2::uuid, $3, $4::jsonb, $5, $6, $7, $8)`,
        vendorId,
        orderId,
        eventType,
        JSON.stringify(eventData),
        eventData.affectsAcceptance || false,
        eventData.affectsCompletion || false,
        eventData.affectsFulfillmentTime || false,
        eventData.affectsCancellation || false
      );

      logger.info('Performance event logged', {
        vendorId,
        orderId,
        eventType,
      });
    } catch (error) {
      logger.error('Error logging performance event', {
        vendorId,
        orderId,
        eventType,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get top reliable wholesalers (vendors) for a specific product
   * @param {string} productId - Product ID to find vendors for
   * @param {number} limit - Maximum number of vendors to return (default: 5)
   * @returns {Promise<Array>} Array of top vendors sorted by reliability score
   */
  async getTopReliableWholesellers(productId, limit = 5) {
    try {
      logger.info('🔍 Finding top reliable wholesalers for product', {
        productId,
        limit,
      });

      // Query vendors who sell this product, ordered by reliability score
      const vendors = await prisma.$queryRaw`
        SELECT 
          v.id as vendor_id,
          v.vendor_code,
          u.name as vendor_name,
          u.business_name,
          u.city,
          u.phone_number,
          v.rating as vendor_rating,
          v.commission_rate,
          
          -- Vendor product details
          vp.id as vendor_product_id,
          vp.sku,
          vp.vendor_price,
          vp.mrp,
          vp.discount,
          vp.stock,
          vp.is_available,
          vp.lead_time_days,
          
          -- Product details
          p.name as product_name,
          p.product_code,
          p.category,
          p.unit,
          
          -- Vendor inventory (if exists)
          vi.available_quantity,
          vi.status as inventory_status,
          
          -- Reliability score from VendorRoutingScore
          COALESCE(vrs.reliability_score, 0) as reliability_score,
          COALESCE(vrs.overall_score, 0) as overall_score,
          COALESCE(vrs.availability_score, 0) as availability_score,
          COALESCE(vrs.price_score, 0) as price_score,
          COALESCE(vrs.workload_score, 0) as workload_score,
          vrs.active_orders_count,
          vrs.pending_orders_count,
          vrs.average_fulfillment_time,
          
          -- Vendor ranking (if exists)
          vr.vendor_score,
          vr.acceptance_rate,
          vr.completion_rate,
          vr.avg_delivery_time,
          vr.total_orders,
          vr.completed_orders,
          vr.rank
          
        FROM vendor_products vp
        INNER JOIN vendors v ON vp.vendor_id = v.id
        INNER JOIN users u ON v.user_id = u.id
        INNER JOIN products p ON vp.product_id = p.id
        LEFT JOIN vendor_inventories vi ON vi.vendor_id = v.id AND vi.product_id = p.id
        LEFT JOIN vendor_routing_scores vrs ON vrs.vendor_id = v.id
        LEFT JOIN vendor_rankings vr ON vr.vendor_id = v.id
        
        WHERE vp.product_id = ${productId}::uuid
        AND vp.is_available = true
        AND vp.deleted_at IS NULL
        AND v.is_approved = true
        AND v.deleted_at IS NULL
        AND u.is_active = true
        AND p.is_active = true
        AND p.deleted_at IS NULL
        
        ORDER BY 
          COALESCE(vrs.reliability_score, 0) DESC,
          COALESCE(vrs.overall_score, 0) DESC,
          COALESCE(vr.vendor_score, 0) DESC,
          vp.vendor_price ASC
        
        LIMIT ${limit}
      `;

      logger.info('✅ Found reliable wholesalers', {
        productId,
        count: vendors.length,
        topVendor: vendors[0]?.vendor_name,
        topReliabilityScore: vendors[0]?.reliability_score,
      });

      // Format the results
      const formattedVendors = vendors.map(vendor => ({
        vendorId: vendor.vendor_id,
        vendorCode: vendor.vendor_code,
        vendorName: vendor.vendor_name,
        businessName: vendor.business_name,
        city: vendor.city,
        phoneNumber: vendor.phone_number,
        vendorRating: parseFloat(vendor.vendor_rating) || 0,
        commissionRate: parseFloat(vendor.commission_rate) || 0,
        
        // Product offering
        vendorProductId: vendor.vendor_product_id,
        sku: vendor.sku,
        price: parseFloat(vendor.vendor_price),
        mrp: parseFloat(vendor.mrp),
        discount: parseFloat(vendor.discount) || 0,
        stock: vendor.stock,
        isAvailable: vendor.is_available,
        leadTimeDays: vendor.lead_time_days,
        
        // Product info
        productName: vendor.product_name,
        productCode: vendor.product_code,
        category: vendor.category,
        unit: vendor.unit,
        
        // Inventory
        availableQuantity: vendor.available_quantity,
        inventoryStatus: vendor.inventory_status,
        
        // Performance scores
        reliabilityScore: parseFloat(vendor.reliability_score) || 0,
        overallScore: parseFloat(vendor.overall_score) || 0,
        availabilityScore: parseFloat(vendor.availability_score) || 0,
        priceScore: parseFloat(vendor.price_score) || 0,
        workloadScore: parseFloat(vendor.workload_score) || 0,
        activeOrdersCount: vendor.active_orders_count || 0,
        pendingOrdersCount: vendor.pending_orders_count || 0,
        averageFulfillmentTime: vendor.average_fulfillment_time || 0,
        
        // Ranking metrics
        vendorScore: parseFloat(vendor.vendor_score) || 0,
        acceptanceRate: parseFloat(vendor.acceptance_rate) || 0,
        completionRate: parseFloat(vendor.completion_rate) || 0,
        avgDeliveryTime: parseFloat(vendor.avg_delivery_time) || 0,
        totalOrders: vendor.total_orders || 0,
        completedOrders: vendor.completed_orders || 0,
        rank: vendor.rank || null,
        
        // Performance grade
        performanceGrade: this.calculatePerformanceGrade(parseFloat(vendor.reliability_score) || 0),
      }));

      return formattedVendors;

    } catch (error) {
      logger.error('❌ Error getting top reliable wholesalers', {
        productId,
        limit,
        error: error.message,
        stack: error.stack,
      });
      throw error;
    }
  }
}

module.exports = new VendorPerformanceService();
