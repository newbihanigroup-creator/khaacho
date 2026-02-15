const prisma = require('../config/database');
const logger = require('../shared/logger');

/**
 * Admin Intelligence Dashboard Service
 * 
 * Provides comprehensive analytics with optimized aggregated queries:
 * - Top selling items
 * - Vendor performance ranking
 * - Failed orders analysis
 * - Average order processing time
 * - OCR success rate
 * - WhatsApp response time
 */

class AdminDashboardService {
  /**
   * Get complete admin dashboard
   */
  async getAdminDashboard(days = 30) {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      logger.info('Generating admin dashboard', { days });

      const [
        topSellingItems,
        vendorPerformance,
        failedOrders,
        orderProcessingTime,
        ocrSuccessRate,
        whatsappResponseTime,
        platformOverview,
      ] = await Promise.all([
        this.getTopSellingItems(startDate, 20),
        this.getVendorPerformanceRanking(startDate, 20),
        this.getFailedOrdersAnalysis(startDate),
        this.getAverageOrderProcessingTime(startDate),
        this.getOCRSuccessRate(startDate),
        this.getWhatsAppResponseTime(startDate),
        this.getPlatformOverview(startDate),
      ]);

      return {
        period: {
          days,
          startDate,
          endDate: new Date(),
        },
        platformOverview,
        topSellingItems,
        vendorPerformance,
        failedOrders,
        orderProcessingTime,
        ocrSuccessRate,
        whatsappResponseTime,
        generatedAt: new Date(),
      };
    } catch (error) {
      logger.error('Failed to generate admin dashboard', {
        error: error.message,
        stack: error.stack,
      });
      throw error;
    }
  }


  /**
   * Get top selling items with aggregated data
   */
  async getTopSellingItems(startDate, limit = 20) {
    try {
      // Optimized aggregated query
      const topItems = await prisma.$queryRaw`
        SELECT 
          p.id as product_id,
          p.name as product_name,
          p.product_code,
          p.category,
          p.unit,
          
          -- Sales metrics
          COUNT(DISTINCT oi.order_id) as order_count,
          SUM(oi.quantity) as total_quantity_sold,
          SUM(oi.total) as total_revenue,
          AVG(oi.unit_price) as avg_selling_price,
          
          -- Performance metrics
          ROUND(AVG(oi.quantity)::numeric, 2) as avg_quantity_per_order,
          ROUND((SUM(oi.total) / NULLIF(SUM(oi.quantity), 0))::numeric, 2) as revenue_per_unit,
          
          -- Trend (last 7 days vs previous 7 days)
          (SELECT SUM(oi2.quantity) 
           FROM order_items oi2
           INNER JOIN orders o2 ON oi2.order_id = o2.id
           WHERE oi2.product_id = p.id
           AND o2.created_at >= CURRENT_DATE - INTERVAL '7 days'
           AND o2.status IN ('DELIVERED', 'COMPLETED')
          ) as quantity_last_7_days,
          
          (SELECT SUM(oi3.quantity) 
           FROM order_items oi3
           INNER JOIN orders o3 ON oi3.order_id = o3.id
           WHERE oi3.product_id = p.id
           AND o3.created_at >= CURRENT_DATE - INTERVAL '14 days'
           AND o3.created_at < CURRENT_DATE - INTERVAL '7 days'
           AND o3.status IN ('DELIVERED', 'COMPLETED')
          ) as quantity_prev_7_days,
          
          -- Vendor count
          (SELECT COUNT(DISTINCT vendor_id) 
           FROM vendor_products vp 
           WHERE vp.product_id = p.id 
           AND vp.is_available = true
          ) as vendor_count
          
        FROM products p
        INNER JOIN order_items oi ON oi.product_id = p.id
        INNER JOIN orders o ON oi.order_id = o.id
        WHERE o.created_at >= ${startDate}
          AND o.status IN ('DELIVERED', 'COMPLETED')
          AND p.deleted_at IS NULL
        GROUP BY p.id, p.name, p.product_code, p.category, p.unit
        ORDER BY total_revenue DESC
        LIMIT ${limit}
      `;

      return topItems.map(item => ({
        productId: item.product_id,
        productName: item.product_name,
        productCode: item.product_code,
        category: item.category,
        unit: item.unit,
        orderCount: Number(item.order_count),
        totalQuantitySold: Number(item.total_quantity_sold),
        totalRevenue: parseFloat(item.total_revenue),
        avgSellingPrice: parseFloat(item.avg_selling_price),
        avgQuantityPerOrder: parseFloat(item.avg_quantity_per_order),
        revenuePerUnit: parseFloat(item.revenue_per_unit),
        quantityLast7Days: Number(item.quantity_last_7_days) || 0,
        quantityPrev7Days: Number(item.quantity_prev_7_days) || 0,
        trend: this.calculateTrend(
          Number(item.quantity_last_7_days) || 0,
          Number(item.quantity_prev_7_days) || 0
        ),
        vendorCount: Number(item.vendor_count),
      }));
    } catch (error) {
      logger.error('Failed to get top selling items', {
        error: error.message,
      });
      throw error;
    }
  }


  /**
   * Get vendor performance ranking with comprehensive metrics
   */
  async getVendorPerformanceRanking(startDate, limit = 20) {
    try {
      // Optimized aggregated query with performance scoring
      const vendorRanking = await prisma.$queryRaw`
        SELECT 
          v.id as vendor_id,
          v.vendor_code,
          u.business_name,
          u.city,
          u.state,
          u.phone_number,
          
          -- Order metrics
          COUNT(DISTINCT o.id) as total_orders,
          COUNT(DISTINCT CASE WHEN o.status IN ('DELIVERED', 'COMPLETED') THEN o.id END) as completed_orders,
          COUNT(DISTINCT CASE WHEN o.status = 'CANCELLED' THEN o.id END) as cancelled_orders,
          COUNT(DISTINCT CASE WHEN o.status = 'REJECTED' THEN o.id END) as rejected_orders,
          
          -- Financial metrics
          SUM(CASE WHEN o.status IN ('DELIVERED', 'COMPLETED') THEN o.total ELSE 0 END) as total_revenue,
          AVG(CASE WHEN o.status IN ('DELIVERED', 'COMPLETED') THEN o.total END) as avg_order_value,
          
          -- Performance rates
          ROUND(
            (COUNT(DISTINCT CASE WHEN o.status IN ('DELIVERED', 'COMPLETED') THEN o.id END)::numeric / 
             NULLIF(COUNT(DISTINCT o.id), 0) * 100)::numeric, 
            2
          ) as fulfillment_rate,
          
          ROUND(
            (COUNT(DISTINCT CASE WHEN o.status = 'CANCELLED' THEN o.id END)::numeric / 
             NULLIF(COUNT(DISTINCT o.id), 0) * 100)::numeric, 
            2
          ) as cancellation_rate,
          
          -- Timing metrics
          ROUND(
            AVG(
              CASE 
                WHEN o.confirmed_at IS NOT NULL 
                THEN EXTRACT(EPOCH FROM (o.confirmed_at - o.created_at)) / 60
              END
            )::numeric, 
            2
          ) as avg_acceptance_time_minutes,
          
          ROUND(
            AVG(
              CASE 
                WHEN o.delivered_at IS NOT NULL AND o.confirmed_at IS NOT NULL
                THEN EXTRACT(EPOCH FROM (o.delivered_at - o.confirmed_at)) / 3600
              END
            )::numeric, 
            2
          ) as avg_delivery_time_hours,
          
          -- Intelligence score from vendor_metrics
          vm.intelligence_score,
          vm.delivery_success_rate,
          vm.order_acceptance_rate,
          vm.average_response_time,
          
          -- Rating
          v.rating,
          
          -- Calculate composite performance score
          ROUND(
            (
              COALESCE(vm.intelligence_score, v.rating * 20, 50) * 0.40 +
              (COUNT(DISTINCT CASE WHEN o.status IN ('DELIVERED', 'COMPLETED') THEN o.id END)::numeric / 
               NULLIF(COUNT(DISTINCT o.id), 0) * 100) * 0.30 +
              (100 - (COUNT(DISTINCT CASE WHEN o.status = 'CANCELLED' THEN o.id END)::numeric / 
               NULLIF(COUNT(DISTINCT o.id), 0) * 100)) * 0.20 +
              LEAST(100, (COUNT(DISTINCT o.id)::numeric / 10 * 10)) * 0.10
            )::numeric,
            2
          ) as performance_score
          
        FROM vendors v
        INNER JOIN users u ON v.user_id = u.id
        LEFT JOIN orders o ON o.vendor_id = v.id AND o.created_at >= ${startDate}
        LEFT JOIN vendor_metrics vm ON vm.vendor_id = v.id
        WHERE v.is_approved = true
          AND v.deleted_at IS NULL
        GROUP BY v.id, v.vendor_code, u.business_name, u.city, u.state, u.phone_number, 
                 vm.intelligence_score, vm.delivery_success_rate, vm.order_acceptance_rate, 
                 vm.average_response_time, v.rating
        HAVING COUNT(DISTINCT o.id) > 0
        ORDER BY performance_score DESC
        LIMIT ${limit}
      `;

      return vendorRanking.map((vendor, index) => ({
        rank: index + 1,
        vendorId: vendor.vendor_id,
        vendorCode: vendor.vendor_code,
        businessName: vendor.business_name,
        city: vendor.city,
        state: vendor.state,
        phoneNumber: vendor.phone_number,
        totalOrders: Number(vendor.total_orders),
        completedOrders: Number(vendor.completed_orders),
        cancelledOrders: Number(vendor.cancelled_orders),
        rejectedOrders: Number(vendor.rejected_orders),
        totalRevenue: parseFloat(vendor.total_revenue),
        avgOrderValue: parseFloat(vendor.avg_order_value),
        fulfillmentRate: parseFloat(vendor.fulfillment_rate),
        cancellationRate: parseFloat(vendor.cancellation_rate),
        avgAcceptanceTimeMinutes: parseFloat(vendor.avg_acceptance_time_minutes),
        avgDeliveryTimeHours: parseFloat(vendor.avg_delivery_time_hours),
        intelligenceScore: parseFloat(vendor.intelligence_score) || 0,
        deliverySuccessRate: parseFloat(vendor.delivery_success_rate) || 0,
        orderAcceptanceRate: parseFloat(vendor.order_acceptance_rate) || 0,
        averageResponseTime: parseFloat(vendor.average_response_time) || 0,
        rating: parseFloat(vendor.rating),
        performanceScore: parseFloat(vendor.performance_score),
        performanceGrade: this.getPerformanceGrade(parseFloat(vendor.performance_score)),
      }));
    } catch (error) {
      logger.error('Failed to get vendor performance ranking', {
        error: error.message,
      });
      throw error;
    }
  }


  /**
   * Get failed orders analysis
   */
  async getFailedOrdersAnalysis(startDate) {
    try {
      // Aggregated query for failed orders
      const failedOrders = await prisma.$queryRaw`
        SELECT 
          o.status,
          COUNT(*) as order_count,
          SUM(o.total) as total_value,
          AVG(o.total) as avg_order_value,
          
          -- Failure reasons distribution
          COUNT(CASE WHEN o.cancellation_reason LIKE '%stock%' THEN 1 END) as stock_issues,
          COUNT(CASE WHEN o.cancellation_reason LIKE '%price%' THEN 1 END) as price_issues,
          COUNT(CASE WHEN o.cancellation_reason LIKE '%credit%' THEN 1 END) as credit_issues,
          COUNT(CASE WHEN o.cancellation_reason LIKE '%delivery%' THEN 1 END) as delivery_issues,
          COUNT(CASE WHEN o.cancellation_reason IS NULL OR o.cancellation_reason = '' THEN 1 END) as no_reason,
          
          -- Time distribution
          COUNT(CASE WHEN EXTRACT(HOUR FROM o.created_at) BETWEEN 6 AND 12 THEN 1 END) as morning_failures,
          COUNT(CASE WHEN EXTRACT(HOUR FROM o.created_at) BETWEEN 12 AND 18 THEN 1 END) as afternoon_failures,
          COUNT(CASE WHEN EXTRACT(HOUR FROM o.created_at) BETWEEN 18 AND 24 THEN 1 END) as evening_failures,
          COUNT(CASE WHEN EXTRACT(HOUR FROM o.created_at) BETWEEN 0 AND 6 THEN 1 END) as night_failures
          
        FROM orders o
        WHERE o.created_at >= ${startDate}
          AND o.status IN ('CANCELLED', 'REJECTED', 'FAILED')
        GROUP BY o.status
      `;

      // Get top retailers with failed orders
      const topFailedRetailers = await prisma.$queryRaw`
        SELECT 
          r.id as retailer_id,
          r.retailer_code,
          u.business_name,
          COUNT(*) as failed_order_count,
          SUM(o.total) as failed_order_value,
          ROUND(
            (COUNT(*)::numeric / 
             (SELECT COUNT(*) FROM orders WHERE retailer_id = r.id AND created_at >= ${startDate}) * 100)::numeric,
            2
          ) as failure_rate
        FROM orders o
        INNER JOIN retailers r ON o.retailer_id = r.id
        INNER JOIN users u ON r.user_id = u.id
        WHERE o.created_at >= ${startDate}
          AND o.status IN ('CANCELLED', 'REJECTED', 'FAILED')
        GROUP BY r.id, r.retailer_code, u.business_name
        ORDER BY failed_order_count DESC
        LIMIT 10
      `;

      // Get top vendors with failed orders
      const topFailedVendors = await prisma.$queryRaw`
        SELECT 
          v.id as vendor_id,
          v.vendor_code,
          u.business_name,
          COUNT(*) as failed_order_count,
          SUM(o.total) as failed_order_value,
          ROUND(
            (COUNT(*)::numeric / 
             (SELECT COUNT(*) FROM orders WHERE vendor_id = v.id AND created_at >= ${startDate}) * 100)::numeric,
            2
          ) as failure_rate
        FROM orders o
        INNER JOIN vendors v ON o.vendor_id = v.id
        INNER JOIN users u ON v.user_id = u.id
        WHERE o.created_at >= ${startDate}
          AND o.status IN ('CANCELLED', 'REJECTED', 'FAILED')
        GROUP BY v.id, v.vendor_code, u.business_name
        ORDER BY failed_order_count DESC
        LIMIT 10
      `;

      const totalFailed = failedOrders.reduce((sum, f) => sum + Number(f.order_count), 0);
      const totalValue = failedOrders.reduce((sum, f) => sum + parseFloat(f.total_value), 0);

      return {
        summary: {
          totalFailedOrders: totalFailed,
          totalFailedValue: totalValue,
          avgFailedOrderValue: totalFailed > 0 ? totalValue / totalFailed : 0,
        },
        byStatus: failedOrders.map(f => ({
          status: f.status,
          count: Number(f.order_count),
          totalValue: parseFloat(f.total_value),
          avgOrderValue: parseFloat(f.avg_order_value),
          percentage: totalFailed > 0 ? (Number(f.order_count) / totalFailed * 100).toFixed(2) : 0,
        })),
        failureReasons: {
          stockIssues: failedOrders.reduce((sum, f) => sum + Number(f.stock_issues), 0),
          priceIssues: failedOrders.reduce((sum, f) => sum + Number(f.price_issues), 0),
          creditIssues: failedOrders.reduce((sum, f) => sum + Number(f.credit_issues), 0),
          deliveryIssues: failedOrders.reduce((sum, f) => sum + Number(f.delivery_issues), 0),
          noReason: failedOrders.reduce((sum, f) => sum + Number(f.no_reason), 0),
        },
        timeDistribution: {
          morning: failedOrders.reduce((sum, f) => sum + Number(f.morning_failures), 0),
          afternoon: failedOrders.reduce((sum, f) => sum + Number(f.afternoon_failures), 0),
          evening: failedOrders.reduce((sum, f) => sum + Number(f.evening_failures), 0),
          night: failedOrders.reduce((sum, f) => sum + Number(f.night_failures), 0),
        },
        topFailedRetailers: topFailedRetailers.map(r => ({
          retailerId: r.retailer_id,
          retailerCode: r.retailer_code,
          businessName: r.business_name,
          failedOrderCount: Number(r.failed_order_count),
          failedOrderValue: parseFloat(r.failed_order_value),
          failureRate: parseFloat(r.failure_rate),
        })),
        topFailedVendors: topFailedVendors.map(v => ({
          vendorId: v.vendor_id,
          vendorCode: v.vendor_code,
          businessName: v.business_name,
          failedOrderCount: Number(v.failed_order_count),
          failedOrderValue: parseFloat(v.failed_order_value),
          failureRate: parseFloat(v.failure_rate),
        })),
      };
    } catch (error) {
      logger.error('Failed to get failed orders analysis', {
        error: error.message,
      });
      throw error;
    }
  }


  /**
   * Get average order processing time with breakdown
   */
  async getAverageOrderProcessingTime(startDate) {
    try {
      // Aggregated query for order processing times
      const processingTimes = await prisma.$queryRaw`
        SELECT 
          COUNT(*) as total_orders,
          
          -- Time to confirmation (order created → confirmed)
          ROUND(AVG(
            CASE 
              WHEN confirmed_at IS NOT NULL 
              THEN EXTRACT(EPOCH FROM (confirmed_at - created_at)) / 60
            END
          )::numeric, 2) as avg_time_to_confirmation_minutes,
          
          -- Time to dispatch (confirmed → dispatched)
          ROUND(AVG(
            CASE 
              WHEN dispatched_at IS NOT NULL AND confirmed_at IS NOT NULL
              THEN EXTRACT(EPOCH FROM (dispatched_at - confirmed_at)) / 60
            END
          )::numeric, 2) as avg_time_to_dispatch_minutes,
          
          -- Time to delivery (dispatched → delivered)
          ROUND(AVG(
            CASE 
              WHEN delivered_at IS NOT NULL AND dispatched_at IS NOT NULL
              THEN EXTRACT(EPOCH FROM (delivered_at - dispatched_at)) / 60
            END
          )::numeric, 2) as avg_time_to_delivery_minutes,
          
          -- Total processing time (created → delivered)
          ROUND(AVG(
            CASE 
              WHEN delivered_at IS NOT NULL
              THEN EXTRACT(EPOCH FROM (delivered_at - created_at)) / 60
            END
          )::numeric, 2) as avg_total_processing_minutes,
          
          -- Percentiles for total processing time
          PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY 
            CASE 
              WHEN delivered_at IS NOT NULL
              THEN EXTRACT(EPOCH FROM (delivered_at - created_at)) / 60
            END
          ) as median_processing_minutes,
          
          PERCENTILE_CONT(0.90) WITHIN GROUP (ORDER BY 
            CASE 
              WHEN delivered_at IS NOT NULL
              THEN EXTRACT(EPOCH FROM (delivered_at - created_at)) / 60
            END
          ) as p90_processing_minutes,
          
          PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY 
            CASE 
              WHEN delivered_at IS NOT NULL
              THEN EXTRACT(EPOCH FROM (delivered_at - created_at)) / 60
            END
          ) as p95_processing_minutes,
          
          -- Count by speed category
          COUNT(CASE 
            WHEN delivered_at IS NOT NULL 
            AND EXTRACT(EPOCH FROM (delivered_at - created_at)) / 3600 <= 24
            THEN 1 
          END) as orders_within_24h,
          
          COUNT(CASE 
            WHEN delivered_at IS NOT NULL 
            AND EXTRACT(EPOCH FROM (delivered_at - created_at)) / 3600 > 24
            AND EXTRACT(EPOCH FROM (delivered_at - created_at)) / 3600 <= 48
            THEN 1 
          END) as orders_24_48h,
          
          COUNT(CASE 
            WHEN delivered_at IS NOT NULL 
            AND EXTRACT(EPOCH FROM (delivered_at - created_at)) / 3600 > 48
            THEN 1 
          END) as orders_over_48h
          
        FROM orders
        WHERE created_at >= ${startDate}
          AND status IN ('DELIVERED', 'COMPLETED')
      `;

      // Get processing time by vendor
      const byVendor = await prisma.$queryRaw`
        SELECT 
          v.id as vendor_id,
          v.vendor_code,
          u.business_name,
          COUNT(*) as order_count,
          ROUND(AVG(
            CASE 
              WHEN o.delivered_at IS NOT NULL
              THEN EXTRACT(EPOCH FROM (o.delivered_at - o.created_at)) / 60
            END
          )::numeric, 2) as avg_processing_minutes
        FROM orders o
        INNER JOIN vendors v ON o.vendor_id = v.id
        INNER JOIN users u ON v.user_id = u.id
        WHERE o.created_at >= ${startDate}
          AND o.status IN ('DELIVERED', 'COMPLETED')
          AND o.delivered_at IS NOT NULL
        GROUP BY v.id, v.vendor_code, u.business_name
        HAVING COUNT(*) >= 5
        ORDER BY avg_processing_minutes ASC
        LIMIT 10
      `;

      const result = processingTimes[0];

      return {
        summary: {
          totalOrders: Number(result.total_orders),
          avgTimeToConfirmationMinutes: parseFloat(result.avg_time_to_confirmation_minutes) || 0,
          avgTimeToDispatchMinutes: parseFloat(result.avg_time_to_dispatch_minutes) || 0,
          avgTimeToDeliveryMinutes: parseFloat(result.avg_time_to_delivery_minutes) || 0,
          avgTotalProcessingMinutes: parseFloat(result.avg_total_processing_minutes) || 0,
          avgTotalProcessingHours: parseFloat(result.avg_total_processing_minutes) / 60 || 0,
          medianProcessingMinutes: parseFloat(result.median_processing_minutes) || 0,
          p90ProcessingMinutes: parseFloat(result.p90_processing_minutes) || 0,
          p95ProcessingMinutes: parseFloat(result.p95_processing_minutes) || 0,
        },
        speedDistribution: {
          within24Hours: Number(result.orders_within_24h),
          between24And48Hours: Number(result.orders_24_48h),
          over48Hours: Number(result.orders_over_48h),
        },
        fastestVendors: byVendor.map(v => ({
          vendorId: v.vendor_id,
          vendorCode: v.vendor_code,
          businessName: v.business_name,
          orderCount: Number(v.order_count),
          avgProcessingMinutes: parseFloat(v.avg_processing_minutes),
          avgProcessingHours: parseFloat(v.avg_processing_minutes) / 60,
        })),
      };
    } catch (error) {
      logger.error('Failed to get order processing time', {
        error: error.message,
      });
      throw error;
    }
  }


  /**
   * Get OCR success rate and performance metrics
   */
  async getOCRSuccessRate(startDate) {
    try {
      // Check if uploaded_orders table exists
      const tableExists = await prisma.$queryRaw`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_name = 'uploaded_orders'
        ) as exists
      `;

      if (!tableExists[0].exists) {
        return {
          summary: {
            totalUploads: 0,
            successfulOCR: 0,
            failedOCR: 0,
            successRate: 0,
            avgProcessingTimeSeconds: 0,
          },
          byStatus: [],
          byConfidenceLevel: [],
          recentFailures: [],
        };
      }

      // Aggregated OCR metrics
      const ocrMetrics = await prisma.$queryRaw`
        SELECT 
          COUNT(*) as total_uploads,
          COUNT(CASE WHEN ocr_status = 'SUCCESS' THEN 1 END) as successful_ocr,
          COUNT(CASE WHEN ocr_status = 'FAILED' THEN 1 END) as failed_ocr,
          COUNT(CASE WHEN ocr_status = 'PARTIAL' THEN 1 END) as partial_ocr,
          COUNT(CASE WHEN ocr_status = 'PENDING' THEN 1 END) as pending_ocr,
          
          ROUND(
            (COUNT(CASE WHEN ocr_status = 'SUCCESS' THEN 1 END)::numeric / 
             NULLIF(COUNT(*), 0) * 100)::numeric,
            2
          ) as success_rate,
          
          ROUND(AVG(
            CASE 
              WHEN ocr_completed_at IS NOT NULL AND ocr_started_at IS NOT NULL
              THEN EXTRACT(EPOCH FROM (ocr_completed_at - ocr_started_at))
            END
          )::numeric, 2) as avg_processing_seconds,
          
          ROUND(AVG(
            CASE 
              WHEN ocr_status = 'SUCCESS' AND ocr_confidence_score IS NOT NULL
              THEN ocr_confidence_score
            END
          )::numeric, 2) as avg_confidence_score,
          
          -- Confidence level distribution
          COUNT(CASE WHEN ocr_confidence_score >= 90 THEN 1 END) as high_confidence,
          COUNT(CASE WHEN ocr_confidence_score >= 70 AND ocr_confidence_score < 90 THEN 1 END) as medium_confidence,
          COUNT(CASE WHEN ocr_confidence_score < 70 THEN 1 END) as low_confidence
          
        FROM uploaded_orders
        WHERE created_at >= ${startDate}
      `;

      // Get recent failures for analysis
      const recentFailures = await prisma.$queryRaw`
        SELECT 
          id,
          retailer_id,
          image_url,
          ocr_status,
          ocr_error_message,
          ocr_confidence_score,
          created_at
        FROM uploaded_orders
        WHERE created_at >= ${startDate}
          AND ocr_status = 'FAILED'
        ORDER BY created_at DESC
        LIMIT 10
      `;

      const result = ocrMetrics[0];

      return {
        summary: {
          totalUploads: Number(result.total_uploads),
          successfulOCR: Number(result.successful_ocr),
          failedOCR: Number(result.failed_ocr),
          partialOCR: Number(result.partial_ocr),
          pendingOCR: Number(result.pending_ocr),
          successRate: parseFloat(result.success_rate) || 0,
          avgProcessingTimeSeconds: parseFloat(result.avg_processing_seconds) || 0,
          avgConfidenceScore: parseFloat(result.avg_confidence_score) || 0,
        },
        byStatus: [
          { status: 'SUCCESS', count: Number(result.successful_ocr) },
          { status: 'FAILED', count: Number(result.failed_ocr) },
          { status: 'PARTIAL', count: Number(result.partial_ocr) },
          { status: 'PENDING', count: Number(result.pending_ocr) },
        ],
        byConfidenceLevel: {
          high: Number(result.high_confidence),
          medium: Number(result.medium_confidence),
          low: Number(result.low_confidence),
        },
        recentFailures: recentFailures.map(f => ({
          id: f.id,
          retailerId: f.retailer_id,
          imageUrl: f.image_url,
          errorMessage: f.ocr_error_message,
          confidenceScore: parseFloat(f.ocr_confidence_score) || 0,
          createdAt: f.created_at,
        })),
      };
    } catch (error) {
      logger.error('Failed to get OCR success rate', {
        error: error.message,
      });
      // Return empty data if table doesn't exist or query fails
      return {
        summary: {
          totalUploads: 0,
          successfulOCR: 0,
          failedOCR: 0,
          successRate: 0,
          avgProcessingTimeSeconds: 0,
        },
        byStatus: [],
        byConfidenceLevel: {},
        recentFailures: [],
      };
    }
  }


  /**
   * Get WhatsApp response time and performance metrics
   */
  async getWhatsAppResponseTime(startDate) {
    try {
      // Check if whatsapp_messages table exists
      const tableExists = await prisma.$queryRaw`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_name = 'whatsapp_messages'
        ) as exists
      `;

      if (!tableExists[0].exists) {
        return {
          summary: {
            totalMessages: 0,
            incomingMessages: 0,
            outgoingMessages: 0,
            avgResponseTimeSeconds: 0,
            messagesWithinSLA: 0,
            slaComplianceRate: 0,
          },
          responseTimeDistribution: {},
          byMessageType: [],
          recentSlowResponses: [],
        };
      }

      // Aggregated WhatsApp metrics
      const whatsappMetrics = await prisma.$queryRaw`
        SELECT 
          COUNT(*) as total_messages,
          COUNT(CASE WHEN direction = 'INCOMING' THEN 1 END) as incoming_messages,
          COUNT(CASE WHEN direction = 'OUTGOING' THEN 1 END) as outgoing_messages,
          
          -- Response time for outgoing messages (time from trigger to sent)
          ROUND(AVG(
            CASE 
              WHEN direction = 'OUTGOING' AND sent_at IS NOT NULL AND created_at IS NOT NULL
              THEN EXTRACT(EPOCH FROM (sent_at - created_at))
            END
          )::numeric, 2) as avg_response_seconds,
          
          -- SLA compliance (assuming 60 seconds SLA)
          COUNT(CASE 
            WHEN direction = 'OUTGOING' 
            AND sent_at IS NOT NULL 
            AND EXTRACT(EPOCH FROM (sent_at - created_at)) <= 60
            THEN 1 
          END) as messages_within_sla,
          
          ROUND(
            (COUNT(CASE 
              WHEN direction = 'OUTGOING' 
              AND sent_at IS NOT NULL 
              AND EXTRACT(EPOCH FROM (sent_at - created_at)) <= 60
              THEN 1 
            END)::numeric / 
             NULLIF(COUNT(CASE WHEN direction = 'OUTGOING' AND sent_at IS NOT NULL THEN 1 END), 0) * 100)::numeric,
            2
          ) as sla_compliance_rate,
          
          -- Response time distribution
          COUNT(CASE 
            WHEN direction = 'OUTGOING' 
            AND sent_at IS NOT NULL 
            AND EXTRACT(EPOCH FROM (sent_at - created_at)) <= 10
            THEN 1 
          END) as within_10_seconds,
          
          COUNT(CASE 
            WHEN direction = 'OUTGOING' 
            AND sent_at IS NOT NULL 
            AND EXTRACT(EPOCH FROM (sent_at - created_at)) > 10
            AND EXTRACT(EPOCH FROM (sent_at - created_at)) <= 30
            THEN 1 
          END) as within_10_30_seconds,
          
          COUNT(CASE 
            WHEN direction = 'OUTGOING' 
            AND sent_at IS NOT NULL 
            AND EXTRACT(EPOCH FROM (sent_at - created_at)) > 30
            AND EXTRACT(EPOCH FROM (sent_at - created_at)) <= 60
            THEN 1 
          END) as within_30_60_seconds,
          
          COUNT(CASE 
            WHEN direction = 'OUTGOING' 
            AND sent_at IS NOT NULL 
            AND EXTRACT(EPOCH FROM (sent_at - created_at)) > 60
            THEN 1 
          END) as over_60_seconds,
          
          -- By message type
          COUNT(CASE WHEN message_type = 'ORDER_CONFIRMATION' THEN 1 END) as order_confirmations,
          COUNT(CASE WHEN message_type = 'PAYMENT_REMINDER' THEN 1 END) as payment_reminders,
          COUNT(CASE WHEN message_type = 'DELIVERY_UPDATE' THEN 1 END) as delivery_updates,
          COUNT(CASE WHEN message_type = 'GENERAL' THEN 1 END) as general_messages
          
        FROM whatsapp_messages
        WHERE created_at >= ${startDate}
      `;

      // Get recent slow responses
      const slowResponses = await prisma.$queryRaw`
        SELECT 
          id,
          phone_number,
          message_type,
          created_at,
          sent_at,
          EXTRACT(EPOCH FROM (sent_at - created_at)) as response_time_seconds,
          status,
          error_message
        FROM whatsapp_messages
        WHERE created_at >= ${startDate}
          AND direction = 'OUTGOING'
          AND sent_at IS NOT NULL
          AND EXTRACT(EPOCH FROM (sent_at - created_at)) > 60
        ORDER BY response_time_seconds DESC
        LIMIT 10
      `;

      const result = whatsappMetrics[0];

      return {
        summary: {
          totalMessages: Number(result.total_messages),
          incomingMessages: Number(result.incoming_messages),
          outgoingMessages: Number(result.outgoing_messages),
          avgResponseTimeSeconds: parseFloat(result.avg_response_seconds) || 0,
          messagesWithinSLA: Number(result.messages_within_sla),
          slaComplianceRate: parseFloat(result.sla_compliance_rate) || 0,
        },
        responseTimeDistribution: {
          within10Seconds: Number(result.within_10_seconds),
          within10To30Seconds: Number(result.within_10_30_seconds),
          within30To60Seconds: Number(result.within_30_60_seconds),
          over60Seconds: Number(result.over_60_seconds),
        },
        byMessageType: [
          { type: 'ORDER_CONFIRMATION', count: Number(result.order_confirmations) },
          { type: 'PAYMENT_REMINDER', count: Number(result.payment_reminders) },
          { type: 'DELIVERY_UPDATE', count: Number(result.delivery_updates) },
          { type: 'GENERAL', count: Number(result.general_messages) },
        ],
        recentSlowResponses: slowResponses.map(r => ({
          id: r.id,
          phoneNumber: r.phone_number,
          messageType: r.message_type,
          createdAt: r.created_at,
          sentAt: r.sent_at,
          responseTimeSeconds: parseFloat(r.response_time_seconds),
          status: r.status,
          errorMessage: r.error_message,
        })),
      };
    } catch (error) {
      logger.error('Failed to get WhatsApp response time', {
        error: error.message,
      });
      // Return empty data if table doesn't exist or query fails
      return {
        summary: {
          totalMessages: 0,
          incomingMessages: 0,
          outgoingMessages: 0,
          avgResponseTimeSeconds: 0,
          messagesWithinSLA: 0,
          slaComplianceRate: 0,
        },
        responseTimeDistribution: {},
        byMessageType: [],
        recentSlowResponses: [],
      };
    }
  }


  /**
   * Get platform overview metrics
   */
  async getPlatformOverview(startDate) {
    try {
      const overview = await prisma.$queryRaw`
        SELECT 
          -- Order metrics
          COUNT(DISTINCT o.id) as total_orders,
          COUNT(DISTINCT CASE WHEN o.status IN ('DELIVERED', 'COMPLETED') THEN o.id END) as completed_orders,
          COUNT(DISTINCT CASE WHEN o.status IN ('CANCELLED', 'REJECTED', 'FAILED') THEN o.id END) as failed_orders,
          COUNT(DISTINCT CASE WHEN o.status IN ('PENDING', 'CONFIRMED', 'ACCEPTED') THEN o.id END) as pending_orders,
          
          -- Financial metrics
          SUM(CASE WHEN o.status IN ('DELIVERED', 'COMPLETED') THEN o.total ELSE 0 END) as total_revenue,
          AVG(CASE WHEN o.status IN ('DELIVERED', 'COMPLETED') THEN o.total END) as avg_order_value,
          
          -- User metrics
          COUNT(DISTINCT o.retailer_id) as active_retailers,
          COUNT(DISTINCT o.vendor_id) as active_vendors,
          
          -- Success rate
          ROUND(
            (COUNT(DISTINCT CASE WHEN o.status IN ('DELIVERED', 'COMPLETED') THEN o.id END)::numeric / 
             NULLIF(COUNT(DISTINCT o.id), 0) * 100)::numeric,
            2
          ) as order_success_rate
          
        FROM orders o
        WHERE o.created_at >= ${startDate}
      `;

      const result = overview[0];

      return {
        totalOrders: Number(result.total_orders),
        completedOrders: Number(result.completed_orders),
        failedOrders: Number(result.failed_orders),
        pendingOrders: Number(result.pending_orders),
        totalRevenue: parseFloat(result.total_revenue),
        avgOrderValue: parseFloat(result.avg_order_value),
        activeRetailers: Number(result.active_retailers),
        activeVendors: Number(result.active_vendors),
        orderSuccessRate: parseFloat(result.order_success_rate),
      };
    } catch (error) {
      logger.error('Failed to get platform overview', {
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Helper: Calculate trend
   */
  calculateTrend(current, previous) {
    if (previous === 0) {
      return current > 0 ? 'UP' : 'STABLE';
    }
    const change = ((current - previous) / previous) * 100;
    if (change > 10) return 'UP';
    if (change < -10) return 'DOWN';
    return 'STABLE';
  }

  /**
   * Helper: Get performance grade
   */
  getPerformanceGrade(score) {
    if (score >= 90) return 'A+';
    if (score >= 80) return 'A';
    if (score >= 70) return 'B';
    if (score >= 60) return 'C';
    if (score >= 50) return 'D';
    return 'F';
  }
}

module.exports = new AdminDashboardService();
